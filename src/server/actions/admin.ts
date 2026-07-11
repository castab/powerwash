"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { addMinutes } from "date-fns";
import {
  BookingEventType,
  BookingStatus,
  PaymentStatus,
  Prisma,
  type BalanceRequestDeliveryChannel,
} from "@/generated/prisma/client";
import { createAdminSession, hashPassword, requireAdmin, verifyPassword } from "@/lib/auth";
import { findOverlappingActiveBooking } from "@/lib/booking";
import { isImmutableBookingState } from "@/lib/booking-state";
import { sendBalancePaymentRequest } from "@/lib/balance-payment";
import { getArchivedCustomerAccessEndsAt, getManagementUrlForCustomer } from "@/lib/booking-management";
import { createBookingEvent, pickBookingEventState } from "@/lib/booking-events";
import { sendCancellationOutcomeEmail } from "@/lib/booking-management";
import { getEnv } from "@/lib/env";
import { prisma } from "@/lib/prisma";
import {
  RATE_LIMITS,
  checkRateLimit,
  recordRateLimitHit,
  resetRateLimit,
} from "@/lib/rate-limit";
import { getClientIp } from "@/lib/request-ip";
import { getRequestOrigin } from "@/lib/request-origin";
import { getStripe } from "@/lib/stripe";
import {
  adminLoginSchema,
  adminPasswordUpdateSchema,
  availabilitySchema,
  blackoutSchema,
  bookingAdminUpdateSchema,
  requestBookingBalanceSchema,
  serviceSchema,
} from "@/lib/validators";
import {
  formatBusinessDateTimeLong,
  parseBusinessDateTimeLocalValue,
  slugify,
  subtractMoney,
  toMoneyDecimal,
  toStripeCents,
} from "@/lib/utils";

function canArchiveBooking(status: BookingStatus) {
  return (
    status === BookingStatus.COMPLETED ||
    status === BookingStatus.CANCELLED ||
    status === BookingStatus.NO_SHOW
  );
}

const EMAIL_DELIVERY_CHANNEL: BalanceRequestDeliveryChannel = "EMAIL";

// Precomputed bcrypt hash (cost 12) compared against when the submitted email
// has no matching admin, so a missing user costs the same ~100-300ms as a real
// one and response time cannot be used to enumerate valid admin emails.
const DUMMY_PASSWORD_HASH = "$2b$12$BZ0ORRA6XU.lHTq9VXFn9O/8ALaps28M5w5KR7ebs10lMzweAgtMC";

function canIssueFullRefund(booking: { status: BookingStatus; paymentStatus: PaymentStatus }) {
  return (
    (booking.status === BookingStatus.CONFIRMED || booking.status === BookingStatus.COMPLETED) &&
    booking.paymentStatus === PaymentStatus.PAID
  );
}

export type AdminPasswordUpdateState = {
  error?: string;
  success?: string;
};

export type BookingUpdateState = {
  error?: string;
  success?: string;
};

// Shared result shape for admin mutations wired through `useActionState`.
// Expected validation and precondition failures are returned as `{ error }`
// so they render inline in production, where Next.js redacts thrown errors.
// Genuinely unexpected failures (DB down, Stripe 5xx) still `throw` and hit
// the admin error boundary.
export type AdminActionState = {
  error?: string;
  success?: string;
};

export async function loginAdminAction(_state: { error?: string }, formData: FormData) {
  const parsed = adminLoginSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid login." };
  }

  const ip = await getClientIp();
  const ipKey = `admin-login:ip:${ip}`;
  const emailKey = `admin-login:email:${parsed.data.email.toLowerCase()}`;

  // Reject over-limit sources before spending a bcrypt comparison so throttling
  // stays cheap under a password-spray attack.
  if (
    !checkRateLimit(ipKey, RATE_LIMITS.adminLogin).ok ||
    !checkRateLimit(emailKey, RATE_LIMITS.adminLogin).ok
  ) {
    return { error: "Too many login attempts. Please try again later." };
  }

  const admin = await prisma.adminUser.findUnique({
    where: { email: parsed.data.email },
  });

  // Always run one bcrypt comparison, even when the email is unknown or the
  // account is inactive, so all failure paths take the same amount of time.
  const passwordHash = admin?.passwordHash ?? DUMMY_PASSWORD_HASH;
  const validPassword = await verifyPassword(parsed.data.password, passwordHash);

  if (!admin || !admin.isActive || !validPassword) {
    recordRateLimitHit(ipKey, RATE_LIMITS.adminLogin);
    recordRateLimitHit(emailKey, RATE_LIMITS.adminLogin);
    return { error: "Invalid credentials." };
  }

  resetRateLimit(ipKey);
  resetRateLimit(emailKey);

  await prisma.adminUser.update({
    where: { id: admin.id },
    data: { lastLoginAt: new Date() },
  });

  await createAdminSession({
    adminId: admin.id,
    email: admin.email,
    name: admin.name,
  });

  redirect("/admin/bookings");
}

export async function updateAdminPasswordAction(
  _state: AdminPasswordUpdateState,
  formData: FormData,
): Promise<AdminPasswordUpdateState> {
  const admin = await requireAdmin();
  const parsed = adminPasswordUpdateSchema.safeParse({
    currentPassword: formData.get("currentPassword"),
    newPassword: formData.get("newPassword"),
    confirmPassword: formData.get("confirmPassword"),
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid password update." };
  }

  const validPassword = await verifyPassword(parsed.data.currentPassword, admin.passwordHash);
  if (!validPassword) {
    return { error: "Current password is incorrect." };
  }

  const passwordHash = await hashPassword(parsed.data.newPassword);
  await prisma.adminUser.update({
    where: { id: admin.id },
    data: { passwordHash },
  });

  await createAdminSession({
    adminId: admin.id,
    email: admin.email,
    name: admin.name,
  });

  revalidatePath("/admin/settings");

  return { success: "Password updated." };
}

export async function saveServiceAction(
  _state: AdminActionState,
  formData: FormData,
): Promise<AdminActionState> {
  await requireAdmin();
  const idValue = formData.get("id");
  const parsed = serviceSchema.safeParse({
    id: typeof idValue === "string" && idValue.length > 0 ? idValue : undefined,
    name: formData.get("name"),
    description: formData.get("description"),
    durationMinutes: formData.get("durationMinutes"),
    basePrice: formData.get("basePrice"),
    depositAmount: formData.get("depositAmount"),
    isActive: formData.get("isActive") === "on",
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid service." };
  }

  const basePrice = toMoneyDecimal(parsed.data.basePrice);
  const depositAmount = toMoneyDecimal(parsed.data.depositAmount);

  if (depositAmount.gt(basePrice)) {
    return { error: "Deposit cannot exceed the total price." };
  }

  const payload = {
    name: parsed.data.name,
    description: parsed.data.description,
    durationMinutes: parsed.data.durationMinutes,
    basePrice,
    depositAmount,
    isActive: parsed.data.isActive,
    slug: slugify(parsed.data.name),
  };

  if (parsed.data.id) {
    await prisma.service.update({
      where: { id: parsed.data.id },
      data: payload,
    });
  } else {
    await prisma.service.create({ data: payload });
  }

  revalidatePath("/admin/services");
  revalidatePath("/");
  revalidatePath("/book");

  return { success: parsed.data.id ? "Service updated." : "Service created." };
}

export async function saveAvailabilityRuleAction(
  _state: AdminActionState,
  formData: FormData,
): Promise<AdminActionState> {
  await requireAdmin();
  const idValue = formData.get("id");
  const parsed = availabilitySchema.safeParse({
    id: typeof idValue === "string" && idValue.length > 0 ? idValue : undefined,
    dayOfWeek: formData.get("dayOfWeek"),
    startTime: formData.get("startTime"),
    endTime: formData.get("endTime"),
    isActive: formData.get("isActive") === "on",
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid availability rule." };
  }

  if (parsed.data.startTime >= parsed.data.endTime) {
    return { error: "Availability end must be after start." };
  }

  if (parsed.data.id) {
    await prisma.availabilityRule.update({
      where: { id: parsed.data.id },
      data: {
        dayOfWeek: parsed.data.dayOfWeek,
        startTime: parsed.data.startTime,
        endTime: parsed.data.endTime,
        isActive: parsed.data.isActive,
      },
    });
  } else {
    await prisma.availabilityRule.create({
      data: {
        dayOfWeek: parsed.data.dayOfWeek,
        startTime: parsed.data.startTime,
        endTime: parsed.data.endTime,
        isActive: parsed.data.isActive,
      },
    });
  }

  revalidatePath("/admin/availability");
  revalidatePath("/book");

  return { success: parsed.data.id ? "Availability rule updated." : "Availability rule added." };
}

export async function saveBlackoutAction(
  _state: AdminActionState,
  formData: FormData,
): Promise<AdminActionState> {
  await requireAdmin();
  const idValue = formData.get("id");
  const parsed = blackoutSchema.safeParse({
    id: typeof idValue === "string" && idValue.length > 0 ? idValue : undefined,
    startsAt: formData.get("startsAt"),
    endsAt: formData.get("endsAt"),
    reason: formData.get("reason"),
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid blackout." };
  }

  const data = {
    // Datetime-local fields are Pacific wall-clock; parse in the business TZ so
    // the stored UTC instants match slot generation (see issue 002).
    startsAt: parseBusinessDateTimeLocalValue(parsed.data.startsAt),
    endsAt: parseBusinessDateTimeLocalValue(parsed.data.endsAt),
    reason: parsed.data.reason,
  };

  if (parsed.data.id) {
    // Re-activate on edit so a corrected blackout is applied even if it had been
    // deactivated (the list only shows active rows, but editing stays safe).
    await prisma.blackoutDate.update({
      where: { id: parsed.data.id },
      data: { ...data, isActive: true },
    });
  } else {
    await prisma.blackoutDate.create({ data });
  }

  revalidatePath("/admin/blackouts");
  revalidatePath("/book");

  return { success: parsed.data.id ? "Blackout updated." : "Blackout created." };
}

export async function deactivateBlackoutAction(
  _state: AdminActionState,
  formData: FormData,
): Promise<AdminActionState> {
  await requireAdmin();
  const id = formData.get("id");

  if (typeof id !== "string" || id.length === 0) {
    return { error: "Blackout not found." };
  }

  const blackout = await prisma.blackoutDate.findUnique({ where: { id } });

  if (!blackout) {
    return { error: "Blackout not found." };
  }

  if (!blackout.isActive) {
    return { success: "Blackout removed." };
  }

  await prisma.blackoutDate.update({
    where: { id },
    data: { isActive: false },
  });

  revalidatePath("/admin/blackouts");
  revalidatePath("/book");

  return { success: "Blackout removed." };
}

export async function updateBookingAction(
  _state: BookingUpdateState,
  formData: FormData,
): Promise<BookingUpdateState> {
  const admin = await requireAdmin();
  const parsed = bookingAdminUpdateSchema.safeParse({
    bookingId: formData.get("bookingId"),
    status: formData.get("status"),
    startAt: formData.get("startAt"),
    adminNotes: formData.get("adminNotes"),
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid booking update." };
  }

  const booking = await prisma.booking.findUnique({
    where: { id: parsed.data.bookingId },
    include: { service: true },
  });

  if (!booking) {
    return { error: "Booking not found." };
  }

  if (isImmutableBookingState(booking)) {
    return {
      error:
        "Bookings in a final state cannot be updated. The customer must create a new booking if service is still needed.",
    };
  }

  const beforeState = pickBookingEventState(booking);
  const data: {
    status?: BookingStatus;
    startAt?: Date;
    endAt?: Date;
    cancelledAt?: Date | null;
    adminNotes?: string;
    paymentStatus?: PaymentStatus;
    refundAmount?: typeof booking.depositAmount;
    refundedAt?: Date;
    refundReason?: string;
    stripeRefundId?: string;
  } = {};

  let eventType: BookingEventType = BookingEventType.BOOKING_UPDATED;

  if (parsed.data.status && parsed.data.status !== booking.status) {
    data.status = parsed.data.status;
    if (parsed.data.status === BookingStatus.CANCELLED) {
      if (booking.paymentStatus === PaymentStatus.PAID) {
        return { error: "Fully paid bookings must be refunded with the full refund action." };
      }

      data.cancelledAt = new Date();
      if (booking.paymentStatus === PaymentStatus.PENDING) {
        data.paymentStatus = PaymentStatus.FAILED;
      }
      eventType = BookingEventType.BOOKING_CANCELLED;

      if (booking.paymentStatus === PaymentStatus.PARTIALLY_PAID) {
        if (!booking.stripePaymentIntentId) {
          return { error: "Stripe payment reference is missing for this booking." };
        }

        const stripe = getStripe();
        const refund = await stripe.refunds.create(
          {
            payment_intent: booking.stripePaymentIntentId,
            amount: toStripeCents(booking.depositAmount),
            reason: "requested_by_customer",
            metadata: {
              bookingId: booking.id,
              refundSource: "admin-cancellation",
            },
          },
          {
            idempotencyKey: `admin-cancel-deposit-refund-${booking.id}`,
          },
        );

        data.paymentStatus = PaymentStatus.REFUNDED;
        data.refundAmount = booking.depositAmount;
        data.refundedAt = new Date();
        data.refundReason = "ADMIN_CANCELLED_DEPOSIT_REFUND";
        data.stripeRefundId = refund.id;
        eventType = BookingEventType.REFUND_ISSUED;
      }
    }
  }

  if (parsed.data.startAt) {
    const startAt = parseBusinessDateTimeLocalValue(parsed.data.startAt);
    if (startAt.getTime() !== booking.startAt.getTime()) {
      const endAt = addMinutes(startAt, booking.service.durationMinutes);

      // Honor the same overlap rules the customer flow and the
      // booking_no_overlap exclusion constraint enforce, excluding the booking
      // being moved. The constraint stays authoritative (see the catch below),
      // but checking first lets us return a readable message and name the
      // conflicting booking instead of surfacing a raw DB error.
      const conflict = await findOverlappingActiveBooking({
        startAt,
        endAt,
        excludeBookingId: booking.id,
      });

      if (conflict) {
        return {
          error: `That time overlaps ${conflict.customer.firstName} ${conflict.customer.lastName}'s ${
            conflict.service.name
          } booking at ${formatBusinessDateTimeLong(conflict.startAt)}. The booking was not changed.`,
        };
      }

      data.startAt = startAt;
      data.endAt = endAt;
      eventType = BookingEventType.BOOKING_RESCHEDULED;
    }
  }

  if (parsed.data.adminNotes !== undefined && parsed.data.adminNotes !== booking.adminNotes) {
    data.adminNotes = parsed.data.adminNotes;
    if (eventType === BookingEventType.BOOKING_UPDATED) {
      eventType = BookingEventType.ADMIN_NOTES_UPDATED;
    }
  }

  if (!Object.keys(data).length) {
    return {};
  }

  let updated: Awaited<ReturnType<typeof prisma.booking.update>>;
  try {
    updated = await prisma.booking.update({
      where: { id: booking.id },
      data,
    });
  } catch (error) {
    // Fallback for a booking that slipped into the window between the overlap
    // check above and this update: the booking_no_overlap exclusion constraint
    // rejects the UPDATE, and we map it to the same friendly message rather than
    // letting a raw Prisma error reach the admin screen.
    if (
      eventType === BookingEventType.BOOKING_RESCHEDULED &&
      (error instanceof Prisma.PrismaClientKnownRequestError ||
        error instanceof Prisma.PrismaClientUnknownRequestError)
    ) {
      return {
        error: "That time overlaps another booking. The booking was not changed.",
      };
    }
    throw error;
  }

  await createBookingEvent({
    bookingId: booking.id,
    type: eventType,
    actorAdminUserId: admin.id,
    actorLabel: admin.email,
    beforeState,
    afterState: pickBookingEventState(updated),
  });

  if (eventType === BookingEventType.REFUND_ISSUED && updated.refundReason === "ADMIN_CANCELLED_DEPOSIT_REFUND") {
    try {
      await sendCancellationOutcomeEmail(booking.id, "admin_cancelled_refunded");
    } catch (error) {
      console.error("Failed to send admin cancellation refund email", error);
    }
  }

  revalidatePath("/admin/bookings");
  revalidatePath("/booking/confirmation");

  return { success: "Booking updated." };
}

export async function requestBookingBalanceAction(
  _state: AdminActionState,
  formData: FormData,
): Promise<AdminActionState> {
  const admin = await requireAdmin();
  const parsed = requestBookingBalanceSchema.safeParse({
    bookingId: formData.get("bookingId"),
    deliveryChannel: formData.get("deliveryChannel"),
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid balance request." };
  }

  const booking = await prisma.booking.findUnique({
    where: { id: parsed.data.bookingId },
    include: { service: true, customer: true },
  });

  if (!booking) {
    return { error: "Booking not found." };
  }

  if (booking.archivedAt) {
    return { error: "Archived bookings cannot request balance payments." };
  }

  if (booking.status !== BookingStatus.CONFIRMED) {
    return { error: "Only confirmed bookings can request the remaining balance." };
  }

  if (booking.paymentStatus !== PaymentStatus.PARTIALLY_PAID) {
    return { error: "This booking is not awaiting a remaining balance payment." };
  }

  if (!booking.balanceDue.gt(0)) {
    return { error: "This booking does not have any remaining balance due." };
  }

  const deliveryChannel = parsed.data.deliveryChannel as BalanceRequestDeliveryChannel;
  if (deliveryChannel !== EMAIL_DELIVERY_CHANNEL) {
    return { error: "That delivery channel is not available yet." };
  }

  const beforeState = pickBookingEventState(booking);
  const nextVersion = booking.balanceRequestVersion + 1;
  const env = getEnv();
  const appOrigin = await getRequestOrigin(env.appUrl);
  const manageUrl = getManagementUrlForCustomer(booking.customer);
  const stripe = getStripe();
  const session = await stripe.checkout.sessions.create(
    {
      mode: "payment",
      // Instant methods only, matching the deposit checkout — deferred methods
      // would leave the balance unsettled for days.
      payment_method_types: ["card"],
      customer_email: booking.customer.email,
      metadata: {
        bookingId: booking.id,
        checkoutPurpose: "balance",
        balanceRequestVersion: String(nextVersion),
      },
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: "usd",
            unit_amount: toStripeCents(booking.balanceDue),
            product_data: {
              name: `${booking.service.name} remaining balance`,
              description: `Deposit already received: ${booking.depositAmount.toFixed(2)}`,
            },
          },
        },
      ],
      success_url: `${appOrigin}/booking/confirmation?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: manageUrl ?? `${appOrigin}/`,
    },
    {
      idempotencyKey: `booking-balance-request-${booking.id}-${nextVersion}`,
    },
  );

  if (!session.url) {
    throw new Error("Stripe did not return a payment link.");
  }

  const delivery = await sendBalancePaymentRequest({
    booking,
    deliveryChannel,
    checkoutUrl: session.url,
  });

  const updated = await prisma.booking.update({
    where: { id: booking.id },
    data: {
      balanceRequestVersion: nextVersion,
      balanceRequestedAt: new Date(),
      balanceRequestDeliveryChannel: deliveryChannel,
      balanceRequestDestination: delivery.destination,
      balanceCheckoutSessionId: session.id,
    },
  });

  await createBookingEvent({
    bookingId: booking.id,
    type: BookingEventType.BALANCE_PAYMENT_REQUESTED,
    actorAdminUserId: admin.id,
    actorLabel: admin.email,
    beforeState,
    afterState: pickBookingEventState(updated),
  });

  revalidatePath("/admin/bookings");
  revalidatePath("/booking/manage");

  return { success: "Remaining balance request sent." };
}

export async function archiveBookingAction(
  _state: AdminActionState,
  formData: FormData,
): Promise<AdminActionState> {
  const admin = await requireAdmin();
  const bookingId = formData.get("bookingId");

  if (typeof bookingId !== "string" || bookingId.length === 0) {
    return { error: "Booking not found." };
  }

  const booking = await prisma.booking.findUnique({
    where: { id: bookingId },
  });

  if (!booking) {
    return { error: "Booking not found." };
  }

  if (!canArchiveBooking(booking.status)) {
    return { error: "Only terminal bookings can be archived." };
  }

  if (booking.archivedAt) {
    return { success: "Booking archived." };
  }

  const archivedAt = new Date();
  const updated = await prisma.booking.update({
    where: { id: bookingId },
    data: {
      archivedAt,
      archivedByAdminUserId: admin.id,
      customerAccessEndsAt: getArchivedCustomerAccessEndsAt(archivedAt),
    },
  });

  await createBookingEvent({
    bookingId,
    type: BookingEventType.BOOKING_ARCHIVED,
    actorAdminUserId: admin.id,
    actorLabel: admin.email,
    beforeState: pickBookingEventState(booking),
    afterState: pickBookingEventState(updated),
  });

  revalidatePath("/admin/bookings");

  return { success: "Booking archived." };
}

export async function unarchiveBookingAction(
  _state: AdminActionState,
  formData: FormData,
): Promise<AdminActionState> {
  const admin = await requireAdmin();
  const bookingId = formData.get("bookingId");

  if (typeof bookingId !== "string" || bookingId.length === 0) {
    return { error: "Booking not found." };
  }

  const booking = await prisma.booking.findUnique({
    where: { id: bookingId },
  });

  if (!booking) {
    return { error: "Booking not found." };
  }

  if (!booking.archivedAt) {
    return { success: "Booking restored." };
  }

  const updated = await prisma.booking.update({
    where: { id: bookingId },
    data: {
      archivedAt: null,
      archivedByAdminUserId: null,
      customerAccessEndsAt: null,
    },
  });

  await createBookingEvent({
    bookingId,
    type: BookingEventType.BOOKING_UNARCHIVED,
    actorAdminUserId: admin.id,
    actorLabel: admin.email,
    beforeState: pickBookingEventState(booking),
    afterState: pickBookingEventState(updated),
  });

  revalidatePath("/admin/bookings");

  return { success: "Booking restored." };
}

export async function issueBookingRefundAction(
  _state: AdminActionState,
  formData: FormData,
): Promise<AdminActionState> {
  const admin = await requireAdmin();
  const bookingId = formData.get("bookingId");

  if (typeof bookingId !== "string" || bookingId.length === 0) {
    return { error: "Booking not found." };
  }

  const booking = await prisma.booking.findUnique({
    where: { id: bookingId },
    include: {
      service: true,
    },
  });

  if (!booking) {
    return { error: "Booking not found." };
  }

  if (booking.status !== BookingStatus.CANCELLED) {
    return { error: "Only canceled bookings can be refunded." };
  }

  if (booking.paymentStatus !== PaymentStatus.PARTIALLY_PAID) {
    return { error: "This booking is not awaiting a refund." };
  }

  if (booking.refundReason !== "CUSTOMER_CANCELLED_INSIDE_24_HOURS") {
    return { error: "This booking is not eligible for an admin-issued refund." };
  }

  if (!booking.stripePaymentIntentId) {
    return { error: "Stripe payment reference is missing for this booking." };
  }

  const stripe = getStripe();
  const refund = await stripe.refunds.create(
    {
      payment_intent: booking.stripePaymentIntentId,
      amount: toStripeCents(booking.depositAmount),
      reason: "requested_by_customer",
      metadata: {
        bookingId: booking.id,
        refundSource: "admin-dashboard",
      },
    },
    {
      idempotencyKey: `admin-booking-refund-${booking.id}`,
    },
  );

  const updated = await prisma.booking.update({
    where: { id: booking.id },
    data: {
      paymentStatus: PaymentStatus.REFUNDED,
      refundAmount: booking.depositAmount,
      refundedAt: new Date(),
      refundReason: "ADMIN_REFUNDED_LATE_CANCELLATION",
      stripeRefundId: refund.id,
    },
  });

  await createBookingEvent({
    bookingId: booking.id,
    type: BookingEventType.REFUND_ISSUED,
    actorAdminUserId: admin.id,
    actorLabel: admin.email,
    beforeState: pickBookingEventState(booking),
    afterState: pickBookingEventState(updated),
  });

  try {
    await sendCancellationOutcomeEmail(booking.id, "admin_refunded");
  } catch (error) {
    console.error("Failed to send admin refund email", error);
  }

  revalidatePath("/admin/bookings");
  revalidatePath("/booking/manage");

  return { success: "Deposit refund issued." };
}

export async function issueFullBookingRefundAction(
  _state: AdminActionState,
  formData: FormData,
): Promise<AdminActionState> {
  const admin = await requireAdmin();
  const bookingId = formData.get("bookingId");

  if (typeof bookingId !== "string" || bookingId.length === 0) {
    return { error: "Booking not found." };
  }

  let booking = await prisma.booking.findUnique({
    where: { id: bookingId },
    include: {
      service: true,
    },
  });

  if (!booking) {
    return { error: "Booking not found." };
  }

  if (!canIssueFullRefund(booking)) {
    return { error: "Only confirmed or completed paid bookings can be fully refunded." };
  }

  if (!booking.stripePaymentIntentId) {
    return { error: "Stripe deposit payment reference is missing for this booking." };
  }

  const balanceRefundAmount = subtractMoney(booking.totalPrice, booking.depositAmount);
  const requiresBalanceRefund = balanceRefundAmount.gt(0);
  const balancePaymentIntentId = booking.balancePaymentIntentId;

  if (requiresBalanceRefund && !balancePaymentIntentId) {
    return { error: "Stripe balance payment reference is missing for this booking." };
  }

  const beforeState = pickBookingEventState(booking);
  const stripe = getStripe();
  const refundedAt = new Date();

  if (!booking.stripeRefundId) {
    const depositRefund = await stripe.refunds.create(
      {
        payment_intent: booking.stripePaymentIntentId,
        amount: toStripeCents(booking.depositAmount),
        reason: "requested_by_customer",
        metadata: {
          bookingId: booking.id,
          refundSource: "admin-full-refund-deposit",
        },
      },
      {
        idempotencyKey: `admin-full-deposit-refund-${booking.id}`,
      },
    );

    booking = await prisma.booking.update({
      where: { id: booking.id },
      data: {
        refundAmount: booking.depositAmount,
        refundReason: "ADMIN_FULL_REFUND_IN_PROGRESS",
        stripeRefundId: depositRefund.id,
      },
      include: {
        service: true,
      },
    });
  }

  if (requiresBalanceRefund && !booking.stripeBalanceRefundId) {
    if (!balancePaymentIntentId) {
      throw new Error("Stripe balance payment reference is missing for this booking.");
    }

    const balanceRefund = await stripe.refunds.create(
      {
        payment_intent: balancePaymentIntentId,
        amount: toStripeCents(balanceRefundAmount),
        reason: "requested_by_customer",
        metadata: {
          bookingId: booking.id,
          refundSource: "admin-full-refund-balance",
        },
      },
      {
        idempotencyKey: `admin-full-balance-refund-${booking.id}`,
      },
    );

    booking = await prisma.booking.update({
      where: { id: booking.id },
      data: {
        refundAmount: booking.totalPrice,
        refundReason: "ADMIN_FULL_REFUND_IN_PROGRESS",
        stripeBalanceRefundId: balanceRefund.id,
      },
      include: {
        service: true,
      },
    });
  }

  const updated = await prisma.booking.update({
    where: { id: booking.id },
    data: {
      status: booking.status === BookingStatus.CONFIRMED ? BookingStatus.CANCELLED : booking.status,
      paymentStatus: PaymentStatus.REFUNDED,
      balanceDue: 0,
      refundAmount: booking.totalPrice,
      refundedAt,
      refundReason: "ADMIN_FULL_REFUND",
      cancelledAt: booking.status === BookingStatus.CONFIRMED ? (booking.cancelledAt ?? refundedAt) : booking.cancelledAt,
    },
  });

  await createBookingEvent({
    bookingId: booking.id,
    type: BookingEventType.REFUND_ISSUED,
    actorAdminUserId: admin.id,
    actorLabel: admin.email,
    beforeState,
    afterState: pickBookingEventState(updated),
  });

  try {
    await sendCancellationOutcomeEmail(booking.id, "admin_full_refunded");
  } catch (error) {
    console.error("Failed to send full refund email", error);
  }

  revalidatePath("/admin/bookings");
  revalidatePath("/booking/manage");

  return { success: "Full refund issued." };
}

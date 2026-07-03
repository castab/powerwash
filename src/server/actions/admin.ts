"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { addMinutes } from "date-fns";
import {
  BookingEventType,
  BookingStatus,
  PaymentStatus,
  type BalanceRequestDeliveryChannel,
} from "@/generated/prisma/client";
import { createAdminSession, hashPassword, requireAdmin, verifyPassword } from "@/lib/auth";
import { isImmutableBookingState } from "@/lib/booking-state";
import { sendBalancePaymentRequest } from "@/lib/balance-payment";
import { getArchivedCustomerAccessEndsAt, getManagementUrlForBooking } from "@/lib/booking-management";
import { createBookingEvent, pickBookingEventState } from "@/lib/booking-events";
import { sendCancellationOutcomeEmail } from "@/lib/booking-management";
import { getEnv } from "@/lib/env";
import { prisma } from "@/lib/prisma";
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

export async function loginAdminAction(_state: { error?: string }, formData: FormData) {
  const parsed = adminLoginSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid login." };
  }

  const admin = await prisma.adminUser.findUnique({
    where: { email: parsed.data.email },
  });

  if (!admin || !admin.isActive) {
    return { error: "Invalid credentials." };
  }

  const validPassword = await verifyPassword(parsed.data.password, admin.passwordHash);
  if (!validPassword) {
    return { error: "Invalid credentials." };
  }

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

export async function saveServiceAction(formData: FormData) {
  const parsed = serviceSchema.safeParse({
    id: formData.get("id"),
    name: formData.get("name"),
    description: formData.get("description"),
    durationMinutes: formData.get("durationMinutes"),
    basePrice: formData.get("basePrice"),
    depositAmount: formData.get("depositAmount"),
    isActive: formData.get("isActive") === "on",
  });

  if (!parsed.success) {
    throw new Error(parsed.error.issues[0]?.message ?? "Invalid service.");
  }

  const basePrice = toMoneyDecimal(parsed.data.basePrice);
  const depositAmount = toMoneyDecimal(parsed.data.depositAmount);

  if (depositAmount.gt(basePrice)) {
    throw new Error("Deposit cannot exceed the total price.");
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
}

export async function saveAvailabilityRuleAction(formData: FormData) {
  const parsed = availabilitySchema.safeParse({
    id: formData.get("id"),
    dayOfWeek: formData.get("dayOfWeek"),
    startTime: formData.get("startTime"),
    endTime: formData.get("endTime"),
    isActive: formData.get("isActive") === "on",
  });

  if (!parsed.success) {
    throw new Error(parsed.error.issues[0]?.message ?? "Invalid availability rule.");
  }

  if (parsed.data.startTime >= parsed.data.endTime) {
    throw new Error("Availability end must be after start.");
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
}

export async function saveBlackoutAction(formData: FormData) {
  const parsed = blackoutSchema.safeParse({
    startsAt: formData.get("startsAt"),
    endsAt: formData.get("endsAt"),
    reason: formData.get("reason"),
  });

  if (!parsed.success) {
    throw new Error(parsed.error.issues[0]?.message ?? "Invalid blackout.");
  }

  await prisma.blackoutDate.create({
    data: {
      startsAt: new Date(parsed.data.startsAt),
      endsAt: new Date(parsed.data.endsAt),
      reason: parsed.data.reason,
    },
  });

  revalidatePath("/admin/blackouts");
  revalidatePath("/book");
}

export async function updateBookingAction(formData: FormData) {
  const admin = await requireAdmin();
  const parsed = bookingAdminUpdateSchema.safeParse({
    bookingId: formData.get("bookingId"),
    status: formData.get("status"),
    startAt: formData.get("startAt"),
    adminNotes: formData.get("adminNotes"),
  });

  if (!parsed.success) {
    throw new Error(parsed.error.issues[0]?.message ?? "Invalid booking update.");
  }

  const booking = await prisma.booking.findUnique({
    where: { id: parsed.data.bookingId },
    include: { service: true },
  });

  if (!booking) {
    throw new Error("Booking not found.");
  }

  if (isImmutableBookingState(booking)) {
    throw new Error(
      "Bookings in a final state cannot be updated. The customer must create a new booking if service is still needed.",
    );
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
        throw new Error("Fully paid bookings must be refunded with the full refund action.");
      }

      data.cancelledAt = new Date();
      if (booking.paymentStatus === PaymentStatus.PENDING) {
        data.paymentStatus = PaymentStatus.FAILED;
      }
      eventType = BookingEventType.BOOKING_CANCELLED;

      if (booking.paymentStatus === PaymentStatus.PARTIALLY_PAID) {
        if (!booking.stripePaymentIntentId) {
          throw new Error("Stripe payment reference is missing for this booking.");
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
      data.startAt = startAt;
      data.endAt = addMinutes(startAt, booking.service.durationMinutes);
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
    return;
  }

  const updated = await prisma.booking.update({
    where: { id: booking.id },
    data,
  });

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
}

export async function requestBookingBalanceAction(formData: FormData) {
  const admin = await requireAdmin();
  const parsed = requestBookingBalanceSchema.safeParse({
    bookingId: formData.get("bookingId"),
    deliveryChannel: formData.get("deliveryChannel"),
  });

  if (!parsed.success) {
    throw new Error(parsed.error.issues[0]?.message ?? "Invalid balance request.");
  }

  const booking = await prisma.booking.findUnique({
    where: { id: parsed.data.bookingId },
    include: { service: true },
  });

  if (!booking) {
    throw new Error("Booking not found.");
  }

  if (booking.archivedAt) {
    throw new Error("Archived bookings cannot request balance payments.");
  }

  if (booking.status !== BookingStatus.CONFIRMED) {
    throw new Error("Only confirmed bookings can request the remaining balance.");
  }

  if (booking.paymentStatus !== PaymentStatus.PARTIALLY_PAID) {
    throw new Error("This booking is not awaiting a remaining balance payment.");
  }

  if (!booking.balanceDue.gt(0)) {
    throw new Error("This booking does not have any remaining balance due.");
  }

  const deliveryChannel = parsed.data.deliveryChannel as BalanceRequestDeliveryChannel;
  if (deliveryChannel !== EMAIL_DELIVERY_CHANNEL) {
    throw new Error("That delivery channel is not available yet.");
  }

  const beforeState = pickBookingEventState(booking);
  const nextVersion = booking.balanceRequestVersion + 1;
  const env = getEnv();
  const appOrigin = await getRequestOrigin(env.appUrl);
  const manageUrl = getManagementUrlForBooking(booking);
  const stripe = getStripe();
  const session = await stripe.checkout.sessions.create(
    {
      mode: "payment",
      customer_email: booking.email,
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
}

export async function archiveBookingAction(formData: FormData) {
  const admin = await requireAdmin();
  const bookingId = formData.get("bookingId");

  if (typeof bookingId !== "string" || bookingId.length === 0) {
    throw new Error("Booking not found.");
  }

  const booking = await prisma.booking.findUnique({
    where: { id: bookingId },
  });

  if (!booking) {
    throw new Error("Booking not found.");
  }

  if (!canArchiveBooking(booking.status)) {
    throw new Error("Only terminal bookings can be archived.");
  }

  if (booking.archivedAt) {
    return;
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
}

export async function unarchiveBookingAction(formData: FormData) {
  const admin = await requireAdmin();
  const bookingId = formData.get("bookingId");

  if (typeof bookingId !== "string" || bookingId.length === 0) {
    throw new Error("Booking not found.");
  }

  const booking = await prisma.booking.findUnique({
    where: { id: bookingId },
  });

  if (!booking) {
    throw new Error("Booking not found.");
  }

  if (!booking.archivedAt) {
    return;
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
}

export async function issueBookingRefundAction(formData: FormData) {
  const admin = await requireAdmin();
  const bookingId = formData.get("bookingId");

  if (typeof bookingId !== "string" || bookingId.length === 0) {
    throw new Error("Booking not found.");
  }

  const booking = await prisma.booking.findUnique({
    where: { id: bookingId },
    include: {
      service: true,
    },
  });

  if (!booking) {
    throw new Error("Booking not found.");
  }

  if (booking.status !== BookingStatus.CANCELLED) {
    throw new Error("Only canceled bookings can be refunded.");
  }

  if (booking.paymentStatus !== PaymentStatus.PARTIALLY_PAID) {
    throw new Error("This booking is not awaiting a refund.");
  }

  if (booking.refundReason !== "CUSTOMER_CANCELLED_INSIDE_24_HOURS") {
    throw new Error("This booking is not eligible for an admin-issued refund.");
  }

  if (!booking.stripePaymentIntentId) {
    throw new Error("Stripe payment reference is missing for this booking.");
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
}

export async function issueFullBookingRefundAction(formData: FormData) {
  const admin = await requireAdmin();
  const bookingId = formData.get("bookingId");

  if (typeof bookingId !== "string" || bookingId.length === 0) {
    throw new Error("Booking not found.");
  }

  let booking = await prisma.booking.findUnique({
    where: { id: bookingId },
    include: {
      service: true,
    },
  });

  if (!booking) {
    throw new Error("Booking not found.");
  }

  if (!canIssueFullRefund(booking)) {
    throw new Error("Only confirmed or completed paid bookings can be fully refunded.");
  }

  if (!booking.stripePaymentIntentId) {
    throw new Error("Stripe deposit payment reference is missing for this booking.");
  }

  const balanceRefundAmount = subtractMoney(booking.totalPrice, booking.depositAmount);
  const requiresBalanceRefund = balanceRefundAmount.gt(0);
  const balancePaymentIntentId = booking.balancePaymentIntentId;

  if (requiresBalanceRefund && !balancePaymentIntentId) {
    throw new Error("Stripe balance payment reference is missing for this booking.");
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
}

"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { BookingEventType, BookingStatus, PaymentStatus } from "@/generated/prisma/client";
import { createHeldBooking } from "@/lib/booking";
import { createBookingEvent, pickBookingEventState } from "@/lib/booking-events";
import { getEnv } from "@/lib/env";
import {
  canAutoRefundBooking,
  getManagedBookingByToken,
  rotateAndSendManageBookingEmail,
  sendCancellationOutcomeEmail,
} from "@/lib/booking-management";
import { reconcileCheckoutSession } from "@/lib/stripe-reconciliation";
import { getStripe } from "@/lib/stripe";
import { bookingSchema } from "@/lib/validators";
import { prisma } from "@/lib/prisma";
import { getRequestOrigin } from "@/lib/request-origin";
import { formatCurrency, toStripeCents } from "@/lib/utils";

export type BookingActionState = {
  status: "idle" | "error";
  message: string;
};

const recentConfirmationReconciliations = new Map<string, number>();

function getConfirmationReconcileConfig() {
  const env = getEnv();

  return {
    debounceMs: env.confirmationReconcileDebounceMs,
    mapMaxSize: env.confirmationReconcileMapMaxSize,
  };
}

function pruneRecentConfirmationReconciliations(
  now: number,
  config: ReturnType<typeof getConfirmationReconcileConfig>,
) {
  for (const [sessionId, attemptedAt] of recentConfirmationReconciliations) {
    if (now - attemptedAt >= config.debounceMs) {
      recentConfirmationReconciliations.delete(sessionId);
    }
  }

  if (recentConfirmationReconciliations.size < config.mapMaxSize) {
    return;
  }

  const entries = [...recentConfirmationReconciliations.entries()].sort((a, b) => a[1] - b[1]);
  const overflowCount = recentConfirmationReconciliations.size - config.mapMaxSize + 1;

  for (const [sessionId] of entries.slice(0, overflowCount)) {
    recentConfirmationReconciliations.delete(sessionId);
  }
}

function buildManageRedirect(token: string, params: Record<string, string>) {
  const searchParams = new URLSearchParams({ token, ...params });
  return `/booking/manage?${searchParams.toString()}`;
}

function isRedirectError(error: unknown) {
  return (
    typeof error === "object" &&
    error !== null &&
    "digest" in error &&
    typeof error.digest === "string" &&
    error.digest.startsWith("NEXT_REDIRECT")
  );
}

async function cancelManagedBooking(token: string, confirmedInsideWindow: boolean) {
  const booking = await getManagedBookingByToken(token);

  if (!booking) {
    redirect("/booking/manage?error=invalid_link");
  }

  if (booking.status === BookingStatus.CANCELLED) {
    const result =
      booking.paymentStatus === PaymentStatus.REFUNDED
        ? "already_cancelled_refunded"
        : "already_cancelled";
    redirect(buildManageRedirect(token, { result }));
  }

  if (booking.status === BookingStatus.COMPLETED || booking.status === BookingStatus.NO_SHOW) {
    redirect(buildManageRedirect(token, { error: "cannot_cancel_terminal" }));
  }

  if (booking.archivedAt) {
    redirect(buildManageRedirect(token, { error: "archived_view_only" }));
  }

  if (
    booking.status !== BookingStatus.CONFIRMED ||
    booking.paymentStatus !== PaymentStatus.PARTIALLY_PAID
  ) {
    redirect(buildManageRedirect(token, { error: "not_cancellable" }));
  }

  const beforeState = pickBookingEventState(booking);

  if (!canAutoRefundBooking(booking.startAt)) {
    if (!confirmedInsideWindow) {
      redirect(buildManageRedirect(token, { error: "confirm_required" }));
    }

    const updated = await prisma.booking.update({
      where: { id: booking.id },
      data: {
        status: BookingStatus.CANCELLED,
        cancelledAt: new Date(),
        refundReason: "CUSTOMER_CANCELLED_INSIDE_24_HOURS",
      },
    });

    await createBookingEvent({
      bookingId: booking.id,
      type: BookingEventType.BOOKING_CANCELLED,
      actorLabel: "customer",
      beforeState,
      afterState: pickBookingEventState(updated),
    });

    try {
      await sendCancellationOutcomeEmail(booking.id, "cancelled_contact_admin");
    } catch (error) {
      console.error("Failed to send no-auto-refund cancellation email", error);
    }

    revalidatePath("/admin/bookings");
    redirect(buildManageRedirect(token, { result: "cancelled_contact_admin" }));
  }

  if (!booking.stripePaymentIntentId) {
    redirect(buildManageRedirect(token, { error: "refund_unavailable" }));
  }

  const stripe = getStripe();
  const refund = await stripe.refunds.create(
    {
      payment_intent: booking.stripePaymentIntentId,
      amount: toStripeCents(booking.depositAmount),
      reason: "requested_by_customer",
      metadata: {
        bookingId: booking.id,
      },
    },
    {
      idempotencyKey: `booking-cancel-refund-${booking.id}`,
    },
  );

  const updated = await prisma.booking.update({
    where: { id: booking.id },
    data: {
      status: BookingStatus.CANCELLED,
      paymentStatus: PaymentStatus.REFUNDED,
      cancelledAt: new Date(),
      refundedAt: new Date(),
      refundAmount: booking.depositAmount,
      refundReason: "CUSTOMER_CANCELLED_24_HOURS_PLUS",
      stripeRefundId: refund.id,
    },
  });

  await createBookingEvent({
    bookingId: booking.id,
    type: BookingEventType.REFUND_ISSUED,
    actorLabel: "customer",
    beforeState,
    afterState: pickBookingEventState(updated),
  });

  try {
    await sendCancellationOutcomeEmail(booking.id, "cancelled_refunded");
  } catch (error) {
    console.error("Failed to send refunded cancellation email", error);
  }

  revalidatePath("/admin/bookings");
  redirect(buildManageRedirect(token, { result: "cancelled_refunded" }));
}

export async function createBookingCheckoutAction(
  _prevState: BookingActionState,
  formData: FormData,
): Promise<BookingActionState> {
  const parsed = bookingSchema.safeParse({
    serviceId: formData.get("serviceId"),
    date: formData.get("date"),
    startAt: formData.get("startAt"),
    firstName: formData.get("firstName"),
    lastName: formData.get("lastName"),
    email: formData.get("email"),
    phone: formData.get("phone"),
    vehicleDescription: formData.get("vehicleDescription"),
    color: formData.get("color"),
    licensePlate: formData.get("licensePlate"),
    notes: formData.get("notes"),
  });

  if (!parsed.success) {
    return {
      status: "error",
      message: parsed.error.issues[0]?.message ?? "Please review the form.",
    };
  }

  try {
    const env = getEnv();
    const appOrigin = await getRequestOrigin(env.appUrl);
    const startAt = new Date(parsed.data.startAt);
    const booking = await createHeldBooking({
      ...parsed.data,
      startAtIso: parsed.data.startAt,
      startAt,
    });

    const stripe = getStripe();
    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      customer_email: booking.email,
      metadata: {
        bookingId: booking.id,
        checkoutPurpose: "deposit",
      },
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: "usd",
            unit_amount: toStripeCents(booking.depositAmount),
            product_data: {
              name: `${booking.service.name} deposit`,
              description: `Remaining balance outstanding after deposit: ${formatCurrency(booking.balanceDue)}`,
            },
          },
        },
      ],
      success_url: `${appOrigin}/booking/confirmation?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${appOrigin}/book?serviceId=${booking.serviceId}`,
    });

    await prisma.booking.update({
      where: { id: booking.id },
      data: { stripeCheckoutSessionId: session.id },
    });

    redirect(session.url ?? `${appOrigin}/booking/confirmation`);
  } catch (error) {
    if (isRedirectError(error)) {
      throw error;
    }

    return {
      status: "error",
      message:
        error instanceof Error ? error.message : "Unable to start checkout. Please try again.",
    };
  }
}

export async function cancelManagedBookingAction(token: string, formData: FormData) {
  try {
    await cancelManagedBooking(token, formData.get("confirmInsideWindow") === "true");
  } catch (error) {
    if (isRedirectError(error)) {
      throw error;
    }

    redirect(buildManageRedirect(token, { error: "cancel_failed" }));
  }
}

export async function resendManagedBookingLinkAction(token: string) {
  try {
    const booking = await getManagedBookingByToken(token);

    if (!booking) {
      redirect("/booking/manage?error=invalid_link");
    }

    if (booking.archivedAt) {
      redirect(buildManageRedirect(token, { error: "archived_view_only" }));
    }

    const nextToken = await rotateAndSendManageBookingEmail(booking.id);
    if (!nextToken) {
      redirect(buildManageRedirect(token, { error: "resend_failed" }));
    }
    redirect(buildManageRedirect(nextToken, { result: "resent" }));
  } catch (error) {
    if (isRedirectError(error)) {
      throw error;
    }

    redirect(buildManageRedirect(token, { error: "resend_failed" }));
  }
}

export async function reconcileBookingConfirmationAction(formData: FormData) {
  const sessionId = formData.get("sessionId");

  if (typeof sessionId !== "string" || sessionId.length === 0) {
    redirect("/booking/confirmation");
  }

  const now = Date.now();
  const config = getConfirmationReconcileConfig();
  pruneRecentConfirmationReconciliations(now, config);
  const lastAttemptAt = recentConfirmationReconciliations.get(sessionId) ?? 0;

  if (now - lastAttemptAt >= config.debounceMs) {
    recentConfirmationReconciliations.set(sessionId, now);

    const result = await reconcileCheckoutSession({
      sessionId,
      trigger: "booking-confirmation",
    });

    if (result.stateChanged) {
      revalidatePath("/booking/confirmation");
      revalidatePath("/booking/manage");
      revalidatePath("/admin/bookings");
    }
  }

  redirect(`/booking/confirmation?session_id=${encodeURIComponent(sessionId)}`);
}

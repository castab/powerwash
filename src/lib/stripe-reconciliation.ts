import { BookingEventType, BookingStatus, PaymentStatus } from "@/generated/prisma/client";
import { ensureInitialManageBookingEmail } from "@/lib/booking-management";
import { createBookingEvent, pickBookingEventState } from "@/lib/booking-events";
import { prisma } from "@/lib/prisma";
import { getStripe } from "@/lib/stripe";

type CheckoutSessionWithMetadata = {
  id: string;
  status: string | null;
  payment_status: string;
  payment_intent: string | { id: string } | null;
  metadata?: Record<string, string | undefined> | null;
};

export type StripeReconciliationTrigger = "stripe-webhook" | "booking-confirmation";

export type StripeReconciliationResult = {
  sessionId: string;
  bookingId: string | null;
  trigger: StripeReconciliationTrigger;
  reconciled: boolean;
  throttled: boolean;
  stateChanged: boolean;
  outcome:
    | "completed"
    | "expired"
    | "noop"
    | "missing-booking-id"
    | "booking-not-found";
};

function getCheckoutPurpose(session: { metadata?: Record<string, string | undefined> | null }) {
  return session.metadata?.checkoutPurpose === "balance" ? "balance" : "deposit";
}

function getBalanceRequestVersion(session: { metadata?: Record<string, string | undefined> | null }) {
  const raw = session.metadata?.balanceRequestVersion;
  const version = raw ? Number(raw) : NaN;
  return Number.isInteger(version) ? version : null;
}

function getPaymentIntentId(session: CheckoutSessionWithMetadata) {
  if (typeof session.payment_intent === "string") {
    return session.payment_intent;
  }

  return session.payment_intent?.id ?? null;
}

async function reconcileCompletedSession(
  session: CheckoutSessionWithMetadata,
  trigger: StripeReconciliationTrigger,
  bookingId: string,
) {
  const before = await prisma.booking.findUnique({
    where: { id: bookingId },
  });

  if (!before) {
    return {
      bookingId,
      reconciled: false,
      stateChanged: false,
      outcome: "booking-not-found" as const,
    };
  }

  const checkoutPurpose = getCheckoutPurpose(session);
  const paymentIntentId = getPaymentIntentId(session);

  if (checkoutPurpose === "deposit") {
    const shouldUpdate =
      before.status !== BookingStatus.CONFIRMED ||
      before.paymentStatus !== PaymentStatus.PARTIALLY_PAID ||
      before.stripeCheckoutSessionId !== session.id ||
      before.stripePaymentIntentId !== paymentIntentId ||
      before.confirmedAt === null;

    if (!shouldUpdate) {
      await ensureInitialManageBookingEmail(bookingId);

      return {
        bookingId,
        reconciled: true,
        stateChanged: false,
        outcome: "completed" as const,
      };
    }

    const updated = await prisma.booking.update({
      where: { id: bookingId },
      data: {
        status: BookingStatus.CONFIRMED,
        paymentStatus: PaymentStatus.PARTIALLY_PAID,
        confirmedAt: before.confirmedAt ?? new Date(),
        stripeCheckoutSessionId: session.id,
        stripePaymentIntentId: paymentIntentId,
      },
    });

    await createBookingEvent({
      bookingId,
      type: BookingEventType.PAYMENT_CONFIRMED,
      actorLabel: trigger,
      beforeState: pickBookingEventState(before),
      afterState: pickBookingEventState(updated),
    });

    await ensureInitialManageBookingEmail(bookingId);

    return {
      bookingId,
      reconciled: true,
      stateChanged: true,
      outcome: "completed" as const,
    };
  }

  const version = getBalanceRequestVersion(session);
  const isActiveRequest =
    version !== null &&
    before.balanceRequestVersion === version &&
    before.balanceCheckoutSessionId === session.id &&
    before.paymentStatus === PaymentStatus.PARTIALLY_PAID;

  if (!isActiveRequest) {
    return {
      bookingId,
      reconciled: true,
      stateChanged: false,
      outcome: "completed" as const,
    };
  }

  const shouldUpdate =
    before.paymentStatus !== PaymentStatus.PAID ||
    !before.balanceDue.eq(0) ||
    before.balancePaymentIntentId !== paymentIntentId ||
    before.balancePaidAt === null;

  if (!shouldUpdate) {
    return {
      bookingId,
      reconciled: true,
      stateChanged: false,
      outcome: "completed" as const,
    };
  }

  const updated = await prisma.booking.update({
    where: { id: bookingId },
    data: {
      paymentStatus: PaymentStatus.PAID,
      balanceDue: 0,
      balancePaymentIntentId: paymentIntentId,
      balancePaidAt: before.balancePaidAt ?? new Date(),
    },
  });

  await createBookingEvent({
    bookingId,
    type: BookingEventType.BALANCE_PAYMENT_CONFIRMED,
    actorLabel: trigger,
    beforeState: pickBookingEventState(before),
    afterState: pickBookingEventState(updated),
  });

  return {
    bookingId,
    reconciled: true,
    stateChanged: true,
    outcome: "completed" as const,
  };
}

async function reconcileExpiredSession(
  session: CheckoutSessionWithMetadata,
  trigger: StripeReconciliationTrigger,
  bookingId: string,
) {
  const before = await prisma.booking.findUnique({
    where: { id: bookingId },
  });

  if (!before) {
    return {
      bookingId,
      reconciled: false,
      stateChanged: false,
      outcome: "booking-not-found" as const,
    };
  }

  const checkoutPurpose = getCheckoutPurpose(session);

  if (checkoutPurpose === "deposit") {
    const canExpirePendingBooking =
      before.status === BookingStatus.PENDING_PAYMENT &&
      before.paymentStatus !== PaymentStatus.PARTIALLY_PAID &&
      before.paymentStatus !== PaymentStatus.PAID &&
      before.paymentStatus !== PaymentStatus.REFUNDED;

    if (!canExpirePendingBooking) {
      return {
        bookingId,
        reconciled: true,
        stateChanged: false,
        outcome: "expired" as const,
      };
    }

    const updated = await prisma.booking.update({
      where: { id: bookingId },
      data: {
        status: BookingStatus.CANCELLED,
        paymentStatus: PaymentStatus.FAILED,
        cancelledAt: before.cancelledAt ?? new Date(),
      },
    });

    await createBookingEvent({
      bookingId,
      type: BookingEventType.PAYMENT_FAILED,
      actorLabel: trigger,
      beforeState: pickBookingEventState(before),
      afterState: pickBookingEventState(updated),
    });

    return {
      bookingId,
      reconciled: true,
      stateChanged: true,
      outcome: "expired" as const,
    };
  }

  const version = getBalanceRequestVersion(session);
  const isActiveRequest =
    version !== null &&
    before.balanceRequestVersion === version &&
    before.balanceCheckoutSessionId === session.id &&
    before.paymentStatus === PaymentStatus.PARTIALLY_PAID;

  if (!isActiveRequest || before.balanceCheckoutSessionId === null) {
    return {
      bookingId,
      reconciled: true,
      stateChanged: false,
      outcome: "expired" as const,
    };
  }

  const updated = await prisma.booking.update({
    where: { id: bookingId },
    data: {
      balanceCheckoutSessionId: null,
    },
  });

  await createBookingEvent({
    bookingId,
    type: BookingEventType.BALANCE_PAYMENT_FAILED,
    actorLabel: trigger,
    beforeState: pickBookingEventState(before),
    afterState: pickBookingEventState(updated),
  });

  return {
    bookingId,
    reconciled: true,
    stateChanged: true,
    outcome: "expired" as const,
  };
}

export async function reconcileCheckoutSession(input: {
  sessionId: string;
  trigger: StripeReconciliationTrigger;
}): Promise<StripeReconciliationResult> {
  const stripe = getStripe();
  const session = (await stripe.checkout.sessions.retrieve(
    input.sessionId,
  )) as CheckoutSessionWithMetadata;
  const bookingId = session.metadata?.bookingId ?? null;

  if (!bookingId) {
    return {
      sessionId: input.sessionId,
      bookingId: null,
      trigger: input.trigger,
      reconciled: false,
      throttled: false,
      stateChanged: false,
      outcome: "missing-booking-id",
    };
  }

  if (session.status === "complete" && session.payment_status === "paid") {
    const result = await reconcileCompletedSession(session, input.trigger, bookingId);

    return {
      sessionId: input.sessionId,
      bookingId: result.bookingId,
      trigger: input.trigger,
      reconciled: result.reconciled,
      throttled: false,
      stateChanged: result.stateChanged,
      outcome: result.outcome,
    };
  }

  if (session.status === "expired") {
    const result = await reconcileExpiredSession(session, input.trigger, bookingId);

    return {
      sessionId: input.sessionId,
      bookingId: result.bookingId,
      trigger: input.trigger,
      reconciled: result.reconciled,
      throttled: false,
      stateChanged: result.stateChanged,
      outcome: result.outcome,
    };
  }

  return {
    sessionId: input.sessionId,
    bookingId,
    trigger: input.trigger,
    reconciled: true,
    throttled: false,
    stateChanged: false,
    outcome: "noop",
  };
}

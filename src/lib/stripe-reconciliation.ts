import { BookingEventType, BookingStatus, PaymentStatus } from "@/generated/prisma/client";
import { releaseHeldBooking } from "@/lib/booking";
import { ensureDepositRecoveryEmail, ensureInitialManageBookingEmail } from "@/lib/booking-management";
import { createBookingEvent, pickBookingEventState } from "@/lib/booking-events";
import { prisma } from "@/lib/prisma";
import { getStripe } from "@/lib/stripe";
import {
  canExpirePendingDeposit,
  getBalanceRequestVersion,
  getCheckoutPurpose,
  getPaymentIntentId,
  isActiveBalanceRequest,
  shouldClearExpiredBalanceRequest,
  shouldConfirmBalancePayment,
  shouldConfirmDepositPayment,
} from "@/lib/stripe-reconciliation-decisions";

type CheckoutSessionWithMetadata = {
  id: string;
  status: string | null;
  payment_status: string;
  payment_intent: string | { id: string } | null;
  metadata?: Record<string, string | undefined> | null;
};

export type StripeReconciliationTrigger = "stripe-webhook" | "booking-confirmation" | "sweeper";

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
    | "async-failed"
    | "noop"
    | "missing-booking-id"
    | "booking-not-found";
};

// The manage-link email is a best-effort side effect of reconciliation. Payment
// state is already persisted before this runs, so an email failure (missing Resend
// key, rate limit, 5xx) must not fail the webhook — otherwise Stripe retries for
// days and every retry re-attempts the email. A lost email is recoverable: the
// confirmation page shows the manage link and the customer can trigger a resend.
async function sendInitialManageEmailBestEffort(bookingId: string) {
  try {
    await ensureInitialManageBookingEmail(bookingId);
  } catch (error) {
    console.error(
      `[stripe-reconciliation] Failed to send initial manage-link email for booking ${bookingId}:`,
      error,
    );
  }
}

// Same best-effort rationale as the manage-link email: the failed-hold recovery
// email must never fail the webhook. A failed send releases its claim, and the
// sweeper retries it on a later run.
export async function sendDepositRecoveryEmailBestEffort(
  bookingId: string,
  actorLabel: string,
) {
  try {
    await ensureDepositRecoveryEmail(bookingId, actorLabel);
  } catch (error) {
    console.error(
      `[stripe-reconciliation] Failed to send deposit recovery email for booking ${bookingId}:`,
      error,
    );
  }
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
    const shouldUpdate = shouldConfirmDepositPayment(before, session.id, paymentIntentId);

    if (!shouldUpdate) {
      await sendInitialManageEmailBestEffort(bookingId);

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

    await sendInitialManageEmailBestEffort(bookingId);

    return {
      bookingId,
      reconciled: true,
      stateChanged: true,
      outcome: "completed" as const,
    };
  }

  const version = getBalanceRequestVersion(session);
  const isActiveRequest = isActiveBalanceRequest(before, session.id, version);

  if (!isActiveRequest) {
    return {
      bookingId,
      reconciled: true,
      stateChanged: false,
      outcome: "completed" as const,
    };
  }

  const shouldUpdate = shouldConfirmBalancePayment(before, paymentIntentId);

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
    const canExpirePendingBooking = canExpirePendingDeposit(before);

    if (!canExpirePendingBooking) {
      // The hold may already be CANCELLED/FAILED (lazy hold-expiry cleanup runs
      // outside this reconciler), so the recovery email still needs a chance to
      // send here; its own predicate no-ops every other state.
      await sendDepositRecoveryEmailBestEffort(bookingId, trigger);

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

    await sendDepositRecoveryEmailBestEffort(bookingId, trigger);

    return {
      bookingId,
      reconciled: true,
      stateChanged: true,
      outcome: "expired" as const,
    };
  }

  const stateChanged = await clearDeadBalanceSession(session, trigger, bookingId, before);

  return {
    bookingId,
    reconciled: true,
    stateChanged,
    outcome: "expired" as const,
  };
}

// Clears the stored balance checkout session on a request that can no longer be
// paid (expired session or failed async payment) so the admin can issue a fresh
// one. Shared by the expired and async-payment-failed paths.
async function clearDeadBalanceSession(
  session: CheckoutSessionWithMetadata,
  trigger: StripeReconciliationTrigger,
  bookingId: string,
  before: NonNullable<Awaited<ReturnType<typeof prisma.booking.findUnique>>>,
) {
  const version = getBalanceRequestVersion(session);

  if (!shouldClearExpiredBalanceRequest(before, session.id, version)) {
    return false;
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

  return true;
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

// A failed asynchronous payment (e.g. a bank debit that bounced days later)
// leaves the Checkout session at status "complete" / payment_status "unpaid",
// so `reconcileCheckoutSession` would no-op it forever and the session never
// emits `checkout.session.expired`. This dedicated path releases the hold and
// notifies the customer. Checkout is restricted to instant payment methods, so
// this is a safety net rather than an expected flow.
export async function reconcileAsyncPaymentFailure(input: {
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

  // The failure event can race a later successful state; if Stripe now reports
  // the session paid, apply the normal completed path instead.
  if (session.status === "complete" && session.payment_status === "paid") {
    return reconcileCheckoutSession(input);
  }

  const before = await prisma.booking.findUnique({
    where: { id: bookingId },
  });

  if (!before) {
    return {
      sessionId: input.sessionId,
      bookingId,
      trigger: input.trigger,
      reconciled: false,
      throttled: false,
      stateChanged: false,
      outcome: "booking-not-found",
    };
  }

  if (getCheckoutPurpose(session) === "deposit") {
    const canRelease =
      before.status === BookingStatus.PENDING_PAYMENT &&
      before.paymentStatus === PaymentStatus.PENDING;

    if (canRelease) {
      await releaseHeldBooking(bookingId, input.trigger);
    }

    // Sends when the hold ended CANCELLED/FAILED (whether released just now or
    // earlier by lazy cleanup); no-ops for every other state.
    await sendDepositRecoveryEmailBestEffort(bookingId, input.trigger);

    return {
      sessionId: input.sessionId,
      bookingId,
      trigger: input.trigger,
      reconciled: true,
      throttled: false,
      stateChanged: canRelease,
      outcome: "async-failed",
    };
  }

  const stateChanged = await clearDeadBalanceSession(session, input.trigger, bookingId, before);

  return {
    sessionId: input.sessionId,
    bookingId,
    trigger: input.trigger,
    reconciled: true,
    throttled: false,
    stateChanged,
    outcome: "async-failed",
  };
}

import { BookingStatus, PaymentStatus } from "@/generated/prisma/client";

// Pure decision helpers for Stripe checkout reconciliation. Extracted from
// `stripe-reconciliation.ts` so the state-transition rules (deposit vs. balance,
// completed vs. expired, already-reconciled / stale-version / wrong-session) can
// be exercised as a decision table over a fake session + booking snapshot,
// without a database. The reconciler owns the DB reads/writes and events; these
// functions own only the "should this row change, and how" logic.

export type ReconciliationSession = {
  id: string;
  payment_intent: string | { id: string } | null;
  metadata?: Record<string, string | undefined> | null;
};

// Minimal view of a booking row the decisions read. `balanceDue` is modeled as
// anything with `.eq(0)` so both a Prisma.Decimal and a test stub satisfy it.
export type ReconciliationBooking = {
  status: BookingStatus;
  paymentStatus: PaymentStatus;
  stripeCheckoutSessionId: string | null;
  stripePaymentIntentId: string | null;
  confirmedAt: Date | null;
  balanceRequestVersion: number;
  balanceCheckoutSessionId: string | null;
  balanceDue: { eq(value: number): boolean };
  balancePaymentIntentId: string | null;
  balancePaidAt: Date | null;
};

export function getCheckoutPurpose(session: Pick<ReconciliationSession, "metadata">) {
  return session.metadata?.checkoutPurpose === "balance" ? "balance" : "deposit";
}

export function getBalanceRequestVersion(session: Pick<ReconciliationSession, "metadata">) {
  const raw = session.metadata?.balanceRequestVersion;
  const version = raw ? Number(raw) : NaN;
  return Number.isInteger(version) ? version : null;
}

export function getPaymentIntentId(session: Pick<ReconciliationSession, "payment_intent">) {
  if (typeof session.payment_intent === "string") {
    return session.payment_intent;
  }

  return session.payment_intent?.id ?? null;
}

// A completed deposit checkout should flip the booking to CONFIRMED /
// PARTIALLY_PAID (and record its session + intent) unless it already reflects
// exactly that.
export function shouldConfirmDepositPayment(
  before: ReconciliationBooking,
  sessionId: string,
  paymentIntentId: string | null,
) {
  return (
    before.status !== BookingStatus.CONFIRMED ||
    before.paymentStatus !== PaymentStatus.PARTIALLY_PAID ||
    before.stripeCheckoutSessionId !== sessionId ||
    before.stripePaymentIntentId !== paymentIntentId ||
    before.confirmedAt === null
  );
}

// A balance checkout only applies to the row if it names the current balance
// request (matching version + session) and the booking is still awaiting it.
export function isActiveBalanceRequest(
  before: ReconciliationBooking,
  sessionId: string,
  version: number | null,
) {
  return (
    version !== null &&
    before.balanceRequestVersion === version &&
    before.balanceCheckoutSessionId === sessionId &&
    before.paymentStatus === PaymentStatus.PARTIALLY_PAID
  );
}

// Given an active balance request, whether the paid state still needs writing.
export function shouldConfirmBalancePayment(
  before: ReconciliationBooking,
  paymentIntentId: string | null,
) {
  return (
    before.paymentStatus !== PaymentStatus.PAID ||
    !before.balanceDue.eq(0) ||
    before.balancePaymentIntentId !== paymentIntentId ||
    before.balancePaidAt === null
  );
}

// An expired deposit checkout may cancel the hold only while it is still an
// unpaid PENDING_PAYMENT booking (never touch a paid/refunded/confirmed row).
export function canExpirePendingDeposit(before: ReconciliationBooking) {
  return (
    before.status === BookingStatus.PENDING_PAYMENT &&
    before.paymentStatus !== PaymentStatus.PARTIALLY_PAID &&
    before.paymentStatus !== PaymentStatus.PAID &&
    before.paymentStatus !== PaymentStatus.REFUNDED
  );
}

// An expired balance checkout clears the stored session only if it is the
// active request and a session id is actually recorded.
export function shouldClearExpiredBalanceRequest(
  before: ReconciliationBooking,
  sessionId: string,
  version: number | null,
) {
  return isActiveBalanceRequest(before, sessionId, version) && before.balanceCheckoutSessionId !== null;
}

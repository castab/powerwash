import assert from "node:assert/strict";
import { BookingStatus, PaymentStatus } from "@/generated/prisma/client";
import {
  canExpirePendingDeposit,
  getBalanceRequestVersion,
  getCheckoutPurpose,
  getPaymentIntentId,
  isActiveBalanceRequest,
  shouldClearExpiredBalanceRequest,
  shouldConfirmBalancePayment,
  shouldConfirmDepositPayment,
  shouldSendDepositRecoveryEmail,
  type ReconciliationBooking,
} from "./stripe-reconciliation-decisions.ts";

function runTest(name: string, fn: () => void) {
  try {
    fn();
    console.log(`PASS ${name}`);
  } catch (error) {
    console.error(`FAIL ${name}`);
    throw error;
  }
}

// Model balanceDue as a stub with `.eq(0)` so tests need no Decimal instance.
function balance(amount: number) {
  return { eq: (value: number) => amount === value };
}

function makeBooking(overrides: Partial<ReconciliationBooking> = {}): ReconciliationBooking {
  return {
    status: BookingStatus.PENDING_PAYMENT,
    paymentStatus: PaymentStatus.PENDING,
    stripeCheckoutSessionId: null,
    stripePaymentIntentId: null,
    confirmedAt: null,
    balanceRequestVersion: 0,
    balanceCheckoutSessionId: null,
    balanceDue: balance(50),
    balancePaymentIntentId: null,
    balancePaidAt: null,
    recoveryEmailSentAt: null,
    ...overrides,
  };
}

// --- session metadata helpers ---------------------------------------------

runTest("getCheckoutPurpose defaults to deposit and reads balance", () => {
  assert.equal(getCheckoutPurpose({ metadata: null }), "deposit");
  assert.equal(getCheckoutPurpose({ metadata: {} }), "deposit");
  assert.equal(getCheckoutPurpose({ metadata: { checkoutPurpose: "balance" } }), "balance");
});

runTest("getBalanceRequestVersion parses integers and rejects junk", () => {
  assert.equal(getBalanceRequestVersion({ metadata: { balanceRequestVersion: "3" } }), 3);
  assert.equal(getBalanceRequestVersion({ metadata: { balanceRequestVersion: "3.5" } }), null);
  assert.equal(getBalanceRequestVersion({ metadata: { balanceRequestVersion: "abc" } }), null);
  assert.equal(getBalanceRequestVersion({ metadata: {} }), null);
});

runTest("getPaymentIntentId handles string, object, and null forms", () => {
  assert.equal(getPaymentIntentId({ payment_intent: "pi_123" }), "pi_123");
  assert.equal(getPaymentIntentId({ payment_intent: { id: "pi_456" } }), "pi_456");
  assert.equal(getPaymentIntentId({ payment_intent: null }), null);
});

// --- completed deposit ------------------------------------------------------

runTest("deposit: fresh pending booking should be confirmed", () => {
  assert.equal(shouldConfirmDepositPayment(makeBooking(), "cs_1", "pi_1"), true);
});

runTest("deposit: already-confirmed booking with matching refs is a no-op", () => {
  const before = makeBooking({
    status: BookingStatus.CONFIRMED,
    paymentStatus: PaymentStatus.PARTIALLY_PAID,
    stripeCheckoutSessionId: "cs_1",
    stripePaymentIntentId: "pi_1",
    confirmedAt: new Date(),
  });
  assert.equal(shouldConfirmDepositPayment(before, "cs_1", "pi_1"), false);
});

runTest("deposit: confirmed but wrong session/intent still needs an update", () => {
  const before = makeBooking({
    status: BookingStatus.CONFIRMED,
    paymentStatus: PaymentStatus.PARTIALLY_PAID,
    stripeCheckoutSessionId: "cs_OLD",
    stripePaymentIntentId: "pi_1",
    confirmedAt: new Date(),
  });
  assert.equal(shouldConfirmDepositPayment(before, "cs_1", "pi_1"), true);
});

// --- completed balance ------------------------------------------------------

runTest("balance: active request requires matching version, session, and partial-paid", () => {
  const before = makeBooking({
    paymentStatus: PaymentStatus.PARTIALLY_PAID,
    balanceRequestVersion: 2,
    balanceCheckoutSessionId: "cs_bal",
  });
  assert.equal(isActiveBalanceRequest(before, "cs_bal", 2), true);
  assert.equal(isActiveBalanceRequest(before, "cs_bal", 1), false, "stale version");
  assert.equal(isActiveBalanceRequest(before, "cs_other", 2), false, "wrong session");
  assert.equal(isActiveBalanceRequest(before, "cs_bal", null), false, "missing version");
});

runTest("balance: already fully paid request is a no-op", () => {
  const paid = makeBooking({
    paymentStatus: PaymentStatus.PAID,
    balanceDue: balance(0),
    balancePaymentIntentId: "pi_bal",
    balancePaidAt: new Date(),
  });
  assert.equal(shouldConfirmBalancePayment(paid, "pi_bal"), false);
});

runTest("balance: partially-paid request should be confirmed", () => {
  const before = makeBooking({ paymentStatus: PaymentStatus.PARTIALLY_PAID, balanceDue: balance(50) });
  assert.equal(shouldConfirmBalancePayment(before, "pi_bal"), true);
});

// --- expired deposit --------------------------------------------------------

runTest("expired deposit: only an unpaid pending hold may be cancelled", () => {
  assert.equal(canExpirePendingDeposit(makeBooking()), true);
  assert.equal(
    canExpirePendingDeposit(makeBooking({ paymentStatus: PaymentStatus.PARTIALLY_PAID })),
    false,
    "already paid deposit",
  );
  assert.equal(
    canExpirePendingDeposit(makeBooking({ status: BookingStatus.CONFIRMED })),
    false,
    "already confirmed",
  );
  assert.equal(
    canExpirePendingDeposit(makeBooking({ paymentStatus: PaymentStatus.REFUNDED })),
    false,
    "already refunded",
  );
});

// --- deposit recovery email --------------------------------------------------

runTest("recovery email: expired hold (CANCELLED + FAILED, unsent) qualifies", () => {
  const expired = makeBooking({
    status: BookingStatus.CANCELLED,
    paymentStatus: PaymentStatus.FAILED,
  });
  assert.equal(shouldSendDepositRecoveryEmail(expired), true);
});

runTest("recovery email: already-sent claim blocks a second send", () => {
  const sent = makeBooking({
    status: BookingStatus.CANCELLED,
    paymentStatus: PaymentStatus.FAILED,
    recoveryEmailSentAt: new Date(),
  });
  assert.equal(shouldSendDepositRecoveryEmail(sent), false);
});

runTest("recovery email: cancellations that were paid never qualify", () => {
  assert.equal(
    shouldSendDepositRecoveryEmail(
      makeBooking({ status: BookingStatus.CANCELLED, paymentStatus: PaymentStatus.REFUNDED }),
    ),
    false,
    "customer cancellation with refund",
  );
  assert.equal(
    shouldSendDepositRecoveryEmail(
      makeBooking({ status: BookingStatus.CANCELLED, paymentStatus: PaymentStatus.PARTIALLY_PAID }),
    ),
    false,
    "cancellation keeping the deposit",
  );
});

runTest("recovery email: live bookings never qualify", () => {
  assert.equal(shouldSendDepositRecoveryEmail(makeBooking()), false, "pending hold");
  assert.equal(
    shouldSendDepositRecoveryEmail(
      makeBooking({ status: BookingStatus.CONFIRMED, paymentStatus: PaymentStatus.PARTIALLY_PAID }),
    ),
    false,
    "confirmed booking",
  );
});

// --- expired balance --------------------------------------------------------

runTest("expired balance: clears only an active request that has a stored session", () => {
  const active = makeBooking({
    paymentStatus: PaymentStatus.PARTIALLY_PAID,
    balanceRequestVersion: 2,
    balanceCheckoutSessionId: "cs_bal",
  });
  assert.equal(shouldClearExpiredBalanceRequest(active, "cs_bal", 2), true);
  assert.equal(shouldClearExpiredBalanceRequest(active, "cs_bal", 1), false, "stale version");

  const noStoredSession = makeBooking({
    paymentStatus: PaymentStatus.PARTIALLY_PAID,
    balanceRequestVersion: 2,
    balanceCheckoutSessionId: null,
  });
  assert.equal(shouldClearExpiredBalanceRequest(noStoredSession, "cs_bal", 2), false);
});

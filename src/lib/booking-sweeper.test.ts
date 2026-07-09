import assert from "node:assert/strict";
import { BookingStatus, PaymentStatus } from "@/generated/prisma/client";
import {
  SWEEP_GRACE_MINUTES,
  SWEEP_RECOVERY_LOOKBACK_HOURS,
  buildOrphanedHoldFilter,
  buildStuckBalanceSessionFilter,
  buildStuckDepositSessionFilter,
  buildUnsentManageEmailFilter,
  buildUnsentRecoveryEmailFilter,
} from "./booking-sweeper.ts";

function runTest(name: string, fn: () => void) {
  try {
    fn();
    console.log(`PASS ${name}`);
  } catch (error) {
    console.error(`FAIL ${name}`);
    throw error;
  }
}

const now = new Date("2026-07-09T12:00:00.000Z");

runTest("stuck deposit filter targets pending holds with a session past the grace period", () => {
  const filter = buildStuckDepositSessionFilter(now);
  assert.equal(filter.status, BookingStatus.PENDING_PAYMENT);
  assert.equal(filter.paymentStatus, PaymentStatus.PENDING);
  assert.deepEqual(filter.stripeCheckoutSessionId, { not: null });
  assert.deepEqual(filter.createdAt, {
    lt: new Date(now.getTime() - SWEEP_GRACE_MINUTES * 60 * 1000),
  });
});

runTest("orphaned hold filter targets sessionless holds past their expiry", () => {
  const filter = buildOrphanedHoldFilter(now);
  assert.equal(filter.status, BookingStatus.PENDING_PAYMENT);
  assert.equal(filter.paymentStatus, PaymentStatus.PENDING);
  assert.equal(filter.stripeCheckoutSessionId, null);
  assert.deepEqual(filter.paymentExpiresAt, { lt: now });
});

runTest("unsent manage-email filter targets confirmed bookings without a sent link", () => {
  const filter = buildUnsentManageEmailFilter();
  assert.equal(filter.status, BookingStatus.CONFIRMED);
  assert.equal(filter.manageLinkSentAt, null);
});

runTest("recovery-email filter targets recent expired holds without a sent claim", () => {
  const filter = buildUnsentRecoveryEmailFilter(now);
  assert.equal(filter.status, BookingStatus.CANCELLED);
  assert.equal(filter.paymentStatus, PaymentStatus.FAILED);
  assert.equal(filter.recoveryEmailSentAt, null);
  assert.deepEqual(filter.stripeCheckoutSessionId, { not: null }, "sessionless holds never paid");
  assert.deepEqual(filter.cancelledAt, {
    gt: new Date(now.getTime() - SWEEP_RECOVERY_LOOKBACK_HOURS * 60 * 60 * 1000),
  });
});

runTest("stuck balance filter targets outstanding balance sessions past the grace period", () => {
  const filter = buildStuckBalanceSessionFilter(now);
  assert.equal(filter.paymentStatus, PaymentStatus.PARTIALLY_PAID);
  assert.deepEqual(filter.balanceCheckoutSessionId, { not: null });
  assert.deepEqual(filter.balanceRequestedAt, {
    lt: new Date(now.getTime() - SWEEP_GRACE_MINUTES * 60 * 1000),
  });
});

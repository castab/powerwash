import assert from "node:assert/strict";
import { BookingStatus, PaymentStatus } from "@/generated/prisma/client";
import { isImmutableBookingState } from "./booking-state.ts";

function runTest(name: string, fn: () => void) {
  try {
    fn();
    console.log(`PASS ${name}`);
  } catch (error) {
    console.error(`FAIL ${name}`);
    throw error;
  }
}

runTest("NO_SHOW is always immutable", () => {
  assert.equal(
    isImmutableBookingState({ status: BookingStatus.NO_SHOW, paymentStatus: PaymentStatus.PENDING }),
    true,
  );
});

runTest("COMPLETED is immutable only once payment is settled", () => {
  assert.equal(
    isImmutableBookingState({ status: BookingStatus.COMPLETED, paymentStatus: PaymentStatus.PAID }),
    true,
  );
  assert.equal(
    isImmutableBookingState({ status: BookingStatus.COMPLETED, paymentStatus: PaymentStatus.REFUNDED }),
    true,
  );
  assert.equal(
    isImmutableBookingState({
      status: BookingStatus.COMPLETED,
      paymentStatus: PaymentStatus.PARTIALLY_PAID,
    }),
    false,
    "a completed job that still owes a balance stays editable",
  );
});

runTest("CANCELLED is immutable only when refunded or failed", () => {
  assert.equal(
    isImmutableBookingState({ status: BookingStatus.CANCELLED, paymentStatus: PaymentStatus.REFUNDED }),
    true,
  );
  assert.equal(
    isImmutableBookingState({ status: BookingStatus.CANCELLED, paymentStatus: PaymentStatus.FAILED }),
    true,
  );
  assert.equal(
    isImmutableBookingState({
      status: BookingStatus.CANCELLED,
      paymentStatus: PaymentStatus.PARTIALLY_PAID,
    }),
    false,
    "a cancelled booking still awaiting a refund decision stays actionable",
  );
});

runTest("active bookings are mutable", () => {
  assert.equal(
    isImmutableBookingState({
      status: BookingStatus.CONFIRMED,
      paymentStatus: PaymentStatus.PARTIALLY_PAID,
    }),
    false,
  );
  assert.equal(
    isImmutableBookingState({
      status: BookingStatus.PENDING_PAYMENT,
      paymentStatus: PaymentStatus.PENDING,
    }),
    false,
  );
});

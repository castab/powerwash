ALTER TABLE "Booking"
  ADD COLUMN "stripeBalanceRefundId" TEXT;

CREATE UNIQUE INDEX "Booking_stripeBalanceRefundId_key" ON "Booking"("stripeBalanceRefundId");

ALTER TABLE "Booking"
  DROP CONSTRAINT "booking_refund_values";

ALTER TABLE "Booking"
  ADD CONSTRAINT "booking_refund_values"
  CHECK (
    "refundAmount" IS NULL OR
    (
      "refundAmount" >= 0.00 AND
      "refundAmount" <= "totalPrice"
    )
  );

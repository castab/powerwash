ALTER TABLE "Booking"
  ADD COLUMN "manageTokenHash" TEXT,
  ADD COLUMN "manageTokenRotatedAt" TIMESTAMP(3),
  ADD COLUMN "manageLinkSentAt" TIMESTAMP(3),
  ADD COLUMN "refundAmount" NUMERIC(10,2),
  ADD COLUMN "refundReason" TEXT,
  ADD COLUMN "refundedAt" TIMESTAMP(3),
  ADD COLUMN "stripeRefundId" TEXT;

CREATE UNIQUE INDEX "Booking_manageTokenHash_key" ON "Booking"("manageTokenHash");
CREATE UNIQUE INDEX "Booking_stripeRefundId_key" ON "Booking"("stripeRefundId");

ALTER TABLE "Booking"
  ADD CONSTRAINT "booking_refund_values"
  CHECK (
    "refundAmount" IS NULL OR
    (
      "refundAmount" >= 0.00 AND
      "refundAmount" <= "depositAmount"
    )
  );

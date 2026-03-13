CREATE TYPE "BalanceRequestDeliveryChannel" AS ENUM ('EMAIL', 'SMS');

ALTER TYPE "PaymentStatus" ADD VALUE 'PARTIALLY_PAID';

ALTER TYPE "BookingEventType" ADD VALUE 'BALANCE_PAYMENT_REQUESTED';
ALTER TYPE "BookingEventType" ADD VALUE 'BALANCE_PAYMENT_CONFIRMED';
ALTER TYPE "BookingEventType" ADD VALUE 'BALANCE_PAYMENT_FAILED';

ALTER TABLE "Booking"
  ADD COLUMN "balanceRequestVersion" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "balanceRequestedAt" TIMESTAMP(3),
  ADD COLUMN "balanceRequestDeliveryChannel" "BalanceRequestDeliveryChannel",
  ADD COLUMN "balanceRequestDestination" TEXT,
  ADD COLUMN "balanceCheckoutSessionId" TEXT,
  ADD COLUMN "balancePaymentIntentId" TEXT,
  ADD COLUMN "balancePaidAt" TIMESTAMP(3);

CREATE UNIQUE INDEX "Booking_balanceCheckoutSessionId_key" ON "Booking"("balanceCheckoutSessionId");
CREATE UNIQUE INDEX "Booking_balancePaymentIntentId_key" ON "Booking"("balancePaymentIntentId");

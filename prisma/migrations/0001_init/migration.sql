CREATE EXTENSION IF NOT EXISTS btree_gist;

CREATE TYPE "BookingStatus" AS ENUM (
  'PENDING_PAYMENT',
  'CONFIRMED',
  'CANCELLED',
  'COMPLETED',
  'NO_SHOW'
);

CREATE TYPE "PaymentStatus" AS ENUM (
  'UNPAID',
  'PENDING',
  'PAID',
  'REFUNDED',
  'FAILED'
);

CREATE TYPE "BookingEventType" AS ENUM (
  'BOOKING_CREATED',
  'PAYMENT_CONFIRMED',
  'PAYMENT_FAILED',
  'BOOKING_UPDATED',
  'BOOKING_CANCELLED',
  'BOOKING_RESCHEDULED',
  'ADMIN_NOTES_UPDATED',
  'REFUND_ISSUED',
  'MANAGE_LINK_ISSUED',
  'MANAGE_LINK_ROTATED',
  'BOOKING_ARCHIVED',
  'BOOKING_UNARCHIVED'
);

CREATE TABLE "Service" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "slug" TEXT NOT NULL,
  "description" TEXT,
  "durationMinutes" INTEGER NOT NULL,
  "basePrice" NUMERIC(10,2) NOT NULL,
  "depositAmount" NUMERIC(10,2) NOT NULL,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Service_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Booking" (
  "id" TEXT NOT NULL,
  "serviceId" TEXT NOT NULL,
  "firstName" TEXT NOT NULL,
  "lastName" TEXT NOT NULL,
  "email" TEXT NOT NULL,
  "phone" TEXT NOT NULL,
  "vehicleMake" TEXT NOT NULL,
  "vehicleModel" TEXT NOT NULL,
  "vehicleYear" INTEGER,
  "vehicleColor" TEXT,
  "vehicleLicensePlate" TEXT,
  "customerNotes" TEXT,
  "startAt" TIMESTAMP(3) NOT NULL,
  "endAt" TIMESTAMP(3) NOT NULL,
  "status" "BookingStatus" NOT NULL DEFAULT 'PENDING_PAYMENT',
  "paymentStatus" "PaymentStatus" NOT NULL DEFAULT 'PENDING',
  "totalPrice" NUMERIC(10,2) NOT NULL,
  "depositAmount" NUMERIC(10,2) NOT NULL,
  "balanceDue" NUMERIC(10,2) NOT NULL,
  "stripeCheckoutSessionId" TEXT,
  "stripePaymentIntentId" TEXT,
  "adminNotes" TEXT,
  "paymentExpiresAt" TIMESTAMP(3),
  "confirmedAt" TIMESTAMP(3),
  "cancelledAt" TIMESTAMP(3),
  "manageTokenVersion" INTEGER NOT NULL DEFAULT 0,
  "manageTokenRotatedAt" TIMESTAMP(3),
  "manageLinkSentAt" TIMESTAMP(3),
  "refundAmount" NUMERIC(10,2),
  "refundReason" TEXT,
  "refundedAt" TIMESTAMP(3),
  "stripeRefundId" TEXT,
  "archivedAt" TIMESTAMP(3),
  "archivedByAdminUserId" TEXT,
  "customerAccessEndsAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Booking_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "BookingEvent" (
  "id" TEXT NOT NULL,
  "bookingId" TEXT NOT NULL,
  "type" "BookingEventType" NOT NULL,
  "actorAdminUserId" TEXT,
  "actorLabel" TEXT,
  "beforeState" JSONB,
  "afterState" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "BookingEvent_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AvailabilityRule" (
  "id" TEXT NOT NULL,
  "dayOfWeek" INTEGER NOT NULL,
  "startTime" TEXT NOT NULL,
  "endTime" TEXT NOT NULL,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AvailabilityRule_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "BlackoutDate" (
  "id" TEXT NOT NULL,
  "startsAt" TIMESTAMP(3) NOT NULL,
  "endsAt" TIMESTAMP(3) NOT NULL,
  "reason" TEXT,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "BlackoutDate_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AdminUser" (
  "id" TEXT NOT NULL,
  "email" TEXT NOT NULL,
  "passwordHash" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "lastLoginAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AdminUser_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Service_slug_key" ON "Service"("slug");
CREATE UNIQUE INDEX "Booking_stripeCheckoutSessionId_key" ON "Booking"("stripeCheckoutSessionId");
CREATE UNIQUE INDEX "Booking_stripePaymentIntentId_key" ON "Booking"("stripePaymentIntentId");
CREATE UNIQUE INDEX "Booking_stripeRefundId_key" ON "Booking"("stripeRefundId");
CREATE UNIQUE INDEX "AdminUser_email_key" ON "AdminUser"("email");
CREATE INDEX "Booking_startAt_endAt_idx" ON "Booking"("startAt", "endAt");
CREATE INDEX "Booking_status_paymentStatus_idx" ON "Booking"("status", "paymentStatus");
CREATE INDEX "Booking_archivedAt_startAt_idx" ON "Booking"("archivedAt", "startAt");
CREATE INDEX "BookingEvent_bookingId_createdAt_idx" ON "BookingEvent"("bookingId", "createdAt");
CREATE INDEX "BookingEvent_type_createdAt_idx" ON "BookingEvent"("type", "createdAt");
CREATE INDEX "AvailabilityRule_dayOfWeek_isActive_idx" ON "AvailabilityRule"("dayOfWeek", "isActive");
CREATE INDEX "BlackoutDate_startsAt_endsAt_isActive_idx" ON "BlackoutDate"("startsAt", "endsAt", "isActive");

ALTER TABLE "Booking"
  ADD CONSTRAINT "Booking_serviceId_fkey"
  FOREIGN KEY ("serviceId") REFERENCES "Service"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "Booking"
  ADD CONSTRAINT "Booking_archivedByAdminUserId_fkey"
  FOREIGN KEY ("archivedByAdminUserId") REFERENCES "AdminUser"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "BookingEvent"
  ADD CONSTRAINT "BookingEvent_bookingId_fkey"
  FOREIGN KEY ("bookingId") REFERENCES "Booking"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "BookingEvent"
  ADD CONSTRAINT "BookingEvent_actorAdminUserId_fkey"
  FOREIGN KEY ("actorAdminUserId") REFERENCES "AdminUser"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "Booking"
  ADD CONSTRAINT "booking_valid_range"
  CHECK ("endAt" > "startAt");

ALTER TABLE "Service"
  ADD CONSTRAINT "service_price_values"
  CHECK (
    "basePrice" >= 0.00 AND
    "depositAmount" >= 0.00 AND
    "depositAmount" <= "basePrice"
  );

ALTER TABLE "Booking"
  ADD CONSTRAINT "booking_money_values"
  CHECK (
    "totalPrice" >= 0.00 AND
    "depositAmount" >= 0.00 AND
    "balanceDue" >= 0.00 AND
    "depositAmount" <= "totalPrice" AND
    "balanceDue" = ROUND("totalPrice" - "depositAmount", 2)
  );

ALTER TABLE "Booking"
  ADD CONSTRAINT "booking_refund_values"
  CHECK (
    "refundAmount" IS NULL OR
    (
      "refundAmount" >= 0.00 AND
      "refundAmount" <= "depositAmount"
    )
  );

ALTER TABLE "Booking"
  ADD CONSTRAINT "booking_no_overlap"
  EXCLUDE USING GIST (
    tsrange("startAt", "endAt", '[)') WITH &&
  )
  WHERE ("status" IN ('PENDING_PAYMENT', 'CONFIRMED', 'COMPLETED', 'NO_SHOW'));

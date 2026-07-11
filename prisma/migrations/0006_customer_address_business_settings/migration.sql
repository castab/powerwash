-- Restructure customer data into first-class Customer/Vehicle/CustomerAddress
-- entities and add the BusinessSettings singleton for service-area config.
-- Existing booking rows are deleted (pre-launch, no real data): the new
-- customer/vehicle/address foreign keys are required and cannot be backfilled.
DELETE FROM "BookingEvent";
DELETE FROM "Booking";

-- CreateTable
CREATE TABLE "Customer" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "manageTokenVersion" INTEGER NOT NULL DEFAULT 0,
    "manageTokenRotatedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Customer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Vehicle" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "color" TEXT,
    "licensePlate" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Vehicle_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CustomerAddress" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "formattedAddress" TEXT NOT NULL,
    "googlePlaceId" TEXT,
    "lat" DECIMAL(9,6),
    "lng" DECIMAL(9,6),
    "rawComponents" JSONB,
    "validated" BOOLEAN NOT NULL DEFAULT false,
    "travelDurationSeconds" INTEGER,
    "serviceEligible" BOOLEAN,
    "eligibilityCheckedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CustomerAddress_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BusinessSettings" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "originFormattedAddress" TEXT,
    "originPlaceId" TEXT,
    "originLat" DECIMAL(9,6),
    "originLng" DECIMAL(9,6),
    "maxTravelMinutes" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BusinessSettings_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "business_settings_singleton" CHECK ("id" = 1)
);

-- The settings row always exists; the app reads/updates it by id = 1.
INSERT INTO "BusinessSettings" ("id", "createdAt", "updatedAt")
VALUES (1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

-- CreateIndex
CREATE UNIQUE INDEX "Customer_email_key" ON "Customer"("email");

-- CreateIndex
CREATE INDEX "Vehicle_customerId_idx" ON "Vehicle"("customerId");

-- CreateIndex
CREATE INDEX "CustomerAddress_customerId_idx" ON "CustomerAddress"("customerId");

-- AlterTable
ALTER TABLE "Booking"
  DROP COLUMN "firstName",
  DROP COLUMN "lastName",
  DROP COLUMN "email",
  DROP COLUMN "phone",
  DROP COLUMN "vehicleDescription",
  DROP COLUMN "vehicleColor",
  DROP COLUMN "vehicleLicensePlate",
  DROP COLUMN "manageTokenVersion",
  DROP COLUMN "manageTokenRotatedAt",
  ADD COLUMN "customerId" TEXT NOT NULL,
  ADD COLUMN "vehicleId" TEXT NOT NULL,
  ADD COLUMN "serviceAddressId" TEXT NOT NULL,
  ADD COLUMN "travelDurationSecondsAtBooking" INTEGER;

-- CreateIndex
CREATE INDEX "Booking_customerId_archivedAt_idx" ON "Booking"("customerId", "archivedAt");

-- AddForeignKey
ALTER TABLE "Vehicle" ADD CONSTRAINT "Vehicle_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerAddress" ADD CONSTRAINT "CustomerAddress_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Booking" ADD CONSTRAINT "Booking_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Booking" ADD CONSTRAINT "Booking_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "Vehicle"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Booking" ADD CONSTRAINT "Booking_serviceAddressId_fkey" FOREIGN KEY ("serviceAddressId") REFERENCES "CustomerAddress"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

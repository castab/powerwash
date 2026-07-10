ALTER TABLE "Booking" ADD COLUMN "vehicleDescription" TEXT;

UPDATE "Booking"
SET "vehicleDescription" = trim(concat_ws(' ', "vehicleYear"::text, "vehicleMake", "vehicleModel"));

ALTER TABLE "Booking" ALTER COLUMN "vehicleDescription" SET NOT NULL;

ALTER TABLE "Booking"
  DROP COLUMN "vehicleMake",
  DROP COLUMN "vehicleModel",
  DROP COLUMN "vehicleYear";

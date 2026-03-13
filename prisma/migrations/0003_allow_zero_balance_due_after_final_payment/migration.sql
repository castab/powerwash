ALTER TABLE "Booking"
  DROP CONSTRAINT "booking_money_values";

ALTER TABLE "Booking"
  ADD CONSTRAINT "booking_money_values"
  CHECK (
    "totalPrice" >= 0.00 AND
    "depositAmount" >= 0.00 AND
    "balanceDue" >= 0.00 AND
    "depositAmount" <= "totalPrice" AND
    (
      "balanceDue" = ROUND("totalPrice" - "depositAmount", 2) OR
      "balanceDue" = 0.00
    )
  );

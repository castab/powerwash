import { z } from "zod";

const moneySchema = z
  .union([z.string(), z.number()])
  .transform((value) => {
    const raw = typeof value === "number" ? String(value) : value.trim();
    return raw.replace(/[$,\s]/g, "");
  })
  .refine((value) => value.length > 0, {
    message: "Enter a dollar amount.",
  })
  .refine((value) => Number.isFinite(Number(value)), {
    message: "Enter a valid dollar amount.",
  })
  .transform((value) => Number(value).toFixed(2))
  .refine((value) => Number(value) >= 0, {
    message: "Amount must be zero or greater.",
  });

// Empty form inputs post as "" — treat those as absent before coercing.
function optionalCoordinate(bound: number) {
  return z.preprocess(
    (value) => (value === "" || value === null || value === undefined ? undefined : value),
    z.coerce.number().min(-bound).max(bound).optional(),
  );
}

export const bookingSchema = z.object({
  serviceId: z.string().min(1, "Select a service."),
  date: z.string().min(1, "Choose a date."),
  startAt: z
    .string()
    .min(1, "Choose a time.")
    .refine((value) => !Number.isNaN(Date.parse(value)), {
      message: "Choose a time.",
    }),
  firstName: z.string().min(2, "Enter a first name."),
  lastName: z.string().min(2, "Enter a last name."),
  email: z.email("Enter a valid email."),
  phone: z.string().min(10, "Enter a valid phone number."),
  vehicleDescription: z.string().trim().min(3, "Enter the vehicle year, make, and model."),
  color: z.string().optional(),
  licensePlate: z.string().optional(),
  notes: z.string().max(500).optional(),
  address: z.string().trim().min(5, "Enter the service address."),
  // A verified Places selection is mandatory: without a placeId the service
  // area cannot be checked reliably and arbitrary text would be persisted.
  addressPlaceId: z
    .string("Select your address from the suggestions.")
    .trim()
    .min(1, "Select your address from the suggestions.")
    .max(500),
  addressLat: optionalCoordinate(90),
  addressLng: optionalCoordinate(180),
  // Raw Places addressComponents as a JSON string; parsed defensively server-side.
  addressComponents: z
    .string()
    .max(8000)
    .optional()
    .transform((value) => value || undefined),
  addressValidated: z.preprocess(
    (value) => value === "true" || value === true,
    z.literal(true, "Select your address from the suggestions."),
  ),
});

export const adminLoginSchema = z.object({
  email: z.email("Enter a valid email."),
  password: z.string().min(8, "Password must be at least 8 characters."),
});

export const adminPasswordUpdateSchema = z
  .object({
    currentPassword: z.string().min(8, "Current password must be at least 8 characters."),
    newPassword: z.string().min(8, "New password must be at least 8 characters."),
    confirmPassword: z.string().min(8, "Confirm the new password."),
  })
  .refine((value) => value.newPassword === value.confirmPassword, {
    message: "New passwords do not match.",
    path: ["confirmPassword"],
  });

export const serviceSchema = z.object({
  id: z.string().optional(),
  name: z.string().min(3),
  description: z.string().max(500).optional(),
  durationMinutes: z.coerce.number().int().min(15).max(480),
  basePrice: moneySchema,
  depositAmount: moneySchema,
  isActive: z.coerce.boolean().default(true),
});

export const availabilitySchema = z.object({
  id: z.string().optional(),
  dayOfWeek: z.coerce.number().int().min(0).max(6),
  startTime: z.string().regex(/^\d{2}:\d{2}$/),
  endTime: z.string().regex(/^\d{2}:\d{2}$/),
  isActive: z.coerce.boolean().default(true),
});

export const blackoutSchema = z
  .object({
    id: z.string().optional(),
    startsAt: z.string().min(1),
    endsAt: z.string().min(1),
    reason: z.string().max(200).optional(),
  })
  .refine((value) => new Date(value.endsAt) > new Date(value.startsAt), {
    message: "Blackout end must be after the start.",
    path: ["endsAt"],
  });

export const businessSettingsSchema = z.object({
  originAddress: z.string().trim().min(5, "Enter the business origin address."),
  originPlaceId: z
    .string()
    .trim()
    .max(500)
    .optional()
    .transform((value) => value || undefined),
  originLat: optionalCoordinate(90),
  originLng: optionalCoordinate(180),
  maxTravelMinutes: z.coerce
    .number()
    .int("Enter a whole number of minutes.")
    .min(5, "Max travel time must be at least 5 minutes.")
    .max(600, "Max travel time cannot exceed 600 minutes."),
});

export const bookingAdminUpdateSchema = z.object({
  bookingId: z.string().min(1),
  status: z.enum(["CONFIRMED", "CANCELLED", "COMPLETED", "NO_SHOW"]).optional(),
  startAt: z.string().optional(),
  adminNotes: z.string().max(500).optional(),
});

export const requestBookingBalanceSchema = z.object({
  bookingId: z.string().min(1),
  deliveryChannel: z.enum(["EMAIL"]),
});

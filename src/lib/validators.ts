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
  make: z.string().min(2, "Enter a vehicle make."),
  model: z.string().min(1, "Enter a vehicle model."),
  year: z
    .string()
    .optional()
    .transform((value) => (value ? Number(value) : undefined))
    .refine((value) => value === undefined || (value >= 1980 && value <= 2100), {
      message: "Enter a valid year.",
    }),
  color: z.string().optional(),
  licensePlate: z.string().optional(),
  notes: z.string().max(500).optional(),
});

export const adminLoginSchema = z.object({
  email: z.email("Enter a valid email."),
  password: z.string().min(8, "Password must be at least 8 characters."),
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
    startsAt: z.string().min(1),
    endsAt: z.string().min(1),
    reason: z.string().max(200).optional(),
  })
  .refine((value) => new Date(value.endsAt) > new Date(value.startsAt), {
    message: "Blackout end must be after the start.",
    path: ["endsAt"],
  });

export const bookingAdminUpdateSchema = z.object({
  bookingId: z.string().min(1),
  status: z.enum(["CONFIRMED", "CANCELLED", "COMPLETED", "NO_SHOW"]).optional(),
  startAt: z.string().optional(),
  adminNotes: z.string().max(500).optional(),
});

import { z } from "zod";

const warnedKeys = new Set<string>();

function warnOnce(key: string, message: string) {
  if (!warnedKeys.has(key)) {
    console.warn(message);
    warnedKeys.add(key);
  }
}

const bookingFormPrefillSchema = z.object({
  firstName: z.string().trim().min(1).default(""),
  lastName: z.string().trim().min(1).default(""),
  email: z.string().trim().default(""),
  phone: z.string().trim().default(""),
  make: z.string().trim().default(""),
  model: z.string().trim().default(""),
  year: z
    .union([z.string(), z.number()])
    .optional()
    .transform((value) => {
      if (value === undefined || value === null || value === "") {
        return "";
      }

      return String(value).trim();
    })
    .refine((value) => value === "" || /^\d{4}$/.test(value), {
      message: "Year must be a four-digit string.",
    }),
  color: z.string().trim().default(""),
  licensePlate: z.string().trim().default(""),
  notes: z.string().trim().default(""),
});

export type BookingFormPrefill = z.infer<typeof bookingFormPrefillSchema>;

const requiredPrefillKeys: Array<keyof BookingFormPrefill> = [
  "firstName",
  "lastName",
  "email",
  "phone",
  "make",
  "model",
];

export const emptyBookingFormPrefill: BookingFormPrefill = {
  firstName: "",
  lastName: "",
  email: "",
  phone: "",
  make: "",
  model: "",
  year: "",
  color: "",
  licensePlate: "",
  notes: "",
};

export function applyBookingFormPrefill(
  current: BookingFormPrefill,
  prefill: BookingFormPrefill,
): BookingFormPrefill {
  return {
    ...current,
    ...prefill,
  };
}

export function parseDevBookingPrefill(input: {
  enabled: string | undefined;
  json: string | undefined;
}): BookingFormPrefill | null {
  if (input.enabled !== "true") {
    return null;
  }

  if (!input.json?.trim()) {
    warnOnce(
      "NEXT_PUBLIC_DEV_BOOKING_PREFILL_JSON",
      "Missing environment variable: NEXT_PUBLIC_DEV_BOOKING_PREFILL_JSON",
    );
    return null;
  }

  try {
    const parsed = JSON.parse(input.json) as unknown;
    const result = bookingFormPrefillSchema.safeParse(parsed);

    if (!result.success) {
      warnOnce(
        "NEXT_PUBLIC_DEV_BOOKING_PREFILL_JSON_INVALID",
        "Invalid NEXT_PUBLIC_DEV_BOOKING_PREFILL_JSON value. Dev booking prefill is disabled.",
      );
      return null;
    }

    const isIncomplete = requiredPrefillKeys.some((key) => result.data[key].trim().length === 0);

    if (isIncomplete) {
      warnOnce(
        "NEXT_PUBLIC_DEV_BOOKING_PREFILL_JSON_INCOMPLETE",
        "Incomplete NEXT_PUBLIC_DEV_BOOKING_PREFILL_JSON value. Dev booking prefill is disabled.",
      );
      return null;
    }

    return result.data;
  } catch {
    warnOnce(
      "NEXT_PUBLIC_DEV_BOOKING_PREFILL_JSON_PARSE",
      "Unable to parse NEXT_PUBLIC_DEV_BOOKING_PREFILL_JSON. Dev booking prefill is disabled.",
    );
    return null;
  }
}

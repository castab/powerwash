import { parseDevBookingPrefill } from "@/lib/booking-prefill";

const warnedKeys = new Set<string>();

function warnOnce(key: string) {
  if (!warnedKeys.has(key)) {
    console.warn(`Missing environment variable: ${key}`);
    warnedKeys.add(key);
  }
}

function readEnv(key: string, fallback = "") {
  const value = process.env[key];

  if (value && value.length > 0) {
    return value;
  }

  warnOnce(key);
  return fallback;
}

export function getEnv() {
  const emailFrom = readEnv("EMAIL_FROM");
  const supportEmail = process.env.SUPPORT_EMAIL ?? emailFrom;

  if (!supportEmail) {
    warnOnce("SUPPORT_EMAIL");
  }

  return {
    appUrl: readEnv("NEXT_PUBLIC_APP_URL", "http://localhost:3000"),
    stripeSecretKey: readEnv("STRIPE_SECRET_KEY"),
    stripeWebhookSecret: readEnv("STRIPE_WEBHOOK_SECRET"),
    adminSessionSecret: readEnv("ADMIN_SESSION_SECRET", "change-me"),
    resendApiKey: readEnv("RESEND_API_KEY"),
    emailFrom,
    supportEmail,
  };
}

export function getDevBookingPrefill() {
  return parseDevBookingPrefill({
    enabled: process.env.NEXT_PUBLIC_DEV_BOOKING_PREFILL_ENABLED,
    json: process.env.NEXT_PUBLIC_DEV_BOOKING_PREFILL_JSON,
  });
}

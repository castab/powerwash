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

const MIN_SECRET_LENGTH = 32;

function readSecretEnv(key: string, devFallback: string) {
  const value = process.env[key];
  const isProduction = process.env.NODE_ENV === "production";

  if (!value || value.length === 0) {
    if (isProduction) {
      throw new Error(`Missing required environment variable in production: ${key}`);
    }

    warnOnce(key);
    return devFallback;
  }

  if (isProduction) {
    if (value.startsWith("change-me") || value.startsWith("replace-with")) {
      throw new Error(`Environment variable ${key} is still set to a placeholder value in production.`);
    }

    if (value.length < MIN_SECRET_LENGTH) {
      throw new Error(
        `Environment variable ${key} must be at least ${MIN_SECRET_LENGTH} characters in production.`,
      );
    }
  }

  return value;
}

function readOptionalPositiveIntEnv(key: string, fallback: number) {
  const value = process.env[key];

  if (!value || value.length === 0) {
    return fallback;
  }

  const parsed = Number.parseInt(value, 10);

  if (!Number.isInteger(parsed) || parsed <= 0) {
    console.warn(`Invalid environment variable: ${key}. Expected a positive integer.`);
    return fallback;
  }

  return parsed;
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
    adminSessionSecret: readSecretEnv("ADMIN_SESSION_SECRET", "change-me"),
    manageLinkSecret: readSecretEnv("MANAGE_LINK_SECRET", "change-me-manage-link"),
    // Signs the anti-bot booking-form token (proof-of-render + min fill time).
    bookingFormSecret: readSecretEnv("BOOKING_FORM_SECRET", "change-me-booking-form"),
    // Cloudflare Turnstile server secret. Optional: when empty the Turnstile
    // check is skipped (see `verifyTurnstileToken`), so dev/first-run is unaffected.
    turnstileSecretKey: process.env.TURNSTILE_SECRET_KEY ?? "",
    resendApiKey: readEnv("RESEND_API_KEY"),
    confirmationReconcileDebounceMs: readOptionalPositiveIntEnv(
      "CONFIRMATION_RECONCILE_DEBOUNCE_MS",
      30_000,
    ),
    confirmationReconcileMapMaxSize: readOptionalPositiveIntEnv(
      "CONFIRMATION_RECONCILE_MAP_MAX_SIZE",
      1_000,
    ),
    emailFrom,
    supportEmail,
    // Optional: service-area features degrade gracefully when unset. Falls back
    // to the browser key, which only works when that key is API-restricted
    // rather than referrer-restricted (server calls send no referrer header).
    googleMapsServerApiKey:
      process.env.GOOGLE_MAPS_SERVER_API_KEY ||
      process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ||
      "",
  };
}

export function getDevBookingPrefill() {
  return parseDevBookingPrefill({
    enabled: process.env.NEXT_PUBLIC_DEV_BOOKING_PREFILL_ENABLED,
    json: process.env.NEXT_PUBLIC_DEV_BOOKING_PREFILL_JSON,
  });
}

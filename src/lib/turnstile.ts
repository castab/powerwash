import { getEnv } from "@/lib/env";

// Server-side verification for Cloudflare Turnstile tokens. Feature-flagged: when
// TURNSTILE_SECRET_KEY is unset the check is skipped (returns ok), mirroring the
// "unconfigured -> skip" policy the service-area gate already uses so local dev
// and first-run deployments are unaffected. When a secret is configured, an
// absent, malformed, or unverified token fails closed.

const SITEVERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

export type TurnstileResult = { ok: boolean; skipped: boolean };

export async function verifyTurnstileToken(
  token: unknown,
  remoteIp?: string,
): Promise<TurnstileResult> {
  const secret = getEnv().turnstileSecretKey;

  if (!secret) {
    return { ok: true, skipped: true };
  }

  if (typeof token !== "string" || token.length === 0) {
    return { ok: false, skipped: false };
  }

  const body = new URLSearchParams();
  body.set("secret", secret);
  body.set("response", token);
  if (remoteIp && remoteIp !== "unknown") {
    body.set("remoteip", remoteIp);
  }

  try {
    const response = await fetch(SITEVERIFY_URL, { method: "POST", body });
    if (!response.ok) {
      return { ok: false, skipped: false };
    }

    const data = (await response.json()) as { success?: boolean };
    return { ok: data.success === true, skipped: false };
  } catch {
    // Network/JSON failure: fail closed rather than admit an unverified caller.
    return { ok: false, skipped: false };
  }
}

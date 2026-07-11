import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

// Pure sign/verify for the booking-form anti-bot token. Kept free of DB, env,
// and request dependencies (mirrors `manage-token.ts`) so the invariants —
// tamper rejection, min fill time, expiry — can be exercised directly in tests.
//
// The token is minted server-side when `/book` renders and echoed back on the
// final submit. Verifying it proves the form was actually rendered by our
// server (a crafted POST has no valid token) and, via `issuedAt`, lets the
// server reject submits that arrive impossibly fast (instant bots) or from a
// stale page. It carries no user data and needs no server-side state.

export type BookingFormTokenPayload = {
  // Epoch milliseconds when the token (and thus the form) was minted.
  issuedAt: number;
  // Random padding so two tokens minted in the same millisecond still differ.
  nonce: string;
};

export type VerifyBookingFormTokenResult =
  | { ok: true; payload: BookingFormTokenPayload }
  | { ok: false; reason: "malformed" | "bad_signature" | "expired" | "future" | "too_fast" };

export type VerifyBookingFormTokenOptions = {
  now?: number;
  // Reject tokens older than this (guards against stale/replayed pages).
  maxAgeMs?: number;
  // Reject tokens younger than this (guards against instant/scripted submits).
  // Only passed on the final submit — pre-checks verify signature + expiry only.
  minAgeMs?: number;
};

// Tolerate small clock differences between render and submit so a token minted
// "just now" is never rejected as coming from the future.
const CLOCK_SKEW_MS = 5_000;

function signPayload(encodedPayload: string, secret: string) {
  return createHmac("sha256", secret).update(encodedPayload).digest("base64url");
}

function encodePayload(payload: BookingFormTokenPayload) {
  return Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
}

function decodePayload(encodedPayload: string): BookingFormTokenPayload | null {
  try {
    const parsed = JSON.parse(
      Buffer.from(encodedPayload, "base64url").toString("utf8"),
    ) as Partial<BookingFormTokenPayload> | null;

    if (!parsed || typeof parsed.issuedAt !== "number" || typeof parsed.nonce !== "string") {
      return null;
    }

    return { issuedAt: parsed.issuedAt, nonce: parsed.nonce };
  } catch {
    return null;
  }
}

export function createBookingFormToken(secret: string, now: number = Date.now()) {
  const payload: BookingFormTokenPayload = {
    issuedAt: now,
    nonce: randomBytes(9).toString("base64url"),
  };
  const encodedPayload = encodePayload(payload);
  const signature = signPayload(encodedPayload, secret);
  return `${encodedPayload}.${signature}`;
}

export function verifyBookingFormToken(
  token: unknown,
  secret: string,
  options: VerifyBookingFormTokenOptions = {},
): VerifyBookingFormTokenResult {
  if (typeof token !== "string") {
    return { ok: false, reason: "malformed" };
  }

  const [encodedPayload, signature] = token.split(".");
  if (!encodedPayload || !signature) {
    return { ok: false, reason: "malformed" };
  }

  const expectedSignature = signPayload(encodedPayload, secret);
  const expectedBuffer = Buffer.from(expectedSignature);
  const actualBuffer = Buffer.from(signature);

  if (expectedBuffer.length !== actualBuffer.length || !timingSafeEqual(expectedBuffer, actualBuffer)) {
    return { ok: false, reason: "bad_signature" };
  }

  const payload = decodePayload(encodedPayload);
  if (!payload) {
    return { ok: false, reason: "malformed" };
  }

  const now = options.now ?? Date.now();
  const age = now - payload.issuedAt;

  if (age < -CLOCK_SKEW_MS) {
    return { ok: false, reason: "future" };
  }

  if (options.maxAgeMs != null && age > options.maxAgeMs) {
    return { ok: false, reason: "expired" };
  }

  if (options.minAgeMs != null && age < options.minAgeMs) {
    return { ok: false, reason: "too_fast" };
  }

  return { ok: true, payload };
}

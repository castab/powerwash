// In-memory fixed-window rate limiter.
//
// State lives in module memory, so counters are per-process and reset on restart.
// This is acceptable for the single-instance Railway deployment; on multi-instance
// or serverless hosting each instance keeps its own counters, so treat these limits
// as best-effort abuse protection rather than a globally coordinated guarantee.

type RateLimitBucket = {
  count: number;
  resetAt: number;
};

export type RateLimitOptions = {
  limit: number;
  windowMs: number;
  now?: number;
};

export type RateLimitResult = {
  ok: boolean;
  remaining: number;
  retryAfterMs: number;
};

// Preset limits shared by the callers so bounds are documented in one place.
export const RATE_LIMITS = {
  // 5 failed admin logins per 15 minutes, per IP and per email.
  adminLogin: { limit: 5, windowMs: 15 * 60 * 1000 },
  // 60 availability lookups per minute, per IP.
  availability: { limit: 60, windowMs: 60 * 1000 },
  // 10 booking-checkout attempts per 10 minutes, per IP (each creates a DB hold
  // and a Stripe Checkout session, so this is the expensive path worth protecting).
  bookingCheckout: { limit: 10, windowMs: 10 * 60 * 1000 },
  // 60 confirmation-status polls per minute, per IP — the confirmation page polls
  // every 3s, so this leaves ample headroom for a handful of concurrent tabs.
  confirmationStatus: { limit: 60, windowMs: 60 * 1000 },
} as const;

// Bound the number of tracked keys so a flood of unique keys cannot grow the map
// without limit. When the cap is exceeded we drop expired buckets first.
const MAX_TRACKED_KEYS = 10_000;

const buckets = new Map<string, RateLimitBucket>();

function pruneExpired(now: number) {
  for (const [key, bucket] of buckets) {
    if (bucket.resetAt <= now) {
      buckets.delete(key);
    }
  }
}

function getActiveBucket(key: string, now: number): RateLimitBucket | null {
  const bucket = buckets.get(key);
  if (!bucket || bucket.resetAt <= now) {
    return null;
  }
  return bucket;
}

function toResult(bucket: RateLimitBucket | null, limit: number, now: number): RateLimitResult {
  if (!bucket) {
    return { ok: true, remaining: limit, retryAfterMs: 0 };
  }

  const remaining = Math.max(0, limit - bucket.count);
  const blocked = bucket.count >= limit;
  return {
    ok: !blocked,
    remaining,
    retryAfterMs: blocked ? Math.max(0, bucket.resetAt - now) : 0,
  };
}

/**
 * Read-only check: is `key` currently at or over its limit? Does not consume.
 * Use before an expensive operation (e.g. a bcrypt comparison) so a blocked
 * caller can be rejected without paying that cost.
 */
export function checkRateLimit(key: string, options: RateLimitOptions): RateLimitResult {
  const now = options.now ?? Date.now();
  return toResult(getActiveBucket(key, now), options.limit, now);
}

/**
 * Record one hit against `key`, opening a fresh window when none is active.
 * Returns the post-increment state. Used to count failures (login) after the
 * fact.
 */
export function recordRateLimitHit(key: string, options: RateLimitOptions): RateLimitResult {
  const now = options.now ?? Date.now();

  let bucket = getActiveBucket(key, now);
  if (!bucket) {
    if (buckets.size >= MAX_TRACKED_KEYS) {
      pruneExpired(now);
    }
    bucket = { count: 0, resetAt: now + options.windowMs };
    buckets.set(key, bucket);
  }

  bucket.count += 1;
  return toResult(bucket, options.limit, now);
}

/**
 * Check-then-consume for per-request endpoints: rejects without incrementing
 * when already over the limit, otherwise records the request.
 */
export function consumeRateLimit(key: string, options: RateLimitOptions): RateLimitResult {
  const now = options.now ?? Date.now();
  const current = checkRateLimit(key, { ...options, now });
  if (!current.ok) {
    return current;
  }

  // The request passed the check, so it is permitted even if this hit exhausts
  // the last token; report it allowed with the post-increment remaining count.
  const afterHit = recordRateLimitHit(key, { ...options, now });
  return { ok: true, remaining: afterHit.remaining, retryAfterMs: 0 };
}

/** Clear a key's window, e.g. after a successful login. */
export function resetRateLimit(key: string) {
  buckets.delete(key);
}

/** Test-only: drop all tracked state. */
export function __resetAllRateLimits() {
  buckets.clear();
}

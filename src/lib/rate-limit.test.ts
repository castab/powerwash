import assert from "node:assert/strict";
import {
  __resetAllRateLimits,
  checkRateLimit,
  consumeRateLimit,
  recordRateLimitHit,
  resetRateLimit,
} from "./rate-limit.ts";

function runTest(name: string, fn: () => void) {
  __resetAllRateLimits();
  try {
    fn();
    console.log(`PASS ${name}`);
  } catch (error) {
    console.error(`FAIL ${name}`);
    throw error;
  }
}

const options = { limit: 5, windowMs: 15 * 60 * 1000 };
const now = 1_000_000;

runTest("checkRateLimit does not consume and stays allowed until failures are recorded", () => {
  // Repeated read-only checks never trip the limit on their own.
  for (let i = 0; i < 10; i += 1) {
    assert.equal(checkRateLimit("key", { ...options, now }).ok, true);
  }
});

runTest("sixth failed attempt is blocked without consuming a bcrypt comparison", () => {
  // Five failures are recorded; the sixth check is rejected before any hit.
  for (let attempt = 1; attempt <= 5; attempt += 1) {
    assert.equal(checkRateLimit("key", { ...options, now }).ok, true, `attempt ${attempt} allowed`);
    recordRateLimitHit("key", { ...options, now });
  }

  const sixth = checkRateLimit("key", { ...options, now });
  assert.equal(sixth.ok, false);
  assert.equal(sixth.remaining, 0);
  assert.ok(sixth.retryAfterMs > 0);
});

runTest("window resets after it elapses", () => {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    recordRateLimitHit("key", { ...options, now });
  }
  assert.equal(checkRateLimit("key", { ...options, now }).ok, false);

  const afterWindow = now + options.windowMs + 1;
  assert.equal(checkRateLimit("key", { ...options, now: afterWindow }).ok, true);
});

runTest("resetRateLimit clears a key immediately (successful login)", () => {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    recordRateLimitHit("key", { ...options, now });
  }
  assert.equal(checkRateLimit("key", { ...options, now }).ok, false);

  resetRateLimit("key");
  assert.equal(checkRateLimit("key", { ...options, now }).ok, true);
});

runTest("consumeRateLimit allows up to the limit then blocks without over-counting", () => {
  const perRequest = { limit: 3, windowMs: 60_000, now };

  assert.equal(consumeRateLimit("ep", perRequest).ok, true);
  assert.equal(consumeRateLimit("ep", perRequest).ok, true);
  const third = consumeRateLimit("ep", perRequest);
  assert.equal(third.ok, true);
  assert.equal(third.remaining, 0);

  const fourth = consumeRateLimit("ep", perRequest);
  assert.equal(fourth.ok, false);
  assert.ok(fourth.retryAfterMs > 0);
});

runTest("separate keys are tracked independently", () => {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    recordRateLimitHit("ip:a", { ...options, now });
  }
  assert.equal(checkRateLimit("ip:a", { ...options, now }).ok, false);
  assert.equal(checkRateLimit("ip:b", { ...options, now }).ok, true);
});

console.log("All rate-limit tests passed.");

import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { createBookingFormToken, verifyBookingFormToken } from "./booking-form-token.ts";

function runTest(name: string, fn: () => void) {
  try {
    fn();
    console.log(`PASS ${name}`);
  } catch (error) {
    console.error(`FAIL ${name}`);
    throw error;
  }
}

const SECRET = "test-booking-form-secret-value";
const T0 = 1_720_000_000_000;

runTest("a freshly signed token verifies against its own timestamp", () => {
  const token = createBookingFormToken(SECRET, T0);
  const result = verifyBookingFormToken(token, SECRET, { now: T0 });
  assert.equal(result.ok, true);
});

runTest("a token signed with a different secret is rejected", () => {
  const token = createBookingFormToken(SECRET, T0);
  const result = verifyBookingFormToken(token, "some-other-secret", { now: T0 });
  assert.deepEqual(result, { ok: false, reason: "bad_signature" });
});

runTest("a tampered signature is rejected", () => {
  const token = createBookingFormToken(SECRET, T0);
  const [encoded, signature] = token.split(".");
  const flipped = signature.slice(0, -1) + (signature.endsWith("A") ? "B" : "A");
  const result = verifyBookingFormToken(`${encoded}.${flipped}`, SECRET, { now: T0 });
  assert.deepEqual(result, { ok: false, reason: "bad_signature" });
});

runTest("a tampered payload no longer matches its signature", () => {
  const token = createBookingFormToken(SECRET, T0);
  const forgedPayload = Buffer.from(
    JSON.stringify({ issuedAt: T0 - 60_000, nonce: "forged" }),
    "utf8",
  ).toString("base64url");
  const signature = token.split(".")[1];
  const result = verifyBookingFormToken(`${forgedPayload}.${signature}`, SECRET, { now: T0 });
  assert.deepEqual(result, { ok: false, reason: "bad_signature" });
});

runTest("malformed tokens are rejected", () => {
  for (const bad of ["", "only-one-part", ".sig", "payload.", null, undefined, 42]) {
    const result = verifyBookingFormToken(bad, SECRET, { now: T0 });
    assert.deepEqual(result, { ok: false, reason: "malformed" });
  }
});

runTest("a token older than maxAgeMs is rejected as expired", () => {
  const token = createBookingFormToken(SECRET, T0);
  const result = verifyBookingFormToken(token, SECRET, {
    now: T0 + 4 * 60 * 60 * 1000,
    maxAgeMs: 3 * 60 * 60 * 1000,
  });
  assert.deepEqual(result, { ok: false, reason: "expired" });
});

runTest("a token younger than minAgeMs is rejected as too_fast", () => {
  const token = createBookingFormToken(SECRET, T0);
  const result = verifyBookingFormToken(token, SECRET, { now: T0 + 500, minAgeMs: 3_000 });
  assert.deepEqual(result, { ok: false, reason: "too_fast" });
});

runTest("a token that satisfies both min and max age verifies", () => {
  const token = createBookingFormToken(SECRET, T0);
  const result = verifyBookingFormToken(token, SECRET, {
    now: T0 + 30_000,
    minAgeMs: 3_000,
    maxAgeMs: 3 * 60 * 60 * 1000,
  });
  assert.equal(result.ok, true);
});

runTest("a token from the future (beyond clock skew) is rejected", () => {
  const token = createBookingFormToken(SECRET, T0);
  const result = verifyBookingFormToken(token, SECRET, { now: T0 - 60_000 });
  assert.deepEqual(result, { ok: false, reason: "future" });
});

runTest("a small negative skew is tolerated", () => {
  const token = createBookingFormToken(SECRET, T0);
  const result = verifyBookingFormToken(token, SECRET, { now: T0 - 1_000 });
  assert.equal(result.ok, true);
});

// A correctly signed but wrong-shaped payload must fail decode, not pass.
runTest("a well-signed payload with wrong field types is rejected as malformed", () => {
  const encoded = Buffer.from(
    JSON.stringify({ issuedAt: "not-a-number", nonce: 5 }),
    "utf8",
  ).toString("base64url");
  const signature = createHmac("sha256", SECRET).update(encoded).digest("base64url");
  const result = verifyBookingFormToken(`${encoded}.${signature}`, SECRET, { now: T0 });
  assert.deepEqual(result, { ok: false, reason: "malformed" });
});

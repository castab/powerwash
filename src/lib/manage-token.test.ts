import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { createManageToken, verifyManageToken } from "./manage-token.ts";

function runTest(name: string, fn: () => void) {
  try {
    fn();
    console.log(`PASS ${name}`);
  } catch (error) {
    console.error(`FAIL ${name}`);
    throw error;
  }
}

const SECRET = "test-manage-link-secret-value";
const payload = { customerId: "customer-123", version: 2, rotatedAt: 1_720_000_000_000 };

runTest("a freshly signed token verifies and round-trips its payload", () => {
  const token = createManageToken(payload, SECRET);
  assert.deepEqual(verifyManageToken(token, SECRET), payload);
});

runTest("a token signed with a different secret is rejected", () => {
  const token = createManageToken(payload, SECRET);
  assert.equal(verifyManageToken(token, "some-other-secret"), null);
});

runTest("a tampered signature is rejected", () => {
  const token = createManageToken(payload, SECRET);
  const [encoded, signature] = token.split(".");
  const flipped = signature.slice(0, -1) + (signature.endsWith("A") ? "B" : "A");
  assert.equal(verifyManageToken(`${encoded}.${flipped}`, SECRET), null);
});

runTest("a tampered payload no longer matches its signature", () => {
  const token = createManageToken(payload, SECRET);
  const forgedPayload = Buffer.from(
    JSON.stringify({ ...payload, customerId: "customer-999" }),
    "utf8",
  ).toString("base64url");
  const signature = token.split(".")[1];
  assert.equal(verifyManageToken(`${forgedPayload}.${signature}`, SECRET), null);
});

runTest("malformed tokens (missing halves) are rejected", () => {
  assert.equal(verifyManageToken("", SECRET), null);
  assert.equal(verifyManageToken("only-one-part", SECRET), null);
  assert.equal(verifyManageToken(".sig", SECRET), null);
  assert.equal(verifyManageToken("payload.", SECRET), null);
});

runTest("a token for an older rotation/version does not verify against the new one", () => {
  // A rotated link binds to version + rotatedAt. An old token still verifies its
  // own (old) payload, but the reconciler compares that payload to the customer's
  // current version/rotatedAt; a mismatch there is what invalidates it.
  const oldToken = createManageToken({ ...payload, version: 1, rotatedAt: 1 }, SECRET);
  const decoded = verifyManageToken(oldToken, SECRET);
  assert.ok(decoded);
  assert.equal(decoded.version, 1);
  assert.notEqual(decoded.version, payload.version);
});

// Properly signs an arbitrary payload so only the decode shape guard can reject it.
function signRawPayload(rawPayload: unknown) {
  const encoded = Buffer.from(JSON.stringify(rawPayload), "utf8").toString("base64url");
  const signature = createHmac("sha256", SECRET).update(encoded).digest("base64url");
  return `${encoded}.${signature}`;
}

runTest("a well-signed payload without customerId (legacy booking-scoped shape) is rejected", () => {
  const legacyToken = signRawPayload({
    bookingId: "booking-123",
    version: 2,
    rotatedAt: 1_720_000_000_000,
  });
  assert.equal(verifyManageToken(legacyToken, SECRET), null);
});

runTest("a well-signed payload with wrong field types is rejected", () => {
  const badToken = signRawPayload({ customerId: 42, version: "2", rotatedAt: null });
  assert.equal(verifyManageToken(badToken, SECRET), null);
});

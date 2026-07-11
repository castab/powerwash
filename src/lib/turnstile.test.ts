import assert from "node:assert/strict";
import { verifyTurnstileToken } from "./turnstile.ts";

async function runTest(name: string, fn: () => Promise<void>) {
  try {
    await fn();
    console.log(`PASS ${name}`);
  } catch (error) {
    console.error(`FAIL ${name}`);
    throw error;
  }
}

const originalFetch = globalThis.fetch;
const originalSecret = process.env.TURNSTILE_SECRET_KEY;

function mockFetch(impl: (input: unknown, init?: unknown) => Response | Promise<Response>) {
  globalThis.fetch = ((input: unknown, init?: unknown) =>
    Promise.resolve(impl(input, init))) as typeof fetch;
}

function jsonResponse(payload: unknown, ok = true) {
  return new Response(JSON.stringify(payload), { status: ok ? 200 : 500 });
}

try {
  await runTest("skips (ok) when the secret is unset", async () => {
    delete process.env.TURNSTILE_SECRET_KEY;
    let called = false;
    mockFetch(() => {
      called = true;
      return jsonResponse({ success: true });
    });
    const result = await verifyTurnstileToken("any-token", "1.2.3.4");
    assert.deepEqual(result, { ok: true, skipped: true });
    assert.equal(called, false, "siteverify must not be called when unconfigured");
  });

  await runTest("fails closed on an empty token when configured", async () => {
    process.env.TURNSTILE_SECRET_KEY = "test-secret";
    let called = false;
    mockFetch(() => {
      called = true;
      return jsonResponse({ success: true });
    });
    const result = await verifyTurnstileToken("", "1.2.3.4");
    assert.deepEqual(result, { ok: false, skipped: false });
    assert.equal(called, false, "empty token should be rejected without a network call");
  });

  await runTest("passes when siteverify returns success", async () => {
    process.env.TURNSTILE_SECRET_KEY = "test-secret";
    mockFetch(() => jsonResponse({ success: true }));
    const result = await verifyTurnstileToken("good-token", "1.2.3.4");
    assert.deepEqual(result, { ok: true, skipped: false });
  });

  await runTest("fails when siteverify returns success: false", async () => {
    process.env.TURNSTILE_SECRET_KEY = "test-secret";
    mockFetch(() => jsonResponse({ success: false, "error-codes": ["invalid-input-response"] }));
    const result = await verifyTurnstileToken("bad-token", "1.2.3.4");
    assert.deepEqual(result, { ok: false, skipped: false });
  });

  await runTest("fails closed when the network call throws", async () => {
    process.env.TURNSTILE_SECRET_KEY = "test-secret";
    globalThis.fetch = (() => Promise.reject(new Error("network down"))) as typeof fetch;
    const result = await verifyTurnstileToken("good-token", "1.2.3.4");
    assert.deepEqual(result, { ok: false, skipped: false });
  });
} finally {
  globalThis.fetch = originalFetch;
  if (originalSecret === undefined) {
    delete process.env.TURNSTILE_SECRET_KEY;
  } else {
    process.env.TURNSTILE_SECRET_KEY = originalSecret;
  }
}

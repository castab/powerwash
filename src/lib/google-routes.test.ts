import assert from "node:assert/strict";
import { buildComputeRoutesBody, parseComputeRoutesResponse } from "./google-routes.ts";

function runTest(name: string, fn: () => void) {
  try {
    fn();
    console.log(`PASS ${name}`);
  } catch (error) {
    console.error(`FAIL ${name}`);
    throw error;
  }
}

runTest("buildComputeRoutesBody encodes a placeId waypoint", () => {
  const body = buildComputeRoutesBody({ placeId: "origin-place" }, { placeId: "dest-place" });

  assert.deepEqual(body, {
    origin: { placeId: "origin-place" },
    destination: { placeId: "dest-place" },
    travelMode: "DRIVE",
  });
});

runTest("buildComputeRoutesBody encodes a lat/lng waypoint", () => {
  const body = buildComputeRoutesBody(
    { placeId: "origin-place" },
    { lat: 37.7749, lng: -122.4194 },
  );

  assert.deepEqual(body.destination, {
    location: { latLng: { latitude: 37.7749, longitude: -122.4194 } },
  });
});

runTest("buildComputeRoutesBody encodes a free-text address waypoint", () => {
  const body = buildComputeRoutesBody(
    { address: "123 Main St, Springfield" },
    { placeId: "dest-place" },
  );

  assert.deepEqual(body.origin, { address: "123 Main St, Springfield" });
});

runTest("parseComputeRoutesResponse parses whole-second durations", () => {
  const result = parseComputeRoutesResponse({ routes: [{ duration: "312s" }] });
  assert.deepEqual(result, { status: "ok", durationSeconds: 312 });
});

runTest("parseComputeRoutesResponse parses fractional-second durations by rounding", () => {
  const result = parseComputeRoutesResponse({ routes: [{ duration: "312.7s" }] });
  assert.deepEqual(result, { status: "ok", durationSeconds: 313 });
});

runTest("parseComputeRoutesResponse treats an empty routes array as not_found", () => {
  assert.deepEqual(parseComputeRoutesResponse({ routes: [] }), { status: "not_found" });
});

runTest("parseComputeRoutesResponse treats a missing routes field as not_found", () => {
  assert.deepEqual(parseComputeRoutesResponse({}), { status: "not_found" });
});

runTest("parseComputeRoutesResponse treats a malformed duration as an error", () => {
  assert.deepEqual(parseComputeRoutesResponse({ routes: [{ duration: "not-a-duration" }] }), {
    status: "error",
  });
});

runTest("parseComputeRoutesResponse treats a missing duration field as an error", () => {
  assert.deepEqual(parseComputeRoutesResponse({ routes: [{}] }), { status: "error" });
});

runTest("parseComputeRoutesResponse treats non-object payloads as an error", () => {
  assert.deepEqual(parseComputeRoutesResponse(null), { status: "error" });
  assert.deepEqual(parseComputeRoutesResponse("routes.googleapis.com is down"), {
    status: "error",
  });
});

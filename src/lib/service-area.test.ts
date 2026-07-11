import assert from "node:assert/strict";
import {
  decideEligibility,
  isEligibilityMemoFresh,
  isServiceAreaConfigured,
} from "./service-area.ts";

function runTest(name: string, fn: () => void) {
  try {
    fn();
    console.log(`PASS ${name}`);
  } catch (error) {
    console.error(`FAIL ${name}`);
    throw error;
  }
}

runTest("decideEligibility: a drive exactly at the max is eligible", () => {
  const decision = decideEligibility(30, { status: "ok", durationSeconds: 30 * 60 });
  assert.deepEqual(decision, { status: "eligible", travelDurationSeconds: 1800 });
});

runTest("decideEligibility: one second over the max is ineligible", () => {
  const decision = decideEligibility(30, { status: "ok", durationSeconds: 30 * 60 + 1 });
  assert.deepEqual(decision, { status: "ineligible", travelDurationSeconds: 1801 });
});

runTest("decideEligibility: well under the max is eligible", () => {
  const decision = decideEligibility(30, { status: "ok", durationSeconds: 600 });
  assert.equal(decision.status, "eligible");
});

runTest("decideEligibility: not_found maps to address_not_found", () => {
  assert.deepEqual(decideEligibility(30, { status: "not_found" }), {
    status: "address_not_found",
  });
});

runTest("decideEligibility: error maps to unavailable", () => {
  assert.deepEqual(decideEligibility(30, { status: "error" }), { status: "unavailable" });
});

runTest("isServiceAreaConfigured: true with a place id origin and max minutes", () => {
  assert.equal(
    isServiceAreaConfigured({
      originFormattedAddress: null,
      originPlaceId: "place-123",
      originLat: null,
      originLng: null,
      maxTravelMinutes: 30,
    }),
    true,
  );
});

runTest("isServiceAreaConfigured: true with lat/lng origin and max minutes", () => {
  assert.equal(
    isServiceAreaConfigured({
      originFormattedAddress: null,
      originPlaceId: null,
      originLat: 37.7749,
      originLng: -122.4194,
      maxTravelMinutes: 30,
    }),
    true,
  );
});

runTest("isServiceAreaConfigured: true with only a formatted address origin", () => {
  assert.equal(
    isServiceAreaConfigured({
      originFormattedAddress: "1234 Main St",
      originPlaceId: null,
      originLat: null,
      originLng: null,
      maxTravelMinutes: 30,
    }),
    true,
  );
});

runTest("isServiceAreaConfigured: false with no origin at all", () => {
  assert.equal(
    isServiceAreaConfigured({
      originFormattedAddress: null,
      originPlaceId: null,
      originLat: null,
      originLng: null,
      maxTravelMinutes: 30,
    }),
    false,
  );
});

runTest("isServiceAreaConfigured: false with an origin but no max travel minutes", () => {
  assert.equal(
    isServiceAreaConfigured({
      originFormattedAddress: "1234 Main St",
      originPlaceId: null,
      originLat: null,
      originLng: null,
      maxTravelMinutes: null,
    }),
    false,
  );
});

runTest("isServiceAreaConfigured: false with a zero max travel minutes", () => {
  assert.equal(
    isServiceAreaConfigured({
      originFormattedAddress: "1234 Main St",
      originPlaceId: null,
      originLat: null,
      originLng: null,
      maxTravelMinutes: 0,
    }),
    false,
  );
});

runTest("isServiceAreaConfigured: false with a blank formatted address and no other origin", () => {
  assert.equal(
    isServiceAreaConfigured({
      originFormattedAddress: "   ",
      originPlaceId: null,
      originLat: null,
      originLng: null,
      maxTravelMinutes: 30,
    }),
    false,
  );
});

runTest("isEligibilityMemoFresh: fresh when checked after the settings were last saved", () => {
  const settings = { updatedAt: new Date("2026-01-01T00:00:00Z") };
  const address = {
    serviceEligible: true,
    eligibilityCheckedAt: new Date("2026-01-02T00:00:00Z"),
  };

  assert.equal(isEligibilityMemoFresh(address, settings), true);
});

runTest("isEligibilityMemoFresh: stale when checked before the settings were last saved", () => {
  const settings = { updatedAt: new Date("2026-01-02T00:00:00Z") };
  const address = {
    serviceEligible: true,
    eligibilityCheckedAt: new Date("2026-01-01T00:00:00Z"),
  };

  assert.equal(isEligibilityMemoFresh(address, settings), false);
});

runTest("isEligibilityMemoFresh: false when never checked", () => {
  const settings = { updatedAt: new Date("2026-01-01T00:00:00Z") };
  const address = { serviceEligible: null, eligibilityCheckedAt: null };

  assert.equal(isEligibilityMemoFresh(address, settings), false);
});

runTest("isEligibilityMemoFresh: checked exactly at settings.updatedAt counts as fresh", () => {
  const updatedAt = new Date("2026-01-01T00:00:00Z");
  const address = { serviceEligible: true, eligibilityCheckedAt: updatedAt };

  assert.equal(isEligibilityMemoFresh(address, { updatedAt }), true);
});

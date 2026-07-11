import assert from "node:assert/strict";
import { findMatchingAddress, findMatchingVehicle, normalizeCustomerEmail } from "./booking.ts";

function runTest(name: string, fn: () => void) {
  try {
    fn();
    console.log(`PASS ${name}`);
  } catch (error) {
    console.error(`FAIL ${name}`);
    throw error;
  }
}

runTest("normalizeCustomerEmail trims and lowercases", () => {
  assert.equal(normalizeCustomerEmail("  Jordan@Example.com  "), "jordan@example.com");
});

const vehicles = [
  { id: "v1", description: "2022 Toyota RAV4", color: "Pearl white", licensePlate: "8ABC123" },
  { id: "v2", description: "2019 Honda Civic", color: null, licensePlate: null },
];

runTest("findMatchingVehicle matches on exact normalized fields", () => {
  const match = findMatchingVehicle(vehicles, {
    description: "2022 Toyota RAV4",
    color: "Pearl white",
    licensePlate: "8ABC123",
  });

  assert.equal(match?.id, "v1");
});

runTest("findMatchingVehicle is case- and whitespace-insensitive", () => {
  const match = findMatchingVehicle(vehicles, {
    description: "  2022 toyota   rav4  ",
    color: "PEARL WHITE",
    licensePlate: "8abc123",
  });

  assert.equal(match?.id, "v1");
});

runTest("findMatchingVehicle matches null-optional fields against undefined input", () => {
  const match = findMatchingVehicle(vehicles, { description: "2019 Honda Civic" });
  assert.equal(match?.id, "v2");
});

runTest("findMatchingVehicle returns null when the plate differs", () => {
  const match = findMatchingVehicle(vehicles, {
    description: "2022 Toyota RAV4",
    color: "Pearl white",
    licensePlate: "9XYZ999",
  });

  assert.equal(match, null);
});

runTest("findMatchingVehicle returns null when nothing matches", () => {
  const match = findMatchingVehicle(vehicles, { description: "2010 Ford F-150" });
  assert.equal(match, null);
});

const addresses = [
  { id: "a1", googlePlaceId: "place-123", formattedAddress: "1234 Main St, Springfield, IL" },
  { id: "a2", googlePlaceId: null, formattedAddress: "56 Oak Ave, Shelbyville, IL" },
];

runTest("findMatchingAddress matches by placeId first", () => {
  const match = findMatchingAddress(addresses, {
    placeId: "place-123",
    formattedAddress: "a different string entirely",
  });

  assert.equal(match?.id, "a1");
});

runTest("findMatchingAddress falls back to normalized formattedAddress when no placeId match", () => {
  const match = findMatchingAddress(addresses, {
    placeId: "unrelated-place",
    formattedAddress: "  56   OAK ave, shelbyville, il  ",
  });

  assert.equal(match?.id, "a2");
});

runTest("findMatchingAddress matches by formattedAddress when no placeId is given", () => {
  const match = findMatchingAddress(addresses, {
    formattedAddress: "1234 Main St, Springfield, IL",
  });

  assert.equal(match?.id, "a1");
});

runTest("findMatchingAddress returns null when nothing matches", () => {
  const match = findMatchingAddress(addresses, { formattedAddress: "999 Nowhere Rd" });
  assert.equal(match, null);
});

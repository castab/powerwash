import assert from "node:assert/strict";
import {
  applyBookingFormPrefill,
  emptyBookingFormPrefill,
  parseDevBookingPrefill,
} from "./booking-prefill.ts";

function runTest(name: string, fn: () => void) {
  try {
    fn();
    console.log(`PASS ${name}`);
  } catch (error) {
    console.error(`FAIL ${name}`);
    throw error;
  }
}

runTest("parseDevBookingPrefill returns null when disabled", () => {
  const result = parseDevBookingPrefill({
    enabled: "false",
    json: JSON.stringify({ firstName: "Jordan" }),
  });

  assert.equal(result, null);
});

runTest("parseDevBookingPrefill returns typed data when enabled with valid json", () => {
  const result = parseDevBookingPrefill({
    enabled: "true",
    json: JSON.stringify({
      firstName: "Jordan",
      lastName: "Taylor",
      email: "jordan@example.com",
      phone: "5551234567",
      make: "Toyota",
      model: "RAV4",
      year: 2022,
      color: "Pearl white",
      licensePlate: "8ABC123",
      notes: "Pet hair",
    }),
  });

  assert.deepEqual(result, {
    firstName: "Jordan",
    lastName: "Taylor",
    email: "jordan@example.com",
    phone: "5551234567",
    make: "Toyota",
    model: "RAV4",
    year: "2022",
    color: "Pearl white",
    licensePlate: "8ABC123",
    notes: "Pet hair",
  });
});

runTest("parseDevBookingPrefill returns null for malformed json", () => {
  const result = parseDevBookingPrefill({
    enabled: "true",
    json: "{not-json}",
  });

  assert.equal(result, null);
});

runTest("parseDevBookingPrefill omits invalid year by failing closed", () => {
  const result = parseDevBookingPrefill({
    enabled: "true",
    json: JSON.stringify({
      firstName: "Jordan",
      lastName: "Taylor",
      email: "jordan@example.com",
      phone: "5551234567",
      make: "Toyota",
      model: "RAV4",
      year: "22",
    }),
  });

  assert.equal(result, null);
});

runTest("parseDevBookingPrefill fills missing optional fields with empty strings", () => {
  const result = parseDevBookingPrefill({
    enabled: "true",
    json: JSON.stringify({
      firstName: "Jordan",
      lastName: "Taylor",
      email: "jordan@example.com",
      phone: "5551234567",
      make: "Toyota",
      model: "RAV4",
    }),
  });

  assert.deepEqual(result, {
    firstName: "Jordan",
    lastName: "Taylor",
    email: "jordan@example.com",
    phone: "5551234567",
    make: "Toyota",
    model: "RAV4",
    year: "",
    color: "",
    licensePlate: "",
    notes: "",
  });
});

runTest("parseDevBookingPrefill returns null for incomplete required payloads", () => {
  const result = parseDevBookingPrefill({
    enabled: "true",
    json: JSON.stringify({
      firstName: "Jordan",
      lastName: "Taylor",
      email: "jordan@example.com",
      phone: "5551234567",
      make: "Toyota",
    }),
  });

  assert.equal(result, null);
});

runTest("applyBookingFormPrefill merges onto existing values", () => {
  const result = applyBookingFormPrefill(emptyBookingFormPrefill, {
    firstName: "Jordan",
    lastName: "Taylor",
    email: "jordan@example.com",
    phone: "5551234567",
    make: "Toyota",
    model: "RAV4",
    year: "2022",
    color: "Pearl white",
    licensePlate: "8ABC123",
    notes: "Pet hair",
  });

  assert.deepEqual(result, {
    firstName: "Jordan",
    lastName: "Taylor",
    email: "jordan@example.com",
    phone: "5551234567",
    make: "Toyota",
    model: "RAV4",
    year: "2022",
    color: "Pearl white",
    licensePlate: "8ABC123",
    notes: "Pet hair",
  });
});

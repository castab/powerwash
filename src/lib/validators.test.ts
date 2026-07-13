import assert from "node:assert/strict";
import { availabilitySchema, bookingSchema, serviceSchema } from "./validators.ts";

function runTest(name: string, fn: () => void) {
  try {
    fn();
    console.log(`PASS ${name}`);
  } catch (error) {
    console.error(`FAIL ${name}`);
    throw error;
  }
}

// On the create path the form renders no id field, so `formData.get("id")`
// returns `null`. The admin actions coerce that to `undefined` before
// parsing (see issue 013); these tests exercise the same coercion.
function coerceFormId(idValue: FormDataEntryValue | null) {
  return typeof idValue === "string" && idValue.length > 0 ? idValue : undefined;
}

runTest("serviceSchema accepts the create-path payload (formData.get(\"id\") is null)", () => {
  const parsed = serviceSchema.safeParse({
    id: coerceFormId(null),
    name: "Basic Wash",
    description: undefined,
    durationMinutes: "60",
    basePrice: "100",
    depositAmount: "25",
    isActive: true,
  });

  assert.equal(parsed.success, true);
});

runTest("availabilitySchema accepts the create-path payload (formData.get(\"id\") is null)", () => {
  const parsed = availabilitySchema.safeParse({
    id: coerceFormId(null),
    dayOfWeek: "1",
    startTime: "09:00",
    endTime: "17:00",
    isActive: true,
  });

  assert.equal(parsed.success, true);
});

runTest("serviceSchema rejects a raw null id (guards the coercion, matches Zod v4 .optional() semantics)", () => {
  const parsed = serviceSchema.safeParse({
    id: null,
    name: "Basic Wash",
    durationMinutes: "60",
    basePrice: "100",
    depositAmount: "25",
    isActive: true,
  });

  assert.equal(parsed.success, false);
});

runTest("availabilitySchema rejects a raw null id (guards the coercion, matches Zod v4 .optional() semantics)", () => {
  const parsed = availabilitySchema.safeParse({
    id: null,
    dayOfWeek: "1",
    startTime: "09:00",
    endTime: "17:00",
    isActive: true,
  });

  assert.equal(parsed.success, false);
});

// Mirrors what the wizard's hidden inputs post after a verified Places
// selection: every field present as a string, metadata populated.
const validBookingPayload = {
  serviceId: "svc_123",
  date: "2026-07-20",
  startAt: "2026-07-20T17:00:00.000Z",
  firstName: "Jordan",
  lastName: "Taylor",
  email: "jordan@example.com",
  phone: "5551234567",
  vehicleDescription: "2022 Toyota RAV4",
  color: "",
  licensePlate: "",
  notes: "",
  address: "1234 Main St, Springfield",
  addressPlaceId: "ChIJexample",
  addressLat: "37.774900",
  addressLng: "-122.419400",
  addressComponents: JSON.stringify([{ longText: "1234", types: ["street_number"] }]),
  addressValidated: "true",
};

runTest("bookingSchema accepts a validated Places selection", () => {
  const parsed = bookingSchema.safeParse(validBookingPayload);

  assert.equal(parsed.success, true);
  assert.equal(parsed.data?.address, "1234 Main St, Springfield");
  assert.equal(parsed.data?.addressPlaceId, "ChIJexample");
  assert.equal(parsed.data?.addressLat, 37.7749);
  assert.equal(parsed.data?.addressLng, -122.4194);
  assert.equal(parsed.data?.addressValidated, true);
});

runTest("bookingSchema rejects a manual address entry (no placeId — hidden inputs post \"\")", () => {
  const parsed = bookingSchema.safeParse({
    ...validBookingPayload,
    addressPlaceId: "",
    addressLat: "",
    addressLng: "",
    addressComponents: "",
    addressValidated: "false",
  });

  assert.equal(parsed.success, false);
});

runTest("bookingSchema rejects a placeId that was not validated (post-selection edit)", () => {
  const parsed = bookingSchema.safeParse({
    ...validBookingPayload,
    addressValidated: "false",
  });

  assert.equal(parsed.success, false);
});

runTest("bookingSchema rejects addressValidated=true without a placeId", () => {
  const parsed = bookingSchema.safeParse({
    ...validBookingPayload,
    addressPlaceId: "",
  });

  assert.equal(parsed.success, false);
});

runTest("bookingSchema rejects a missing or too-short address", () => {
  const missing = bookingSchema.safeParse({ ...validBookingPayload, address: "" });
  assert.equal(missing.success, false);

  const short = bookingSchema.safeParse({ ...validBookingPayload, address: "123" });
  assert.equal(short.success, false);
});

runTest("bookingSchema rejects out-of-range coordinates", () => {
  const parsed = bookingSchema.safeParse({
    ...validBookingPayload,
    addressLat: "91",
    addressLng: "0",
  });

  assert.equal(parsed.success, false);
});

runTest("serviceSchema still accepts an id on the edit path", () => {
  const parsed = serviceSchema.safeParse({
    id: coerceFormId("svc_123"),
    name: "Basic Wash",
    durationMinutes: "60",
    basePrice: "100",
    depositAmount: "25",
    isActive: true,
  });

  assert.equal(parsed.success, true);
  assert.equal(parsed.data?.id, "svc_123");
});

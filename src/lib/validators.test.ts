import assert from "node:assert/strict";
import { availabilitySchema, serviceSchema } from "./validators.ts";

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

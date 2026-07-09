// Force a non-Pacific server time zone so these assertions fail if slot math
// ever falls back to server-local Date semantics (issue 002 regression).
process.env.TZ = "UTC";

import assert from "node:assert/strict";
import { computeAvailableSlots } from "./booking-slots.ts";
import {
  addDaysToDateValue,
  getBusinessDateValue,
  getBusinessDayWindow,
  getDayOfWeekForDateValue,
} from "./business-time.ts";

function runTest(name: string, fn: () => void) {
  try {
    fn();
    console.log(`PASS ${name}`);
  } catch (error) {
    console.error(`FAIL ${name}`);
    throw error;
  }
}

const businessRule = { startTime: "08:00", endTime: "17:00" };
const earlyNow = new Date("2026-07-01T00:00:00.000Z");

runTest("slots anchor to Pacific wall-clock time during PDT", () => {
  const slots = computeAvailableSlots({
    dateValue: "2026-07-08",
    durationMinutes: 60,
    rules: [businessRule],
    bookings: [],
    blackouts: [],
    now: earlyNow,
  });

  assert.equal(slots[0]?.startAt, "2026-07-08T15:00:00.000Z");
  assert.equal(slots[0]?.label, "8:00 AM");
  assert.equal(slots.at(-1)?.startAt, "2026-07-08T23:00:00.000Z");
  assert.equal(slots.at(-1)?.label, "4:00 PM");
  assert.equal(slots.length, 33);
});

runTest("slots anchor to Pacific wall-clock time during PST", () => {
  const slots = computeAvailableSlots({
    dateValue: "2026-01-14",
    durationMinutes: 60,
    rules: [businessRule],
    bookings: [],
    blackouts: [],
    now: new Date("2026-01-01T00:00:00.000Z"),
  });

  assert.equal(slots[0]?.startAt, "2026-01-14T16:00:00.000Z");
  assert.equal(slots[0]?.label, "8:00 AM");
});

runTest("overlapping bookings and blackouts remove slots", () => {
  const slots = computeAvailableSlots({
    dateValue: "2026-07-08",
    durationMinutes: 60,
    rules: [businessRule],
    bookings: [
      {
        startAt: new Date("2026-07-08T15:00:00.000Z"),
        endAt: new Date("2026-07-08T16:00:00.000Z"),
      },
    ],
    blackouts: [
      {
        startsAt: new Date("2026-07-08T22:00:00.000Z"),
        endsAt: new Date("2026-07-09T07:00:00.000Z"),
      },
    ],
    now: earlyNow,
  });

  assert.equal(slots[0]?.startAt, "2026-07-08T16:00:00.000Z");
  assert.ok(slots.every((slot) => new Date(slot.endAt) <= new Date("2026-07-08T22:00:00.000Z")));
});

runTest("slots starting within the lead-time window are excluded", () => {
  const slots = computeAvailableSlots({
    dateValue: "2026-07-08",
    durationMinutes: 60,
    rules: [businessRule],
    bookings: [],
    blackouts: [],
    now: new Date("2026-07-08T15:30:00.000Z"),
  });

  assert.equal(slots[0]?.startAt, "2026-07-08T16:30:00.000Z");
});

runTest("overlapping availability rules do not emit duplicate slot starts", () => {
  const slots = computeAvailableSlots({
    dateValue: "2026-07-08",
    durationMinutes: 60,
    rules: [
      { startTime: "08:00", endTime: "12:00" },
      // Overlaps the first rule for part of the morning.
      { startTime: "10:00", endTime: "14:00" },
    ],
    bookings: [],
    blackouts: [],
    now: earlyNow,
  });

  const starts = slots.map((slot) => slot.startAt);
  assert.equal(new Set(starts).size, starts.length, "no duplicate startAt values");
  // Output stays chronologically sorted across the interleaved rules.
  const sorted = [...starts].sort((a, b) => a.localeCompare(b));
  assert.deepEqual(starts, sorted);
});

runTest("business day window covers the Pacific calendar day", () => {
  const window = getBusinessDayWindow("2026-07-08");

  assert.equal(window.start.toISOString(), "2026-07-08T07:00:00.000Z");
  assert.equal(window.end.toISOString(), "2026-07-09T07:00:00.000Z");
});

runTest("day of week derives from the business date value", () => {
  assert.equal(getDayOfWeekForDateValue("2026-07-08"), 3);
  assert.equal(getDayOfWeekForDateValue("2026-07-12"), 0);
});

runTest("date value helpers roll over months and map instants to business dates", () => {
  assert.equal(addDaysToDateValue("2026-07-31", 1), "2026-08-01");
  // 2026-07-09T02:00Z is still 2026-07-08 in Pacific time.
  assert.equal(getBusinessDateValue(new Date("2026-07-09T02:00:00.000Z")), "2026-07-08");
});

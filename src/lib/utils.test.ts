import assert from "node:assert/strict";
import { Prisma as BrowserPrisma } from "@/generated/prisma/browser";
import { Prisma as ClientPrisma } from "@/generated/prisma/client";
import {
  formatInBusinessTimeZone,
  normalizeMoneyInput,
  parseBusinessDateTimeLocalValue,
  toBusinessDateTimeLocalValue,
} from "./utils.ts";

function runTest(name: string, fn: () => void) {
  try {
    fn();
    console.log(`PASS ${name}`);
  } catch (error) {
    console.error(`FAIL ${name}`);
    throw error;
  }
}

runTest("toBusinessDateTimeLocalValue renders Pacific time for stored UTC dates", () => {
  const bookingStart = new Date("2026-03-13T03:08:00.000Z");

  assert.equal(toBusinessDateTimeLocalValue(bookingStart), "2026-03-12T20:08");
});

runTest("parseBusinessDateTimeLocalValue converts Pacific local form values back to UTC", () => {
  const parsed = parseBusinessDateTimeLocalValue("2026-03-12T20:08");

  assert.equal(parsed.toISOString(), "2026-03-13T03:08:00.000Z");
});

runTest("business timezone formatter uses Pacific wall-clock time", () => {
  const formatted = formatInBusinessTimeZone(new Date("2026-03-13T03:08:00.000Z"), {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });

  assert.equal(formatted, "Mar 12, 8:08 PM");
});


runTest("normalizeMoneyInput rejects blank string input", () => {
  assert.throws(() => normalizeMoneyInput("   "), /Enter a valid dollar amount\./);
});

runTest("normalizeMoneyInput still supports formatted currency strings", () => {
  assert.equal(normalizeMoneyInput(" $1,234.5 "), "1234.50");
});

runTest("normalizeMoneyInput supports generated browser Decimal values", () => {
  assert.equal(normalizeMoneyInput(new BrowserPrisma.Decimal("42.5")), "42.50");
});

runTest("normalizeMoneyInput supports generated client Decimal values", () => {
  assert.equal(normalizeMoneyInput(new ClientPrisma.Decimal("42.5")), "42.50");
});

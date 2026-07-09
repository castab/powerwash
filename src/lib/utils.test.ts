import assert from "node:assert/strict";
import { Prisma as BrowserPrisma } from "@/generated/prisma/browser";
import { Prisma as ClientPrisma } from "@/generated/prisma/client";
import {
  formatInBusinessTimeZone,
  normalizeMoneyInput,
  parseBusinessDateTimeLocalValue,
  subtractMoney,
  toBusinessDateTimeLocalValue,
  toStripeCents,
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

runTest("toStripeCents converts dollars to integer cents without float drift", () => {
  assert.equal(toStripeCents("19.99"), 1999);
  assert.equal(toStripeCents(0.1 + 0.2), 30);
  assert.equal(toStripeCents(new BrowserPrisma.Decimal("125.00")), 12500);
});

runTest("subtractMoney keeps two-decimal precision for balance math", () => {
  assert.equal(subtractMoney("100.00", "35.00").toString(), "65");
  assert.equal(subtractMoney(new BrowserPrisma.Decimal("59.99"), "20").toString(), "39.99");
  // Deposit equal to total leaves no balance due.
  assert.equal(subtractMoney("80", "80").toString(), "0");
});

runTest("parseBusinessDateTimeLocalValue resolves the spring-forward DST boundary", () => {
  // 2026-03-08 02:30 Pacific does not exist (clocks jump 02:00 -> 03:00). The
  // offset-settling loop must still land on a real UTC instant, not loop or NaN.
  const parsed = parseBusinessDateTimeLocalValue("2026-03-08T03:30");
  assert.equal(parsed.toISOString(), "2026-03-08T10:30:00.000Z");
});

runTest("parseBusinessDateTimeLocalValue resolves the fall-back DST boundary", () => {
  // 2026-11-01 01:30 Pacific is ambiguous (occurs twice); parsing must be stable.
  const parsed = parseBusinessDateTimeLocalValue("2026-11-01T01:30");
  assert.equal(parsed.toISOString(), "2026-11-01T08:30:00.000Z");
});

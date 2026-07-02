import { Prisma as BrowserPrisma } from "@/generated/prisma/browser";
import type { Prisma } from "@/generated/prisma/client";
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

const BUSINESS_TIME_ZONE = "America/Los_Angeles";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export type MoneyInput = Prisma.Decimal | number | string;

function asMoneyNumber(value: MoneyInput) {
  if (value instanceof BrowserPrisma.Decimal) {
    return value.toNumber();
  }

  if (typeof value === "string") {
    const sanitized = value.replace(/[$,\s]/g, "");

    if (sanitized.length === 0) {
      return Number.NaN;
    }

    return Number(sanitized);
  }

  return value;
}

export function normalizeMoneyInput(value: MoneyInput) {
  const amount = asMoneyNumber(value);

  if (!Number.isFinite(amount)) {
    throw new Error("Enter a valid dollar amount.");
  }

  return amount.toFixed(2);
}

export function toMoneyDecimal(value: MoneyInput) {
  return new BrowserPrisma.Decimal(normalizeMoneyInput(value));
}

export function formatMoneyInput(value: MoneyInput) {
  return normalizeMoneyInput(value);
}

export function toStripeCents(value: MoneyInput) {
  return toMoneyDecimal(value).mul(100).toDecimalPlaces(0).toNumber();
}

export function subtractMoney(a: MoneyInput, b: MoneyInput) {
  return toMoneyDecimal(a).sub(toMoneyDecimal(b)).toDecimalPlaces(2);
}

export function formatCurrency(amount: MoneyInput) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(asMoneyNumber(amount));
}

function formatBusinessDateParts(
  date: Date,
  options: Intl.DateTimeFormatOptions,
) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: BUSINESS_TIME_ZONE,
    hourCycle: "h23",
    ...options,
  }).formatToParts(date);
}

export function formatInBusinessTimeZone(
  date: Date,
  options: Intl.DateTimeFormatOptions,
) {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: BUSINESS_TIME_ZONE,
    ...options,
  }).format(date);
}

export function formatBusinessDateTimeLong(date: Date) {
  return formatInBusinessTimeZone(date, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function formatBusinessDateLong(date: Date) {
  return formatInBusinessTimeZone(date, {
    weekday: "long",
    month: "long",
    day: "numeric",
  });
}

export function formatBusinessTime(date: Date) {
  return formatInBusinessTimeZone(date, {
    hour: "numeric",
    minute: "2-digit",
  });
}

function getBusinessTimeZoneOffsetMinutes(date: Date) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: BUSINESS_TIME_ZONE,
    timeZoneName: "shortOffset",
  }).formatToParts(date);
  const value = parts.find((part) => part.type === "timeZoneName")?.value ?? "GMT";

  if (value === "GMT" || value === "UTC") {
    return 0;
  }

  const match = value.match(/^GMT([+-])(\d{1,2})(?::(\d{2}))?$/);
  if (!match) {
    throw new Error(`Unable to determine timezone offset for ${value}.`);
  }

  const [, sign, hours, minutes = "00"] = match;
  const totalMinutes = Number(hours) * 60 + Number(minutes);
  return sign === "-" ? -totalMinutes : totalMinutes;
}

export function toBusinessDateTimeLocalValue(date: Date) {
  const parts = formatBusinessDateParts(date, {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });

  const lookup = new Map(parts.map((part) => [part.type, part.value]));

  return `${lookup.get("year")}-${lookup.get("month")}-${lookup.get("day")}T${lookup.get("hour")}:${lookup.get("minute")}`;
}

export function parseBusinessDateTimeLocalValue(value: string) {
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/);

  if (!match) {
    return new Date(value);
  }

  const [, yearValue, monthValue, dayValue, hourValue, minuteValue] = match;
  const year = Number(yearValue);
  const month = Number(monthValue);
  const day = Number(dayValue);
  const hour = Number(hourValue);
  const minute = Number(minuteValue);

  let utcMs = Date.UTC(year, month - 1, day, hour, minute);

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const offsetMinutes = getBusinessTimeZoneOffsetMinutes(new Date(utcMs));
    const nextUtcMs = Date.UTC(year, month - 1, day, hour, minute) - offsetMinutes * 60_000;

    if (nextUtcMs === utcMs) {
      break;
    }

    utcMs = nextUtcMs;
  }

  return new Date(utcMs);
}

export function slugify(value: string) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

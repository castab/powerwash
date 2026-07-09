import { Prisma as BrowserPrisma } from "@/generated/prisma/browser";
import type { Prisma } from "@/generated/prisma/client";
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export {
  BUSINESS_TIME_ZONE,
  addDaysToDateValue,
  formatBusinessDateLong,
  formatBusinessDateTimeLong,
  formatBusinessTime,
  formatInBusinessTimeZone,
  getBusinessDateValue,
  getBusinessDayWindow,
  getDayOfWeekForDateValue,
  parseBusinessDateTimeLocalValue,
  toBusinessDateTimeLocalValue,
} from "./business-time";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export type MoneyInput = Prisma.Decimal | number | string;

type DecimalLike = {
  toNumber?: () => number;
  toString: () => string;
};

function asMoneyNumber(value: MoneyInput) {
  if (typeof value === "string") {
    const sanitized = value.replace(/[$,\s]/g, "");

    if (sanitized.length === 0) {
      return Number.NaN;
    }

    return Number(sanitized);
  }

  if (typeof value === "number") {
    return value;
  }

  const decimal = value as DecimalLike;

  if (typeof decimal.toNumber === "function") {
    return decimal.toNumber();
  }

  return Number(decimal.toString());
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

export function slugify(value: string) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

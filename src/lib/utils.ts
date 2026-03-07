import { Prisma } from "@prisma/client";
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export type MoneyInput = Prisma.Decimal | number | string;

function asMoneyNumber(value: MoneyInput) {
  if (value instanceof Prisma.Decimal) {
    return value.toNumber();
  }

  if (typeof value === "string") {
    const sanitized = value.replace(/[$,\s]/g, "");
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
  return new Prisma.Decimal(normalizeMoneyInput(value));
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

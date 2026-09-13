import { addDays } from "date-fns";

export const CREDIT_DAYS = 24;
export const INTEREST_RATE_BPS = 2_000;

function limaDateParts(now: Date) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Lima",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((item) => item.type === type)?.value;
  return { year: part("year"), month: part("month"), day: part("day") };
}

export function businessDateKey(now = new Date()) {
  const { year, month, day } = limaDateParts(now);
  return `${year}-${month}-${day}`;
}

export function businessToday(now = new Date()) {
  return new Date(`${businessDateKey(now)}T00:00:00.000Z`);
}

export function businessDayStartUtc(now = new Date()) {
  return new Date(`${businessDateKey(now)}T00:00:00.000-05:00`);
}

export function dateOnly(value: Date | string) {
  if (typeof value === "string") return new Date(`${value}T00:00:00.000Z`);
  return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()));
}

export function collectionDate(disbursedAt: Date, installmentIndex: number) {
  let date = dateOnly(disbursedAt);
  while (date.getUTCDay() === 0) date = addDays(date, 1);
  for (let index = 0; index < installmentIndex; index += 1) {
    do date = addDays(date, 1); while (date.getUTCDay() === 0);
  }
  return date;
}

export function collectionDayDifference(from: Date, to: Date) {
  const start = dateOnly(from);
  const end = dateOnly(to);
  if (start.getTime() === end.getTime()) return 0;
  const direction = start < end ? 1 : -1;
  let cursor = start;
  let days = 0;
  while (cursor.getTime() !== end.getTime()) {
    cursor = addDays(cursor, direction);
    if (cursor.getUTCDay() !== 0) days += direction;
  }
  return days;
}

export function creditRating(lateCollectionDays: number): "B" | "Q" {
  return lateCollectionDays >= 3 ? "Q" : "B";
}

export function creditNumbers(principalCents: bigint, count = CREDIT_DAYS) {
  if (principalCents <= BigInt(0)) throw new Error("El capital debe ser mayor que cero");
  if (count <= 0) throw new Error("El número de cuotas debe ser mayor que cero");
  const interestCents = (principalCents * BigInt(INTEREST_RATE_BPS)) / BigInt(10_000);
  const totalDueCents = principalCents + interestCents;
  const installmentCents = totalDueCents / BigInt(count);
  return { interestCents, totalDueCents, installmentCents };
}

export function installmentPlan(principalCents: bigint, disbursedAt: Date) {
  const { totalDueCents, installmentCents } = creditNumbers(principalCents);
  const remainder = totalDueCents - installmentCents * BigInt(CREDIT_DAYS);
  return Array.from({ length: CREDIT_DAYS }, (_, index) => ({
    number: index + 1,
    dueDate: collectionDate(disbursedAt, index),
    expectedCents: installmentCents + (BigInt(index) < remainder ? BigInt(1) : BigInt(0)),
  }));
}

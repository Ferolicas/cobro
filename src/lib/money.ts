export const DEFAULT_CURRENCY = "PEN";

export function toCents(value: number | string): bigint {
  const number = typeof value === "string" ? Number(value) : value;
  if (!Number.isFinite(number)) throw new Error("Importe no válido");
  return BigInt(Math.round(number * 100));
}

export function fromCents(value: bigint | number | string): number {
  return Number(value) / 100;
}

export function formatMoney(cents: bigint | number, currency = DEFAULT_CURRENCY) {
  return new Intl.NumberFormat(currency === "PEN" ? "es-PE" : "es-CO", {
    style: "currency",
    currency,
    maximumFractionDigits: currency === "COP" ? 0 : 2,
  }).format(Number(cents) / 100);
}

export async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, { ...init, headers: init?.body instanceof FormData ? init.headers : { "Content-Type": "application/json", ...init?.headers } });
  const body = await response.json().catch(() => ({})) as T & { error?: string };
  if (!response.ok) throw new Error(body.error ?? "No se pudo completar la operación");
  return body;
}

export function shortDate(value: string | Date) {
  return new Intl.DateTimeFormat("es-PE", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" }).format(new Date(value));
}

export function dateTime(value: string | Date) {
  return new Intl.DateTimeFormat("es-PE", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }).format(new Date(value));
}

function dateKeyInTimeZone(value: string | Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date(value));
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((item) => item.type === type)?.value;
  return `${part("year")}-${part("month")}-${part("day")}`;
}

export function installmentVisualStatus(installment: { status: string; dueDate: string | Date; paidAt?: string | Date | null }) {
  if (installment.status === "PAID" && installment.paidAt) {
    const dueDate = new Date(installment.dueDate).toISOString().slice(0, 10);
    if (dateKeyInTimeZone(installment.paidAt, "America/Lima") > dueDate) return "paid-late";
  }
  return installment.status.toLowerCase();
}

export function todayInput() {
  return dateKeyInTimeZone(new Date(), "America/Lima");
}

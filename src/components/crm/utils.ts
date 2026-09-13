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

export function installmentLedger(input: {
  installments: { number: number; dueDate: string | Date; paidCents?: number; status?: string; paidAt?: string | Date | null }[];
  payments: { amountCents: number; paidAt: string | Date; source: string; allocations?: { installment: { number: number } }[] }[];
  noPaymentActivities?: { createdAt: string | Date }[];
  totalDueCents: number;
  installmentCents: number;
  today?: string;
}) {
  const today = input.today ?? todayInput();
  const scheduleDates = new Set(input.installments.map((installment) => new Date(installment.dueDate).toISOString().slice(0, 10)));
  const receivedByDate = new Map<string, number>();
  const installmentsCoveredByScheduledPayments = new Set<number>();
  for (const payment of input.payments) {
    const key = payment.source === "ADVANCE_INSTALLMENT"
      ? new Date(input.installments[0]?.dueDate ?? payment.paidAt).toISOString().slice(0, 10)
      : dateKeyInTimeZone(payment.paidAt, "America/Lima");
    receivedByDate.set(key, (receivedByDate.get(key) ?? 0) + payment.amountCents);
    if (scheduleDates.has(key)) {
      for (const allocation of payment.allocations ?? []) {
        installmentsCoveredByScheduledPayments.add(allocation.installment.number);
      }
    }
  }
  const noPaymentDates = new Set((input.noPaymentActivities ?? []).map((activity) => dateKeyInTimeZone(activity.createdAt, "America/Lima")));
  const remainder = input.totalDueCents - input.installmentCents * input.installments.length;
  let carryCents = 0;
  return input.installments.map((installment, index) => {
    const date = new Date(installment.dueDate).toISOString().slice(0, 10);
    const contractualCents = input.installmentCents + (index < remainder ? 1 : 0);
    const dueCents = contractualCents + carryCents;
    const receivedOnDateCents = receivedByDate.get(date) ?? 0;
    const usePersistedPayment = receivedOnDateCents === 0
      && (installment.paidCents ?? 0) > 0
      && !installmentsCoveredByScheduledPayments.has(installment.number);
    const receivedCents = usePersistedPayment ? installment.paidCents ?? 0 : receivedOnDateCents;
    const dueReached = date <= today;
    const explicitlyMissed = noPaymentDates.has(date);
    const completed = (dueReached || usePersistedPayment) && receivedCents >= dueCents;
    const short = (dueReached || usePersistedPayment) && (receivedCents > 0 || explicitlyMissed || date < today) && !completed;
    const completedLate = completed && usePersistedPayment && installment.paidAt
      ? dateKeyInTimeZone(installment.paidAt, "America/Lima") > date
      : false;
    carryCents = short ? dueCents - receivedCents : 0;
    return {
      ...installment,
      dueCents,
      receivedCents,
      displayCents: completed || short ? receivedCents : dueCents,
      visualStatus: completed ? completedLate ? "paid-late" : "paid" : short ? "partial" : "pending",
      checked: receivedCents > 0,
    };
  });
}

export function todayInput() {
  return dateKeyInTimeZone(new Date(), "America/Lima");
}

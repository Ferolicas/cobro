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
  payments: { id?: string; amountCents: number; paidAt: string | Date; source: string; allocations?: { installment: { number: number } }[] }[];
  noPaymentActivities?: { createdAt: string | Date }[];
  totalDueCents: number;
  installmentCents: number;
  today?: string;
}) {
  const today = input.today ?? todayInput();
  const scheduleNumberByDate = new Map(input.installments.map((installment) => [
    new Date(installment.dueDate).toISOString().slice(0, 10),
    installment.number,
  ]));
  const paymentByInstallment = new Map<number, { amountCents: number; paidAt: string | Date; source: string }>();
  let lastPaymentNumber = 0;
  const payments = [...input.payments].sort((left, right) => {
    const timeDifference = new Date(left.paidAt).getTime() - new Date(right.paidAt).getTime();
    return timeDifference || (left.id ?? "").localeCompare(right.id ?? "");
  });
  for (const payment of payments) {
    const paymentDate = dateKeyInTimeZone(payment.paidAt, "America/Lima");
    const scheduledNumber = payment.source === "ADVANCE_INSTALLMENT"
      ? 1
      : scheduleNumberByDate.get(paymentDate);
    let targetNumber = Math.max(scheduledNumber ?? lastPaymentNumber + 1, lastPaymentNumber + 1);
    while (paymentByInstallment.has(targetNumber)) targetNumber += 1;
    if (targetNumber > input.installments.length) continue;
    paymentByInstallment.set(targetNumber, {
      amountCents: payment.amountCents,
      paidAt: payment.paidAt,
      source: payment.source,
    });
    lastPaymentNumber = targetNumber;
  }
  const noPaymentDates = new Set((input.noPaymentActivities ?? []).map((activity) => dateKeyInTimeZone(activity.createdAt, "America/Lima")));
  const remainder = input.totalDueCents - input.installmentCents * input.installments.length;
  let carryCents = 0;
  return input.installments.map((installment, index) => {
    const date = new Date(installment.dueDate).toISOString().slice(0, 10);
    const contractualCents = input.installmentCents + (index < remainder ? 1 : 0);
    const dueCents = contractualCents + carryCents;
    const payment = paymentByInstallment.get(installment.number);
    const receivedCents = payment?.amountCents ?? 0;
    const dueReached = date <= today;
    const explicitlyMissed = noPaymentDates.has(date);
    const paymentRecorded = receivedCents > 0;
    const completed = (dueReached || paymentRecorded) && receivedCents >= dueCents;
    const short = (dueReached || paymentRecorded) && (paymentRecorded || explicitlyMissed || date < today) && !completed;
    const completedLate = completed && payment && payment.source !== "ADVANCE_INSTALLMENT"
      ? dateKeyInTimeZone(payment.paidAt, "America/Lima") > date
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

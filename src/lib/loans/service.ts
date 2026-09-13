import "server-only";
import { randomUUID } from "node:crypto";
import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/db/prisma";
import { businessTimestamp, businessToday, collectionDate, collectionDayDifference, CREDIT_DAYS, creditNumbers, creditRating, installmentPlan, INTEREST_RATE_BPS } from "@/lib/loans/calculation";

export { CREDIT_DAYS, creditNumbers, dateOnly, installmentPlan, INTEREST_RATE_BPS } from "@/lib/loans/calculation";

export type NewCreditInput = {
  clientId: string;
  collectorId?: string | null;
  principalCents: bigint;
  microinsuranceCents?: bigint;
  advancePaymentCents?: bigint;
  disbursedAt: Date;
  notes?: string | null;
  previousCreditId?: string | null;
};

async function allocatePayment(
  tx: Prisma.TransactionClient,
  params: {
    creditId: string;
    collectorId?: string | null;
    amountCents: bigint;
    paidAt: Date;
    method: string;
    source: string;
    note?: string | null;
    cashMovement?: boolean;
    proofDocumentIds?: string[];
  },
) {
  const credit = await tx.credit.findUniqueOrThrow({ where: { id: params.creditId } });
  if (credit.status !== "ACTIVE" && credit.status !== "OVERDUE") {
    throw new Error("El crédito no admite pagos");
  }
  if (params.amountCents <= BigInt(0)) throw new Error("El pago debe ser mayor que cero");
  if (params.amountCents > credit.balanceCents) throw new Error("El pago supera el saldo pendiente");

  const digitalMethod = params.method === "YAPE" || params.method === "TRANSFER";
  const proofDocumentIds = [...new Set(params.proofDocumentIds ?? [])];
  if (digitalMethod) {
    if (!params.collectorId || !proofDocumentIds.length) {
      throw new Error("Yape y transferencia requieren al menos un justificante");
    }
    const expectedCategory = params.method === "YAPE" ? "PAYMENT_YAPE" : "PAYMENT_TRANSFER";
    const proofCount = await tx.document.count({
      where: {
        id: { in: proofDocumentIds },
        creditId: params.creditId,
        uploadedById: params.collectorId,
        category: expectedCategory,
        paymentId: null,
      },
    });
    if (proofCount !== proofDocumentIds.length) {
      throw new Error("El justificante no corresponde a este cobro o ya fue utilizado");
    }
  } else if (proofDocumentIds.length) {
    throw new Error("Los justificantes digitales solo corresponden a Yape o transferencia");
  }

  const payment = await tx.payment.create({
    data: {
      creditId: params.creditId,
      collectorId: params.collectorId,
      amountCents: params.amountCents,
      paidAt: params.paidAt,
      method: params.method,
      source: params.source,
      note: params.note,
    },
  });
  if (proofDocumentIds.length) {
    const linked = await tx.document.updateMany({
      where: { id: { in: proofDocumentIds }, paymentId: null },
      data: { paymentId: payment.id },
    });
    if (linked.count !== proofDocumentIds.length) {
      throw new Error("No se pudieron vincular todos los justificantes al pago");
    }
  }
  const pending = await tx.installment.findMany({
    where: { creditId: params.creditId, status: { not: "PAID" } },
    orderBy: { number: "asc" },
  });
  let remaining = params.amountCents;
  for (const installment of pending) {
    if (remaining <= BigInt(0)) break;
    const missing = installment.expectedCents - installment.paidCents;
    const allocated = remaining < missing ? remaining : missing;
    remaining -= allocated;
    const paidCents = installment.paidCents + allocated;
    await tx.paymentAllocation.create({
      data: { paymentId: payment.id, installmentId: installment.id, amountCents: allocated },
    });
    await tx.installment.update({
      where: { id: installment.id },
      data: {
        paidCents,
        status: paidCents >= installment.expectedCents ? "PAID" : "PARTIAL",
        paidAt: paidCents >= installment.expectedCents ? params.paidAt : null,
      },
    });
  }
  const paidCents = credit.paidCents + params.amountCents;
  const balanceCents = credit.totalDueCents - paidCents;
  await tx.credit.update({
    where: { id: credit.id },
    data: {
      paidCents,
      balanceCents,
      status: balanceCents === BigInt(0) ? "PAID" : credit.status,
      closedAt: balanceCents === BigInt(0) ? params.paidAt : null,
    },
  });
  if (params.cashMovement !== false) {
    await tx.cashMovement.create({
      data: {
        collectorId: params.collectorId,
        creditId: credit.id,
        paymentId: payment.id,
        type:
          params.method === "YAPE"
            ? "PAYMENT_YAPE"
            : params.method === "TRANSFER"
              ? "PAYMENT_TRANSFER"
              : "PAYMENT_CASH",
        direction: "IN",
        amountCents: params.amountCents,
        occurredAt: params.paidAt,
        note: params.note,
      },
    });
  }
  return payment;
}

export async function registerPayment(params: {
  creditId: string;
  collectorId?: string | null;
  amountCents: bigint;
  paidAt: Date;
  method: string;
  source?: string;
  note?: string | null;
  proofDocumentIds?: string[];
}) {
  return prisma.$transaction((tx) =>
    allocatePayment(tx, {
      ...params,
      source: params.source ?? "DAILY_COLLECTION",
      cashMovement: true,
    }),
  );
}

export async function refreshOverdueStatuses() {
  const today = businessToday();
  const active = await prisma.credit.findMany({
    where: { status: "ACTIVE", balanceCents: { gt: BigInt(0) } },
    select: { id: true, disbursedAt: true },
  });
  const overdueIds = active
    .filter((credit) => collectionDate(credit.disbursedAt, CREDIT_DAYS - 1) < today)
    .map((credit) => credit.id);
  if (!overdueIds.length) return { count: 0 };
  return prisma.credit.updateMany({
    where: { id: { in: overdueIds } },
    data: { status: "OVERDUE" },
  });
}

export async function createCredit(input: NewCreditInput) {
  return prisma.$transaction(async (tx) => {
    const occurredAt = businessTimestamp(input.disbursedAt);
    const active = await tx.credit.findFirst({
      where: { clientId: input.clientId, status: { in: ["ACTIVE", "OVERDUE"] } },
    });
    if (active && active.id !== input.previousCreditId) {
      throw new Error("El cliente ya tiene un crédito activo; usa Renovar");
    }
    const schedule = installmentPlan(input.principalCents, input.disbursedAt);
    const { interestCents, totalDueCents, installmentCents } = creditNumbers(input.principalCents);
    const minimumAdvancePaymentCents = schedule[0].expectedCents;
    const advancePaymentCents = input.advancePaymentCents ?? minimumAdvancePaymentCents;
    const microinsuranceCents = input.microinsuranceCents ?? BigInt(0);
    if (advancePaymentCents < minimumAdvancePaymentCents) {
      throw new Error("El pago inicial debe cubrir como mínimo la primera cuota");
    }
    let priorSettlementCents = BigInt(0);
    if (input.previousCreditId) {
      const previous = await tx.credit.findUniqueOrThrow({ where: { id: input.previousCreditId } });
      if (previous.clientId !== input.clientId) throw new Error("El crédito anterior pertenece a otro cliente");
      priorSettlementCents = previous.balanceCents;
    }
    const cashDeliveredCents =
      input.principalCents - advancePaymentCents - microinsuranceCents - priorSettlementCents;
    if (cashDeliveredCents < BigInt(0)) {
      throw new Error("El capital nuevo no cubre la liquidación anterior, primera cuota y microseguro");
    }
    const code = `CR-${input.disbursedAt.toISOString().slice(0, 10).replaceAll("-", "")}-${randomUUID().slice(0, 6).toUpperCase()}`;
    const credit = await tx.credit.create({
      data: {
        code,
        clientId: input.clientId,
        collectorId: input.collectorId,
        previousCreditId: input.previousCreditId,
        principalCents: input.principalCents,
        interestRateBps: INTEREST_RATE_BPS,
        interestCents,
        totalDueCents,
        installmentCount: CREDIT_DAYS,
        installmentCents,
        disbursedAt: input.disbursedAt,
        maturityDate: schedule[schedule.length - 1].dueDate,
        microinsuranceCents,
        advancePaymentCents,
        priorSettlementCents,
        cashDeliveredCents,
        paidCents: BigInt(0),
        balanceCents: totalDueCents,
        notes: input.notes,
        installments: { create: schedule },
      },
    });
    if (priorSettlementCents > BigInt(0) && input.previousCreditId) {
      await allocatePayment(tx, {
        creditId: input.previousCreditId,
        collectorId: input.collectorId,
        amountCents: priorSettlementCents,
        paidAt: occurredAt,
        method: "RENEWAL",
        source: "RENEWAL_SETTLEMENT",
        note: `Liquidado con ${code}`,
        cashMovement: false,
      });
      await tx.credit.update({
        where: { id: input.previousCreditId },
        data: { status: "RENEWED", closedAt: occurredAt },
      });
    }
    await allocatePayment(tx, {
      creditId: credit.id,
      collectorId: input.collectorId,
      amountCents: advancePaymentCents,
      paidAt: occurredAt,
      method: "WITHHELD",
      source: "ADVANCE_INSTALLMENT",
      note: "Primera cuota cobrada al desembolsar",
      cashMovement: false,
    });
    await tx.cashMovement.create({
      data: {
        collectorId: input.collectorId,
        creditId: credit.id,
        type: "DISBURSEMENT",
        direction: "OUT",
        amountCents: input.principalCents,
        occurredAt,
      },
    });
    await tx.cashMovement.create({
      data: {
        collectorId: input.collectorId,
        creditId: credit.id,
        type: "ADVANCE_INSTALLMENT",
        direction: "IN",
        amountCents: advancePaymentCents,
        occurredAt,
      },
    });
    if (microinsuranceCents > BigInt(0)) {
      await tx.cashMovement.create({
        data: {
          collectorId: input.collectorId,
          creditId: credit.id,
          type: "MICROINSURANCE",
          direction: "IN",
          amountCents: microinsuranceCents,
          occurredAt,
        },
      });
    }
    if (priorSettlementCents > BigInt(0)) {
      await tx.cashMovement.create({
        data: {
          collectorId: input.collectorId,
          creditId: credit.id,
          type: "RENEWAL_SETTLEMENT",
          direction: "IN",
          amountCents: priorSettlementCents,
          occurredAt,
        },
      });
    }
    await tx.clientActivity.create({
      data: {
        clientId: input.clientId,
        creditId: credit.id,
        actorId: input.collectorId,
        type: input.previousCreditId ? "CREDIT_RENEWED" : "CREDIT_CREATED",
        title: input.previousCreditId ? "Crédito renovado" : "Crédito desembolsado",
        metadata: { code, principalCents: input.principalCents.toString() },
      },
    });
    return tx.credit.findUniqueOrThrow({
      where: { id: credit.id },
      include: { client: true, installments: { orderBy: { number: "asc" } } },
    });
  });
}

export function creditProgress(credit: {
  balanceCents: bigint;
  totalDueCents: bigint;
  disbursedAt: Date;
  maturityDate: Date;
  installments: { number: number; dueDate: Date; expectedCents: bigint; paidCents: bigint; status?: string }[];
}) {
  const today = businessToday();
  const installments = credit.installments.map((item) => ({
    ...item,
    dueDate: collectionDate(credit.disbursedAt, item.number - 1),
  }));
  const maturityDate = collectionDate(credit.disbursedAt, CREDIT_DAYS - 1);
  const daysElapsed = Math.max(0, collectionDayDifference(installments[0]?.dueDate ?? credit.disbursedAt, today));
  const dueTodayCents = installments
    .filter((item) => item.dueDate <= today)
    .reduce((sum, item) => sum + (item.expectedCents - item.paidCents), BigInt(0));
  const paidInstallmentsCount = installments.filter(
    (item) => item.paidCents >= item.expectedCents,
  ).length;
  const lateDays = installments.filter(
    (item) => item.dueDate <= today && item.paidCents < item.expectedCents,
  ).length;
  const currentInstallmentNumber =
    installments.find((item) => item.paidCents < item.expectedCents)?.number ??
    installments.length;
  return {
    installments,
    maturityDate,
    daysRemaining: collectionDayDifference(today, maturityDate),
    daysElapsed,
    excelStatus: creditRating(lateDays),
    zeroPaymentDays: installments.filter((item) => item.dueDate <= today && item.paidCents === BigInt(0)).length,
    dueTodayCents: dueTodayCents > credit.balanceCents ? credit.balanceCents : dueTodayCents,
    paidInstallmentsCount,
    currentInstallmentNumber,
    progress: credit.totalDueCents === BigInt(0) ? 100 : Number(((credit.totalDueCents - credit.balanceCents) * BigInt(10_000)) / credit.totalDueCents) / 100,
  };
}

import { subDays } from "date-fns";
import { z } from "zod";
import { Prisma } from "@/generated/prisma/client";
import { audit } from "@/lib/audit";
import { apiError, requireUser } from "@/lib/auth/guard";
import { prisma } from "@/lib/db/prisma";
import { jsonResponse } from "@/lib/json";
import { calculateAutomaticLiquidation } from "@/lib/liquidations/calculation";
import { businessDateKey, dateOnly } from "@/lib/loans/calculation";
import { toCents } from "@/lib/money";
import { notifyMasters } from "@/lib/notify";

const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const closeSchema = z.object({
  date: dateSchema,
  openingBase: z.coerce.number().min(0).max(10_000_000),
  expenses: z.coerce.number().min(0).max(10_000_000).default(0),
  collectorWithdrawal: z.coerce.number().min(0).max(10_000_000).default(0),
  closingCash: z.coerce.number().min(0).max(10_000_000),
  notes: z.string().trim().max(2000).optional().nullable(),
});

type LiquidationDb = Pick<
  Prisma.TransactionClient,
  "liquidation" | "cashMovement" | "client" | "credit"
>;

function dayBounds(date: Date) {
  const key = date.toISOString().slice(0, 10);
  const start = new Date(`${key}T00:00:00.000-05:00`);
  return { start, end: new Date(start.getTime() + 86_400_000) };
}

async function dailySummary(
  db: LiquidationDb,
  collectorId: string,
  date: Date,
  manual?: {
    openingBaseCents: bigint;
    expensesCents: bigint;
    collectorWithdrawalCents: bigint;
  },
) {
  const { start, end } = dayBounds(date);
  const [existing, previous, movements, totalAssignedClients, newClientsCount, overdue30Count, zeroBalanceCount] =
    await Promise.all([
      db.liquidation.findUnique({ where: { collectorId_date: { collectorId, date } } }),
      db.liquidation.findFirst({ where: { collectorId, date: { lt: date } }, orderBy: { date: "desc" } }),
      db.cashMovement.findMany({
        where: { collectorId, occurredAt: { gte: start, lt: end } },
        orderBy: { occurredAt: "asc" },
      }),
      db.client.count({ where: { collectorId, active: true } }),
      db.client.count({ where: { collectorId, createdAt: { gte: start, lt: end } } }),
      db.credit.count({
        where: {
          collectorId,
          status: { in: ["ACTIVE", "OVERDUE"] },
          disbursedAt: { lt: dateOnly(subDays(date, 30)) },
        },
      }),
      db.credit.count({ where: { collectorId, closedAt: { gte: start, lt: end } } }),
    ]);

  const openingBaseCents = manual?.openingBaseCents ?? existing?.openingBaseCents ?? previous?.closingCashCents ?? BigInt(0);
  const expensesCents = manual?.expensesCents ?? existing?.expensesCents ?? BigInt(0);
  const collectorWithdrawalCents = manual?.collectorWithdrawalCents ?? existing?.collectorWithdrawalCents ?? BigInt(0);
  const automatic = calculateAutomaticLiquidation({ movements, openingBaseCents, expensesCents, collectorWithdrawalCents });

  return {
    ...automatic,
    openingBaseCents,
    expensesCents,
    collectorWithdrawalCents,
    totalAssignedClients,
    newClientsCount,
    overdue30Count,
    zeroBalanceCount,
    movementCount: movements.length,
    previousClosingCents: previous?.closingCashCents ?? null,
  };
}

export async function GET(request: Request) {
  try {
    const { user } = await requireUser(request);
    const url = new URL(request.url);
    const date = dateOnly(dateSchema.parse(url.searchParams.get("date") ?? businessDateKey()));
    const collectorId = user.role === "COLLECTOR" ? user.id : url.searchParams.get("collectorId") ?? undefined;
    if (!collectorId) return jsonResponse({ liquidations: [], summary: null });
    const collector = await prisma.user.findFirst({ where: { id: collectorId, role: "COLLECTOR" }, select: { id: true } });
    if (!collector) return Response.json({ error: "Cobrador no encontrado" }, { status: 404 });

    const [liquidations, summary] = await Promise.all([
      prisma.liquidation.findMany({
        where: { collectorId },
        include: { collector: { select: { id: true, name: true } }, documents: true },
        orderBy: { date: "desc" },
        take: 100,
      }),
      dailySummary(prisma, collectorId, date),
    ]);
    return jsonResponse({ liquidations, summary });
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(request: Request) {
  try {
    const { user } = await requireUser(request, ["COLLECTOR"]);
    const input = closeSchema.parse(await request.json());
    if (input.date > businessDateKey()) return Response.json({ error: "No puedes cerrar una fecha futura" }, { status: 400 });
    const date = dateOnly(input.date);
    const manual = {
      openingBaseCents: toCents(input.openingBase),
      expensesCents: toCents(input.expenses),
      collectorWithdrawalCents: toCents(input.collectorWithdrawal),
    };
    const closingCashCents = toCents(input.closingCash);

    const liquidation = await prisma.$transaction(async (tx) => {
      const summary = await dailySummary(tx, user.id, date, manual);
      const { start, end } = dayBounds(date);
      const data = {
        collectorId: user.id,
        date,
        openingBaseCents: summary.openingBaseCents,
        cashOutCents: summary.cashOutCents,
        collectedCashCents: summary.collectedCashCents,
        collectedYapeCents: summary.collectedDigitalCents,
        disbursedCents: summary.disbursedCents,
        expensesCents: summary.expensesCents,
        collectorWithdrawalCents: summary.collectorWithdrawalCents,
        microinsuranceCents: summary.microinsuranceCents,
        closingCashCents,
        expectedClosingCents: summary.expectedClosingCents,
        differenceCents: closingCashCents - summary.expectedClosingCents,
        newClientsCount: summary.newClientsCount,
        totalAssignedClients: summary.totalAssignedClients,
        overdue30Count: summary.overdue30Count,
        zeroBalanceCount: summary.zeroBalanceCount,
        status: "SUBMITTED",
        notes: input.notes,
      };
      const saved = await tx.liquidation.upsert({
        where: { collectorId_date: { collectorId: user.id, date } },
        create: data,
        update: data,
        include: { collector: { select: { id: true, name: true } }, documents: true },
      });
      await tx.cashMovement.updateMany({
        where: { collectorId: user.id, occurredAt: { gte: start, lt: end } },
        data: { liquidationId: saved.id },
      });
      return saved;
    });

    await audit({
      actorId: user.id,
      action: "LIQUIDATION_SUBMITTED",
      entityType: "liquidation",
      entityId: liquidation.id,
      after: liquidation,
      metadata: { automatic: true },
    });
    await notifyMasters({
      actorId: user.id,
      type: "LIQUIDATION_SUBMITTED",
      title: "Liquidación automática confirmada",
      message: `${liquidation.collector.name} cerró con una diferencia de S/ ${(Number(liquidation.differenceCents) / 100).toFixed(2)}`,
      entityType: "liquidation",
      entityId: liquidation.id,
      actionUrl: "/app/liquidaciones",
      details: {
        cobrador: liquidation.collector.name,
        fecha: input.date,
        base: input.openingBase,
        cobroEfectivoCalculado: Number(liquidation.collectedCashCents) / 100,
        cobroDigitalCalculado: Number(liquidation.collectedYapeCents) / 100,
        efectivoEntregadoCalculado: Number(liquidation.cashOutCents) / 100,
        capitalPrestadoCalculado: Number(liquidation.disbursedCents) / 100,
        microseguroCalculado: Number(liquidation.microinsuranceCents) / 100,
        gastos: input.expenses,
        retiroCobrador: input.collectorWithdrawal,
        cajaDeclarada: input.closingCash,
        cajaEsperada: Number(liquidation.expectedClosingCents) / 100,
        diferencia: Number(liquidation.differenceCents) / 100,
        clientesNuevosCalculados: liquidation.newClientsCount,
      },
    });
    return jsonResponse({ liquidation });
  } catch (error) {
    return apiError(error);
  }
}

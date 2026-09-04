import { addDays, subDays } from "date-fns";
import { z } from "zod";
import { Prisma } from "@/generated/prisma/client";
import { audit } from "@/lib/audit";
import { apiError, requireUser } from "@/lib/auth/guard";
import { prisma } from "@/lib/db/prisma";
import { jsonResponse } from "@/lib/json";
import { calculateAutomaticLiquidation } from "@/lib/liquidations/calculation";
import { calculateWeeklyBalance, type FinancialDay } from "@/lib/liquidations/weekly";
import { businessDateKey, dateOnly } from "@/lib/loans/calculation";
import { toCents } from "@/lib/money";
import { notifyMasters } from "@/lib/notify";

const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const INITIAL_COLLECTOR_BASE_CENTS = BigInt(3_000_000);
const closeSchema = z.object({
  date: dateSchema,
  expenses: z.coerce.number().min(0).max(10_000_000).default(0),
  collectorWithdrawal: z.coerce.number().min(0).max(10_000_000).default(0),
  closingCash: z.coerce.number().min(0).max(10_000_000),
  notes: z.string().trim().max(2000).optional().nullable(),
});

type LiquidationDb = Pick<Prisma.TransactionClient, "liquidation" | "cashMovement" | "client" | "credit">;

type BalanceDetailSetting = {
  collectorEmail?: string;
  initialChainCapitalCents?: string;
  dailyNotes?: { date: string; notes: string[] }[];
  undatedSnapshots?: {
    label: string;
    baseCents: string;
    collectedCents: string;
    disbursedCents: string;
    expensesCents: string;
    collectorCents: string;
    closingCashCents: string;
    differenceCents: string;
  }[];
};

type ImportSetting = {
  legacyWeeklyBalance?: { week: string; chain: string; date: string | null; profit: number }[];
};

const DAY_NAMES = ["LUNES", "MARTES", "MIÉRCOLES", "JUEVES", "VIERNES", "SÁBADO"];

function dayBounds(date: Date) {
  const key = date.toISOString().slice(0, 10);
  const start = new Date(`${key}T00:00:00.000-05:00`);
  return { start, end: new Date(start.getTime() + 86_400_000) };
}

function weekStart(date: Date) {
  return addDays(date, -((date.getUTCDay() + 6) % 7));
}

function weekEndKey(date: Date) {
  return addDays(weekStart(date), 5).toISOString().slice(0, 10);
}

async function dailySummary(
  db: LiquidationDb,
  collectorId: string,
  date: Date,
  manual?: { expensesCents: bigint; collectorWithdrawalCents: bigint },
) {
  const { start, end } = dayBounds(date);
  const [existing, previous, movements, totalAssignedClients, newClientsCount, overdue30Count, zeroBalanceCount] =
    await Promise.all([
      db.liquidation.findUnique({ where: { collectorId_date: { collectorId, date } } }),
      db.liquidation.findFirst({ where: { collectorId, date: { lt: date } }, orderBy: { date: "desc" } }),
      db.cashMovement.findMany({ where: { collectorId, occurredAt: { gte: start, lt: end } }, orderBy: { occurredAt: "asc" } }),
      db.client.count({ where: { collectorId, active: true } }),
      db.client.count({
        where: {
          collectorId,
          createdAt: { gte: start, lt: end },
          NOT: { notes: { startsWith: "Importado desde" } },
        },
      }),
      db.credit.count({
        where: {
          collectorId,
          status: { in: ["ACTIVE", "OVERDUE"] },
          disbursedAt: { lt: dateOnly(subDays(date, 30)) },
        },
      }),
      db.credit.count({ where: { collectorId, closedAt: { gte: start, lt: end } } }),
    ]);

  if (existing?.status === "LEGACY_IMPORTED") {
    const collectedBeforeMicroinsuranceCents = existing.collectedCashCents > existing.microinsuranceCents
      ? existing.collectedCashCents - existing.microinsuranceCents
      : BigInt(0);
    return {
      collectedCashCents: existing.collectedCashCents,
      collectedYapeCents: existing.collectedYapeCents,
      collectedTransferCents: BigInt(0),
      collectedDigitalCents: existing.collectedYapeCents,
      totalCollectedCents: existing.collectedCashCents + existing.collectedYapeCents,
      ledgerCollectedCashCents: collectedBeforeMicroinsuranceCents,
      totalIncomeCents: existing.collectedCashCents,
      ledgerCollectedTotalCents: existing.collectedCashCents + existing.collectedYapeCents,
      disbursedCents: existing.disbursedCents,
      advancePaymentCents: BigInt(0),
      microinsuranceCents: existing.microinsuranceCents,
      renewalSettlementCents: BigInt(0),
      cashOutCents: existing.cashOutCents,
      expectedClosingCents: existing.expectedClosingCents,
      openingBaseCents: existing.openingBaseCents,
      expensesCents: existing.expensesCents,
      collectorWithdrawalCents: existing.collectorWithdrawalCents,
      totalAssignedClients: existing.totalAssignedClients,
      newClientsCount: existing.newClientsCount,
      overdue30Count: existing.overdue30Count,
      zeroBalanceCount: existing.zeroBalanceCount,
      movementCount: movements.length,
      previousClosingCents: previous?.closingCashCents ?? null,
      closingCashCents: existing.closingCashCents,
      differenceCents: existing.differenceCents,
      status: existing.status,
      notes: existing.notes,
    };
  }

  const openingBaseCents = existing?.openingBaseCents ?? previous?.closingCashCents ?? INITIAL_COLLECTOR_BASE_CENTS;
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
    closingCashCents: existing?.closingCashCents ?? null,
    differenceCents: existing?.differenceCents ?? null,
    status: existing?.status ?? "OPEN",
    notes: existing?.notes ?? null,
  };
}

async function buildFinancialOverview(collectorId: string, collectorEmail: string, selectedDate: Date) {
  const [detailSettingRow, importSettingRow] = await Promise.all([
    prisma.systemSetting.findUnique({ where: { key: "excel_balance_detail_2026_09_02" } }),
    prisma.systemSetting.findUnique({ where: { key: "excel_import_2026_09_02" } }),
  ]);
  const detailSetting = detailSettingRow?.value as BalanceDetailSetting | undefined;
  const importSetting = importSettingRow?.value as ImportSetting | undefined;
  const isExcelCollector = detailSetting?.collectorEmail === collectorEmail;
  const notesByDate = new Map((isExcelCollector ? detailSetting?.dailyNotes ?? [] : []).map((item) => [item.date, item.notes]));
  const start = weekStart(selectedDate);
  const summaries = await Promise.all(Array.from({ length: 6 }, (_, index) => dailySummary(prisma, collectorId, addDays(start, index))));
  const todayKey = businessDateKey();
  const days: FinancialDay[] = summaries.map((summary, index) => {
    const date = addDays(start, index).toISOString().slice(0, 10);
    return {
      date,
      dayName: DAY_NAMES[index],
      isFuture: date > todayKey,
      source: summary.status === "LEGACY_IMPORTED" ? "EXCEL" : summary.status === "OPEN" ? "AUTOMATIC" : "SUBMITTED",
      openingBaseCents: summary.openingBaseCents,
      ledgerCollectedCashCents: summary.ledgerCollectedCashCents,
      totalIncomeCents: summary.totalIncomeCents,
      collectedDigitalCents: summary.collectedDigitalCents,
      disbursedCents: summary.disbursedCents,
      microinsuranceCents: summary.microinsuranceCents,
      advancePaymentCents: summary.advancePaymentCents,
      renewalSettlementCents: summary.renewalSettlementCents,
      expensesCents: summary.expensesCents,
      collectorWithdrawalCents: summary.collectorWithdrawalCents,
      expectedClosingCents: summary.expectedClosingCents,
      closingCashCents: summary.closingCashCents,
      differenceCents: summary.differenceCents,
      newClientsCount: summary.newClientsCount,
      totalAssignedClients: summary.totalAssignedClients,
      overdue30Count: summary.overdue30Count,
      zeroBalanceCount: summary.zeroBalanceCount,
      movementCount: summary.movementCount,
      notes: summary.notes,
      detailNotes: notesByDate.get(date) ?? [],
    };
  });
  const weekly = calculateWeeklyBalance(days);

  const legacyRows = isExcelCollector ? importSetting?.legacyWeeklyBalance ?? [] : [];
  const selectedWeekEnd = addDays(start, 5);
  let chainDates: Date[];
  if (legacyRows.length && legacyRows.some((row) => row.date)) {
    const firstDate = legacyRows.find((row) => row.date)?.date?.slice(0, 10) ?? weekEndKey(selectedDate);
    chainDates = Array.from({ length: 11 }, (_, index) => addDays(dateOnly(firstDate), index * 7));
  } else {
    chainDates = Array.from({ length: 11 }, (_, index) => addDays(selectedWeekEnd, (index - 10) * 7));
  }
  const chainStart = dayBounds(addDays(chainDates[0], -5)).start;
  const chainEnd = dayBounds(addDays(chainDates[10], 1)).start;
  const [chainMovements, chainLiquidations] = await Promise.all([
    prisma.cashMovement.findMany({
      where: { collectorId, type: "DISBURSEMENT", occurredAt: { gte: chainStart, lt: chainEnd } },
      select: { amountCents: true, occurredAt: true },
    }),
    prisma.liquidation.findMany({
      where: { collectorId, date: { gte: addDays(chainDates[0], -5), lte: chainDates[10] } },
      select: { date: true, expensesCents: true },
    }),
  ]);
  const dynamicByWeek = new Map<string, { disbursed: bigint; expenses: bigint }>();
  for (const movement of chainMovements) {
    const key = weekEndKey(dateOnly(businessDateKey(movement.occurredAt)));
    const current = dynamicByWeek.get(key) ?? { disbursed: BigInt(0), expenses: BigInt(0) };
    current.disbursed += movement.amountCents;
    dynamicByWeek.set(key, current);
  }
  for (const liquidation of chainLiquidations) {
    const key = weekEndKey(liquidation.date);
    const current = dynamicByWeek.get(key) ?? { disbursed: BigInt(0), expenses: BigInt(0) };
    current.expenses += liquidation.expensesCents;
    dynamicByWeek.set(key, current);
  }
  const chain = chainDates.map((date, index) => {
    const dateKey = date.toISOString().slice(0, 10);
    const legacy = legacyRows[index];
    const dynamic = dynamicByWeek.get(dateKey);
    const dynamicProfit = dynamic ? (dynamic.disbursed * BigInt(20)) / BigInt(100) - dynamic.expenses : BigInt(0);
    const hasLegacyValue = Boolean(legacy?.date);
    const hasDynamicValue = Boolean(dynamic) && dateKey <= todayKey && date <= selectedWeekEnd;
    return {
      week: index + 1,
      chain: legacy?.chain || "CADENA",
      date: hasLegacyValue || hasDynamicValue ? dateKey : null,
      profitCents: hasLegacyValue ? BigInt(Math.round(legacy.profit * 100)) : hasDynamicValue ? dynamicProfit : null,
      source: hasLegacyValue ? "EXCEL" : hasDynamicValue ? "SYSTEM" : "EMPTY",
    };
  });

  return {
    days,
    weekly,
    chain: {
      initialCapitalCents: BigInt(isExcelCollector ? detailSetting?.initialChainCapitalCents ?? "0" : "0"),
      rows: chain,
      totalProfitCents: chain.reduce((total, row) => total + (row.profitCents ?? BigInt(0)), BigInt(0)),
    },
    undatedSnapshots: isExcelCollector ? detailSetting?.undatedSnapshots ?? [] : [],
  };
}

export async function GET(request: Request) {
  try {
    const { user } = await requireUser(request);
    const url = new URL(request.url);
    const date = dateOnly(dateSchema.parse(url.searchParams.get("date") ?? businessDateKey()));
    const collectorId = user.role === "COLLECTOR" ? user.id : url.searchParams.get("collectorId") ?? undefined;
    if (!collectorId) return jsonResponse({ liquidations: [], summary: null, overview: null });
    const collector = await prisma.user.findFirst({ where: { id: collectorId, role: "COLLECTOR" }, select: { id: true, name: true, email: true } });
    if (!collector) return Response.json({ error: "Cobrador no encontrado" }, { status: 404 });

    const [liquidations, summary, overview] = await Promise.all([
      prisma.liquidation.findMany({
        where: { collectorId },
        include: { collector: { select: { id: true, name: true } }, documents: true },
        orderBy: { date: "desc" },
        take: 100,
      }),
      dailySummary(prisma, collectorId, date),
      buildFinancialOverview(collectorId, collector.email, date),
    ]);
    return jsonResponse({ collector, liquidations, summary, overview });
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
    const legacy = await prisma.liquidation.findUnique({ where: { collectorId_date: { collectorId: user.id, date } }, select: { status: true } });
    if (legacy?.status === "LEGACY_IMPORTED") return Response.json({ error: "Este cierre pertenece al Excel histórico y es de solo lectura" }, { status: 409 });
    const manual = {
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
        // Se persiste el total físico ingresado para conservar compatibilidad
        // con los cierres históricos; la API separa COBRADO y M.S al leerlo.
        collectedCashCents: summary.totalIncomeCents,
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

    await audit({ actorId: user.id, action: "LIQUIDATION_SUBMITTED", entityType: "liquidation", entityId: liquidation.id, after: liquidation, metadata: { automatic: true } });
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
        base: Number(liquidation.openingBaseCents) / 100,
        entregaCobrador: input.collectorWithdrawal,
        cobradoSinMicroseguro: Number(liquidation.collectedCashCents - liquidation.microinsuranceCents) / 100,
        totalIngresado: Number(liquidation.collectedCashCents) / 100,
        cobroDigitalCalculado: Number(liquidation.collectedYapeCents) / 100,
        capitalPrestadoCalculado: Number(liquidation.disbursedCents) / 100,
        microseguroCalculado: Number(liquidation.microinsuranceCents) / 100,
        gastos: input.expenses,
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

import { startOfDay, endOfDay } from "date-fns";
import { z } from "zod";
import { audit } from "@/lib/audit";
import { apiError, requireUser } from "@/lib/auth/guard";
import { prisma } from "@/lib/db/prisma";
import { jsonResponse } from "@/lib/json";
import { dateOnly } from "@/lib/loans/service";
import { toCents } from "@/lib/money";
import { notifyMasters } from "@/lib/notify";

const schema = z.object({
  collectorId: z.string().optional(), date: z.string().min(10), openingBase: z.coerce.number().min(0), cashOut: z.coerce.number().min(0).default(0),
  collectedCash: z.coerce.number().min(0), collectedYape: z.coerce.number().min(0).default(0), disbursed: z.coerce.number().min(0), expenses: z.coerce.number().min(0).default(0),
  collectorWithdrawal: z.coerce.number().min(0).default(0), microinsurance: z.coerce.number().min(0).default(0), closingCash: z.coerce.number().min(0),
  newClientsCount: z.coerce.number().int().min(0).default(0), totalAssignedClients: z.coerce.number().int().min(0).default(0), overdue30Count: z.coerce.number().int().min(0).default(0), zeroBalanceCount: z.coerce.number().int().min(0).default(0), notes: z.string().max(2000).optional().nullable(),
});

export async function GET(request: Request) {
  try {
    const { user } = await requireUser(request);
    const url = new URL(request.url);
    const requestedDate = dateOnly(url.searchParams.get("date") ?? new Date());
    const collectorId = user.role === "COLLECTOR" ? user.id : url.searchParams.get("collectorId") ?? undefined;
    const [liquidations, movements, clients, overdue30, zeroBalance] = await Promise.all([
      prisma.liquidation.findMany({ where: { ...(collectorId ? { collectorId } : {}), ...(user.role === "MASTER" && !url.searchParams.has("date") ? {} : { date: requestedDate }) }, include: { collector: { select: { id: true, name: true } }, documents: true }, orderBy: { date: "desc" }, take: 100 }),
      collectorId ? prisma.cashMovement.findMany({ where: { collectorId, occurredAt: { gte: startOfDay(requestedDate), lte: endOfDay(requestedDate) } } }) : Promise.resolve([]),
      collectorId ? prisma.client.count({ where: { collectorId, active: true } }) : Promise.resolve(0),
      collectorId ? prisma.credit.count({ where: { collectorId, status: { in: ["ACTIVE", "OVERDUE"] }, disbursedAt: { lt: dateOnly(new Date(Date.now() - 30 * 86_400_000)) } } }) : Promise.resolve(0),
      collectorId ? prisma.credit.count({ where: { collectorId, balanceCents: BigInt(0), closedAt: { gte: startOfDay(requestedDate), lte: endOfDay(requestedDate) } } }) : Promise.resolve(0),
    ]);
    const sum = (type: string, direction?: string) => movements.filter((item) => item.type === type && (!direction || item.direction === direction)).reduce((total, item) => total + item.amountCents, BigInt(0));
    return jsonResponse({ liquidations, suggested: { collectedCashCents: sum("PAYMENT_CASH"), collectedYapeCents: sum("PAYMENT_YAPE"), disbursedCents: sum("DISBURSEMENT"), microinsuranceCents: sum("MICROINSURANCE"), totalAssignedClients: clients, overdue30Count: overdue30, zeroBalanceCount: zeroBalance } });
  } catch (error) { return apiError(error); }
}

export async function POST(request: Request) {
  try {
    const { user } = await requireUser(request);
    const input = schema.parse(await request.json());
    const collectorId = user.role === "COLLECTOR" ? user.id : input.collectorId;
    if (!collectorId) return Response.json({ error: "Selecciona un cobrador" }, { status: 400 });
    const openingBaseCents = toCents(input.openingBase), collectedCashCents = toCents(input.collectedCash), collectedYapeCents = toCents(input.collectedYape), disbursedCents = toCents(input.disbursed), expensesCents = toCents(input.expenses), collectorWithdrawalCents = toCents(input.collectorWithdrawal), microinsuranceCents = toCents(input.microinsurance), closingCashCents = toCents(input.closingCash);
    const expectedClosingCents = openingBaseCents + collectedCashCents + microinsuranceCents - disbursedCents - expensesCents - collectorWithdrawalCents;
    const data = { collectorId, date: dateOnly(input.date), openingBaseCents, cashOutCents: toCents(input.cashOut), collectedCashCents, collectedYapeCents, disbursedCents, expensesCents, collectorWithdrawalCents, microinsuranceCents, closingCashCents, expectedClosingCents, differenceCents: closingCashCents - expectedClosingCents, newClientsCount: input.newClientsCount, totalAssignedClients: input.totalAssignedClients, overdue30Count: input.overdue30Count, zeroBalanceCount: input.zeroBalanceCount, notes: input.notes };
    const liquidation = await prisma.liquidation.upsert({ where: { collectorId_date: { collectorId, date: data.date } }, create: data, update: data, include: { collector: { select: { name: true } } } });
    await audit({ actorId: user.id, action: "LIQUIDATION_SUBMITTED", entityType: "liquidation", entityId: liquidation.id, after: liquidation });
    await notifyMasters({ actorId: user.id, type: "LIQUIDATION_SUBMITTED", title: "Liquidación diaria recibida", message: `${liquidation.collector.name} cerró con una diferencia de S/ ${(Number(liquidation.differenceCents) / 100).toFixed(2)}`, entityType: "liquidation", entityId: liquidation.id, actionUrl: "/app/liquidaciones", details: { cobrador: liquidation.collector.name, fecha: input.date, base: input.openingBase, cobroEfectivo: input.collectedCash, yape: input.collectedYape, prestó: input.disbursed, gastos: input.expenses, retiroCobrador: input.collectorWithdrawal, microseguro: input.microinsurance, cajaDeclarada: input.closingCash, cajaEsperada: Number(expectedClosingCents) / 100, diferencia: Number(liquidation.differenceCents) / 100, clientesNuevos: input.newClientsCount } });
    return jsonResponse({ liquidation });
  } catch (error) { return apiError(error); }
}

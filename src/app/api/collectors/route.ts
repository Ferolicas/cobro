import { randomUUID } from "node:crypto";
import { hashPassword } from "better-auth/crypto";
import { z } from "zod";
import { audit } from "@/lib/audit";
import { apiError, requireUser } from "@/lib/auth/guard";
import { prisma } from "@/lib/db/prisma";
import { jsonResponse } from "@/lib/json";
import { notifyMasters } from "@/lib/notify";
import { COLLECTOR_BASE_CENTS } from "@/lib/liquidations/constants";
import { addDays } from "date-fns";
import { businessDateKey, businessDayStartUtc } from "@/lib/loans/calculation";

const schema = z.object({
  name: z.string().trim().min(3).max(120),
  email: z.string().email().transform((value) => value.toLowerCase()),
  phone: z.string().trim().max(30).optional().nullable(),
  zoneId: z.string().min(1),
});

export async function GET(request: Request) {
  try {
    await requireUser(request, ["MASTER"]);
    const todayStart = businessDayStartUtc();
    const todayKey = businessDateKey();
    const collectors = await prisma.user.findMany({
      where: { role: "COLLECTOR" },
      select: { id: true, name: true, email: true, phone: true, active: true, mustChangePassword: true, createdAt: true, zone: true, liquidations: { orderBy: { date: "desc" }, take: 1, select: { date: true, closingCashCents: true, differenceCents: true, expensesCents: true } }, cashMovements: { where: { occurredAt: { gte: todayStart, lt: addDays(todayStart, 1) } }, select: { type: true, amountCents: true } }, _count: { select: { assignedClients: true, managedCredits: true } } },
      orderBy: [{ active: "desc" }, { name: "asc" }],
    });
    const zones = await prisma.zone.findMany({ where: { active: true }, orderBy: { name: "asc" } });
    return jsonResponse({ collectors: collectors.map((collector) => {
      const latest = collector.liquidations[0];
      const physicalIncomeCents = collector.cashMovements
        .filter((movement) => ["PAYMENT_CASH", "ADVANCE_INSTALLMENT", "MICROINSURANCE", "RENEWAL_SETTLEMENT"].includes(movement.type))
        .reduce((total, movement) => total + movement.amountCents, BigInt(0));
      const disbursedCents = collector.cashMovements
        .filter((movement) => movement.type === "DISBURSEMENT")
        .reduce((total, movement) => total + movement.amountCents, BigInt(0));
      const todayExpensesCents = latest?.date.toISOString().slice(0, 10) === todayKey ? latest.expensesCents : BigInt(0);
      const currentCashCents = COLLECTOR_BASE_CENTS + physicalIncomeCents - disbursedCents - todayExpensesCents;
      return {
        ...collector,
        liquidations: undefined,
        cashMovements: undefined,
        finance: {
          baseCents: COLLECTOR_BASE_CENTS,
          currentCashCents,
          baseDifferenceCents: currentCashCents - COLLECTOR_BASE_CENTS,
          supportNeededCents: currentCashCents < BigInt(0) ? -currentCashCents : BigInt(0),
          lastClosedAt: latest?.date ?? null,
        },
      };
    }), zones });
  } catch (error) { return apiError(error); }
}

export async function POST(request: Request) {
  try {
    const { user } = await requireUser(request, ["MASTER"]);
    const input = schema.parse(await request.json());
    const zone = await prisma.zone.findFirst({ where: { id: input.zoneId, active: true } });
    if (!zone) return Response.json({ error: "Selecciona una zona de trabajo válida" }, { status: 400 });
    const password = await hashPassword("cobro1234*");
    const id = randomUUID();
    const collector = await prisma.user.create({
      data: {
        id, name: input.name, email: input.email, phone: input.phone, zoneId: input.zoneId,
        role: "COLLECTOR", mustChangePassword: true, active: true,
        accounts: { create: { id: randomUUID(), issuer: "local:credential", accountId: id, providerId: "credential", password } },
      },
    });
    await audit({ actorId: user.id, action: "COLLECTOR_CREATED", entityType: "user", entityId: id, after: collector });
    await notifyMasters({ actorId: user.id, type: "COLLECTOR_CREATED", title: "Cobrador creado", message: `${collector.name} ya puede acceder con su correo`, entityType: "user", entityId: id, actionUrl: "/app/cobradores", details: { nombre: collector.name, correo: collector.email, zona: zone.name, baseInicial: 30_000, contraseñaTemporal: "cobro1234*", cambioObligatorio: true } });
    return jsonResponse({ collector }, { status: 201 });
  } catch (error) { return apiError(error); }
}

import { randomUUID } from "node:crypto";
import { hashPassword } from "better-auth/crypto";
import { z } from "zod";
import { apiError, requireUser } from "@/lib/auth/guard";
import { prisma } from "@/lib/db/prisma";
import { jsonResponse, jsonValue } from "@/lib/json";
import { notifyMasters } from "@/lib/notify";
import { COLLECTOR_BASE_CENTS } from "@/lib/liquidations/constants";
import { financialEventsForDate } from "@/lib/liquidations/calculation";
import { addDays } from "date-fns";
import { businessDateKey, businessDayStartUtc, businessToday } from "@/lib/loans/calculation";

const schema = z.object({
  name: z.string().trim().min(3).max(120),
  email: z.string().email().transform((value) => value.toLowerCase()),
  phone: z.string().trim().max(30).optional().nullable(),
  role: z.enum(["COLLECTOR", "MASTER"]).default("COLLECTOR"),
  zoneId: z.preprocess(
    (value) => value === "" ? undefined : value,
    z.string().min(1).optional(),
  ),
  transferFromCollectorId: z.preprocess(
    (value) => value === "" ? undefined : value,
    z.string().min(1).optional(),
  ),
});

export async function GET(request: Request) {
  try {
    await requireUser(request, ["MASTER"]);
    const today = businessToday();
    const todayStart = businessDayStartUtc();
    const todayKey = businessDateKey();
    const [collectors, administrators, zones] = await Promise.all([
      prisma.user.findMany({
        where: { role: "COLLECTOR" },
        select: { id: true, name: true, email: true, phone: true, active: true, mustChangePassword: true, createdAt: true, zone: true, liquidations: { orderBy: { date: "desc" }, take: 1, select: { date: true, closingCashCents: true, differenceCents: true, expensesCents: true } }, cashMovements: { where: { occurredAt: { gte: today, lt: addDays(todayStart, 1) } }, select: { type: true, amountCents: true, occurredAt: true } }, _count: { select: { assignedClients: true, managedCredits: true } } },
        orderBy: [{ active: "desc" }, { name: "asc" }],
      }),
      prisma.user.findMany({
        where: { role: "MASTER" },
        select: { id: true, name: true, email: true, phone: true, active: true, mustChangePassword: true, createdAt: true },
        orderBy: [{ active: "desc" }, { name: "asc" }],
      }),
      prisma.zone.findMany({ where: { active: true }, orderBy: { name: "asc" } }),
    ]);
    return jsonResponse({ collectors: collectors.map((collector) => {
      const latest = collector.liquidations[0];
      const todayMovements = financialEventsForDate(collector.cashMovements, today);
      const physicalIncomeCents = todayMovements
        .filter((movement) => ["PAYMENT_CASH", "ADVANCE_INSTALLMENT", "MICROINSURANCE", "RENEWAL_SETTLEMENT"].includes(movement.type))
        .reduce((total, movement) => total + movement.amountCents, BigInt(0));
      const disbursedCents = todayMovements
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
    }), administrators, zones });
  } catch (error) { return apiError(error); }
}

export async function POST(request: Request) {
  try {
    const { user } = await requireUser(request, ["MASTER"]);
    const input = schema.parse(await request.json());
    if (input.role === "COLLECTOR" && !input.zoneId) {
      return Response.json({ error: "Selecciona una zona de trabajo válida" }, { status: 400 });
    }
    if (input.role === "MASTER" && input.transferFromCollectorId) {
      return Response.json({ error: "Una transferencia de cartera solo corresponde a un cobrador" }, { status: 400 });
    }
    const zone = input.role === "COLLECTOR"
      ? await prisma.zone.findFirst({ where: { id: input.zoneId, active: true } })
      : null;
    if (input.role === "COLLECTOR" && !zone) return Response.json({ error: "Selecciona una zona de trabajo válida" }, { status: 400 });
    const previousCollector = input.role === "COLLECTOR" && input.transferFromCollectorId
      ? await prisma.user.findFirst({ where: { id: input.transferFromCollectorId, role: "COLLECTOR" } })
      : null;
    if (input.transferFromCollectorId && !previousCollector) {
      return Response.json({ error: "El cobrador anterior ya no existe" }, { status: 400 });
    }
    const password = await hashPassword("cobro1234*");
    const id = randomUUID();
    const result = await prisma.$transaction(async (tx) => {
      const createdUser = await tx.user.create({
        data: {
          id, name: input.name, email: input.email, phone: input.phone, zoneId: input.role === "COLLECTOR" ? input.zoneId : null,
          role: input.role, mustChangePassword: true, active: true,
          accounts: { create: { id: randomUUID(), issuer: "local:credential", accountId: id, providerId: "credential", password } },
        },
      });
      let transfer: { previousCollector: { id: string; name: string }; clients: number; credits: number } | null = null;
      if (previousCollector) {
        const clients = await tx.client.updateMany({
          where: { collectorId: previousCollector.id, active: true },
          data: { collectorId: createdUser.id },
        });
        const credits = await tx.credit.updateMany({
          where: { collectorId: previousCollector.id, status: { in: ["ACTIVE", "OVERDUE"] } },
          data: { collectorId: createdUser.id },
        });
        await tx.user.update({ where: { id: previousCollector.id }, data: { active: false } });
        await tx.session.deleteMany({ where: { userId: previousCollector.id } });
        transfer = {
          previousCollector: { id: previousCollector.id, name: previousCollector.name },
          clients: clients.count,
          credits: credits.count,
        };
      }
      await tx.auditLog.create({
        data: {
          actorId: user.id,
          action: transfer ? "COLLECTOR_PORTFOLIO_TRANSFERRED" : input.role === "MASTER" ? "ADMIN_CREATED" : "COLLECTOR_CREATED",
          entityType: "user",
          entityId: createdUser.id,
          afterData: jsonValue(createdUser),
          metadata: transfer ? jsonValue({
            previousCollectorId: transfer.previousCollector.id,
            previousCollectorName: transfer.previousCollector.name,
            newCollectorId: createdUser.id,
            newCollectorName: createdUser.name,
            transferredClients: transfer.clients,
            transferredCredits: transfer.credits,
            historicalRecordsPreserved: true,
          }) : undefined,
        },
      });
      return { createdUser, transfer };
    });
    const { createdUser, transfer } = result;
    const createdAdministrator = input.role === "MASTER";
    await notifyMasters({
      actorId: user.id,
      type: transfer ? "COLLECTOR_PORTFOLIO_TRANSFERRED" : createdAdministrator ? "ADMIN_CREATED" : "COLLECTOR_CREATED",
      title: transfer ? "Cartera transferida" : createdAdministrator ? "Administrador creado" : "Cobrador creado",
      message: transfer
        ? `${createdUser.name} recibió la cartera activa de ${transfer.previousCollector.name}`
        : `${createdUser.name} ya puede acceder como ${createdAdministrator ? "administrador" : "cobrador"}`,
      entityType: "user",
      entityId: id,
      actionUrl: "/app/cobradores",
      details: {
        nombre: createdUser.name,
        correo: createdUser.email,
        rol: createdAdministrator ? "Administrador" : "Cobrador",
        zona: zone?.name,
        baseInicial: createdAdministrator ? undefined : 30_000,
        contraseñaTemporal: "cobro1234*",
        cambioObligatorio: true,
        cobradorAnterior: transfer?.previousCollector.name,
        clientesTransferidos: transfer?.clients,
        créditosTransferidos: transfer?.credits,
        historialAnteriorConservado: Boolean(transfer),
      },
      audienceUserIds: transfer ? [createdUser.id, transfer.previousCollector.id] : [createdUser.id],
    });
    return jsonResponse({ user: createdUser, collector: createdUser, transfer }, { status: 201 });
  } catch (error) { return apiError(error); }
}

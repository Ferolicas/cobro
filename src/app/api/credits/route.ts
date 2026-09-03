import { z } from "zod";
import { audit } from "@/lib/audit";
import { apiError, requireUser } from "@/lib/auth/guard";
import { prisma } from "@/lib/db/prisma";
import { jsonResponse } from "@/lib/json";
import { createCredit, creditProgress, dateOnly, refreshOverdueStatuses } from "@/lib/loans/service";
import { toCents } from "@/lib/money";
import { notifyMasters } from "@/lib/notify";

const createSchema = z.object({
  clientId: z.string().min(1),
  collectorId: z.string().optional().nullable(),
  principal: z.coerce.number().positive().max(1_000_000),
  microinsurance: z.coerce.number().min(0).max(1_000_000).default(0),
  disbursedAt: z.string().min(10),
  notes: z.string().max(2000).optional().nullable(),
});

export async function GET(request: Request) {
  try {
    const { user } = await requireUser(request);
    await refreshOverdueStatuses();
    const url = new URL(request.url);
    const status = url.searchParams.get("status");
    const q = url.searchParams.get("q")?.trim();
    const credits = await prisma.credit.findMany({
      where: {
        ...(user.role === "COLLECTOR" ? { collectorId: user.id } : {}),
        ...(status && status !== "ALL" ? { status } : {}),
        ...(q ? { OR: [{ code: { contains: q, mode: "insensitive" } }, { client: { name: { contains: q, mode: "insensitive" } } }] } : {}),
      },
      include: {
        client: { select: { id: true, name: true, phone: true, businessName: true } },
        collector: { select: { id: true, name: true } },
        installments: { orderBy: { number: "asc" } },
      },
      orderBy: [{ status: "asc" }, { maturityDate: "asc" }],
      take: 300,
    });
    return jsonResponse({ credits: credits.map((credit) => ({ ...credit, ...creditProgress(credit) })) });
  } catch (error) { return apiError(error); }
}

export async function POST(request: Request) {
  try {
    const { user } = await requireUser(request, ["COLLECTOR"]);
    const input = createSchema.parse(await request.json());
    const client = await prisma.client.findUniqueOrThrow({ where: { id: input.clientId } });
    if (client.collectorId !== user.id) return Response.json({ error: "Cliente no asignado" }, { status: 403 });
    const collectorId = user.id;
    const credit = await createCredit({
      clientId: input.clientId,
      collectorId,
      principalCents: toCents(input.principal),
      microinsuranceCents: toCents(input.microinsurance),
      disbursedAt: dateOnly(input.disbursedAt),
      notes: input.notes,
    });
    await audit({ actorId: user.id, action: "CREDIT_CREATED", entityType: "credit", entityId: credit.id, after: credit });
    await notifyMasters({
      actorId: user.id, type: "CREDIT_CREATED", title: "Nuevo crédito desembolsado",
      message: `${user.name} desembolsó S/ ${input.principal.toFixed(2)} a ${credit.client.name}`,
      entityType: "credit", entityId: credit.id, actionUrl: `/app/creditos/${credit.id}`,
      details: { cliente: credit.client.name, capital: input.principal, interés: "20%", plazo: "24 días", microseguro: input.microinsurance, primeraCuota: Number(credit.advancePaymentCents) / 100, efectivoEntregado: Number(credit.cashDeliveredCents) / 100 },
    });
    return jsonResponse({ credit }, { status: 201 });
  } catch (error) { return apiError(error); }
}

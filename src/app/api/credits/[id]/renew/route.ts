import { z } from "zod";
import { audit } from "@/lib/audit";
import { apiError, requireUser } from "@/lib/auth/guard";
import { prisma } from "@/lib/db/prisma";
import { jsonResponse } from "@/lib/json";
import { createCredit, dateOnly } from "@/lib/loans/service";
import { toCents } from "@/lib/money";
import { notifyMasters } from "@/lib/notify";

const schema = z.object({
  principal: z.coerce.number().positive().max(1_000_000),
  microinsurance: z.coerce.number().min(0).default(0),
  disbursedAt: z.string().min(10),
  notes: z.string().max(2000).optional().nullable(),
});

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { user } = await requireUser(request);
    const { id } = await params;
    const input = schema.parse(await request.json());
    const previous = await prisma.credit.findUniqueOrThrow({ where: { id }, include: { client: true } });
    if (user.role === "COLLECTOR" && previous.collectorId !== user.id) return Response.json({ error: "Crédito no asignado" }, { status: 403 });
    const credit = await createCredit({
      clientId: previous.clientId, collectorId: previous.collectorId ?? user.id,
      principalCents: toCents(input.principal), microinsuranceCents: toCents(input.microinsurance),
      disbursedAt: dateOnly(input.disbursedAt), notes: input.notes, previousCreditId: previous.id,
    });
    await audit({ actorId: user.id, action: "CREDIT_RENEWED", entityType: "credit", entityId: credit.id, before: previous, after: credit });
    await notifyMasters({
      actorId: user.id, type: "CREDIT_RENEWED", title: "Crédito renovado",
      message: `${user.name} renovó el crédito de ${previous.client.name} por S/ ${input.principal.toFixed(2)}`,
      entityType: "credit", entityId: credit.id, actionUrl: `/app/creditos/${credit.id}`,
      details: { cliente: previous.client.name, créditoAnterior: previous.code, saldoLiquidado: Number(previous.balanceCents) / 100, créditoNuevo: credit.code, capitalNuevo: input.principal, microseguro: input.microinsurance, efectivoEntregado: Number(credit.cashDeliveredCents) / 100 },
    });
    return jsonResponse({ credit }, { status: 201 });
  } catch (error) { return apiError(error); }
}

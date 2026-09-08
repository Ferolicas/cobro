import { addDays } from "date-fns";
import { z } from "zod";
import { audit } from "@/lib/audit";
import { apiError, requireUser } from "@/lib/auth/guard";
import { prisma } from "@/lib/db/prisma";
import { jsonResponse } from "@/lib/json";
import { businessDayStartUtc } from "@/lib/loans/calculation";
import { notifyMasters } from "@/lib/notify";

const schema = z.object({ note: z.string().trim().max(500).optional().nullable() });

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { user } = await requireUser(request, ["COLLECTOR"]);
    const { id } = await params;
    const input = schema.parse(await request.json());
    const credit = await prisma.credit.findUniqueOrThrow({
      where: { id },
      include: { client: true, installments: { orderBy: { number: "asc" } } },
    });
    if (credit.collectorId !== user.id) {
      return Response.json({ error: "Crédito no asignado" }, { status: 403 });
    }
    if (!credit.status.match(/^(ACTIVE|OVERDUE)$/)) {
      return Response.json({ error: "El crédito ya no admite gestiones de cobro" }, { status: 409 });
    }

    const start = businessDayStartUtc();
    const end = addDays(start, 1);
    const result = await prisma.$transaction(async (tx) => {
      const existing = await tx.clientActivity.findFirst({
        where: {
          creditId: id,
          actorId: user.id,
          type: "NO_PAYMENT",
          createdAt: { gte: start, lt: end },
        },
      });
      if (existing) return { activity: existing, created: false };
      const currentInstallment = credit.installments.find(
        (installment) => installment.paidCents < installment.expectedCents,
      );
      const activity = await tx.clientActivity.create({
        data: {
          clientId: credit.clientId,
          creditId: id,
          actorId: user.id,
          type: "NO_PAYMENT",
          title: "Visita registrada: no pagó",
          description: input.note || "El cliente no realizó pago en la visita.",
          metadata: {
            saldoCents: credit.balanceCents.toString(),
            cuotaActual: currentInstallment?.number ?? credit.installmentCount,
          },
        },
      });
      return { activity, created: true };
    });

    if (!result.created) return jsonResponse(result);
    await audit({
      actorId: user.id,
      action: "NO_PAYMENT_RECORDED",
      entityType: "credit",
      entityId: id,
      after: result.activity,
      metadata: { note: input.note },
    });
    await notifyMasters({
      actorId: user.id,
      type: "NO_PAYMENT_RECORDED",
      title: "Cliente visitado sin pago",
      message: `${user.name} registró que ${credit.client.name} no pagó`,
      entityType: "credit",
      entityId: id,
      actionUrl: `/app/creditos/${id}`,
      details: {
        cliente: credit.client.name,
        crédito: credit.code,
        saldo: Number(credit.balanceCents) / 100,
        nota: input.note,
      },
    });
    return jsonResponse(result);
  } catch (error) {
    return apiError(error);
  }
}

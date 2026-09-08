import { z } from "zod";
import { audit } from "@/lib/audit";
import { apiError, requireUser } from "@/lib/auth/guard";
import { prisma } from "@/lib/db/prisma";
import { jsonResponse } from "@/lib/json";
import { registerPayment } from "@/lib/loans/service";
import { toCents } from "@/lib/money";
import { notifyMasters } from "@/lib/notify";

const schema = z.object({
  amount: z.coerce.number().positive().max(1_000_000),
  method: z.enum(["CASH", "YAPE", "TRANSFER"]).default("CASH"),
  paidAt: z.string().optional(),
  note: z.string().max(500).optional().nullable(),
  proofDocumentIds: z.array(z.string().min(1)).max(10).default([]),
});

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { user } = await requireUser(request, ["COLLECTOR"]);
    const { id } = await params;
    const input = schema.parse(await request.json());
    const credit = await prisma.credit.findUniqueOrThrow({ where: { id }, include: { client: true } });
    if (credit.collectorId !== user.id) return Response.json({ error: "Crédito no asignado" }, { status: 403 });
    if (["YAPE", "TRANSFER"].includes(input.method) && !input.proofDocumentIds.length) {
      return Response.json({ error: "Yape y transferencia requieren un justificante" }, { status: 400 });
    }
    const payment = await registerPayment({ creditId: id, collectorId: user.id, amountCents: toCents(input.amount), paidAt: input.paidAt ? new Date(input.paidAt) : new Date(), method: input.method, note: input.note, proofDocumentIds: input.proofDocumentIds });
    const updated = await prisma.credit.findUniqueOrThrow({ where: { id }, include: { installments: { orderBy: { number: "asc" } } } });
    const proofs = await prisma.document.findMany({ where: { paymentId: payment.id }, orderBy: { createdAt: "asc" } });
    await audit({ actorId: user.id, action: "PAYMENT_RECORDED", entityType: "credit", entityId: id, after: payment, metadata: { proofDocumentIds: proofs.map((proof) => proof.id) } });
    await notifyMasters({
      actorId: user.id, type: "PAYMENT_RECORDED", title: "Pago registrado",
      message: `${user.name} registró S/ ${input.amount.toFixed(2)} de ${credit.client.name}`,
      entityType: "credit", entityId: id, actionUrl: `/app/creditos/${id}`,
      details: { cliente: credit.client.name, crédito: credit.code, importe: input.amount, medio: input.method, justificantes: proofs.map((proof) => proof.label ?? proof.fileName), saldoAnterior: Number(credit.balanceCents) / 100, saldoNuevo: Number(updated.balanceCents) / 100, nota: input.note },
    });
    return jsonResponse({ payment: { ...payment, documents: proofs }, credit: updated });
  } catch (error) { return apiError(error); }
}

import { z } from "zod";
import { audit } from "@/lib/audit";
import { apiError, requireUser } from "@/lib/auth/guard";
import { prisma } from "@/lib/db/prisma";
import { jsonResponse } from "@/lib/json";
import { creditProgress } from "@/lib/loans/service";
import { notifyMasters } from "@/lib/notify";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { user } = await requireUser(request); const { id } = await params;
    const credit = await prisma.credit.findUnique({ where: { id }, include: { client: true, collector: { select: { id: true, name: true } }, previousCredit: { select: { id: true, code: true } }, installments: { orderBy: { number: "asc" } }, payments: { include: { collector: { select: { name: true } } }, orderBy: { paidAt: "desc" } }, documents: { orderBy: { createdAt: "desc" } } } });
    if (!credit || (user.role === "COLLECTOR" && credit.collectorId !== user.id)) return Response.json({ error: "Crédito no encontrado" }, { status: 404 });
    return jsonResponse({ credit: { ...credit, ...creditProgress(credit) } });
  } catch (error) { return apiError(error); }
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { user } = await requireUser(request, ["MASTER"]); const { id } = await params;
    const { action, note } = z.object({ action: z.literal("WRITE_OFF"), note: z.string().trim().min(5).max(500) }).parse(await request.json());
    const before = await prisma.credit.findUniqueOrThrow({ where: { id }, include: { client: true } });
    if (before.balanceCents <= BigInt(0)) return Response.json({ error: "El crédito ya no tiene saldo" }, { status: 400 });
    const credit = await prisma.credit.update({ where: { id }, data: { status: "WRITTEN_OFF", writtenOffCents: before.balanceCents, closedAt: new Date(), notes: [before.notes, `Castigo: ${note}`].filter(Boolean).join("\n") } });
    await audit({ actorId: user.id, action, entityType: "credit", entityId: id, before, after: credit, metadata: { note } });
    await notifyMasters({ actorId: user.id, type: "CREDIT_WRITTEN_OFF", title: "Crédito registrado como pérdida", message: `${before.client.name}: pérdida de S/ ${(Number(before.balanceCents)/100).toFixed(2)}`, entityType: "credit", entityId: id, actionUrl: `/app/creditos/${id}`, details: { cliente: before.client.name, crédito: before.code, capital: Number(before.principalCents)/100, cobrado: Number(before.paidCents)/100, pérdida: Number(before.balanceCents)/100, motivo: note } });
    return jsonResponse({ credit });
  } catch (error) { return apiError(error); }
}

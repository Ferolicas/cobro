import { z } from "zod";
import { audit } from "@/lib/audit";
import { apiError, requireUser } from "@/lib/auth/guard";
import { prisma } from "@/lib/db/prisma";
import { jsonResponse } from "@/lib/json";

const updateSchema = z.object({
  name: z.string().trim().min(3).max(160).optional(),
  documentNumber: z.string().trim().max(30).nullable().optional(),
  phone: z.string().trim().max(30).nullable().optional(),
  alternatePhone: z.string().trim().max(30).nullable().optional(),
  businessName: z.string().trim().max(160).nullable().optional(),
  businessType: z.string().trim().max(100).nullable().optional(),
  address: z.string().trim().max(240).nullable().optional(),
  locationNotes: z.string().trim().max(500).nullable().optional(),
  reference: z.string().trim().max(240).nullable().optional(),
  notes: z.string().trim().max(2000).nullable().optional(),
  zoneId: z.string().nullable().optional(),
  collectorId: z.string().nullable().optional(),
  riskStatus: z.enum(["NORMAL", "WATCH", "LATE", "BLOCKED"]).optional(),
  active: z.boolean().optional(),
});

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { user } = await requireUser(request);
    const { id } = await params;
    const client = await prisma.client.findUnique({
      where: { id },
      include: {
        collector: { select: { id: true, name: true, email: true } }, zone: true,
        credits: { include: { installments: { orderBy: { number: "asc" } }, payments: { include: { collector: { select: { name: true } } }, orderBy: { paidAt: "desc" } }, documents: true }, orderBy: { disbursedAt: "desc" } },
        documents: { orderBy: { createdAt: "desc" } },
        activities: { include: { actor: { select: { name: true } } }, orderBy: { createdAt: "desc" }, take: 100 },
      },
    });
    if (!client || (user.role === "COLLECTOR" && client.collectorId !== user.id)) return Response.json({ error: "Cliente no encontrado" }, { status: 404 });
    return jsonResponse({ client });
  } catch (error) { return apiError(error); }
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { user } = await requireUser(request);
    const { id } = await params;
    const before = await prisma.client.findUniqueOrThrow({ where: { id } });
    if (user.role === "COLLECTOR" && before.collectorId !== user.id) return Response.json({ error: "No tienes acceso" }, { status: 403 });
    const input = updateSchema.parse(await request.json());
    if (user.role === "COLLECTOR") { delete input.collectorId; delete input.active; }
    const client = await prisma.client.update({ where: { id }, data: input });
    await audit({ actorId: user.id, action: "CLIENT_UPDATED", entityType: "client", entityId: id, before, after: client });
    return jsonResponse({ client });
  } catch (error) { return apiError(error); }
}

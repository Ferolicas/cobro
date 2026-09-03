import { randomUUID } from "node:crypto";
import { z } from "zod";
import { audit } from "@/lib/audit";
import { apiError, requireUser } from "@/lib/auth/guard";
import { prisma } from "@/lib/db/prisma";
import { jsonResponse } from "@/lib/json";
import { notifyMasters } from "@/lib/notify";

const clientSchema = z.object({
  name: z.string().trim().min(3).max(160),
  documentNumber: z.string().trim().max(30).optional().nullable(),
  phone: z.string().trim().max(30).optional().nullable(),
  alternatePhone: z.string().trim().max(30).optional().nullable(),
  businessName: z.string().trim().max(160).optional().nullable(),
  businessType: z.string().trim().max(100).optional().nullable(),
  address: z.string().trim().max(240).optional().nullable(),
  locationNotes: z.string().trim().max(500).optional().nullable(),
  reference: z.string().trim().max(240).optional().nullable(),
  notes: z.string().trim().max(2000).optional().nullable(),
  zoneId: z.string().optional().nullable(),
  collectorId: z.string().optional().nullable(),
});

export async function GET(request: Request) {
  try {
    const { user } = await requireUser(request);
    const url = new URL(request.url);
    const query = url.searchParams.get("q")?.trim();
    const where = {
      ...(user.role === "COLLECTOR" ? { collectorId: user.id } : {}),
      active: true,
      ...(query ? { OR: ["name", "documentNumber", "phone", "businessName"].map((field) => ({ [field]: { contains: query, mode: "insensitive" as const } })) } : {}),
    };
    const clients = await prisma.client.findMany({
      where,
      include: {
        collector: { select: { id: true, name: true } },
        zone: true,
        credits: { where: { status: { in: ["ACTIVE", "OVERDUE"] } }, select: { id: true, code: true, balanceCents: true, maturityDate: true } },
      },
      orderBy: { updatedAt: "desc" },
      take: 250,
    });
    return jsonResponse({ clients });
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(request: Request) {
  try {
    const { user } = await requireUser(request, ["COLLECTOR"]);
    const input = clientSchema.parse(await request.json());
    const collectorId = user.id;
    const client = await prisma.client.create({
      data: { ...input, collectorId, code: `CL-${randomUUID().slice(0, 8).toUpperCase()}` },
      include: { collector: { select: { id: true, name: true } }, zone: true },
    });
    await audit({ actorId: user.id, action: "CLIENT_CREATED", entityType: "client", entityId: client.id, after: client });
    await notifyMasters({
      actorId: user.id,
      type: "CLIENT_CREATED",
      title: "Nuevo cliente creado",
      message: `${user.name} creó a ${client.name}`,
      entityType: "client",
      entityId: client.id,
      actionUrl: `/app/clientes/${client.id}`,
      details: { cliente: client.name, negocio: client.businessName, teléfono: client.phone, cobrador: user.name },
    });
    return jsonResponse({ client }, { status: 201 });
  } catch (error) {
    return apiError(error);
  }
}

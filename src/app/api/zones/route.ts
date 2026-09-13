import { z } from "zod";
import { apiError, requireUser } from "@/lib/auth/guard";
import { prisma } from "@/lib/db/prisma";
import { audit } from "@/lib/audit";
import { notifyMasters } from "@/lib/notify";

export async function GET(request: Request) {
  try {
    await requireUser(request);
    return Response.json({ zones: await prisma.zone.findMany({ where: { active: true }, orderBy: { name: "asc" } }) });
  } catch (error) { return apiError(error); }
}

export async function POST(request: Request) {
  try {
    const { user } = await requireUser(request, ["MASTER"]);
    const { name } = z.object({ name: z.string().trim().min(2).max(100) }).parse(await request.json());
    const zone = await prisma.zone.upsert({ where: { name }, create: { name }, update: { active: true } });
    await audit({ actorId: user.id, action: "ZONE_CREATED", entityType: "zone", entityId: zone.id, after: zone });
    await notifyMasters({ actorId: user.id, type: "ZONE_CREATED", title: "Zona de trabajo disponible", message: `${zone.name} ya puede asignarse a cobradores y clientes`, entityType: "zone", entityId: zone.id, actionUrl: "/app/cobradores", details: { zona: zone.name }, broadcastToAll: true });
    return Response.json({ zone }, { status: 201 });
  } catch (error) { return apiError(error); }
}

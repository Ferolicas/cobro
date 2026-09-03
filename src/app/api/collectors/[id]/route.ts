import { z } from "zod";
import { audit } from "@/lib/audit";
import { apiError, requireUser } from "@/lib/auth/guard";
import { prisma } from "@/lib/db/prisma";
import { jsonResponse } from "@/lib/json";

const schema = z.object({ active: z.boolean().optional(), name: z.string().trim().min(3).optional(), phone: z.string().trim().nullable().optional(), zoneId: z.string().nullable().optional() });

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { user } = await requireUser(request, ["MASTER"]);
    const { id } = await params;
    const before = await prisma.user.findUniqueOrThrow({ where: { id } });
    if (before.role !== "COLLECTOR") return Response.json({ error: "Usuario no válido" }, { status: 400 });
    const collector = await prisma.user.update({ where: { id }, data: schema.parse(await request.json()) });
    await audit({ actorId: user.id, action: "COLLECTOR_UPDATED", entityType: "user", entityId: id, before, after: collector });
    return jsonResponse({ collector });
  } catch (error) { return apiError(error); }
}

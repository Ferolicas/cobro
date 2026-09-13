import { z } from "zod";
import { audit } from "@/lib/audit";
import { apiError, requireUser } from "@/lib/auth/guard";
import { prisma } from "@/lib/db/prisma";
import { jsonResponse } from "@/lib/json";
import { emitDataChanged } from "@/lib/realtime/hub";

const schema = z.object({ active: z.boolean().optional(), name: z.string().trim().min(3).optional(), phone: z.string().trim().nullable().optional(), zoneId: z.string().nullable().optional() });

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { user } = await requireUser(request, ["MASTER"]);
    const { id } = await params;
    const before = await prisma.user.findUniqueOrThrow({ where: { id } });
    if (before.role !== "COLLECTOR") return Response.json({ error: "Usuario no válido" }, { status: 400 });
    const input = schema.parse(await request.json());
    const collector = await prisma.$transaction(async (tx) => {
      const updated = await tx.user.update({ where: { id }, data: input });
      if (input.active === false) await tx.session.deleteMany({ where: { userId: id } });
      return updated;
    });
    await audit({ actorId: user.id, action: "COLLECTOR_UPDATED", entityType: "user", entityId: id, before, after: collector });
    emitDataChanged({ action: "COLLECTOR_UPDATED", entityType: "user", entityId: id }, ["masters", `user:${id}`]);
    return jsonResponse({ collector });
  } catch (error) { return apiError(error); }
}

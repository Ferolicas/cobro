import { z } from "zod";
import { apiError, requireUser } from "@/lib/auth/guard";
import { requireSuperAdmin } from "@/lib/auth/scope";
import { prisma } from "@/lib/db/prisma";
import { jsonResponse, jsonValue } from "@/lib/json";
import { notifyMasters } from "@/lib/notify";

const schema = z.object({ collectorIds: z.array(z.string().min(1)).min(1) });

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { user } = await requireUser(request, ["MASTER"]);
    requireSuperAdmin(user);
    const { id } = await params;
    const { collectorIds: rawCollectorIds } = schema.parse(await request.json());
    const collectorIds = [...new Set(rawCollectorIds)];
    const administrator = await prisma.user.findFirst({
      where: { id, role: "MASTER" },
      select: { id: true, name: true, isSuperAdmin: true },
    });
    if (!administrator) return Response.json({ error: "Administrador no encontrado" }, { status: 404 });
    if (administrator.isSuperAdmin) {
      return Response.json({ error: "El administrador principal conserva acceso global" }, { status: 400 });
    }
    const collectors = await prisma.user.findMany({
      where: { id: { in: collectorIds }, role: "COLLECTOR" },
      select: { id: true, name: true },
    });
    if (collectors.length !== collectorIds.length) {
      return Response.json({ error: "Uno de los cobradores seleccionados ya no existe" }, { status: 400 });
    }
    await prisma.$transaction(async (tx) => {
      await tx.collectorAssignment.deleteMany({ where: { administratorId: id } });
      await tx.collectorAssignment.createMany({
        data: collectorIds.map((collectorId) => ({ administratorId: id, collectorId })),
      });
      await tx.auditLog.create({
        data: {
          actorId: user.id,
          action: "ADMIN_COLLECTORS_ASSIGNED",
          entityType: "user",
          entityId: id,
          metadata: jsonValue({ collectorIds, collectors: collectors.map(({ name }) => name) }),
        },
      });
    });
    await notifyMasters({
      actorId: user.id,
      type: "ADMIN_COLLECTORS_ASSIGNED",
      title: "Cobradores asignados",
      message: `${administrator.name} ahora supervisa ${collectors.length} cobrador${collectors.length === 1 ? "" : "es"}`,
      entityType: "user",
      entityId: id,
      actionUrl: "/app/cobradores",
      details: { administrador: administrator.name, cobradores: collectors.map(({ name }) => name).join(", ") },
      audienceUserIds: [id],
    });
    return jsonResponse({ administrator: { ...administrator, assignedCollectors: collectors } });
  } catch (error) {
    return apiError(error);
  }
}

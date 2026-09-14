import { z } from "zod";
import { apiError, requireUser } from "@/lib/auth/guard";
import { requireSuperAdmin } from "@/lib/auth/scope";
import { prisma } from "@/lib/db/prisma";
import { jsonResponse, jsonValue } from "@/lib/json";
import { disconnectRealtimeUser, emitDataChanged } from "@/lib/realtime/hub";

const deleteSchema = z.object({ confirmation: z.string().trim().email() });

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { user } = await requireUser(request, ["MASTER"]);
    requireSuperAdmin(user);
    const { id } = await params;
    if (id === user.id) return Response.json({ error: "No puedes eliminar tu propia cuenta principal" }, { status: 400 });
    const { confirmation } = deleteSchema.parse(await request.json());
    const target = await prisma.user.findUnique({
      where: { id },
      select: {
        id: true, name: true, email: true, role: true, isSuperAdmin: true,
        _count: { select: { assignedClients: true, managedCredits: true, payments: true, liquidations: true, uploadedDocuments: true, cashMovements: true } },
      },
    });
    if (!target) return Response.json({ error: "Usuario no encontrado" }, { status: 404 });
    if (target.isSuperAdmin) return Response.json({ error: "El administrador principal no puede eliminarse" }, { status: 400 });
    if (confirmation.toLowerCase() !== target.email.toLowerCase()) {
      return Response.json({ error: `Escribe ${target.email} para confirmar la eliminación` }, { status: 400 });
    }
    await prisma.$transaction(async (tx) => {
      await tx.user.delete({ where: { id } });
      await tx.auditLog.create({
        data: {
          actorId: user.id,
          action: "USER_PERMANENTLY_DELETED",
          entityType: "user",
          entityId: id,
          metadata: jsonValue({
            deletedRole: target.role,
            detachedRecords: target._count,
            businessHistoryPreserved: true,
          }),
        },
      });
    });
    disconnectRealtimeUser(id);
    emitDataChanged({ action: "USER_PERMANENTLY_DELETED", entityType: "user", entityId: id }, [`user:${user.id}`]);
    return jsonResponse({ ok: true, detachedRecords: target._count });
  } catch (error) {
    return apiError(error);
  }
}

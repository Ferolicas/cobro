import "server-only";
import { prisma } from "@/lib/db/prisma";
import { emitRealtime } from "@/lib/realtime/hub";
import { jsonSafe, jsonValue } from "@/lib/json";

export async function notifyMasters(params: {
  actorId?: string | null;
  type: string;
  title: string;
  message: string;
  entityType?: string;
  entityId?: string;
  actionUrl?: string;
  details?: unknown;
}) {
  const masters = await prisma.user.findMany({
    where: { role: "MASTER", active: true },
    select: { id: true },
  });
  if (!masters.length) return [];
  const created = await prisma.$transaction(
    masters.map(({ id }) =>
      prisma.notification.create({
        data: {
          recipientId: id,
          actorId: params.actorId,
          type: params.type,
          title: params.title,
          message: params.message,
          entityType: params.entityType,
          entityId: params.entityId,
          actionUrl: params.actionUrl,
          details: params.details === undefined ? undefined : jsonValue(params.details),
        },
        include: { actor: { select: { id: true, name: true, email: true } } },
      }),
    ),
  );
  for (const notification of created) {
    emitRealtime("notification:new", jsonSafe(notification), [
      `user:${notification.recipientId}`,
    ]);
  }
  emitRealtime("data:changed", { type: params.entityType, id: params.entityId });
  return created;
}

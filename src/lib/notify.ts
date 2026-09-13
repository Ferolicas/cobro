import "server-only";
import { prisma } from "@/lib/db/prisma";
import { emitDataChanged, emitRealtime } from "@/lib/realtime/hub";
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
  audienceUserIds?: Array<string | null | undefined>;
  broadcastToAll?: boolean;
}) {
  const masters = await prisma.user.findMany({
    where: { role: "MASTER", active: true },
    select: { id: true },
  });
  const created = masters.length
    ? await prisma.$transaction(
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
      )
    : [];
  for (const notification of created) {
    emitRealtime("notification:new", jsonSafe(notification), [
      `user:${notification.recipientId}`,
    ]);
  }
  emitDataChanged({
    action: params.type,
    entityType: params.entityType ?? "system",
    entityId: params.entityId,
  }, params.broadcastToAll
    ? ["authenticated"]
    : [...new Set([
        "masters",
        ...(params.actorId ? [`user:${params.actorId}`] : []),
        ...(params.audienceUserIds ?? []).filter((id): id is string => Boolean(id)).map((id) => `user:${id}`),
      ])]);
  return created;
}

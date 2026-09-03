import "server-only";
import { prisma } from "@/lib/db/prisma";
import { jsonValue } from "@/lib/json";

export async function audit(params: {
  actorId?: string | null;
  action: string;
  entityType: string;
  entityId: string;
  before?: unknown;
  after?: unknown;
  metadata?: unknown;
}) {
  return prisma.auditLog.create({
    data: {
      actorId: params.actorId,
      action: params.action,
      entityType: params.entityType,
      entityId: params.entityId,
      beforeData: params.before === undefined ? undefined : jsonValue(params.before),
      afterData: params.after === undefined ? undefined : jsonValue(params.after),
      metadata: params.metadata === undefined ? undefined : jsonValue(params.metadata),
    },
  });
}

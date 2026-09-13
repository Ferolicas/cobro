import "server-only";
import type { CobroUser } from "@/lib/auth/auth";
import { AuthError } from "@/lib/auth/guard";
import { prisma } from "@/lib/db/prisma";

export async function permittedCollectorIds(user: CobroUser): Promise<string[] | null> {
  if (user.role === "COLLECTOR") return [user.id];
  if (user.isSuperAdmin) return null;
  const assignments = await prisma.collectorAssignment.findMany({
    where: { administratorId: user.id },
    select: { collectorId: true },
  });
  return assignments.map(({ collectorId }) => collectorId);
}

export async function assertCollectorAccess(user: CobroUser, collectorId: string | null | undefined) {
  if (!collectorId) throw new AuthError("Cobrador no encontrado", 404);
  const allowedIds = await permittedCollectorIds(user);
  if (allowedIds !== null && !allowedIds.includes(collectorId)) {
    throw new AuthError("No tienes acceso a este cobrador", 403);
  }
}

export function requireSuperAdmin(user: CobroUser) {
  if (user.role !== "MASTER" || !user.isSuperAdmin) {
    throw new AuthError("Solo el administrador principal puede gestionar usuarios y zonas", 403);
  }
}

export async function masterRecipientIdsForCollectors(collectorIds: Array<string | null | undefined>) {
  const ids = [...new Set(collectorIds.filter((id): id is string => Boolean(id)))];
  const masters = await prisma.user.findMany({
    where: {
      role: "MASTER",
      active: true,
      OR: [
        { isSuperAdmin: true },
        ...(ids.length ? [{ managedCollectorAssignments: { some: { collectorId: { in: ids } } } }] : []),
      ],
    },
    select: { id: true },
  });
  return masters.map(({ id }) => id);
}

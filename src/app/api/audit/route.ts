import { apiError, requireUser } from "@/lib/auth/guard";
import { prisma } from "@/lib/db/prisma";
import { jsonResponse } from "@/lib/json";
import { permittedCollectorIds } from "@/lib/auth/scope";

export async function GET(request: Request) {
  try {
    const { user } = await requireUser(request, ["MASTER"]);
    const collectorIds = await permittedCollectorIds(user);
    const logs = await prisma.auditLog.findMany({ where: collectorIds === null ? {} : { actorId: { in: [user.id, ...collectorIds] } }, include: { actor: { select: { name: true, email: true } } }, orderBy: { createdAt: "desc" }, take: 250 });
    return jsonResponse({ logs });
  } catch (error) { return apiError(error); }
}

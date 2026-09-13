import { apiError, requireUser } from "@/lib/auth/guard";
import { prisma } from "@/lib/db/prisma";
import { emitRealtime } from "@/lib/realtime/hub";

export async function POST(request: Request) {
  try {
    const { user } = await requireUser(request);
    const readAt = new Date();
    await prisma.notification.updateMany({ where: { recipientId: user.id, readAt: null }, data: { readAt } });
    emitRealtime("notification:read-all", { readAt: readAt.toISOString() }, [`user:${user.id}`]);
    return Response.json({ ok: true });
  } catch (error) { return apiError(error); }
}

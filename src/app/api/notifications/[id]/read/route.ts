import { apiError, requireUser } from "@/lib/auth/guard";
import { prisma } from "@/lib/db/prisma";
import { jsonResponse } from "@/lib/json";
import { emitRealtime } from "@/lib/realtime/hub";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { user } = await requireUser(request);
    const { id } = await params;
    const readAt = new Date();
    const result = await prisma.notification.updateMany({ where: { id, recipientId: user.id }, data: { readAt } });
    if (!result.count) return Response.json({ error: "Notificación no encontrada" }, { status: 404 });
    emitRealtime("notification:read", { id, readAt: readAt.toISOString() }, [`user:${user.id}`]);
    return jsonResponse({ ok: true });
  } catch (error) { return apiError(error); }
}

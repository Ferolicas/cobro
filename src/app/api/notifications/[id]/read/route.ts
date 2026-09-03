import { apiError, requireUser } from "@/lib/auth/guard";
import { prisma } from "@/lib/db/prisma";
import { jsonResponse } from "@/lib/json";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { user } = await requireUser(request);
    const { id } = await params;
    const result = await prisma.notification.updateMany({ where: { id, recipientId: user.id }, data: { readAt: new Date() } });
    if (!result.count) return Response.json({ error: "Notificación no encontrada" }, { status: 404 });
    return jsonResponse({ ok: true });
  } catch (error) { return apiError(error); }
}

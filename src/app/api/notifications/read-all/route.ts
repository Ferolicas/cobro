import { apiError, requireUser } from "@/lib/auth/guard";
import { prisma } from "@/lib/db/prisma";

export async function POST(request: Request) {
  try {
    const { user } = await requireUser(request);
    await prisma.notification.updateMany({ where: { recipientId: user.id, readAt: null }, data: { readAt: new Date() } });
    return Response.json({ ok: true });
  } catch (error) { return apiError(error); }
}

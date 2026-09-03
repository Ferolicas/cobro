import { apiError, requireUser } from "@/lib/auth/guard";
import { prisma } from "@/lib/db/prisma";
import { jsonResponse } from "@/lib/json";

export async function GET(request: Request) {
  try {
    const { user } = await requireUser(request);
    const notifications = await prisma.notification.findMany({
      where: { recipientId: user.id },
      include: { actor: { select: { id: true, name: true, email: true } } },
      orderBy: { createdAt: "desc" },
      take: 100,
    });
    return jsonResponse({ notifications, unread: notifications.filter((item) => !item.readAt).length });
  } catch (error) { return apiError(error); }
}

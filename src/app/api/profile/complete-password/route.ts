import { audit } from "@/lib/audit";
import { apiError, requireUser } from "@/lib/auth/guard";
import { prisma } from "@/lib/db/prisma";

export async function POST(request: Request) {
  try {
    const { user } = await requireUser(request, undefined, { allowPasswordChange: true });
    await prisma.user.update({ where: { id: user.id }, data: { mustChangePassword: false } });
    await audit({ actorId: user.id, action: "PASSWORD_CHANGED", entityType: "user", entityId: user.id });
    return Response.json({ ok: true });
  } catch (error) {
    return apiError(error);
  }
}

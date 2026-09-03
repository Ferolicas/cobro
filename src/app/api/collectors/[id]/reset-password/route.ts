import { hashPassword } from "better-auth/crypto";
import { audit } from "@/lib/audit";
import { apiError, requireUser } from "@/lib/auth/guard";
import { prisma } from "@/lib/db/prisma";
import { notifyMasters } from "@/lib/notify";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { user } = await requireUser(request, ["MASTER"]);
    const { id } = await params;
    const target = await prisma.user.findUniqueOrThrow({ where: { id } });
    if (target.role !== "COLLECTOR") return Response.json({ error: "Solo se restablecen cobradores" }, { status: 400 });
    const password = await hashPassword("cobro1234*");
    await prisma.$transaction([
      prisma.account.updateMany({ where: { userId: id, providerId: "credential" }, data: { password } }),
      prisma.user.update({ where: { id }, data: { mustChangePassword: true } }),
      prisma.session.deleteMany({ where: { userId: id } }),
    ]);
    await audit({ actorId: user.id, action: "COLLECTOR_PASSWORD_RESET", entityType: "user", entityId: id });
    await notifyMasters({ actorId: user.id, type: "PASSWORD_RESET", title: "Contraseña restablecida", message: `La contraseña de ${target.name} volvió al valor temporal`, entityType: "user", entityId: id, actionUrl: "/app/cobradores", details: { cobrador: target.name, contraseñaTemporal: "cobro1234*", sesionesCerradas: true } });
    return Response.json({ ok: true, temporaryPassword: "cobro1234*" });
  } catch (error) { return apiError(error); }
}

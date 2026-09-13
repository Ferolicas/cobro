import { hashPassword } from "better-auth/crypto";
import { z } from "zod";
import { audit } from "@/lib/audit";
import { apiError, requireUser } from "@/lib/auth/guard";
import { prisma } from "@/lib/db/prisma";

export async function POST(request: Request) {
  try {
    const { user, session } = await requireUser(request, undefined, { allowPasswordChange: true });
    if (!user.mustChangePassword) {
      return Response.json({ error: "La contraseña inicial ya fue configurada" }, { status: 409 });
    }
    const input = z.object({
      newPassword: z.string().min(10).max(128).regex(/[a-z]/).regex(/[A-Z]/).regex(/\d/),
      confirmPassword: z.string().min(10).max(128),
    }).parse(await request.json());
    if (input.newPassword !== input.confirmPassword) {
      return Response.json({ error: "Las contraseñas no coinciden" }, { status: 400 });
    }
    if (input.newPassword === "cobro1234*") {
      return Response.json({ error: "Elige una contraseña nueva y diferente" }, { status: 400 });
    }
    const account = await prisma.account.findFirst({ where: { userId: user.id, issuer: "local:credential", providerId: "credential" }, select: { id: true } });
    if (!account) return Response.json({ error: "No se encontró la cuenta de acceso" }, { status: 404 });
    const password = await hashPassword(input.newPassword);
    await prisma.$transaction([
      prisma.account.update({ where: { id: account.id }, data: { password } }),
      prisma.user.update({ where: { id: user.id }, data: { mustChangePassword: false } }),
      prisma.session.deleteMany({ where: { userId: user.id, id: { not: session.session.id } } }),
    ]);
    await audit({ actorId: user.id, action: "PASSWORD_CHANGED", entityType: "user", entityId: user.id });
    return Response.json({ ok: true });
  } catch (error) {
    return apiError(error);
  }
}

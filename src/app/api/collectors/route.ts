import { randomUUID } from "node:crypto";
import { hashPassword } from "better-auth/crypto";
import { z } from "zod";
import { audit } from "@/lib/audit";
import { apiError, requireUser } from "@/lib/auth/guard";
import { prisma } from "@/lib/db/prisma";
import { jsonResponse } from "@/lib/json";
import { notifyMasters } from "@/lib/notify";

const schema = z.object({
  name: z.string().trim().min(3).max(120),
  email: z.string().email().transform((value) => value.toLowerCase()),
  phone: z.string().trim().max(30).optional().nullable(),
  zoneId: z.string().optional().nullable(),
});

export async function GET(request: Request) {
  try {
    await requireUser(request, ["MASTER"]);
    const collectors = await prisma.user.findMany({
      where: { role: "COLLECTOR" },
      select: { id: true, name: true, email: true, phone: true, active: true, mustChangePassword: true, createdAt: true, zone: true, _count: { select: { assignedClients: true, managedCredits: true } } },
      orderBy: [{ active: "desc" }, { name: "asc" }],
    });
    const zones = await prisma.zone.findMany({ where: { active: true }, orderBy: { name: "asc" } });
    return jsonResponse({ collectors, zones });
  } catch (error) { return apiError(error); }
}

export async function POST(request: Request) {
  try {
    const { user } = await requireUser(request, ["MASTER"]);
    const input = schema.parse(await request.json());
    const password = await hashPassword("cobro1234*");
    const id = randomUUID();
    const collector = await prisma.user.create({
      data: {
        id, name: input.name, email: input.email, phone: input.phone, zoneId: input.zoneId,
        role: "COLLECTOR", mustChangePassword: true, active: true,
        accounts: { create: { id: randomUUID(), issuer: "local:credential", accountId: id, providerId: "credential", password } },
      },
    });
    await audit({ actorId: user.id, action: "COLLECTOR_CREATED", entityType: "user", entityId: id, after: collector });
    await notifyMasters({ actorId: user.id, type: "COLLECTOR_CREATED", title: "Cobrador creado", message: `${collector.name} ya puede acceder con su correo`, entityType: "user", entityId: id, actionUrl: "/app/cobradores", details: { nombre: collector.name, correo: collector.email, contraseñaTemporal: "cobro1234*", cambioObligatorio: true } });
    return jsonResponse({ collector }, { status: 201 });
  } catch (error) { return apiError(error); }
}

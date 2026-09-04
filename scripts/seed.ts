import "dotenv/config";
import { randomUUID } from "node:crypto";
import { hashPassword } from "better-auth/crypto";
import { prisma } from "../src/lib/db/prisma";

const DEFAULT_PASSWORD = "cobro1234*";

async function ensureUser(input: { email: string; name: string; role: "MASTER" | "COLLECTOR"; active?: boolean }) {
  const existing = await prisma.user.findUnique({ where: { email: input.email.toLowerCase() } });
  if (existing) return existing;
  const id = randomUUID();
  const password = await hashPassword(DEFAULT_PASSWORD);
  return prisma.user.create({
    data: {
      id,
      name: input.name,
      email: input.email.toLowerCase(),
      role: input.role,
      active: input.active ?? true,
      mustChangePassword: true,
      accounts: { create: { id: randomUUID(), issuer: "local:credential", accountId: id, providerId: "credential", password } },
    },
  });
}

async function main() {
  const master = await ensureUser({ email: process.env.MASTER_EMAIL ?? "prueba@olcas.app", name: process.env.MASTER_NAME ?? "Administrador principal", role: "MASTER" });
  const importedCollector = await ensureUser({ email: process.env.IMPORT_COLLECTOR_EMAIL ?? "beatriz@cobro.olcas.app", name: "Beatriz", role: "COLLECTOR" });
  const zones = ["San Isidro", "Barrio Milagros", "Wichanzao", "Esperanza Baja", "Esperanza Alta", "Alto Trujillo", "El Porvenir", "Puma Cagua", "Buenos Aires"];
  for (const name of zones) await prisma.zone.upsert({ where: { name }, create: { name }, update: { active: true } });
  console.log(`Seed listo: master=${master.email}, cartera=${importedCollector.email}, zonas=${zones.length}`);
}

main().finally(() => prisma.$disconnect());

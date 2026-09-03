import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";

const globalForPrisma = globalThis as unknown as { cobroPrisma?: PrismaClient };

function createClient() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("DATABASE_URL no configurada");
  return new PrismaClient({
    adapter: new PrismaPg({
      connectionString,
      max: Number(process.env.DATABASE_POOL_MAX ?? 12),
      connectionTimeoutMillis: 5_000,
      idleTimeoutMillis: 30_000,
    }),
  });
}

export const prisma = globalForPrisma.cobroPrisma ?? createClient();
if (process.env.NODE_ENV !== "production") globalForPrisma.cobroPrisma = prisma;

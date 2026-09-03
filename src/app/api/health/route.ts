import { prisma } from "@/lib/db/prisma";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return Response.json({
      status: "ok",
      service: "cobro",
      database: "ok",
      realtime: globalThis.__cobroRealtime ? "ok" : "starting",
      integrations: {
        sanity: process.env.SANITY_PROJECT_ID && process.env.SANITY_API_TOKEN ? "configured" : "pending",
        email: process.env.SMTP2GO_API_KEY ? "configured" : "pending",
      },
      timestamp: new Date().toISOString(),
    });
  } catch {
    return Response.json({ status: "error", database: "unavailable" }, { status: 503 });
  }
}

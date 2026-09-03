import { startOfDay } from "date-fns";
import { apiError, requireUser } from "@/lib/auth/guard";
import { prisma } from "@/lib/db/prisma";

export async function GET(request: Request) {
  try {
    await requireUser(request);
    const today = startOfDay(new Date());
    let record = await prisma.exchangeRate.findUnique({ where: { day_base_quote: { day: today, base: "PEN", quote: "COP" } } });
    if (!record) {
      try {
        const response = await fetch("https://api.frankfurter.dev/v2/rate/PEN/COP", { signal: AbortSignal.timeout(7_000), cache: "no-store" });
        if (!response.ok) throw new Error(`Frankfurter ${response.status}`);
        const body = await response.json() as { rate?: number; date?: string };
        if (!body.rate || !Number.isFinite(body.rate)) throw new Error("Tasa inválida");
        record = await prisma.exchangeRate.upsert({
          where: { day_base_quote: { day: today, base: "PEN", quote: "COP" } },
          create: { day: today, base: "PEN", quote: "COP", rate: body.rate, source: "Frankfurter v2" },
          update: { rate: body.rate, fetchedAt: new Date(), source: "Frankfurter v2" },
        });
      } catch (error) {
        console.warn("No se pudo actualizar la tasa", error);
        record = await prisma.exchangeRate.findFirst({ where: { base: "PEN", quote: "COP" }, orderBy: { day: "desc" } });
      }
    }
    if (!record) return Response.json({ error: "Tasa no disponible" }, { status: 503 });
    return Response.json({ base: record.base, quote: record.quote, rate: Number(record.rate), day: record.day, source: record.source });
  } catch (error) { return apiError(error); }
}

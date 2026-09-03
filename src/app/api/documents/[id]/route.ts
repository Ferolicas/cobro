import { apiError, requireUser } from "@/lib/auth/guard";
import { prisma } from "@/lib/db/prisma";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { user } = await requireUser(request);
    const { id } = await params;
    const document = await prisma.document.findUnique({
      where: { id },
      include: { client: { select: { collectorId: true } }, credit: { select: { collectorId: true } }, liquidation: { select: { collectorId: true } } },
    });
    if (!document) return Response.json({ error: "Archivo no encontrado" }, { status: 404 });
    const owner = document.client?.collectorId ?? document.credit?.collectorId ?? document.liquidation?.collectorId;
    if (user.role === "COLLECTOR" && owner !== user.id && document.uploadedById !== user.id) return Response.json({ error: "No tienes acceso" }, { status: 403 });
    const upstream = await fetch(document.sanityUrl, { cache: "no-store", signal: AbortSignal.timeout(20_000) });
    if (!upstream.ok || !upstream.body) return Response.json({ error: "No se pudo recuperar el archivo" }, { status: 502 });
    return new Response(upstream.body, { headers: { "Content-Type": document.mimeType, "Content-Disposition": `inline; filename*=UTF-8''${encodeURIComponent(document.fileName)}`, "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" } });
  } catch (error) { return apiError(error); }
}

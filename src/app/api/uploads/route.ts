import { createClient } from "@sanity/client";
import { apiError, requireUser } from "@/lib/auth/guard";
import { prisma } from "@/lib/db/prisma";
import { jsonResponse } from "@/lib/json";
import { notifyMasters } from "@/lib/notify";

const allowedCategories = new Set(["LOCATION", "YAPE", "OTHER"]);
const allowedTypes = new Set(["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif", "video/mp4", "video/quicktime", "video/webm", "application/pdf"]);

export async function POST(request: Request) {
  try {
    const { user } = await requireUser(request);
    const projectId = process.env.SANITY_PROJECT_ID;
    const token = process.env.SANITY_API_TOKEN;
    if (!projectId || !token) return Response.json({ error: "Sanity aún no está configurado" }, { status: 503 });
    const form = await request.formData();
    const category = String(form.get("category") ?? "OTHER");
    const clientId = form.get("clientId")?.toString() || undefined;
    const creditId = form.get("creditId")?.toString() || undefined;
    const liquidationId = form.get("liquidationId")?.toString() || undefined;
    if (!allowedCategories.has(category)) return Response.json({ error: "Categoría no válida" }, { status: 400 });
    const files = form.getAll("files").filter((item): item is File => item instanceof File);
    if (!files.length) return Response.json({ error: "Selecciona al menos un archivo" }, { status: 400 });
    const maxFile = Number(process.env.MAX_FILE_SIZE_MB ?? 25) * 1_000_000;
    const maxBatch = Number(process.env.MAX_BATCH_SIZE_MB ?? 100) * 1_000_000;
    if (files.some((file) => file.size > maxFile) || files.reduce((sum, file) => sum + file.size, 0) > maxBatch) return Response.json({ error: "Los archivos superan el límite permitido" }, { status: 413 });
    if (files.some((file) => !allowedTypes.has(file.type))) return Response.json({ error: "Hay un formato de archivo no permitido" }, { status: 415 });
    if (user.role === "COLLECTOR") {
      if (clientId && !(await prisma.client.count({ where: { id: clientId, collectorId: user.id } }))) return Response.json({ error: "Cliente no asignado" }, { status: 403 });
      if (creditId && !(await prisma.credit.count({ where: { id: creditId, collectorId: user.id } }))) return Response.json({ error: "Crédito no asignado" }, { status: 403 });
      if (liquidationId && !(await prisma.liquidation.count({ where: { id: liquidationId, collectorId: user.id } }))) return Response.json({ error: "Liquidación no asignada" }, { status: 403 });
    }
    const sanity = createClient({ projectId, dataset: process.env.SANITY_DATASET ?? "production", apiVersion: process.env.SANITY_API_VERSION ?? "2026-09-01", token, useCdn: false });
    const documents = [];
    for (const file of files) {
      const asset = await sanity.assets.upload(file.type.startsWith("image/") ? "image" : "file", Buffer.from(await file.arrayBuffer()), { filename: file.name, contentType: file.type });
      documents.push(await prisma.document.create({ data: { clientId, creditId, liquidationId, uploadedById: user.id, category, fileName: file.name, mimeType: file.type, sizeBytes: file.size, sanityAssetId: asset._id, sanityUrl: asset.url } }));
    }
    await notifyMasters({ actorId: user.id, type: "DOCUMENTS_UPLOADED", title: "Documentos cargados", message: `${user.name} subió ${documents.length} archivo${documents.length === 1 ? "" : "s"}`, entityType: creditId ? "credit" : clientId ? "client" : "liquidation", entityId: creditId ?? clientId ?? liquidationId, actionUrl: creditId ? `/app/creditos/${creditId}` : clientId ? `/app/clientes/${clientId}` : "/app/liquidaciones", details: { categoría: category, archivos: documents.map((item) => ({ nombre: item.fileName, tipo: item.mimeType, tamaño: item.sizeBytes })) } });
    return jsonResponse({ documents }, { status: 201 });
  } catch (error) { return apiError(error); }
}

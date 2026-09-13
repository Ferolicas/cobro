import "server-only";
import { createClient } from "@sanity/client";

export async function deleteSanityAssets(assetIds: string[]) {
  const uniqueIds = [...new Set(assetIds)].filter(Boolean);
  if (!uniqueIds.length) return;
  const projectId = process.env.SANITY_PROJECT_ID;
  const token = process.env.SANITY_API_TOKEN;
  if (!projectId || !token) throw new Error("Sanity no está configurado para eliminar los archivos");
  const sanity = createClient({
    projectId,
    dataset: process.env.SANITY_DATASET ?? "production",
    apiVersion: process.env.SANITY_API_VERSION ?? "2026-09-01",
    token,
    useCdn: false,
  });
  await Promise.all(uniqueIds.map((assetId) => sanity.delete(assetId)));
}

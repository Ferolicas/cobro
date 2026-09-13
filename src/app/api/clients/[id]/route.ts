import { z } from "zod";
import { audit } from "@/lib/audit";
import { apiError, requireUser } from "@/lib/auth/guard";
import { prisma } from "@/lib/db/prisma";
import { jsonResponse } from "@/lib/json";
import { notifyMasters } from "@/lib/notify";
import { emitDataChanged } from "@/lib/realtime/hub";
import { deleteSanityAssets } from "@/lib/sanity/assets";
import { assertCollectorAccess, masterRecipientIdsForCollectors } from "@/lib/auth/scope";

const updateSchema = z.object({
  name: z.string().trim().min(3).max(160).optional(),
  documentNumber: z.string().trim().max(30).nullable().optional(),
  phone: z.string().trim().max(30).nullable().optional(),
  alternatePhone: z.string().trim().max(30).nullable().optional(),
  businessName: z.string().trim().max(160).nullable().optional(),
  businessType: z.string().trim().max(100).nullable().optional(),
  address: z.string().trim().max(240).nullable().optional(),
  locationNotes: z.string().trim().max(500).nullable().optional(),
  latitude: z.coerce.number().min(-90).max(90).nullable().optional(),
  longitude: z.coerce.number().min(-180).max(180).nullable().optional(),
  locationAccuracyMeters: z.coerce.number().min(0).max(100_000).nullable().optional(),
  locationCapturedAt: z.coerce.date().nullable().optional(),
  reference: z.string().trim().max(240).nullable().optional(),
  notes: z.string().trim().max(2000).nullable().optional(),
  zoneId: z.string().nullable().optional(),
  collectorId: z.string().nullable().optional(),
  riskStatus: z.enum(["NORMAL", "WATCH", "LATE", "BLOCKED"]).optional(),
  active: z.boolean().optional(),
});

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { user } = await requireUser(request);
    const { id } = await params;
    const client = await prisma.client.findUnique({
      where: { id },
      include: {
        collector: { select: { id: true, name: true, email: true } }, zone: true,
        credits: { include: { installments: { orderBy: { number: "asc" } }, payments: { include: { collector: { select: { name: true } } }, orderBy: { paidAt: "desc" } }, documents: true }, orderBy: { disbursedAt: "desc" } },
        documents: { orderBy: { createdAt: "desc" } },
        activities: { include: { actor: { select: { name: true } } }, orderBy: { createdAt: "desc" }, take: 100 },
      },
    });
    if (!client) return Response.json({ error: "Cliente no encontrado" }, { status: 404 });
    await assertCollectorAccess(user, client.collectorId);
    return jsonResponse({ client });
  } catch (error) { return apiError(error); }
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { user } = await requireUser(request);
    const { id } = await params;
    const before = await prisma.client.findUniqueOrThrow({ where: { id } });
    await assertCollectorAccess(user, before.collectorId);
    const input = updateSchema.parse(await request.json());
    if (user.role === "COLLECTOR") { delete input.collectorId; delete input.active; }
    if (user.role === "MASTER" && input.collectorId) await assertCollectorAccess(user, input.collectorId);
    const client = await prisma.client.update({ where: { id }, data: input });
    await audit({ actorId: user.id, action: "CLIENT_UPDATED", entityType: "client", entityId: id, before, after: client });
    if (input.latitude != null && input.longitude != null) {
      await notifyMasters({
        actorId: user.id,
        type: "CLIENT_LOCATION_UPDATED",
        title: "Ubicación actualizada",
        message: `${user.name} guardó la ubicación en tiempo real de ${client.name}`,
        entityType: "client",
        entityId: id,
        actionUrl: `/app/clientes/${id}`,
        details: { cliente: client.name, latitud: client.latitude, longitud: client.longitude, precisiónMetros: client.locationAccuracyMeters, capturada: client.locationCapturedAt },
        audienceUserIds: [before.collectorId, client.collectorId],
      });
    } else {
      const masterIds = await masterRecipientIdsForCollectors([before.collectorId, client.collectorId]);
      emitDataChanged(
        { action: "CLIENT_UPDATED", entityType: "client", entityId: id },
        [...new Set([...masterIds.map((masterId) => `user:${masterId}`), ...[before.collectorId, client.collectorId].filter((collectorId): collectorId is string => Boolean(collectorId)).map((collectorId) => `user:${collectorId}`)])],
      );
    }
    return jsonResponse({ client });
  } catch (error) { return apiError(error); }
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { user } = await requireUser(request, ["MASTER"]);
    const { id } = await params;
    const { confirmation } = z.object({ confirmation: z.string() }).parse(await request.json());
    const client = await prisma.client.findUnique({
      where: { id },
      include: { credits: { select: { id: true } } },
    });
    if (!client) return Response.json({ error: "Cliente no encontrado" }, { status: 404 });
    await assertCollectorAccess(user, client.collectorId);
    if (confirmation !== client.code) {
      return Response.json({ error: `Escribe ${client.code} para confirmar la eliminación` }, { status: 400 });
    }

    const creditIds = client.credits.map((credit) => credit.id);
    const [paymentIds, documents, closedMovementCount] = await Promise.all([
      prisma.payment.findMany({ where: { creditId: { in: creditIds } }, select: { id: true } }),
      prisma.document.findMany({
        where: { OR: [{ clientId: id }, { creditId: { in: creditIds } }] },
        select: { id: true, sanityAssetId: true },
      }),
      prisma.cashMovement.count({
        where: { creditId: { in: creditIds }, liquidationId: { not: null } },
      }),
    ]);
    if (closedMovementCount > 0) {
      return Response.json({
        error: "Este cliente tiene movimientos incluidos en un cierre diario. No puede eliminarse sin romper el historial financiero.",
      }, { status: 409 });
    }

    const cleanupKey = `sanity_cleanup:client:${id}`;
    const assetIds = documents.map((document) => document.sanityAssetId);
    const paymentIdValues = paymentIds.map((payment) => payment.id);
    await prisma.$transaction(async (tx) => {
      await tx.notification.deleteMany({
        where: {
          OR: [
            { entityType: "client", entityId: id },
            { entityType: "credit", entityId: { in: creditIds } },
          ],
        },
      });
      await tx.auditLog.deleteMany({
        where: {
          OR: [
            { entityType: "client", entityId: id },
            { entityType: "credit", entityId: { in: creditIds } },
          ],
        },
      });
      await tx.document.deleteMany({ where: { id: { in: documents.map((document) => document.id) } } });
      await tx.cashMovement.deleteMany({ where: { creditId: { in: creditIds } } });
      await tx.paymentAllocation.deleteMany({ where: { paymentId: { in: paymentIdValues } } });
      await tx.payment.deleteMany({ where: { id: { in: paymentIdValues } } });
      await tx.clientActivity.deleteMany({ where: { clientId: id } });
      await tx.credit.deleteMany({ where: { id: { in: creditIds } } });
      await tx.client.delete({ where: { id } });
      if (assetIds.length) {
        await tx.systemSetting.upsert({
          where: { key: cleanupKey },
          create: { key: cleanupKey, value: { assetIds } },
          update: { value: { assetIds } },
        });
      }
      await tx.auditLog.create({
        data: {
          actorId: user.id,
          action: "CLIENT_DELETED",
          entityType: "client",
          entityId: id,
          metadata: {
            code: client.code,
            creditsDeleted: creditIds.length,
            paymentsDeleted: paymentIdValues.length,
            documentsDeleted: documents.length,
          },
        },
      });
    });

    let assetsPendingCleanup = false;
    if (assetIds.length) {
      try {
        await deleteSanityAssets(assetIds);
        await prisma.systemSetting.delete({ where: { key: cleanupKey } });
      } catch (error) {
        assetsPendingCleanup = true;
        console.error("No se pudieron eliminar todos los archivos de Sanity", error);
      }
    }
    const masterIds = await masterRecipientIdsForCollectors([client.collectorId]);
    emitDataChanged(
      { action: "CLIENT_DELETED", entityType: "client", entityId: id },
      [...new Set([...masterIds.map((masterId) => `user:${masterId}`), ...(client.collectorId ? [`user:${client.collectorId}`] : [])])],
    );
    return jsonResponse({ ok: true, assetsPendingCleanup });
  } catch (error) { return apiError(error); }
}

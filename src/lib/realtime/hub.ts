import type { Server } from "socket.io";

declare global {
  var __cobroRealtime: Server | undefined;
}

export function emitRealtime(
  event: string,
  payload: unknown,
  rooms: string[] = ["masters"],
) {
  const io = globalThis.__cobroRealtime;
  if (!io) return;
  for (const room of rooms) io.to(room).emit(event, payload);
}

export type RealtimeChange = {
  action: string;
  entityType: string;
  entityId?: string;
  relatedIds?: Record<string, string | null | undefined>;
  occurredAt: string;
};

export function emitDataChanged(
  change: Omit<RealtimeChange, "occurredAt">,
  rooms: string[] = ["authenticated"],
) {
  emitRealtime(
    "data:changed",
    { ...change, occurredAt: new Date().toISOString() },
    rooms,
  );
}

export function disconnectRealtimeUser(userId: string) {
  globalThis.__cobroRealtime?.in(`user:${userId}`).disconnectSockets(true);
}

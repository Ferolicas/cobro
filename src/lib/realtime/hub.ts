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

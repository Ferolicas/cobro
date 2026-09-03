import { createServer } from "node:http";
import { createSecretKey } from "node:crypto";
import next from "next";
import { Server } from "socket.io";
import { jwtVerify } from "jose";

const port = Number(process.env.PORT ?? 4009);
const dev = process.env.NODE_ENV !== "production";
const hostname = process.env.HOSTNAME ?? "0.0.0.0";
const app = next({ dev, hostname, port });
const handle = app.getRequestHandler();

async function main() {
  await app.prepare();

const httpServer = createServer((request, response) => {
  response.setHeader("X-Content-Type-Options", "nosniff");
  response.setHeader("X-Frame-Options", "DENY");
  response.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  response.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=(self)");
  if (!dev) response.setHeader("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
  void handle(request, response);
});

const io = new Server(httpServer, {
  path: "/socket.io",
  transports: ["websocket", "polling"],
  cors: { origin: process.env.APP_URL ?? `http://localhost:${port}`, credentials: true },
  connectionStateRecovery: { maxDisconnectionDuration: 2 * 60 * 1000 },
});

io.use(async (socket, nextSocket) => {
  try {
    const ticket = socket.handshake.auth.ticket;
    if (typeof ticket !== "string") throw new Error("Ticket ausente");
    const secret = process.env.AUTH_SECRET ?? process.env.BETTER_AUTH_SECRET;
    if (!secret) throw new Error("AUTH_SECRET ausente");
    const { payload } = await jwtVerify(ticket, createSecretKey(Buffer.from(secret)), {
      audience: "cobro-realtime",
      issuer: "cobro.olcas.app",
    });
    socket.data.userId = payload.sub;
    socket.data.role = payload.role;
    nextSocket();
  } catch {
    nextSocket(new Error("No autorizado"));
  }
});

io.on("connection", (socket) => {
  socket.join(`user:${socket.data.userId}`);
  if (socket.data.role === "MASTER") socket.join("masters");
});

globalThis.__cobroRealtime = io;
httpServer.listen(port, hostname, () => {
  console.log(`Cobro listo en http://${hostname}:${port}`);
});
}

void main();

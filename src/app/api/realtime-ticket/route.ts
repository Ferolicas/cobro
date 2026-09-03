import { createSecretKey } from "node:crypto";
import { SignJWT } from "jose";
import { apiError, requireUser } from "@/lib/auth/guard";

export async function POST(request: Request) {
  try {
    const { user } = await requireUser(request);
    const secret = process.env.AUTH_SECRET ?? process.env.BETTER_AUTH_SECRET;
    if (!secret) throw new Error("AUTH_SECRET no configurado");
    const ticket = await new SignJWT({ role: user.role })
      .setProtectedHeader({ alg: "HS256" })
      .setSubject(user.id)
      .setIssuer("cobro.olcas.app")
      .setAudience("cobro-realtime")
      .setIssuedAt()
      .setExpirationTime("5m")
      .sign(createSecretKey(Buffer.from(secret)));
    return Response.json({ ticket });
  } catch (error) {
    return apiError(error);
  }
}

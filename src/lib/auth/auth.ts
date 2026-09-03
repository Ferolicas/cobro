import "server-only";
import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { prisma } from "@/lib/db/prisma";

async function sendResetEmail(to: string, url: string) {
  const key = process.env.SMTP2GO_API_KEY;
  if (!key) {
    console.warn("SMTP2GO_API_KEY no configurada; no se envió el enlace de recuperación");
    return;
  }
  const response = await fetch("https://api.smtp2go.com/v3/email/send", {
    method: "POST",
    headers: { "X-Smtp2go-Api-Key": key, "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({
      sender: process.env.EMAIL_FROM ?? "Cobro <no-reply@olcas.app>",
      to: [to],
      subject: "Restablece tu contraseña de Cobro",
      html_body: `<div style="font-family:Arial,sans-serif;max-width:560px;margin:auto;padding:32px"><h1 style="color:#123c8c">Restablecer contraseña</h1><p>Solicitaste un enlace para crear una nueva contraseña.</p><p><a href="${url}" style="display:inline-block;background:#1468ed;color:white;padding:14px 22px;border-radius:12px;text-decoration:none;font-weight:700">Crear nueva contraseña</a></p><p style="color:#68738a;font-size:13px">Si no hiciste esta solicitud, ignora este mensaje.</p></div>`,
      text_body: `Restablece tu contraseña de Cobro: ${url}\n\nSi no hiciste esta solicitud, ignora este mensaje.`,
    }),
  });
  const result = await response.json().catch(() => null) as { data?: { succeeded?: number; error?: string } } | null;
  if (!response.ok || result?.data?.succeeded !== 1) throw new Error(`SMTP2GO rechazó el envío (${response.status})`);
}

export const auth = betterAuth({
  appName: "Cobro",
  baseURL: process.env.BETTER_AUTH_URL ?? process.env.APP_URL,
  secret: process.env.BETTER_AUTH_SECRET ?? process.env.AUTH_SECRET,
  database: prismaAdapter(prisma, { provider: "postgresql" }),
  trustedOrigins: [process.env.APP_URL ?? "http://localhost:4009", "http://localhost:4009"],
  emailAndPassword: {
    enabled: true,
    minPasswordLength: 10,
    maxPasswordLength: 128,
    sendResetPassword: async ({ user, url }) => sendResetEmail(user.email, url),
    onPasswordReset: async ({ user }) => {
      await prisma.user.update({ where: { id: user.id }, data: { mustChangePassword: false } });
    },
  },
  session: {
    expiresIn: 60 * 60 * 24 * 7,
    updateAge: 60 * 60 * 12,
  },
  advanced: {
    cookiePrefix: "cobro",
    useSecureCookies: process.env.NODE_ENV === "production",
  },
  user: {
    additionalFields: {
      role: { type: "string", required: false, defaultValue: "COLLECTOR", input: false },
      mustChangePassword: { type: "boolean", required: false, defaultValue: true, input: false },
      active: { type: "boolean", required: false, defaultValue: true, input: false },
      phone: { type: "string", required: false, input: false },
      zoneId: { type: "string", required: false, input: false },
    },
  },
});

export type CobroUser = {
  id: string;
  name: string;
  email: string;
  role: "MASTER" | "COLLECTOR";
  mustChangePassword: boolean;
  active: boolean;
  phone?: string | null;
  zoneId?: string | null;
};

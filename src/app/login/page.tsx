import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { BadgeCheck, BellRing, LineChart, ShieldCheck } from "lucide-react";
import { LoginForm } from "@/components/auth/LoginForm";
import { auth } from "@/lib/auth/auth";

export default async function LoginPage() {
  if (await auth.api.getSession({ headers: await headers() })) redirect("/");
  return <main className="auth-page"><section className="auth-visual"><div className="auth-brand"><span className="brand-mark">C</span><span>COBRO</span></div><div className="auth-message"><div className="eyebrow"><ShieldCheck size={17}/> Gestión protegida</div><h2>Todo tu negocio,<br/>claro y al día.</h2><p>Cartera, rutas, cobros y liquidaciones en un solo lugar.</p><div className="auth-features"><span><BadgeCheck/>Cuotas exactas</span><span><BellRing/>Alertas en vivo</span><span><LineChart/>Ganancia real</span></div></div><div className="auth-live-card"><i></i><div><strong>Sistema conectado</strong><span>Información actualizada en tiempo real</span></div></div></section><section className="auth-panel"><LoginForm/></section></main>;
}

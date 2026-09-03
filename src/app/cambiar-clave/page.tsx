import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { ChangePasswordForm } from "@/components/auth/ChangePasswordForm";
import { auth, type CobroUser } from "@/lib/auth/auth";
export default async function ChangePasswordPage() { const session = await auth.api.getSession({ headers: await headers() }); if (!session) redirect("/login"); const user = session.user as unknown as CobroUser; if (!user.mustChangePassword) redirect("/app"); return <main className="auth-page simple"><section className="password-art"><div className="auth-brand"><span className="brand-mark">C</span><span>COBRO</span></div><div><h2>Tu cuenta,<br/>solo tuya.</h2><p>Esta clave temporal dejará de funcionar en cuanto guardes la nueva.</p></div></section><section className="auth-panel"><ChangePasswordForm/></section></main>; }

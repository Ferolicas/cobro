"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Eye, EyeOff, LoaderCircle, LockKeyhole, Mail } from "lucide-react";
import { authClient } from "@/lib/auth/client";

const DISABLED_USER_MESSAGE = "Usuario desactivado";

export function LoginForm({ disabledSession = false }: { disabledSession?: boolean }) {
  const router = useRouter();
  const [email, setEmail] = useState(""); const [password, setPassword] = useState(""); const [show, setShow] = useState(false); const [loading, setLoading] = useState(false); const [error, setError] = useState(disabledSession ? DISABLED_USER_MESSAGE : "");

  useEffect(() => {
    if (disabledSession) void authClient.signOut();
  }, [disabledSession]);

  async function submit(event: React.FormEvent) {
    event.preventDefault(); setLoading(true); setError("");
    try {
      const result = await authClient.signIn.email({ email, password });
      if (result.error) { setError("Correo o contraseña incorrectos"); return; }

      const response = await fetch("/api/me");
      const data = await response.json() as { error?: string; user?: { mustChangePassword?: boolean } };
      if (!response.ok || !data.user) {
        await authClient.signOut();
        setError(response.status === 403 && data.error === DISABLED_USER_MESSAGE
          ? DISABLED_USER_MESSAGE
          : "No fue posible verificar tu acceso. Inténtalo de nuevo.");
        return;
      }

      router.replace(data.user.mustChangePassword ? "/cambiar-clave" : "/app");
      router.refresh();
    } catch {
      setError("No fue posible iniciar sesión. Inténtalo de nuevo.");
    } finally {
      setLoading(false);
    }
  }
  return <form className="auth-form" onSubmit={submit}><div className="auth-heading"><span>Acceso seguro</span><h1>Bienvenido a Cobro</h1><p>Ingresa para gestionar tu ruta y cartera.</p></div><label className="field"><span>Correo electrónico</span><div className="input-with-icon"><Mail size={20}/><input type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="tu@correo.com" required autoFocus /></div></label><label className="field"><span>Contraseña</span><div className="input-with-icon"><LockKeyhole size={20}/><input type={show ? "text" : "password"} autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Tu contraseña" required /><button className="input-action" type="button" onClick={() => setShow(!show)} aria-label={show ? "Ocultar contraseña" : "Mostrar contraseña"}>{show ? <EyeOff size={20}/> : <Eye size={20}/>}</button></div></label><div className="auth-help"><Link href="/recuperar">¿Olvidaste tu contraseña?</Link></div>{error && <div className="form-error" role="alert">{error}</div>}<button className="primary-button full" disabled={loading}>{loading ? <><LoaderCircle className="spin" size={20}/> Entrando…</> : "Entrar al sistema"}</button><p className="privacy-note">Área privada. Tus acciones quedan protegidas y registradas.</p></form>;
}

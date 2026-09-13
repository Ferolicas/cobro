"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Eye, EyeOff, LoaderCircle, LockKeyhole } from "lucide-react";

export function ChangePasswordForm() {
  const router = useRouter(); const [newPassword, setNewPassword] = useState(""); const [confirm, setConfirm] = useState(""); const [showNew, setShowNew] = useState(false); const [showConfirm, setShowConfirm] = useState(false); const [error, setError] = useState(""); const [loading, setLoading] = useState(false);
  const strong = newPassword.length >= 10 && /[A-Z]/.test(newPassword) && /[a-z]/.test(newPassword) && /\d/.test(newPassword);
  async function submit(event: React.FormEvent) {
    event.preventDefault(); setError("");
    if (!strong) return setError("La nueva contraseña no cumple los requisitos");
    if (newPassword !== confirm) return setError("Las contraseñas no coinciden");
    setLoading(true);
    try {
      const response = await fetch("/api/profile/complete-password", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ newPassword, confirmPassword: confirm }) });
      if (!response.ok) { const data = await response.json().catch(() => ({})); setError(data.error ?? "No se pudo completar el cambio"); return; }
      router.replace("/app"); router.refresh();
    } catch {
      setError("No se pudo conectar. Inténtalo de nuevo.");
    } finally {
      setLoading(false);
    }
  }
  return <form className="auth-form compact" onSubmit={submit}><div className="auth-heading"><span>Primer acceso</span><h1>Crea tu contraseña</h1><p>Escribe y confirma la contraseña que usarás desde ahora.</p></div><label className="field"><span>Nueva contraseña</span><div className="input-with-icon"><LockKeyhole size={20}/><input type={showNew ? "text" : "password"} autoComplete="new-password" value={newPassword} onChange={(e)=>setNewPassword(e.target.value)} required autoFocus/><button className="input-action" type="button" onClick={()=>setShowNew(!showNew)} aria-label={showNew ? "Ocultar nueva contraseña" : "Mostrar nueva contraseña"}>{showNew ? <EyeOff size={20}/> : <Eye size={20}/>}</button></div></label><label className="field"><span>Confirmar contraseña</span><div className="input-with-icon"><LockKeyhole size={20}/><input type={showConfirm ? "text" : "password"} autoComplete="new-password" value={confirm} onChange={(e)=>setConfirm(e.target.value)} required/><button className="input-action" type="button" onClick={()=>setShowConfirm(!showConfirm)} aria-label={showConfirm ? "Ocultar confirmación" : "Mostrar confirmación"}>{showConfirm ? <EyeOff size={20}/> : <Eye size={20}/>}</button></div></label><div className="password-rules"><span className={newPassword.length>=10?"ok":""}><CheckCircle2/>10 caracteres</span><span className={/[A-Z]/.test(newPassword)&&/[a-z]/.test(newPassword)?"ok":""}><CheckCircle2/>Mayúscula y minúscula</span><span className={/\d/.test(newPassword)?"ok":""}><CheckCircle2/>Un número</span></div>{error&&<div className="form-error" role="alert">{error}</div>}<button className="primary-button full" disabled={loading}>{loading?<><LoaderCircle className="spin"/>Guardando…</>:"Guardar y continuar"}</button></form>;
}

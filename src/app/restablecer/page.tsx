import { Suspense } from "react";
import { ResetForm } from "@/components/auth/RecoveryForms";
export default function ResetPage(){return <main className="auth-page recovery"><section className="password-art"><div className="auth-brand"><span className="brand-mark">C</span><span>COBRO</span></div><div><h2>Protege tu cuenta<br/>con una nueva clave.</h2></div></section><section className="auth-panel"><Suspense><ResetForm/></Suspense></section></main>}

"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis } from "recharts";
import { AlertTriangle, ArrowRight, CircleDollarSign, ContactRound, CreditCard, PiggyBank, TrendingUp, UsersRound, WalletCards } from "lucide-react";
import { EmptyState, LoadingState } from "@/components/crm/Modal";
import type { AppUser, DashboardData } from "@/components/crm/types";
import { api, shortDate } from "@/components/crm/utils";

type Currency = { money: (cents: number) => string };

export function DashboardView({ user, currency, refreshKey }: { user: AppUser; currency: Currency; refreshKey: number }) {
  const router = useRouter();
  const [data, setData] = useState<DashboardData | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    void api<DashboardData>("/api/dashboard").then(setData).catch((loadError: Error) => setError(loadError.message));
  }, [refreshKey]);

  if (error) return <EmptyState icon={<AlertTriangle />} title="No pudimos cargar el resumen" text={error} />;
  if (!data) return <LoadingState />;

  const stats = [
    { label: "Cobrado hoy", value: currency.money(data.stats.collectedTodayCents), note: `Meta exigible: ${currency.money(data.stats.todayDueCents)}`, icon: CircleDollarSign, tone: "blue" },
    { label: "Cartera pendiente", value: currency.money(data.stats.portfolioCents), note: `${data.stats.activeCredits} créditos activos`, icon: WalletCards, tone: "navy" },
    { label: "Ganancia proyectada", value: currency.money(data.stats.expectedProfitCents), note: "Interés total al 20%", icon: TrendingUp, tone: "aqua" },
    { label: "Clientes activos", value: String(data.stats.clients), note: user.role === "MASTER" ? `${data.stats.collectors} cobradores activos` : "En tu ruta asignada", icon: user.role === "MASTER" ? UsersRound : ContactRound, tone: "violet" },
  ];
  const operationsUrl = user.role === "MASTER" ? "/app/creditos" : "/app/cobro-hoy";

  return <div className="dashboard-grid">
    <section className="metric-grid">{stats.map((stat) => <article className="metric-card" key={stat.label}><span className={`metric-icon ${stat.tone}`}><stat.icon /></span><div><p>{stat.label}</p><strong>{stat.value}</strong><small>{stat.note}</small></div></article>)}</section>
    <section className="hero-balance"><div><p>CAPITAL ACTIVO</p><h2>{currency.money(data.stats.activeCapitalCents)}</h2><span>Dinero colocado actualmente en la calle</span><div className="hero-tags"><b><PiggyBank />Rentabilidad esperada {currency.money(data.stats.expectedProfitCents)}</b><b className={data.stats.overdue ? "danger" : ""}><AlertTriangle />{data.stats.overdue} vencidos</b></div></div><CreditCard className="hero-card-icon" /></section>
    <section className="chart-card"><header><div><p>RECAUDO</p><h3>Últimos 7 días</h3></div><button onClick={() => router.push(user.role === "MASTER" ? "/app/reportes" : "/app/cobro-hoy")}>{user.role === "MASTER" ? "Ver reporte" : "Ir a cobrar"} <ArrowRight /></button></header><div className="chart-wrap"><ResponsiveContainer width="100%" height="100%"><AreaChart data={data.series}><defs><linearGradient id="cobroFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#1768ec" stopOpacity={0.3} /><stop offset="1" stopColor="#1768ec" stopOpacity={0} /></linearGradient></defs><CartesianGrid strokeDasharray="4 4" vertical={false} stroke="#e5eaf2" /><XAxis dataKey="date" tickFormatter={(value) => new Date(`${value}T12:00:00`).toLocaleDateString("es-PE", { weekday: "short" })} axisLine={false} tickLine={false} /><Tooltip formatter={(value) => currency.money(Number(value))} /><Area type="monotone" dataKey="amountCents" stroke="#1768ec" strokeWidth={3} fill="url(#cobroFill)" /></AreaChart></ResponsiveContainer></div></section>
    <section className="urgent-card"><header><div><p>PRIORIDAD</p><h3>Créditos por atender</h3></div><button onClick={() => router.push(operationsUrl)}>{user.role === "MASTER" ? "Ver cartera" : "Ver ruta"} <ArrowRight /></button></header>{data.urgentCredits.length ? <div className="compact-list">{data.urgentCredits.slice(0, 6).map((credit) => <button key={credit.id} onClick={() => router.push(`/app/creditos/${credit.id}`)}><span className={credit.daysRemaining < 0 ? "avatar danger" : "avatar"}>{credit.client.name.slice(0, 2).toUpperCase()}</span><div><strong>{credit.client.name}</strong><small>{credit.client.businessName || credit.code}</small></div><div className="list-money"><strong>{currency.money(credit.dueTodayCents)}</strong><small>{credit.daysRemaining < 0 ? `${Math.abs(credit.daysRemaining)} días vencido` : `${credit.daysRemaining} días restantes`}</small></div></button>)}</div> : <EmptyState icon={<CreditCard />} title="Sin cobros pendientes" text="La cartera está al día." />}</section>
    <section className="attention-strip"><div><span className="attention-icon"><AlertTriangle /></span><div><strong>{data.stats.overdue ? `${data.stats.overdue} créditos necesitan atención` : "Tu cartera está al día"}</strong><p>{data.stats.overdue ? "Revisa primero los vencidos para proteger la recuperación del capital." : `Actualizado ${shortDate(new Date())}`}</p></div></div><button className="secondary-button" onClick={() => router.push("/app/creditos")}>Revisar cartera</button></section>
  </div>;
}

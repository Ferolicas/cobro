"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { io } from "socket.io-client";
import { Bell, BookOpenCheck, CircleDollarSign, ClipboardCheck, ContactRound, CreditCard, LayoutDashboard, LogOut, Menu, ReceiptText, Search, ShieldCheck, UsersRound, WalletCards, X } from "lucide-react";
import { toast } from "sonner";
import { authClient } from "@/lib/auth/client";
import { Modal } from "@/components/crm/Modal";
import type { AppUser, Notification } from "@/components/crm/types";
import { api, dateTime } from "@/components/crm/utils";
import { DashboardView } from "@/components/crm/views/DashboardView";
import { ClientsView } from "@/components/crm/views/ClientsView";
import { CreditsView } from "@/components/crm/views/CreditsView";
import { TodayView } from "@/components/crm/views/TodayView";
import { LiquidationsView } from "@/components/crm/views/LiquidationsView";
import { CollectorsView } from "@/components/crm/views/CollectorsView";
import { ReportsView } from "@/components/crm/views/ReportsView";
import { AuditView } from "@/components/crm/views/AuditView";

type CurrencyContext = { currency: "PEN" | "COP"; rate: number; money: (cents: number) => string };
export const defaultCurrency: CurrencyContext = { currency: "PEN", rate: 1, money: (cents) => `S/ ${(cents / 100).toLocaleString("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` };

const masterNav = [
  { id: "dashboard", label: "Resumen", icon: LayoutDashboard }, { id: "clientes", label: "Clientes", icon: ContactRound }, { id: "creditos", label: "Créditos", icon: CreditCard }, { id: "liquidaciones", label: "Liquidaciones", icon: ClipboardCheck }, { id: "cobradores", label: "Cobradores", icon: UsersRound }, { id: "reportes", label: "Caja y reportes", icon: WalletCards }, { id: "auditoria", label: "Auditoría", icon: BookOpenCheck },
];
const collectorNav = [
  { id: "dashboard", label: "Mi resumen", icon: LayoutDashboard }, { id: "cobro-hoy", label: "Cobro de hoy", icon: CircleDollarSign }, { id: "clientes", label: "Mis clientes", icon: ContactRound }, { id: "creditos", label: "Mis créditos", icon: CreditCard }, { id: "liquidaciones", label: "Mi liquidación", icon: ClipboardCheck },
];
const titleMap: Record<string, [string, string]> = { dashboard: ["Resumen del negocio", "Una mirada clara a todo lo que importa hoy"], "cobro-hoy": ["Cobro de hoy", "Tu ruta, ordenada por prioridad"], clientes: ["Clientes", "Personas y negocios de tu cartera"], creditos: ["Créditos", "Cuotas, saldos y renovaciones"], liquidaciones: ["Liquidación diaria", "Cierra tu jornada sin perder un sol"], cobradores: ["Equipo de cobro", "Accesos, zonas y carga de trabajo"], reportes: ["Caja y reportes", "Ganancias, cartera y resultados"], auditoria: ["Auditoría", "Historial completo de movimientos"] };

export function CrmShell({ user, slug }: { user: AppUser; slug: string[] }) {
  const router = useRouter(); const requestedView = slug[0] || "dashboard"; const entityId = slug[1];
  const [sidebar, setSidebar] = useState(false); const [notificationsOpen, setNotificationsOpen] = useState(false); const [notifications, setNotifications] = useState<Notification[]>([]); const [selectedNotification, setSelectedNotification] = useState<Notification | null>(null); const [currency, setCurrency] = useState<"PEN"|"COP">("PEN"); const [rate, setRate] = useState(1); const [refreshKey, setRefreshKey] = useState(0);
  const nav = user.role === "MASTER" ? masterNav : collectorNav;
  const view = nav.some((item) => item.id === requestedView) ? requestedView : "dashboard";
  const currencyContext = useMemo<CurrencyContext>(() => ({ currency, rate, money: (cents) => { const value = currency === "COP" ? (cents / 100) * rate : cents / 100; return new Intl.NumberFormat(currency === "COP" ? "es-CO" : "es-PE", { style: "currency", currency, maximumFractionDigits: currency === "COP" ? 0 : 2 }).format(value); } }), [currency, rate]);
  const loadNotifications = useCallback(async () => { try { const data = await api<{ notifications: Notification[] }>("/api/notifications"); setNotifications(data.notifications); } catch { /* session handling stays with page */ } }, []);
  useEffect(() => { void loadNotifications(); void api<{rate:number}>("/api/exchange").then((data)=>setRate(data.rate)).catch(()=>undefined); const timer=setInterval(loadNotifications,60000); let socket: ReturnType<typeof io> | undefined; void api<{ticket:string}>("/api/realtime-ticket",{method:"POST"}).then(({ticket})=>{socket=io({path:"/socket.io",auth:{ticket}});socket.on("notification:new",(notification:Notification)=>{setNotifications((items)=>[notification,...items.filter((item)=>item.id!==notification.id)]);toast.info(notification.title,{description:notification.message});});socket.on("data:changed",()=>setRefreshKey((key)=>key+1));}); return()=>{clearInterval(timer);socket?.disconnect();}; },[loadNotifications]);
  const unread = notifications.filter((item)=>!item.readAt).length;
  function navigate(id:string){router.push(id==="dashboard"?"/app":`/app/${id}`);setSidebar(false)}
  async function openNotification(notification:Notification){setSelectedNotification(notification);setNotificationsOpen(false);if(!notification.readAt){await api(`/api/notifications/${notification.id}/read`,{method:"POST"});setNotifications((items)=>items.map((item)=>item.id===notification.id?{...item,readAt:new Date().toISOString()}:item));}}
  async function logout(){await authClient.signOut();router.replace("/login");router.refresh()}
  const [title, subtitle] = view === "liquidaciones" && user.role === "MASTER"
    ? ["Supervisión de liquidaciones", "Revisa los cierres automáticos de cada cobrador"]
    : view === "dashboard" && user.role === "COLLECTOR"
      ? ["Mi jornada", "Cobros, cartera y prioridades de tu ruta"]
      : titleMap[view] ?? titleMap.dashboard;
  return <div className="app-shell">
    <aside className={`sidebar ${sidebar?"open":""}`}><div className="sidebar-brand"><span className="brand-mark">C</span><div><strong>COBRO</strong><small>Control inteligente</small></div><button className="mobile-close" onClick={()=>setSidebar(false)}><X/></button></div><div className="nav-label">GESTIÓN</div><nav>{nav.map((item)=><button key={item.id} className={(view===item.id||(view==="dashboard"&&item.id==="dashboard"))?"active":""} onClick={()=>navigate(item.id)}><item.icon/><span>{item.label}</span></button>)}</nav><div className="sidebar-help"><ShieldCheck/><div><strong>Datos protegidos</strong><span>Actividad auditada</span></div></div><button className="logout-button" onClick={logout}><LogOut/>Cerrar sesión</button></aside>
    <div className="app-stage"><header className="app-header"><button className="menu-button" onClick={()=>setSidebar(true)}><Menu/></button><div className="header-search"><Search/><input placeholder="Buscar clientes o créditos…" onKeyDown={(e)=>{if(e.key==="Enter"&&e.currentTarget.value.trim())router.push(`/app/clientes?q=${encodeURIComponent(e.currentTarget.value)}`)}}/></div><div className="header-actions"><div className="currency-toggle"><button className={currency==="PEN"?"active":""} onClick={()=>setCurrency("PEN")}>S/ PEN</button><button className={currency==="COP"?"active":""} onClick={()=>setCurrency("COP")}>$ COP</button></div><button className="notification-button" onClick={()=>setNotificationsOpen(!notificationsOpen)} aria-label="Notificaciones"><Bell/>{unread>0&&<b>{unread>99?"99+":unread}</b>}</button><button className="profile-button"><span>{user.name.split(" ").slice(0,2).map((part)=>part[0]).join("").toUpperCase()}</span><div><strong>{user.name}</strong><small>{user.role==="MASTER"?"Administrador":"Cobrador"}</small></div></button></div></header>
      {notificationsOpen&&<section className="notifications-popover"><header><div><h3>Notificaciones</h3><span>{unread} sin leer</span></div><button onClick={async()=>{await api("/api/notifications/read-all",{method:"POST"});setNotifications((items)=>items.map((item)=>({...item,readAt:item.readAt??new Date().toISOString()})))}}>Marcar todas</button></header><div>{notifications.length?notifications.slice(0,30).map((item)=><button key={item.id} className={!item.readAt?"unread":""} onClick={()=>void openNotification(item)}><i></i><span><strong>{item.title}</strong><small>{item.message}</small><time>{dateTime(item.createdAt)}</time></span></button>):<p className="no-notifications">Todo está al día.</p>}</div></section>}
      <main className="app-main"><div className="page-heading"><div><p>{user.role==="MASTER"?"PANEL MAESTRO":"MI RUTA"}</p><h1>{title}</h1><span>{subtitle}</span></div><div className="live-chip"><i></i>En vivo</div></div>
        {view==="dashboard"&&<DashboardView user={user} currency={currencyContext} refreshKey={refreshKey}/>}
        {view==="clientes"&&<ClientsView user={user} currency={currencyContext} initialId={entityId} refreshKey={refreshKey}/>}
        {view==="creditos"&&<CreditsView user={user} currency={currencyContext} initialId={entityId} refreshKey={refreshKey}/>}
        {view==="cobro-hoy"&&user.role==="COLLECTOR"&&<TodayView currency={currencyContext} refreshKey={refreshKey}/>}
        {view==="liquidaciones"&&<LiquidationsView user={user} currency={currencyContext} refreshKey={refreshKey}/>}
        {view==="cobradores"&&user.role==="MASTER"&&<CollectorsView refreshKey={refreshKey}/>}
        {view==="reportes"&&user.role==="MASTER"&&<ReportsView user={user} currency={currencyContext} refreshKey={refreshKey}/>}
        {view==="auditoria"&&user.role==="MASTER"&&<AuditView refreshKey={refreshKey}/>}
      </main>
    </div>
    {selectedNotification&&<Modal title={selectedNotification.title} subtitle={dateTime(selectedNotification.createdAt)} onClose={()=>setSelectedNotification(null)}><div className="notification-detail"><div className="notification-event"><ReceiptText/><div><strong>{selectedNotification.message}</strong><span>Realizado por {selectedNotification.actor?.name??"Sistema"}</span></div></div><dl>{Object.entries(selectedNotification.details??{}).map(([key,value])=><div key={key}><dt>{key.replace(/([A-Z])/g," $1")}</dt><dd>{typeof value==="object"?JSON.stringify(value,null,2):String(value??"—")}</dd></div>)}</dl>{selectedNotification.actionUrl&&<button className="primary-button full" onClick={()=>{router.push(selectedNotification.actionUrl!);setSelectedNotification(null)}}>Abrir registro relacionado</button>}</div></Modal>}
    <nav className="bottom-nav">{nav.slice(0,5).map((item)=><button key={item.id} className={view===item.id?"active":""} onClick={()=>navigate(item.id)}><item.icon/><span>{item.label.replace(" de hoy","")}</span></button>)}</nav>
  </div>;
}

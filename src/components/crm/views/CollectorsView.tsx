"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, BarChart3, KeyRound, Mail, MapPinned, MapPin, Plus, Power, ShieldCheck, UsersRound, WalletCards } from "lucide-react";
import { toast } from "sonner";
import { EmptyState, LoadingState, Modal } from "@/components/crm/Modal";
import type { Administrator, Collector, Zone } from "@/components/crm/types";
import { api, shortDate } from "@/components/crm/utils";

type Currency = { money: (cents: number) => string };

export function CollectorsView({ currency, refreshKey }: { currency: Currency; refreshKey: number }) {
  const router = useRouter();
  const [collectors, setCollectors] = useState<Collector[]>([]);
  const [administrators, setAdministrators] = useState<Administrator[]>([]);
  const [zones, setZones] = useState<Zone[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [zoneOpen, setZoneOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [transferFromCollectorId, setTransferFromCollectorId] = useState("");
  const [accountRole, setAccountRole] = useState<"COLLECTOR" | "MASTER">("COLLECTOR");

  async function load() {
    const data = await api<{ collectors: Collector[]; administrators: Administrator[]; zones: Zone[] }>("/api/collectors");
    setCollectors(data.collectors);
    setAdministrators(data.administrators);
    setZones(data.zones);
    setLoading(false);
  }

  useEffect(() => { void load(); }, [refreshKey]);

  async function create(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const previousCollector = accountRole === "COLLECTOR" ? collectors.find((collector) => collector.id === transferFromCollectorId) : undefined;
    if (previousCollector && !confirm(`¿Transferir la cartera activa de ${previousCollector.name} al nuevo cobrador? ${previousCollector.name} quedará sin acceso, pero conservará todo su historial.`)) return;
    setSaving(true);
    try {
      const data = await api<{ transfer?: { previousCollector: { name: string }; clients: number; credits: number } | null }>("/api/collectors", { method: "POST", body: JSON.stringify(Object.fromEntries(form.entries())) });
      await load();
      setOpen(false);
      setTransferFromCollectorId("");
      toast.success(accountRole === "MASTER"
        ? "Administrador creado con acceso completo"
        : data.transfer
        ? `Cartera transferida: ${data.transfer.clients} clientes y ${data.transfer.credits} créditos abiertos`
        : "Cobrador creado con base fija de S/30.000");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Error");
    } finally {
      setSaving(false);
    }
  }

  async function createZone(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    try {
      const form = new FormData(event.currentTarget);
      await api("/api/zones", { method: "POST", body: JSON.stringify({ name: form.get("name") }) });
      await load();
      setZoneOpen(false);
      toast.success("Zona de trabajo disponible");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Error");
    } finally {
      setSaving(false);
    }
  }

  async function reset(item: Collector) {
    if (!confirm(`¿Restablecer la contraseña de ${item.name} a cobro1234*?`)) return;
    try {
      await api(`/api/collectors/${item.id}/reset-password`, { method: "POST" });
      toast.success("Contraseña restablecida y sesiones cerradas");
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Error");
    }
  }

  async function toggle(item: Collector) {
    try {
      await api(`/api/collectors/${item.id}`, { method: "PATCH", body: JSON.stringify({ active: !item.active }) });
      await load();
      toast.success(item.active ? "Acceso desactivado" : "Acceso activado");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Error");
    }
  }

  if (loading) return <LoadingState />;
  return <div className="page-stack">
    <div className="toolbar"><div className="team-summary"><span><UsersRound /></span><div><strong>{collectors.filter((collector) => collector.active).length} cobradores activos</strong><small>{administrators.filter((administrator) => administrator.active).length} administradores · {collectors.length} cuentas de cobro</small></div></div><div className="toolbar-actions"><button className="secondary-button" onClick={() => setZoneOpen(true)}><MapPinned />Nueva zona</button><button className="secondary-button" onClick={() => { setAccountRole("MASTER"); setTransferFromCollectorId(""); setOpen(true); }}><ShieldCheck />Nuevo administrador</button><button className="primary-button" onClick={() => { setAccountRole("COLLECTOR"); setTransferFromCollectorId(""); setOpen(true); }}><Plus />Nuevo cobrador</button></div></div>
    <section className="zone-roster"><header><ShieldCheck /><div><strong>Administradores del sistema</strong><small>Acceso completo de supervisión y gestión administrativa</small></div></header><div>{administrators.map((administrator) => <span key={administrator.id}><ShieldCheck />{administrator.name} · {administrator.email} · {administrator.active ? "Activo" : "Inactivo"}{administrator.mustChangePassword ? " · clave temporal" : ""}</span>)}</div></section>
    <section className="zone-roster"><header><MapPinned /><div><strong>Zonas de trabajo actuales</strong><small>Disponibles para altas de cobradores y clientes</small></div></header><div>{zones.map((zone) => <span key={zone.id}><MapPin />{zone.name}</span>)}</div></section>
    <div className="collector-grid">{collectors.map((item) => <article className={!item.active ? "disabled" : ""} key={item.id}>
      <header><span className="large-avatar">{item.name.slice(0, 2).toUpperCase()}</span><div><h3>{item.name}</h3><p><Mail />{item.email}</p></div><b className={item.active ? "status-badge active" : "status-badge suspended"}>{item.active ? "Activo" : "Inactivo"}</b></header>
      <div className="collector-stats"><div><strong>{item._count.assignedClients}</strong><span>Clientes</span></div><div><strong>{item._count.managedCredits}</strong><span>Créditos</span></div></div>
      <p className="collector-zone"><MapPin />{item.zone?.name || "Sin zona asignada"}</p>
      <div className="collector-fund"><div><span><WalletCards />BASE / SALIDA</span><strong>{currency.money(item.finance.baseCents)}</strong></div><div><span>ÚLTIMA CAJA</span><strong className={item.finance.currentCashCents < 0 ? "danger-text" : ""}>{currency.money(item.finance.currentCashCents)}</strong><small>{item.finance.lastClosedAt ? shortDate(item.finance.lastClosedAt) : "Sin cierres"}</small></div></div>
      {item.finance.supportNeededCents > 0 && <div className="support-warning"><AlertTriangle /><span><strong>Base en negativo</strong><small>Requiere {currency.money(item.finance.supportNeededCents)} de otro cobrador</small></span></div>}
      {item.mustChangePassword && <div className="temporary-alert"><KeyRound />Pendiente de cambiar clave temporal</div>}
      <button className="collector-overview-button" onClick={() => router.push(`/app/liquidaciones?collectorId=${item.id}`)}><BarChart3 /><span><strong>Ver control financiero completo</strong><small>Base, cierre, M.S, sueldo, semana y cadena</small></span></button>
      <footer><button onClick={() => void reset(item)}><KeyRound />Restablecer clave</button><button className={item.active ? "danger-action" : "success-action"} onClick={() => void toggle(item)}><Power />{item.active ? "Desactivar" : "Activar"}</button></footer>
    </article>)}</div>
    {!collectors.length && <EmptyState icon={<UsersRound />} title="Aún no hay cobradores" text="Crea la primera cuenta para comenzar." />}

    {open && <Modal title={accountRole === "MASTER" ? "Nuevo administrador" : "Nuevo cobrador"} subtitle={accountRole === "MASTER" ? "Acceso completo al panel maestro" : "Base y salida automáticas de S/30.000"} onClose={() => setOpen(false)}><form className="modal-form" onSubmit={create}><input type="hidden" name="role" value={accountRole}/><label className="field"><span>Nombre completo</span><input name="name" minLength={3} required autoFocus /></label><label className="field"><span>Correo electrónico</span><input name="email" type="email" required /></label><label className="field"><span>Teléfono</span><input name="phone" /></label>{accountRole === "COLLECTOR" ? <><label className="field"><span>Zona de trabajo actual *</span><select name="zoneId" required><option value="">Selecciona una zona</option>{zones.map((zone) => <option key={zone.id} value={zone.id}>{zone.name}</option>)}</select></label><label className="field"><span>Transferir cartera anterior (opcional)</span><select name="transferFromCollectorId" value={transferFromCollectorId} onChange={(event) => setTransferFromCollectorId(event.target.value)}><option value="">Crear sin transferir cartera</option>{collectors.map((collector) => <option key={collector.id} value={collector.id}>{collector.name} · {collector.active ? "Activo" : "Inactivo"} · {collector._count.assignedClients} clientes</option>)}</select></label>{transferFromCollectorId ? <div className="warning-box"><AlertTriangle /><span>Los clientes activos y créditos abiertos pasarán al nuevo acceso. El cobrador anterior quedará inactivo; sus pagos, cierres y auditorías seguirán a su nombre.</span></div> : <div className="info-box"><KeyRound /><span>En el primer acceso deberá crear una contraseña personal. Su base operativa será S/30.000.</span></div>}</> : <div className="info-box"><ShieldCheck /><span>Tendrá acceso completo de administrador. Entrará con cobro1234* y en el primer acceso creará y confirmará su contraseña personal.</span></div>}<div className="form-actions"><button type="button" className="secondary-button" onClick={() => setOpen(false)}>Cancelar</button><button className="primary-button" disabled={saving}>{accountRole === "MASTER" ? "Crear administrador" : transferFromCollectorId ? "Crear y transferir" : "Crear acceso"}</button></div></form></Modal>}
    {zoneOpen && <Modal title="Nueva zona de trabajo" subtitle="Aparecerá en las altas de cobradores y clientes" onClose={() => setZoneOpen(false)}><form className="modal-form" onSubmit={createZone}><label className="field"><span>Nombre de la zona</span><input name="name" minLength={2} required autoFocus /></label><div className="form-actions"><button type="button" className="secondary-button" onClick={() => setZoneOpen(false)}>Cancelar</button><button className="primary-button" disabled={saving}>Guardar zona</button></div></form></Modal>}
  </div>;
}

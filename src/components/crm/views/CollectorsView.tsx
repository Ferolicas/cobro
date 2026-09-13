"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, BarChart3, ContactRound, CreditCard, KeyRound, LayoutDashboard, Mail, MapPinned, MapPin, Pencil, Plus, Power, ShieldCheck, UsersRound, WalletCards } from "lucide-react";
import { toast } from "sonner";
import { EmptyState, LoadingState, Modal } from "@/components/crm/Modal";
import type { Administrator, AppUser, Collector, Zone } from "@/components/crm/types";
import { api, shortDate } from "@/components/crm/utils";

type Currency = { money: (cents: number) => string };

export function CollectorsView({ currency, refreshKey }: { user: AppUser; currency: Currency; refreshKey: number }) {
  const router = useRouter();
  const [collectors, setCollectors] = useState<Collector[]>([]);
  const [administrators, setAdministrators] = useState<Administrator[]>([]);
  const [zones, setZones] = useState<Zone[]>([]);
  const [canManageUsers, setCanManageUsers] = useState(false);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [zoneOpen, setZoneOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [transferFromCollectorId, setTransferFromCollectorId] = useState("");
  const [accountRole, setAccountRole] = useState<"COLLECTOR" | "MASTER">("COLLECTOR");
  const [assignedCollectorIds, setAssignedCollectorIds] = useState<string[]>([]);
  const [editingAdministrator, setEditingAdministrator] = useState<Administrator | null>(null);
  const [zoneFilter, setZoneFilter] = useState("ALL");

  async function load() {
    const data = await api<{ collectors: Collector[]; administrators: Administrator[]; zones: Zone[]; canManageUsers: boolean }>("/api/collectors");
    setCollectors(data.collectors);
    setAdministrators(data.administrators);
    setZones(data.zones);
    setCanManageUsers(data.canManageUsers);
    setLoading(false);
  }

  useEffect(() => { void load(); }, [refreshKey]);

  const visibleCollectors = useMemo(
    () => zoneFilter === "ALL" ? collectors : collectors.filter((collector) => collector.zone?.id === zoneFilter),
    [collectors, zoneFilter],
  );

  function toggleAssignment(id: string) {
    setAssignedCollectorIds((current) => current.includes(id) ? current.filter((collectorId) => collectorId !== id) : [...current, id]);
  }

  async function create(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (accountRole === "MASTER" && assignedCollectorIds.length === 0) return toast.error("Asigna al menos un cobrador");
    const form = new FormData(event.currentTarget);
    const previousCollector = accountRole === "COLLECTOR" ? collectors.find((collector) => collector.id === transferFromCollectorId) : undefined;
    if (previousCollector && !confirm(`¿Transferir la cartera activa de ${previousCollector.name} al nuevo cobrador? ${previousCollector.name} quedará sin acceso, pero conservará todo su historial.`)) return;
    setSaving(true);
    try {
      const payload = { ...Object.fromEntries(form.entries()), collectorIds: accountRole === "MASTER" ? assignedCollectorIds : [] };
      const data = await api<{ transfer?: { previousCollector: { name: string }; clients: number; credits: number } | null }>("/api/collectors", { method: "POST", body: JSON.stringify(payload) });
      await load();
      setOpen(false);
      setTransferFromCollectorId("");
      setAssignedCollectorIds([]);
      toast.success(accountRole === "MASTER"
        ? "Administrador creado con sus cobradores asignados"
        : data.transfer
          ? `Cartera transferida: ${data.transfer.clients} clientes y ${data.transfer.credits} créditos abiertos`
          : "Cobrador creado con base fija de S/30.000");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Error");
    } finally { setSaving(false); }
  }

  async function saveAssignments() {
    if (!editingAdministrator || assignedCollectorIds.length === 0) return toast.error("Asigna al menos un cobrador");
    setSaving(true);
    try {
      await api(`/api/administrators/${editingAdministrator.id}/collectors`, { method: "PATCH", body: JSON.stringify({ collectorIds: assignedCollectorIds }) });
      await load();
      setEditingAdministrator(null);
      setAssignedCollectorIds([]);
      toast.success("Asignación actualizada inmediatamente");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Error");
    } finally { setSaving(false); }
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
    } catch (error) { toast.error(error instanceof Error ? error.message : "Error"); }
    finally { setSaving(false); }
  }

  async function reset(item: Collector) {
    if (!confirm(`¿Restablecer la contraseña de ${item.name} a cobro1234*?`)) return;
    try {
      await api(`/api/collectors/${item.id}/reset-password`, { method: "POST" });
      toast.success("Contraseña restablecida y sesiones cerradas");
      await load();
    } catch (error) { toast.error(error instanceof Error ? error.message : "Error"); }
  }

  async function toggle(item: Collector) {
    try {
      await api(`/api/collectors/${item.id}`, { method: "PATCH", body: JSON.stringify({ active: !item.active }) });
      await load();
      toast.success(item.active ? "Acceso desactivado" : "Acceso activado");
    } catch (error) { toast.error(error instanceof Error ? error.message : "Error"); }
  }

  if (loading) return <LoadingState />;
  return <div className="page-stack">
    <div className="toolbar">
      <div className="team-summary"><span><UsersRound /></span><div><strong>{collectors.filter((collector) => collector.active).length} cobradores activos</strong><small>{canManageUsers ? `${administrators.filter((administrator) => administrator.active).length} administradores · ` : ""}{collectors.length} cuentas visibles</small></div></div>
      {canManageUsers && <div className="toolbar-actions"><button className="secondary-button" onClick={() => setZoneOpen(true)}><MapPinned />Nueva zona</button><button className="secondary-button" onClick={() => { setAccountRole("MASTER"); setTransferFromCollectorId(""); setAssignedCollectorIds([]); setOpen(true); }}><ShieldCheck />Nuevo administrador</button><button className="primary-button" onClick={() => { setAccountRole("COLLECTOR"); setTransferFromCollectorId(""); setAssignedCollectorIds([]); setOpen(true); }}><Plus />Nuevo cobrador</button></div>}
    </div>

    {canManageUsers && <section className="zone-roster"><header><ShieldCheck /><div><strong>Administradores del sistema</strong><small>El administrador principal puede cambiar sus cobradores asignados en cualquier momento</small></div></header><div>{administrators.map((administrator) => <span key={administrator.id}><ShieldCheck />{administrator.name} · {administrator.isSuperAdmin ? "Acceso global" : `${administrator.assignedCollectors.length} cobradores`} · {administrator.active ? "Activo" : "Inactivo"}{!administrator.isSuperAdmin && <button type="button" className="inline-icon-button" onClick={() => { setEditingAdministrator(administrator); setAssignedCollectorIds(administrator.assignedCollectors.map(({ id }) => id)); }} aria-label={`Editar cobradores de ${administrator.name}`}><Pencil /></button>}</span>)}</div></section>}

    <section className="zone-roster"><header><MapPinned /><div><strong>Filtrar cobradores por zona</strong><small>Selecciona una zona para ver únicamente los cobradores asignados allí</small></div></header><div><button type="button" className={zoneFilter === "ALL" ? "zone-filter active" : "zone-filter"} onClick={() => setZoneFilter("ALL")}><UsersRound />Todas ({collectors.length})</button>{zones.map((zone) => { const count = collectors.filter((collector) => collector.zone?.id === zone.id).length; return <button type="button" className={zoneFilter === zone.id ? "zone-filter active" : "zone-filter"} key={zone.id} onClick={() => setZoneFilter(zone.id)}><MapPin />{zone.name} ({count})</button>; })}</div></section>

    <div className="collector-grid">{visibleCollectors.map((item) => <article className={!item.active ? "disabled" : ""} key={item.id}>
      <header><span className="large-avatar">{item.name.slice(0, 2).toUpperCase()}</span><div><h3>{item.name}</h3><p><Mail />{item.email}</p></div><b className={item.active ? "status-badge active" : "status-badge suspended"}>{item.active ? "Activo" : "Inactivo"}</b></header>
      <div className="collector-stats"><div><strong>{item._count.assignedClients}</strong><span>Clientes</span></div><div><strong>{item._count.managedCredits}</strong><span>Créditos</span></div></div>
      <p className="collector-zone"><MapPin />{item.zone?.name || "Sin zona asignada"}</p>
      <div className="collector-fund"><div><span><WalletCards />BASE / SALIDA</span><strong>{currency.money(item.finance.baseCents)}</strong></div><div><span>ÚLTIMA CAJA</span><strong className={item.finance.currentCashCents < 0 ? "danger-text" : ""}>{currency.money(item.finance.currentCashCents)}</strong><small>{item.finance.lastClosedAt ? shortDate(item.finance.lastClosedAt) : "Sin cierres"}</small></div></div>
      {item.finance.supportNeededCents > 0 && <div className="support-warning"><AlertTriangle /><span><strong>Base en negativo</strong><small>Requiere {currency.money(item.finance.supportNeededCents)} de otro cobrador</small></span></div>}
      {item.mustChangePassword && <div className="temporary-alert"><KeyRound />Pendiente de cambiar clave temporal</div>}
      <div className="collector-panel-links"><button onClick={() => router.push(`/app?collectorId=${item.id}`)}><LayoutDashboard />Panel</button><button onClick={() => router.push(`/app/clientes?collectorId=${item.id}`)}><ContactRound />Clientes</button><button onClick={() => router.push(`/app/creditos?collectorId=${item.id}`)}><CreditCard />Créditos</button></div>
      <button className="collector-overview-button" onClick={() => router.push(`/app/liquidaciones?collectorId=${item.id}`)}><BarChart3 /><span><strong>Ver control financiero completo</strong><small>Base, cierre, M.S, sueldo, semana y cadena</small></span></button>
      <footer><button onClick={() => void reset(item)}><KeyRound />Restablecer clave</button><button className={item.active ? "danger-action" : "success-action"} onClick={() => void toggle(item)}><Power />{item.active ? "Desactivar" : "Activar"}</button></footer>
    </article>)}</div>
    {!visibleCollectors.length && <EmptyState icon={<UsersRound />} title="No hay cobradores en esta zona" text="Prueba con otra zona o revisa las asignaciones." />}

    {open && <Modal title={accountRole === "MASTER" ? "Nuevo administrador" : "Nuevo cobrador"} subtitle={accountRole === "MASTER" ? "Acceso limitado a los cobradores seleccionados" : "Base y salida automáticas de S/30.000"} onClose={() => setOpen(false)}><form className="modal-form" onSubmit={create}><input type="hidden" name="role" value={accountRole}/><label className="field"><span>Nombre completo</span><input name="name" minLength={3} required autoFocus /></label><label className="field"><span>Correo electrónico</span><input name="email" type="email" required /></label><label className="field"><span>Teléfono</span><input name="phone" /></label>{accountRole === "COLLECTOR" ? <><label className="field"><span>Zona de trabajo actual *</span><select name="zoneId" required><option value="">Selecciona una zona</option>{zones.map((zone) => <option key={zone.id} value={zone.id}>{zone.name}</option>)}</select></label><label className="field"><span>Transferir cartera anterior (opcional)</span><select name="transferFromCollectorId" value={transferFromCollectorId} onChange={(event) => setTransferFromCollectorId(event.target.value)}><option value="">Crear sin transferir cartera</option>{collectors.map((collector) => <option key={collector.id} value={collector.id}>{collector.name} · {collector.active ? "Activo" : "Inactivo"} · {collector._count.assignedClients} clientes</option>)}</select></label>{transferFromCollectorId ? <div className="warning-box"><AlertTriangle /><span>Los clientes activos y créditos abiertos pasarán al nuevo acceso. El cobrador anterior quedará inactivo; sus pagos, cierres y auditorías seguirán a su nombre.</span></div> : <div className="info-box"><KeyRound /><span>En el primer acceso deberá crear una contraseña personal. Su base operativa será S/30.000.</span></div>}</> : <><AssignmentPicker collectors={collectors} selected={assignedCollectorIds} onToggle={toggleAssignment}/><div className="info-box"><ShieldCheck /><span>Solo verá los cobradores seleccionados y sus clientes, créditos, panel y liquidaciones. La asignación se puede cambiar después.</span></div></>}<div className="form-actions"><button type="button" className="secondary-button" onClick={() => setOpen(false)}>Cancelar</button><button className="primary-button" disabled={saving}>{accountRole === "MASTER" ? "Crear administrador" : transferFromCollectorId ? "Crear y transferir" : "Crear acceso"}</button></div></form></Modal>}
    {editingAdministrator && <Modal title={`Cobradores de ${editingAdministrator.name}`} subtitle="El cambio de acceso se aplica inmediatamente" onClose={() => setEditingAdministrator(null)}><div className="modal-form"><AssignmentPicker collectors={collectors} selected={assignedCollectorIds} onToggle={toggleAssignment}/><div className="form-actions"><button type="button" className="secondary-button" onClick={() => setEditingAdministrator(null)}>Cancelar</button><button type="button" className="primary-button" disabled={saving} onClick={() => void saveAssignments()}>Guardar asignación</button></div></div></Modal>}
    {zoneOpen && <Modal title="Nueva zona de trabajo" subtitle="Aparecerá en las altas de cobradores y clientes" onClose={() => setZoneOpen(false)}><form className="modal-form" onSubmit={createZone}><label className="field"><span>Nombre de la zona</span><input name="name" minLength={2} required autoFocus /></label><div className="form-actions"><button type="button" className="secondary-button" onClick={() => setZoneOpen(false)}>Cancelar</button><button className="primary-button" disabled={saving}>Guardar zona</button></div></form></Modal>}
  </div>;
}

function AssignmentPicker({ collectors, selected, onToggle }: { collectors: Collector[]; selected: string[]; onToggle: (id: string) => void }) {
  return <fieldset className="assignment-picker"><legend>Cobradores asignados *</legend>{collectors.map((collector) => <label key={collector.id}><input type="checkbox" checked={selected.includes(collector.id)} onChange={() => onToggle(collector.id)} /><span><strong>{collector.name}</strong><small>{collector.zone?.name || "Sin zona"} · {collector.active ? "Activo" : "Inactivo"}</small></span></label>)}</fieldset>;
}

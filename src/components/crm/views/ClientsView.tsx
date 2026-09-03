"use client";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Building2, Camera, ContactRound, CreditCard, MapPin, Phone, Plus, Search, Upload } from "lucide-react";
import { toast } from "sonner";
import { EmptyState, LoadingState, Modal } from "@/components/crm/Modal";
import type { AppUser, Client, Zone } from "@/components/crm/types";
import { api, dateTime, shortDate } from "@/components/crm/utils";

type Currency = { money: (cents: number) => string };

export function ClientsView({ user, currency, initialId, refreshKey }: { user: AppUser; currency: Currency; initialId?: string; refreshKey: number }) {
  const params = useSearchParams();
  const canOperate = user.role === "COLLECTOR";
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState(params.get("q") ?? "");
  const [createOpen, setCreateOpen] = useState(false);
  const [selected, setSelected] = useState<Client | null>(null);
  const [zones, setZones] = useState<Zone[]>([]);
  const [saving, setSaving] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const data = await api<{ clients: Client[] }>(`/api/clients${query ? `?q=${encodeURIComponent(query)}` : ""}`);
      setClients(data.clients);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    const timer = setTimeout(() => void load(), query ? 250 : 0);
    return () => clearTimeout(timer);
  }, [query, refreshKey]);
  useEffect(() => {
    if (initialId) void api<{ client: Client }>(`/api/clients/${initialId}`).then((data) => setSelected(data.client));
  }, [initialId, refreshKey]);
  useEffect(() => {
    if (canOperate) void api<{ zones: Zone[] }>("/api/zones").then((data) => setZones(data.zones));
  }, [canOperate]);

  const filtered = useMemo(() => clients, [clients]);

  async function create(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    const form = new FormData(event.currentTarget);
    const body = Object.fromEntries([...form.entries()].map(([key, value]) => [key, value || null]));
    try {
      const data = await api<{ client: Client }>("/api/clients", { method: "POST", body: JSON.stringify(body) });
      setClients((items) => [data.client, ...items]);
      setCreateOpen(false);
      toast.success("Cliente creado correctamente");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "No se pudo crear");
    } finally {
      setSaving(false);
    }
  }

  async function upload(event: React.ChangeEvent<HTMLInputElement>, client: Client) {
    const files = Array.from(event.target.files ?? []);
    if (!files.length) return;
    const form = new FormData();
    files.forEach((file) => form.append("files", file));
    form.append("category", "LOCATION");
    form.append("clientId", client.id);
    try {
      await api("/api/uploads", { method: "POST", body: form });
      toast.success(`${files.length} archivo(s) de ubicación subidos`);
      const data = await api<{ client: Client }>(`/api/clients/${client.id}`);
      setSelected(data.client);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Error al subir");
    }
  }

  if (loading && !clients.length) return <LoadingState />;
  return <div className="page-stack">
    <div className="toolbar"><div className="search-box"><Search /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Nombre, DNI, negocio o teléfono…" /></div>{canOperate && <button className="primary-button" onClick={() => setCreateOpen(true)}><Plus />Nuevo cliente</button>}</div>
    <div className="client-grid">{filtered.map((client) => <article className="client-card" key={client.id}><button className="card-main" onClick={() => void api<{ client: Client }>(`/api/clients/${client.id}`).then((data) => setSelected(data.client))}><div className="client-top"><span className="customer-avatar">{client.name.slice(0, 2).toUpperCase()}</span><div><h3>{client.name}</h3><p>{client.code}</p></div><i className={`risk-dot ${client.riskStatus.toLowerCase()}`}></i></div><div className="client-info"><span><Building2 />{client.businessName || "Negocio sin registrar"}</span><span><MapPin />{client.zone?.name || client.address || "Zona sin asignar"}</span><span><Phone />{client.phone || "Sin teléfono"}</span></div></button><footer><div><small>Saldo activo</small><strong>{currency.money(client.credits.reduce((sum, credit) => sum + credit.balanceCents, 0))}</strong></div><span>{client.credits.length} crédito{client.credits.length === 1 ? "" : "s"} activo{client.credits.length === 1 ? "" : "s"}</span></footer></article>)}</div>
    {!filtered.length && <EmptyState icon={<ContactRound />} title="No encontramos clientes" text={canOperate ? "Prueba otro término o crea el primer cliente." : "Prueba con otro término de búsqueda."} action={canOperate ? <button className="primary-button" onClick={() => setCreateOpen(true)}><Plus />Crear cliente</button> : undefined} />}
    {createOpen && canOperate && <Modal title="Nuevo cliente" subtitle="Datos personales y del negocio" onClose={() => setCreateOpen(false)} wide><form className="modal-form form-grid" onSubmit={create}><label className="field span-2"><span>Nombre completo *</span><input name="name" required minLength={3} autoFocus /></label><label className="field"><span>DNI / documento</span><input name="documentNumber" /></label><label className="field"><span>Teléfono</span><input name="phone" inputMode="tel" /></label><label className="field"><span>Teléfono alternativo</span><input name="alternatePhone" inputMode="tel" /></label><label className="field"><span>Nombre del negocio</span><input name="businessName" /></label><label className="field"><span>Tipo de negocio</span><input name="businessType" placeholder="Bodega, mercado, taller…" /></label><label className="field"><span>Sector / zona</span><select name="zoneId"><option value="">Sin zona</option>{zones.map((zone) => <option key={zone.id} value={zone.id}>{zone.name}</option>)}</select></label><label className="field span-2"><span>Dirección</span><input name="address" /></label><label className="field span-2"><span>Indicaciones de ubicación</span><textarea name="locationNotes" placeholder="Referencia para encontrar el negocio" /></label><label className="field span-2"><span>Referencia personal/comercial</span><input name="reference" /></label><label className="field span-2"><span>Observaciones</span><textarea name="notes" /></label><div className="form-actions span-2"><button type="button" className="secondary-button" onClick={() => setCreateOpen(false)}>Cancelar</button><button className="primary-button" disabled={saving}>{saving ? "Guardando…" : "Crear cliente"}</button></div></form></Modal>}
    {selected && <Modal title={selected.name} subtitle={`${selected.code} · ${selected.businessName || "Cliente"}`} onClose={() => setSelected(null)} wide><div className="client-detail"><div className="detail-summary"><span className="large-avatar">{selected.name.slice(0, 2).toUpperCase()}</span><div><h3>{selected.businessName || "Negocio sin registrar"}</h3><p><Phone /> {selected.phone || "Sin teléfono"}</p><p><MapPin /> {selected.address || selected.zone?.name || "Sin dirección"}</p></div>{canOperate && <label className="upload-button"><Camera />Subir ubicación<input type="file" accept="image/*,video/*" multiple onChange={(event) => void upload(event, selected)} /></label>}</div><div className="detail-kpis"><div><span>Saldo pendiente</span><strong>{currency.money(selected.credits.reduce((sum, credit) => sum + credit.balanceCents, 0))}</strong></div><div><span>Créditos</span><strong>{selected.credits.length}</strong></div><div><span>Riesgo</span><strong>{selected.riskStatus}</strong></div></div><section className="detail-section"><h3><CreditCard />Historial de créditos</h3>{selected.credits.length ? selected.credits.map((credit) => <div className="credit-row" key={credit.id}><div><strong>{credit.code}</strong><span>{shortDate(credit.disbursedAt)} · {credit.status}</span></div><div><small>Capital</small><strong>{currency.money(credit.principalCents)}</strong></div><div><small>Saldo</small><strong>{currency.money(credit.balanceCents)}</strong></div></div>) : <p className="muted-box">Aún no tiene créditos.</p>}</section><section className="detail-section"><h3><Upload />Documentos</h3>{selected.documents?.length ? selected.documents.map((document) => <a className="document-row" key={document.id} href={`/api/documents/${document.id}`} target="_blank"><span>{document.fileName}</span><small>{dateTime(document.createdAt)}</small></a>) : <p className="muted-box">No hay archivos cargados.</p>}</section><section className="detail-section"><h3>Actividad</h3>{selected.activities?.map((activity) => <div className="timeline-row" key={activity.id}><i></i><div><strong>{activity.title}</strong><span>{activity.description || activity.actor?.name || "Sistema"} · {dateTime(activity.createdAt)}</span></div></div>)}</section></div></Modal>}
  </div>;
}

"use client";

import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, CalendarDays, CheckCircle2, CircleDollarSign, CreditCard, FileUp, Plus, RefreshCw, Search } from "lucide-react";
import { toast } from "sonner";
import { EmptyState, LoadingState, Modal } from "@/components/crm/Modal";
import type { AppUser, Client, Credit } from "@/components/crm/types";
import { api, dateTime, shortDate, todayInput } from "@/components/crm/utils";

type Currency = { money: (cents: number) => string };

export function CreditsView({ user, currency, initialId, refreshKey }: { user: AppUser; currency: Currency; initialId?: string; refreshKey: number }) {
  const canOperate = user.role === "COLLECTOR";
  const [credits, setCredits] = useState<Credit[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("ALL");
  const [selected, setSelected] = useState<Credit | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [renewOpen, setRenewOpen] = useState(false);
  const [paymentOpen, setPaymentOpen] = useState(false);
  const [clients, setClients] = useState<Client[]>([]);
  const [saving, setSaving] = useState(false);

  async function load() {
    setLoading(true);
    const data = await api<{ credits: Credit[] }>(`/api/credits?status=${status}${query ? `&q=${encodeURIComponent(query)}` : ""}`);
    setCredits(data.credits);
    setLoading(false);
  }
  async function detail(id: string) {
    const data = await api<{ credit: Credit }>(`/api/credits/${id}`);
    setSelected(data.credit);
  }

  useEffect(() => {
    const timer = setTimeout(() => void load(), query ? 250 : 0);
    return () => clearTimeout(timer);
  }, [query, status, refreshKey]);
  useEffect(() => {
    if (initialId) void detail(initialId);
  }, [initialId, refreshKey]);
  useEffect(() => {
    if (canOperate) void api<{ clients: Client[] }>("/api/clients").then((data) => setClients(data.clients));
  }, [canOperate]);

  const totals = useMemo(() => ({
    capital: credits.reduce((sum, credit) => sum + credit.principalCents, 0),
    saldo: credits.reduce((sum, credit) => sum + credit.balanceCents, 0),
    profit: credits.reduce((sum, credit) => sum + credit.interestCents, 0),
  }), [credits]);

  async function create(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    const body = Object.fromEntries(new FormData(event.currentTarget).entries());
    try {
      const data = await api<{ credit: Credit }>("/api/credits", { method: "POST", body: JSON.stringify(body) });
      setCredits((items) => [data.credit, ...items]);
      setCreateOpen(false);
      toast.success("Crédito creado con 24 cuotas");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Error");
    } finally {
      setSaving(false);
    }
  }

  async function submitPayment(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selected) return;
    setSaving(true);
    try {
      await api(`/api/credits/${selected.id}/payments`, { method: "POST", body: JSON.stringify(Object.fromEntries(new FormData(event.currentTarget).entries())) });
      await detail(selected.id);
      setPaymentOpen(false);
      void load();
      toast.success("Pago registrado");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Error");
    } finally {
      setSaving(false);
    }
  }

  async function renew(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selected) return;
    setSaving(true);
    try {
      const data = await api<{ credit: Credit }>(`/api/credits/${selected.id}/renew`, { method: "POST", body: JSON.stringify(Object.fromEntries(new FormData(event.currentTarget).entries())) });
      setSelected(data.credit);
      setRenewOpen(false);
      void load();
      toast.success("Crédito anterior liquidado y renovación creada");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Error");
    } finally {
      setSaving(false);
    }
  }

  async function upload(event: React.ChangeEvent<HTMLInputElement>, credit: Credit) {
    const files = Array.from(event.target.files ?? []);
    if (!files.length) return;
    const form = new FormData();
    files.forEach((file) => form.append("files", file));
    form.append("category", "YAPE");
    form.append("creditId", credit.id);
    try {
      await api("/api/uploads", { method: "POST", body: form });
      await detail(credit.id);
      toast.success("Comprobante(s) subido(s)");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Error al subir");
    }
  }

  if (loading && !credits.length) return <LoadingState />;
  return <div className="page-stack">
    <section className="mini-metrics"><div><span>Capital listado</span><strong>{currency.money(totals.capital)}</strong></div><div><span>Saldo pendiente</span><strong>{currency.money(totals.saldo)}</strong></div><div><span>Interés esperado</span><strong>{currency.money(totals.profit)}</strong></div></section>
    <div className="toolbar"><div className="search-box"><Search /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Cliente o código…" /></div><div className="filter-tabs">{[["ALL", "Todos"], ["ACTIVE", "Activos"], ["PAID", "Pagados"], ["WRITTEN_OFF", "Pérdidas"]].map(([id, label]) => <button key={id} className={status === id ? "active" : ""} onClick={() => setStatus(id)}>{label}</button>)}</div>{canOperate && <button className="primary-button" onClick={() => setCreateOpen(true)}><Plus />Nuevo crédito</button>}</div>
    <div className="credit-table"><div className="table-head"><span>Cliente</span><span>Capital</span><span>Saldo</span><span>Cuota de hoy</span><span>Plazo</span><span>Estado</span></div>{credits.map((credit) => <button className="table-row" key={credit.id} onClick={() => void detail(credit.id)}><span className="table-client"><i>{credit.client.name.slice(0, 2).toUpperCase()}</i><div><strong>{credit.client.name}</strong><small>{credit.code}</small></div></span><span><strong>{currency.money(credit.principalCents)}</strong></span><span><strong>{currency.money(credit.balanceCents)}</strong><small>{credit.progress.toFixed(0)}% cobrado</small></span><span><strong>{currency.money(credit.dueTodayCents)}</strong></span><span className={credit.daysRemaining < 0 ? "danger-text" : ""}><strong>{credit.daysRemaining < 0 ? `${Math.abs(credit.daysRemaining)} vencidos` : `${credit.daysRemaining} días`}</strong><small>{shortDate(credit.maturityDate)}</small></span><span><b className={`status-badge ${credit.status.toLowerCase()}`}>{credit.status === "ACTIVE" ? "Activo" : credit.status === "PAID" ? "Pagado" : credit.status === "RENEWED" ? "Renovado" : "Pérdida"}</b></span></button>)}</div>
    {!credits.length && <EmptyState icon={<CreditCard />} title="No hay créditos en esta vista" text={canOperate ? "Cambia el filtro o crea un crédito." : "Cambia el filtro para revisar la cartera."} />}

    {createOpen && canOperate && <Modal title="Nuevo crédito" subtitle="20% de interés · 24 cuotas diarias" onClose={() => setCreateOpen(false)} wide><form className="modal-form form-grid" onSubmit={create}><label className="field span-2"><span>Cliente *</span><select name="clientId" required autoFocus><option value="">Selecciona un cliente</option>{clients.map((client) => <option value={client.id} key={client.id}>{client.name} · {client.businessName || client.code}</option>)}</select></label><label className="field"><span>Capital prestado (S/) *</span><input type="number" name="principal" min="1" step="0.01" required /></label><label className="field"><span>Microseguro (S/)</span><input type="number" name="microinsurance" min="0" step="0.01" defaultValue="0" /></label><label className="field"><span>Fecha de desembolso</span><input type="date" name="disbursedAt" defaultValue={todayInput()} required /></label><div className="formula-note"><strong>Automático</strong><span>Interés 20%, 24 días y primera cuota descontada.</span></div><label className="field span-2"><span>Observaciones</span><textarea name="notes" /></label><div className="form-actions span-2"><button type="button" className="secondary-button" onClick={() => setCreateOpen(false)}>Cancelar</button><button className="primary-button" disabled={saving}>{saving ? "Calculando…" : "Desembolsar crédito"}</button></div></form></Modal>}

    {selected && !paymentOpen && !renewOpen && <Modal title={selected.client.name} subtitle={`${selected.code} · ${selected.status}`} onClose={() => setSelected(null)} wide><div className="credit-detail"><section className="loan-hero"><div><span>SALDO PENDIENTE</span><h2>{currency.money(selected.balanceCents)}</h2><p>{selected.daysRemaining < 0 ? `${Math.abs(selected.daysRemaining)} días vencido` : `${selected.daysRemaining} días para terminar`}</p></div><div className="progress-ring" style={{ "--progress": `${selected.progress}%` } as React.CSSProperties}><strong>{selected.progress.toFixed(0)}%</strong><span>cobrado</span></div></section><div className="detail-kpis four"><div><span>Capital / venta</span><strong>{currency.money(selected.principalCents)}</strong></div><div><span>Servicio 20%</span><strong>{currency.money(selected.interestCents)}</strong></div><div><span>Total</span><strong>{currency.money(selected.totalDueCents)}</strong></div><div><span>Saldo</span><strong>{currency.money(selected.balanceCents)}</strong></div><div><span>Días transcurridos</span><strong>{selected.daysElapsed}</strong></div><div><span>Clasificación B/Q</span><strong>{selected.excelStatus}</strong></div><div><span>Días en cero</span><strong>{selected.zeroPaymentDays}</strong></div><div><span>Teléfono</span><strong>{selected.client.phone || "—"}</strong></div><div><span>Primera cuota</span><strong>{currency.money(selected.advancePaymentCents)}</strong></div><div><span>Microseguro</span><strong>{currency.money(selected.microinsuranceCents)}</strong></div><div><span>Entregado</span><strong>{currency.money(selected.cashDeliveredCents)}</strong></div><div><span>Fecha</span><strong>{shortDate(selected.disbursedAt)}</strong></div></div>{canOperate && <div className="credit-actions"><button className="primary-button" onClick={() => setPaymentOpen(true)} disabled={selected.balanceCents <= 0}><CircleDollarSign />Registrar pago</button><button className="secondary-button" onClick={() => setRenewOpen(true)} disabled={selected.balanceCents <= 0}><RefreshCw />Renovar</button><label className="secondary-button file-label"><FileUp />Subir Yape<input type="file" accept="image/*,video/*" multiple onChange={(event) => void upload(event, selected)} /></label></div>}<section className="detail-section"><h3><CalendarDays />Plan de 24 cuotas</h3><div className="installment-grid">{selected.installments.map((installment) => <div key={installment.id} className={installment.status.toLowerCase()}><span>{installment.number}</span><strong>{currency.money(installment.expectedCents)}</strong><small>{shortDate(installment.dueDate)}</small>{installment.status === "PAID" ? <CheckCircle2 /> : installment.status === "PARTIAL" ? <i>{currency.money(installment.paidCents)}</i> : null}</div>)}</div></section><section className="detail-section"><h3>Movimientos</h3>{selected.payments?.map((payment) => <div className="payment-row" key={payment.id}><span className="payment-icon"><CircleDollarSign /></span><div><strong>{payment.source === "ADVANCE_INSTALLMENT" ? "Primera cuota" : payment.source === "RENEWAL_SETTLEMENT" ? "Liquidación por renovación" : "Pago recibido"}</strong><small>{dateTime(payment.paidAt)} · {payment.method}</small></div><strong>{currency.money(payment.amountCents)}</strong></div>)}</section><section className="detail-section"><h3>Comprobantes</h3>{selected.documents?.map((document) => <a className="document-row" key={document.id} href={`/api/documents/${document.id}`} target="_blank"><span>{document.fileName}</span><small>{dateTime(document.createdAt)}</small></a>)}</section>{user.role === "MASTER" && selected.balanceCents > 0 && <div className="danger-zone"><AlertTriangle /><div><strong>Control administrativo</strong><span>El registro como pérdida se realiza como una acción administrativa auditada.</span></div></div>}</div></Modal>}

    {selected && paymentOpen && canOperate && <Modal title="Registrar pago" subtitle={selected.client.name} onClose={() => setPaymentOpen(false)}><form className="modal-form" onSubmit={submitPayment}><div className="amount-hero"><span>Debe hoy</span><strong>{currency.money(selected.dueTodayCents)}</strong><small>Saldo total {currency.money(selected.balanceCents)}</small></div><label className="field"><span>Importe recibido (S/)</span><input name="amount" type="number" min="0.01" max={selected.balanceCents / 100} step="0.01" defaultValue={(selected.dueTodayCents / 100).toFixed(2)} required autoFocus /></label><label className="field"><span>Medio</span><select name="method"><option value="CASH">Efectivo</option><option value="YAPE">Yape</option><option value="TRANSFER">Transferencia</option></select></label><label className="field"><span>Nota</span><textarea name="note" /></label><div className="form-actions"><button type="button" className="secondary-button" onClick={() => setPaymentOpen(false)}>Atrás</button><button className="primary-button" disabled={saving}>Guardar pago</button></div></form></Modal>}

    {selected && renewOpen && canOperate && <Modal title="Renovar crédito" subtitle={`Se liquidará ${currency.money(selected.balanceCents)} del crédito anterior`} onClose={() => setRenewOpen(false)}><form className="modal-form" onSubmit={renew}><div className="warning-box"><RefreshCw /><span>El saldo anterior se cerrará y nacerá un crédito nuevo a 24 días. La deuda será sobre el capital nuevo.</span></div><label className="field"><span>Nuevo capital (S/)</span><input name="principal" type="number" min={(selected.balanceCents / 100) + 1} step="0.01" required autoFocus /></label><label className="field"><span>Microseguro (S/)</span><input name="microinsurance" type="number" min="0" step="0.01" defaultValue="0" /></label><label className="field"><span>Fecha</span><input name="disbursedAt" type="date" defaultValue={todayInput()} required /></label><label className="field"><span>Observación</span><textarea name="notes" /></label><div className="form-actions"><button type="button" className="secondary-button" onClick={() => setRenewOpen(false)}>Cancelar</button><button className="primary-button" disabled={saving}>Confirmar renovación</button></div></form></Modal>}
  </div>;
}

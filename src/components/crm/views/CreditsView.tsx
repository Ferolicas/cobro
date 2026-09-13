"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { AlertTriangle, CalendarDays, CheckCircle2, CircleDollarSign, CreditCard, FileUp, LocateFixed, Plus, RefreshCw, Search, UserX } from "lucide-react";
import { toast } from "sonner";
import { captureLiveLocation, mapsUrl, type LiveLocation } from "@/components/crm/location";
import { EmptyState, LoadingState, Modal } from "@/components/crm/Modal";
import type { AppUser, Client, Credit, CreditPreview, StoredDocument } from "@/components/crm/types";
import { api, dateTime, installmentVisualStatus, shortDate, todayInput } from "@/components/crm/utils";

type Currency = { money: (cents: number) => string };

export function CreditsView({ user, currency, initialId, refreshKey }: { user: AppUser; currency: Currency; initialId?: string; refreshKey: number }) {
  const params = useSearchParams();
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
  const [createClientId, setCreateClientId] = useState("");
  const [saving, setSaving] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState("CASH");
  const [paymentProofs, setPaymentProofs] = useState<File[]>([]);
  const [paymentNote, setPaymentNote] = useState("");
  const [principal, setPrincipal] = useState("");
  const [microinsurance, setMicroinsurance] = useState("0.00");
  const [advancePayment, setAdvancePayment] = useState("");
  const [preview, setPreview] = useState<CreditPreview | null>(null);
  const [previewError, setPreviewError] = useState("");
  const [updateDocuments, setUpdateDocuments] = useState(false);
  const [updateFiles, setUpdateFiles] = useState<File[]>([]);
  const [updateLocation, setUpdateLocation] = useState<LiveLocation | null>(null);
  const [locating, setLocating] = useState(false);
  const initialRenewOpenedFor = useRef<string | undefined>(undefined);

  async function load() {
    try {
      const data = await api<{ credits: Credit[] }>(`/api/credits?status=${status}${query ? `&q=${encodeURIComponent(query)}` : ""}`);
      setCredits(data.credits);
    } finally {
      setLoading(false);
    }
  }

  async function loadClients() {
    if (!canOperate) return;
    const data = await api<{ clients: Client[] }>("/api/clients");
    setClients(data.clients);
  }

  async function detail(id: string, openRenew = false) {
    const data = await api<{ credit: Credit }>(`/api/credits/${id}`);
    setSelected(data.credit);
    if (openRenew) startLoanForm("renew");
  }

  useEffect(() => {
    const timer = setTimeout(() => void load(), query ? 250 : 0);
    return () => clearTimeout(timer);
  }, [query, status, refreshKey]);
  useEffect(() => {
    if (!initialId) return;
    const openRenew = canOperate && params.get("action") === "renew" && initialRenewOpenedFor.current !== initialId;
    if (openRenew) initialRenewOpenedFor.current = initialId;
    void detail(initialId, openRenew).catch(() => setSelected(null));
  }, [canOperate, initialId, params, refreshKey]);
  useEffect(() => {
    if (!initialId && selected?.id) void detail(selected.id).catch(() => setSelected(null));
  }, [initialId, refreshKey, selected?.id]);
  useEffect(() => {
    void loadClients();
  }, [canOperate, refreshKey]);
  useEffect(() => {
    if ((!createOpen && !renewOpen) || !principal || Number(principal) <= 0) {
      setPreview(null);
      return;
    }
    const timer = setTimeout(() => {
      void api<CreditPreview>("/api/credits/preview", {
        method: "POST",
        body: JSON.stringify({
          principal,
          microinsurance,
          advancePayment: advancePayment || undefined,
          disbursedAt: todayInput(),
          previousCreditId: renewOpen ? selected?.id : undefined,
        }),
      }).then((data) => {
        setPreview(data);
        setPreviewError("");
        if (!advancePayment) setAdvancePayment((data.minimumAdvancePaymentCents / 100).toFixed(2));
      }).catch((error: Error) => {
        setPreview(null);
        setPreviewError(error.message);
      });
    }, 250);
    return () => clearTimeout(timer);
  }, [advancePayment, createOpen, microinsurance, principal, renewOpen, selected?.id]);

  const totals = useMemo(() => ({
    capital: credits.reduce((sum, credit) => sum + credit.principalCents, 0),
    saldo: credits.reduce((sum, credit) => sum + credit.balanceCents, 0),
    profit: credits.reduce((sum, credit) => sum + credit.interestCents, 0),
  }), [credits]);
  function startLoanForm(mode: "create" | "renew") {
    setPrincipal("");
    setMicroinsurance("0.00");
    setAdvancePayment("");
    setPreview(null);
    setPreviewError("");
    setUpdateDocuments(false);
    setUpdateFiles([]);
    setUpdateLocation(null);
    if (mode === "create") {
      setCreateClientId("");
      setCreateOpen(true);
    }
    else setRenewOpen(true);
  }

  function selectCreditClient(clientId: string) {
    setCreateClientId(clientId);
    const client = clients.find((item) => item.id === clientId);
    const activeCredit = client?.credits.find((credit) => ["ACTIVE", "OVERDUE"].includes(credit.status));
    if (!activeCredit) return;
    setCreateOpen(false);
    void detail(activeCredit.id, true).catch((error: Error) => {
      setCreateClientId("");
      setCreateOpen(true);
      toast.error(error.message || "No se pudo abrir la renovación");
    });
  }

  async function uploadFiles(files: File[], category: string, creditId: string, clientId?: string) {
    if (!files.length) return [];
    const form = new FormData();
    files.forEach((file) => form.append("files", file));
    form.append("category", category);
    form.append("creditId", creditId);
    if (clientId) form.append("clientId", clientId);
    const result = await api<{ documents: StoredDocument[] }>("/api/uploads", { method: "POST", body: form });
    return result.documents;
  }

  async function create(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!preview) return toast.error(previewError || "Completa el cálculo del crédito");
    if (updateDocuments && !updateFiles.length && !updateLocation) {
      return toast.error("Adjunta documentos o captura la ubicación que quieres actualizar");
    }
    const form = new FormData(event.currentTarget);
    const clientId = String(form.get("clientId") ?? "");
    setSaving(true);
    try {
      const data = await api<{ credit: Credit }>("/api/credits", {
        method: "POST",
        body: JSON.stringify({ clientId, principal, microinsurance, advancePayment, disbursedAt: form.get("disbursedAt"), notes: form.get("notes") || null }),
      });
      let documentWarning = "";
      if (updateDocuments) {
        try {
          if (updateLocation) await api(`/api/clients/${clientId}`, { method: "PATCH", body: JSON.stringify(updateLocation) });
          if (updateFiles.length) await uploadFiles(updateFiles, "CREDIT_UPDATE", data.credit.id, clientId);
        } catch (error) {
          documentWarning = error instanceof Error ? error.message : "No se actualizaron los documentos";
        }
      }
      setCreateOpen(false);
      await Promise.all([load(), loadClients()]);
      toast.success(documentWarning ? "Crédito creado correctamente" : updateDocuments ? "Crédito creado y documentos actualizados" : "Crédito creado con 24 cuotas");
      if (documentWarning) toast.warning(`Documentos pendientes: ${documentWarning}`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Error");
    } finally {
      setSaving(false);
    }
  }

  async function uploadPaymentProofs(credit: Credit) {
    if (paymentMethod === "CASH") return [];
    if (!paymentProofs.length) throw new Error("Adjunta el justificante obligatorio de Yape o transferencia");
    const category = paymentMethod === "YAPE" ? "PAYMENT_YAPE" : "PAYMENT_TRANSFER";
    const documents = await uploadFiles(paymentProofs, category, credit.id);
    return documents.map((document) => document.id);
  }

  async function submitPayment(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selected) return;
    const form = new FormData(event.currentTarget);
    setSaving(true);
    try {
      const proofDocumentIds = await uploadPaymentProofs(selected);
      await api(`/api/credits/${selected.id}/payments`, {
        method: "POST",
        body: JSON.stringify({ amount: form.get("amount"), method: paymentMethod, note: paymentNote || null, proofDocumentIds }),
      });
      await Promise.all([detail(selected.id), load(), loadClients()]);
      setPaymentOpen(false);
      toast.success("Pago registrado");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Error");
    } finally {
      setSaving(false);
    }
  }

  async function noPayment() {
    if (!selected) return;
    setSaving(true);
    try {
      await api(`/api/credits/${selected.id}/no-payment`, { method: "POST", body: JSON.stringify({ note: paymentNote || null }) });
      await detail(selected.id);
      setPaymentOpen(false);
      void load();
      toast.success("Visita sin pago registrada");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Error");
    } finally {
      setSaving(false);
    }
  }

  async function renew(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selected || !preview) return;
    const form = new FormData(event.currentTarget);
    setSaving(true);
    try {
      const data = await api<{ credit: Credit }>(`/api/credits/${selected.id}/renew`, {
        method: "POST",
        body: JSON.stringify({ principal, microinsurance, advancePayment, disbursedAt: form.get("disbursedAt"), notes: form.get("notes") || null }),
      });
      setRenewOpen(false);
      await Promise.all([detail(data.credit.id), load(), loadClients()]);
      toast.success("Crédito anterior liquidado y renovación creada");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Error");
    } finally {
      setSaving(false);
    }
  }

  async function captureUpdateLocation() {
    setLocating(true);
    try {
      const location = await captureLiveLocation();
      setUpdateLocation(location);
      toast.success("Ubicación actual lista para actualizar");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "No se pudo obtener la ubicación");
    } finally {
      setLocating(false);
    }
  }

  async function uploadCreditDocuments(event: React.ChangeEvent<HTMLInputElement>, credit: Credit) {
    const files = Array.from(event.target.files ?? []);
    try {
      await uploadFiles(files, "CREDIT_UPDATE", credit.id, credit.clientId);
      await detail(credit.id);
      toast.success("Documentos actualizados");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Error al subir");
    } finally {
      event.target.value = "";
    }
  }

  if (loading && !credits.length) return <LoadingState />;
  return <div className="page-stack">
    <section className="mini-metrics"><div><span>Capital listado</span><strong>{currency.money(totals.capital)}</strong></div><div><span>Valor del cobro actual</span><strong>{currency.money(totals.saldo)}</strong><small>Suma de todo lo que deben</small></div><div><span>Interés esperado</span><strong>{currency.money(totals.profit)}</strong></div></section>
    <div className="toolbar"><div className="search-box"><Search /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Cliente o código…" /></div><div className="filter-tabs">{[["ALL", "Todos"], ["ACTIVE", "Activos"], ["PAID", "Pagados"], ["WRITTEN_OFF", "Pérdidas"]].map(([id, label]) => <button key={id} className={status === id ? "active" : ""} onClick={() => setStatus(id)}>{label}</button>)}</div>{canOperate && <button className="primary-button" onClick={() => startLoanForm("create")}><Plus />Nuevo crédito</button>}</div>
    <div className="credit-table"><div className="table-head"><span>Cliente</span><span>Capital</span><span>Saldo</span><span>Cuota actual</span><span>Plazo</span><span>Estado</span></div>{credits.map((credit) => <button className="table-row" key={credit.id} onClick={() => void detail(credit.id)}><span className="table-client"><i>{credit.client.name.slice(0, 2).toUpperCase()}</i><div><strong>{credit.client.name}</strong><small>{credit.code}</small></div></span><span><strong>{currency.money(credit.principalCents)}</strong></span><span><strong>{currency.money(credit.balanceCents)}</strong><small>{credit.progress.toFixed(0)}% cobrado</small></span><span><strong>{credit.currentInstallmentNumber} / {credit.installmentCount}</strong><small>{currency.money(credit.dueTodayCents)} hoy</small></span><span className={credit.daysRemaining < 0 ? "danger-text" : ""}><strong>{credit.daysRemaining < 0 ? `${Math.abs(credit.daysRemaining)} vencidos` : `${credit.daysRemaining} días`}</strong><small>{shortDate(credit.maturityDate)}</small></span><span><b className={`status-badge ${credit.status.toLowerCase()}`}>{credit.status === "ACTIVE" ? "Activo" : credit.status === "PAID" ? "Pagado" : credit.status === "RENEWED" ? "Renovado" : credit.status === "OVERDUE" ? "Vencido" : "Pérdida"}</b></span></button>)}</div>
    {!credits.length && <EmptyState icon={<CreditCard />} title="No hay créditos en esta vista" text={canOperate ? "Cambia el filtro o crea un crédito." : "Cambia el filtro para revisar la cartera."} />}

    {createOpen && canOperate && <Modal title="Nuevo crédito" subtitle="Si el cliente ya tiene crédito activo, se abrirá directamente Renovar" onClose={() => setCreateOpen(false)} wide><form className="modal-form form-grid" onSubmit={create}>
      <label className="field span-2"><span>Cliente *</span><select name="clientId" value={createClientId} onChange={(event) => selectCreditClient(event.target.value)} required autoFocus><option value="">Selecciona un cliente</option>{clients.map((client) => { const activeCredit = client.credits.find((credit) => ["ACTIVE", "OVERDUE"].includes(credit.status)); return <option value={client.id} key={client.id}>{client.name} · {activeCredit ? `Renovar ${activeCredit.code}` : client.businessName || client.code}</option>; })}</select></label>
      {!clients.length && <div className="warning-box span-2"><RefreshCw /><span>No tienes clientes disponibles para crear o renovar un crédito.</span></div>}
      <label className="field"><span>Capital prestado (S/) *</span><input type="number" min="1" step="0.01" value={principal} onChange={(event) => setPrincipal(event.target.value)} required /></label>
      <label className="field"><span>Microseguro pagado (S/)</span><input type="number" min="0" step="0.01" value={microinsurance} onChange={(event) => setMicroinsurance(event.target.value)} required /></label>
      <label className="field"><span>Primera cuota pagada (S/) *</span><input type="number" min={preview ? preview.minimumAdvancePaymentCents / 100 : 0.01} step="0.01" value={advancePayment} onChange={(event) => setAdvancePayment(event.target.value)} required /></label>
      <label className="field"><span>Fecha de desembolso</span><input type="date" name="disbursedAt" defaultValue={todayInput()} required /></label>
      {preview && <div className="loan-preview span-2"><div><span>Total a pagar</span><strong>{currency.money(preview.totalDueCents)}</strong></div><div><span>Cuota mínima</span><strong>{currency.money(preview.minimumAdvancePaymentCents)}</strong></div><div><span>Pago inicial</span><strong>{currency.money(preview.advancePaymentCents)}</strong></div><div><span>Efectivo entregado</span><strong>{currency.money(preview.cashDeliveredCents)}</strong></div></div>}
      {previewError && <p className="form-error span-2">{previewError}</p>}
      <label className="check-card span-2"><input type="checkbox" checked={updateDocuments} onChange={(event) => setUpdateDocuments(event.target.checked)} /><span><strong>Actualizar documentos y ubicación</strong><small>Permite adjuntar evidencias nuevas al desembolsar.</small></span></label>
      {updateDocuments && <div className="credit-document-update span-2"><label className="upload-drop"><FileUp /><strong>Nuevos documentos</strong><input type="file" accept="image/*,video/*,application/pdf" multiple onChange={(event) => setUpdateFiles(Array.from(event.target.files ?? []))} />{updateFiles.length > 0 && <b>{updateFiles.length} archivo(s)</b>}</label><button type="button" className={`location-capture ${updateLocation ? "captured" : ""}`} onClick={() => void captureUpdateLocation()} disabled={locating}><LocateFixed /><span><strong>{updateLocation ? "Ubicación actual capturada" : "Actualizar ubicación GPS"}</strong><small>{updateLocation ? `${updateLocation.latitude.toFixed(6)}, ${updateLocation.longitude.toFixed(6)}` : "Opcional"}</small></span>{updateLocation && <CheckCircle2 />}</button></div>}
      <label className="field span-2"><span>Observaciones</span><textarea name="notes" /></label>
      <div className="form-actions span-2"><button type="button" className="secondary-button" onClick={() => setCreateOpen(false)}>Cancelar</button><button className="primary-button" disabled={saving || !preview || !createClientId}>{saving ? "Calculando…" : "Desembolsar crédito"}</button></div>
    </form></Modal>}

    {selected && !paymentOpen && !renewOpen && <Modal title={selected.client.name} subtitle={`${selected.code} · ${selected.status}`} onClose={() => setSelected(null)} wide><div className="credit-detail">
      <section className="loan-hero"><div><span>SALDO PENDIENTE</span><h2>{currency.money(selected.balanceCents)}</h2><p>Cuota {selected.currentInstallmentNumber} de {selected.installmentCount} · {selected.paidInstallmentsCount} pagadas</p></div><div className="progress-ring" style={{ "--progress": `${selected.progress}%` } as React.CSSProperties}><strong>{selected.progress.toFixed(0)}%</strong><span>cobrado</span></div></section>
      <div className="detail-kpis four"><div><span>Capital / venta</span><strong>{currency.money(selected.principalCents)}</strong></div><div><span>Servicio 20%</span><strong>{currency.money(selected.interestCents)}</strong></div><div><span>Total</span><strong>{currency.money(selected.totalDueCents)}</strong></div><div><span>Saldo</span><strong>{currency.money(selected.balanceCents)}</strong></div><div><span>Cuota actual</span><strong>{selected.currentInstallmentNumber} / {selected.installmentCount}</strong></div><div><span>Clasificación B/Q</span><strong>{selected.excelStatus}</strong></div><div><span>Días en cero</span><strong>{selected.zeroPaymentDays}</strong></div><div><span>Teléfono</span><strong>{selected.client.phone || "—"}</strong></div><div><span>Pago inicial</span><strong>{currency.money(selected.advancePaymentCents)}</strong></div><div><span>Microseguro</span><strong>{currency.money(selected.microinsuranceCents)}</strong></div><div><span>Entregado</span><strong>{currency.money(selected.cashDeliveredCents)}</strong></div><div><span>Fecha</span><strong>{shortDate(selected.disbursedAt)}</strong></div></div>
      {selected.client.latitude != null && selected.client.longitude != null && <a className="saved-location compact" href={mapsUrl(selected.client.latitude, selected.client.longitude)} target="_blank" rel="noreferrer"><LocateFixed /><span><strong>Ubicación GPS del cliente</strong><small>{selected.client.latitude.toFixed(6)}, {selected.client.longitude.toFixed(6)}</small></span><strong>Abrir mapa</strong></a>}
      {canOperate && <div className="credit-actions"><button className="primary-button" onClick={() => { setPaymentMethod("CASH"); setPaymentProofs([]); setPaymentNote(""); setPaymentOpen(true); }} disabled={selected.balanceCents <= 0}><CircleDollarSign />Registrar pago</button><button className="secondary-button" onClick={() => startLoanForm("renew")} disabled={selected.balanceCents <= 0}><RefreshCw />Renovar</button><label className="secondary-button file-label"><FileUp />Actualizar documentos<input type="file" accept="image/*,video/*,application/pdf" multiple onChange={(event) => void uploadCreditDocuments(event, selected)} /></label></div>}
      <section className="detail-section"><h3><CalendarDays />Plan de {selected.installmentCount} cuotas</h3><div className="installment-grid">{selected.installments.map((installment) => { const visualStatus = installmentVisualStatus(installment); return <div key={installment.id} className={visualStatus} title={visualStatus === "paid-late" ? "Cuota pagada con atraso" : undefined}><span>{installment.number}</span><strong>{currency.money(installment.expectedCents)}</strong><small>{shortDate(installment.dueDate)}</small>{installment.status === "PAID" ? <CheckCircle2 /> : installment.status === "PARTIAL" ? <i>{currency.money(installment.paidCents)}</i> : null}</div>; })}</div></section>
      <section className="detail-section"><h3>Movimientos y justificantes</h3>{selected.payments?.map((payment) => { const quotas = [...new Set(payment.allocations?.map((allocation) => allocation.installment.number) ?? [])]; return <div className="payment-record" key={payment.id}><div className="payment-row"><span className="payment-icon"><CircleDollarSign /></span><div><strong>{payment.source === "ADVANCE_INSTALLMENT" ? "Primera cuota" : payment.source === "RENEWAL_SETTLEMENT" ? "Liquidación por renovación" : "Pago recibido"}</strong><small>{dateTime(payment.paidAt)} · {payment.method}{quotas.length ? ` · cuota${quotas.length > 1 ? "s" : ""} ${quotas.join(", ")}` : ""}</small></div><strong>{currency.money(payment.amountCents)}</strong></div>{payment.documents?.map((document) => <a className="payment-proof" href={`/api/documents/${document.id}`} target="_blank" key={document.id}><FileUp /><span>{document.label || document.fileName}</span><small>Ver justificante</small></a>)}</div>; })}</section>
      {selected.activities?.length ? <section className="detail-section"><h3>Visitas sin pago</h3>{selected.activities.map((activity) => <div className="timeline-row" key={activity.id}><i></i><div><strong>{activity.title}</strong><span>{activity.description || "Sin observación"} · {dateTime(activity.createdAt)} · {activity.actor?.name || "Cobrador"}</span></div></div>)}</section> : null}
      <section className="detail-section"><h3>Todos los documentos</h3>{selected.documents?.map((document) => <a className="document-row" key={document.id} href={`/api/documents/${document.id}`} target="_blank"><span><strong>{document.label || document.fileName}</strong><small>{document.fileName}</small></span><small>{dateTime(document.createdAt)}</small></a>)}</section>
      {user.role === "MASTER" && selected.balanceCents > 0 && <div className="danger-zone"><AlertTriangle /><div><strong>Control administrativo</strong><span>Pagos, no pagos, GPS y justificantes son visibles aquí en tiempo real.</span></div></div>}
    </div></Modal>}

    {selected && paymentOpen && canOperate && <Modal title="Registrar pago" subtitle={`${selected.client.name} · cuota ${selected.currentInstallmentNumber} de ${selected.installmentCount}`} onClose={() => setPaymentOpen(false)}><form className="modal-form" onSubmit={submitPayment}>
      <div className="amount-hero"><span>Debe hoy</span><strong>{currency.money(selected.dueTodayCents)}</strong><small>Saldo total {currency.money(selected.balanceCents)}</small></div>
      <label className="field"><span>Importe recibido (S/)</span><input name="amount" type="number" min="0.01" max={selected.balanceCents / 100} step="0.01" defaultValue={(selected.dueTodayCents / 100).toFixed(2)} required autoFocus /></label>
      <label className="field"><span>Medio</span><select value={paymentMethod} onChange={(event) => { setPaymentMethod(event.target.value); setPaymentProofs([]); }}><option value="CASH">Efectivo</option><option value="YAPE">Yape</option><option value="TRANSFER">Transferencia</option></select></label>
      {paymentMethod !== "CASH" && <label className="upload-drop required-proof"><FileUp /><strong>Justificante obligatorio</strong><span>{paymentMethod === "YAPE" ? "Se numerará Yape 1, Yape 2…" : "Se numerará Transferencia 1, 2…"}</span><input type="file" accept="image/*,application/pdf" multiple required onChange={(event) => setPaymentProofs(Array.from(event.target.files ?? []))} />{paymentProofs.length > 0 && <b>{paymentProofs.length} justificante(s)</b>}</label>}
      <label className="field"><span>Nota</span><textarea value={paymentNote} onChange={(event) => setPaymentNote(event.target.value)} placeholder="Observación o motivo del no pago" /></label>
      <div className="form-actions payment-actions"><button type="button" className="secondary-button no-pay-button" onClick={() => void noPayment()} disabled={saving}><UserX />No pagó</button><button className="primary-button" disabled={saving}>Guardar pago</button></div>
    </form></Modal>}

    {selected && renewOpen && canOperate && <Modal title="Renovar crédito" subtitle={`Se liquidará ${currency.money(selected.balanceCents)} del crédito anterior`} onClose={() => setRenewOpen(false)}><form className="modal-form" onSubmit={renew}>
      <div className="warning-box"><RefreshCw /><span>El saldo anterior se cierra antes de abrir las 24 cuotas nuevas.</span></div>
      <label className="field"><span>Nuevo capital (S/)</span><input type="number" min={(selected.balanceCents / 100) + 1} step="0.01" value={principal} onChange={(event) => setPrincipal(event.target.value)} required autoFocus /></label>
      <label className="field"><span>Microseguro (S/)</span><input type="number" min="0" step="0.01" value={microinsurance} onChange={(event) => setMicroinsurance(event.target.value)} /></label>
      <label className="field"><span>Primera cuota pagada (S/)</span><input type="number" min={preview ? preview.minimumAdvancePaymentCents / 100 : 0.01} step="0.01" value={advancePayment} onChange={(event) => setAdvancePayment(event.target.value)} required /></label>
      <label className="field"><span>Fecha</span><input name="disbursedAt" type="date" defaultValue={todayInput()} required /></label>
      {preview && <div className="loan-preview"><div><span>Total nuevo</span><strong>{currency.money(preview.totalDueCents)}</strong></div><div><span>Liquida anterior</span><strong>{currency.money(preview.priorSettlementCents)}</strong></div><div><span>Efectivo entregado</span><strong>{currency.money(preview.cashDeliveredCents)}</strong></div></div>}
      {previewError && <p className="form-error">{previewError}</p>}
      <label className="field"><span>Observación</span><textarea name="notes" /></label>
      <div className="form-actions"><button type="button" className="secondary-button" onClick={() => setRenewOpen(false)}>Cancelar</button><button className="primary-button" disabled={saving || !preview}>Confirmar renovación</button></div>
    </form></Modal>}
  </div>;
}

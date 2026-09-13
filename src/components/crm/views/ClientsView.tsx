"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { AlertTriangle, Building2, Camera, CheckCircle2, ContactRound, CreditCard, FileBadge, LocateFixed, MapPin, Phone, Plus, RefreshCw, Search, Trash2, Upload, Video } from "lucide-react";
import { toast } from "sonner";
import { captureLiveLocation, mapsUrl, type LiveLocation } from "@/components/crm/location";
import { EmptyState, LoadingState, Modal } from "@/components/crm/Modal";
import type { AppUser, Client, Collector, CreditPreview, StoredDocument, Zone } from "@/components/crm/types";
import { api, dateTime, shortDate, todayInput } from "@/components/crm/utils";

type Currency = { money: (cents: number) => string };
type ClientDraft = Record<"name" | "documentNumber" | "phone" | "alternatePhone" | "businessName" | "businessType" | "zoneId" | "address" | "locationNotes" | "reference" | "notes", string>;

async function uploadDocuments(clientId: string, category: string, files: File[], creditId?: string) {
  if (!files.length) return [];
  const form = new FormData();
  files.forEach((file) => form.append("files", file));
  form.append("category", category);
  form.append("clientId", clientId);
  if (creditId) form.append("creditId", creditId);
  const result = await api<{ documents: StoredDocument[] }>("/api/uploads", { method: "POST", body: form });
  return result.documents;
}

export function ClientsView({ user, currency, initialId, refreshKey }: { user: AppUser; currency: Currency; initialId?: string; refreshKey: number }) {
  const router = useRouter();
  const params = useSearchParams();
  const collectorId = user.role === "MASTER" ? params.get("collectorId") ?? "" : "";
  const canOperate = user.role === "COLLECTOR";
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState(params.get("q") ?? "");
  const [createOpen, setCreateOpen] = useState(false);
  const [selected, setSelected] = useState<Client | null>(null);
  const [zones, setZones] = useState<Zone[]>([]);
  const [saving, setSaving] = useState(false);
  const [step, setStep] = useState(1);
  const [location, setLocation] = useState<LiveLocation | null>(null);
  const [locating, setLocating] = useState(false);
  const [identityFiles, setIdentityFiles] = useState<File[]>([]);
  const [businessPhotos, setBusinessPhotos] = useState<File[]>([]);
  const [businessVideos, setBusinessVideos] = useState<File[]>([]);
  const [principal, setPrincipal] = useState("");
  const [microinsurance, setMicroinsurance] = useState("0.00");
  const [advancePayment, setAdvancePayment] = useState("");
  const [preview, setPreview] = useState<CreditPreview | null>(null);
  const [previewError, setPreviewError] = useState("");
  const [onboardingClientId, setOnboardingClientId] = useState("");
  const [onboardingDocumentsReady, setOnboardingDocumentsReady] = useState(false);
  const [clientDraft, setClientDraft] = useState<ClientDraft | null>(null);
  const [disbursedAt, setDisbursedAt] = useState(todayInput());
  const [creditNotes, setCreditNotes] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<Client | null>(null);
  const [deleteConfirmation, setDeleteConfirmation] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [collectorOptions, setCollectorOptions] = useState<Collector[]>([]);

  async function load() {
    try {
      const search = new URLSearchParams();
      if (query) search.set("q", query);
      if (collectorId) search.set("collectorId", collectorId);
      const data = await api<{ clients: Client[] }>(`/api/clients${search.size ? `?${search}` : ""}`);
      setClients(data.clients);
    } finally {
      setLoading(false);
    }
  }

  async function detail(id: string) {
    const data = await api<{ client: Client }>(`/api/clients/${id}`);
    setSelected(data.client);
  }

  useEffect(() => {
    const timer = setTimeout(() => void load(), query ? 250 : 0);
    return () => clearTimeout(timer);
  }, [collectorId, query, refreshKey]);
  useEffect(() => { if (initialId) void detail(initialId).catch(() => setSelected(null)); }, [initialId, refreshKey]);
  useEffect(() => {
    if (!initialId && selected?.id) void detail(selected.id).catch(() => setSelected(null));
  }, [initialId, refreshKey, selected?.id]);
  useEffect(() => { if (canOperate) void api<{ zones: Zone[] }>("/api/zones").then((data) => setZones(data.zones)); }, [canOperate, refreshKey]);
  useEffect(() => {
    if (user.role === "MASTER") void api<{ collectors: Collector[] }>("/api/collectors").then((data) => setCollectorOptions(data.collectors));
  }, [refreshKey, user.role]);
  useEffect(() => {
    if (!canOperate || step !== 3 || !principal || Number(principal) <= 0 || !disbursedAt) {
      setPreview(null);
      return;
    }
    const timer = setTimeout(() => {
      void api<CreditPreview>("/api/credits/preview", {
        method: "POST",
        body: JSON.stringify({ principal, microinsurance, advancePayment: advancePayment || undefined, disbursedAt }),
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
  }, [advancePayment, canOperate, disbursedAt, microinsurance, principal, step]);

  const filtered = useMemo(() => clients, [clients]);

  function resetOnboarding() {
    setCreateOpen(false);
    setStep(1);
    setLocation(null);
    setIdentityFiles([]);
    setBusinessPhotos([]);
    setBusinessVideos([]);
    setPrincipal("");
    setMicroinsurance("0.00");
    setAdvancePayment("");
    setPreview(null);
    setPreviewError("");
    setOnboardingClientId("");
    setOnboardingDocumentsReady(false);
    setClientDraft(null);
    setDisbursedAt(todayInput());
    setCreditNotes("");
  }

  async function locate(setter: (value: LiveLocation) => void) {
    setLocating(true);
    try {
      const value = await captureLiveLocation();
      setter(value);
      toast.success(`Ubicación guardada con ${Math.round(value.locationAccuracyMeters)} m de precisión`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "No se pudo obtener la ubicación");
    } finally {
      setLocating(false);
    }
  }

  function validateFirstStep(form: HTMLFormElement) {
    const names = ["name", "documentNumber", "phone", "businessName", "zoneId"];
    const invalid = names.map((name) => form.elements.namedItem(name)).find((field) => field instanceof HTMLInputElement || field instanceof HTMLSelectElement ? !field.reportValidity() : false);
    if (invalid) return;
    const data = new FormData(form);
    setClientDraft({
      name: String(data.get("name") ?? ""), documentNumber: String(data.get("documentNumber") ?? ""), phone: String(data.get("phone") ?? ""),
      alternatePhone: String(data.get("alternatePhone") ?? ""), businessName: String(data.get("businessName") ?? ""), businessType: String(data.get("businessType") ?? ""),
      zoneId: String(data.get("zoneId") ?? ""), address: String(data.get("address") ?? ""), locationNotes: String(data.get("locationNotes") ?? ""),
      reference: String(data.get("reference") ?? ""), notes: String(data.get("notes") ?? ""),
    });
    setStep(2);
  }

  function validateEvidenceStep() {
    if (!location) return toast.error("Captura la ubicación GPS actual del cliente");
    if (!identityFiles.length) return toast.error("Adjunta el DNI o documento del cliente");
    if (!businessPhotos.length) return toast.error("Adjunta al menos una foto del negocio");
    if (!businessVideos.length) return toast.error("Adjunta al menos un vídeo del negocio");
    setStep(3);
  }

  async function create(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!clientDraft) { setStep(1); return toast.error("Revisa y confirma primero los datos del cliente"); }
    if (!location || !preview || previewError) return toast.error(previewError || "Completa el cálculo del crédito");
    setSaving(true);
    try {
      let clientId = onboardingClientId;
      if (!clientId) {
        const data = await api<{ client: { id: string } }>("/api/clients", {
          method: "POST",
          body: JSON.stringify({
            ...clientDraft,
            alternatePhone: clientDraft.alternatePhone || null,
            businessType: clientDraft.businessType || null,
            address: clientDraft.address || null,
            locationNotes: clientDraft.locationNotes || null,
            reference: clientDraft.reference || null,
            notes: clientDraft.notes || null,
            ...location,
          }),
        });
        clientId = data.client.id;
        setOnboardingClientId(clientId);
      }

      if (!onboardingDocumentsReady) {
        await uploadDocuments(clientId, "CLIENT_ID", identityFiles);
        await uploadDocuments(clientId, "BUSINESS", [...businessPhotos, ...businessVideos]);
        setOnboardingDocumentsReady(true);
      }

      await api("/api/credits", {
        method: "POST",
        body: JSON.stringify({
          clientId,
          principal,
          microinsurance,
          advancePayment,
          disbursedAt,
          notes: creditNotes || null,
        }),
      });
      toast.success("Cliente, documentos, ubicación y crédito creados correctamente");
      resetOnboarding();
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "No se pudo completar el alta");
    } finally {
      setSaving(false);
    }
  }

  async function upload(event: React.ChangeEvent<HTMLInputElement>, client: Client, category: string) {
    const files = Array.from(event.target.files ?? []);
    if (!files.length) return;
    try {
      await uploadDocuments(client.id, category, files);
      toast.success(`${files.length} archivo(s) subidos`);
      await detail(client.id);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Error al subir");
    } finally {
      event.target.value = "";
    }
  }

  async function updateLocation(client: Client) {
    await locate(async (freshLocation) => {
      try {
        await api(`/api/clients/${client.id}`, { method: "PATCH", body: JSON.stringify(freshLocation) });
        await detail(client.id);
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "No se pudo guardar la ubicación");
      }
    });
  }

  async function deleteClient(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!deleteTarget || deleteConfirmation !== deleteTarget.code) return;
    setDeleting(true);
    try {
      const result = await api<{ assetsPendingCleanup: boolean }>(`/api/clients/${deleteTarget.id}`, {
        method: "DELETE",
        body: JSON.stringify({ confirmation: deleteConfirmation }),
      });
      setClients((items) => items.filter((item) => item.id !== deleteTarget.id));
      setDeleteTarget(null);
      setDeleteConfirmation("");
      toast.success(result.assetsPendingCleanup ? "Cliente eliminado; los archivos externos quedaron en cola de limpieza" : "Cliente eliminado definitivamente");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "No se pudo eliminar el cliente");
    } finally {
      setDeleting(false);
    }
  }

  if (loading && !clients.length) return <LoadingState />;
  return <div className="page-stack">
    <div className="toolbar"><div className="search-box"><Search /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Nombre, DNI, negocio o teléfono…" /></div>{user.role === "MASTER" && <label className="collector-search-filter"><span>Cobrador</span><select value={collectorId} onChange={(event) => { const next = new URLSearchParams(params.toString()); if (event.target.value) next.set("collectorId", event.target.value); else next.delete("collectorId"); setSelected(null); router.replace(`/app/clientes${next.size ? `?${next}` : ""}`); }}><option value="">Todos mis cobradores</option>{collectorOptions.map((collector) => <option key={collector.id} value={collector.id}>{collector.name} · {collector.zone?.name || "Sin zona"}</option>)}</select></label>}{canOperate && <button className="primary-button" onClick={() => setCreateOpen(true)}><Plus />Nuevo cliente</button>}</div>
    <div className="client-grid">{filtered.map((client) => <article className="client-card" key={client.id}><button className="card-main" onClick={() => void detail(client.id)}><div className="client-top"><span className="customer-avatar">{client.name.slice(0, 2).toUpperCase()}</span><div><h3>{client.name}</h3><p>{client.code}</p></div><i className={`risk-dot ${client.riskStatus.toLowerCase()}`}></i></div><div className="client-info"><span><Building2 />{client.businessName || "Negocio sin registrar"}</span><span><MapPin />{client.zone?.name || client.address || "Zona sin asignar"}</span><span><Phone />{client.phone || "Sin teléfono"}</span></div></button><footer><div><small>Saldo activo</small><strong>{currency.money(client.credits.reduce((sum, credit) => sum + credit.balanceCents, 0))}</strong></div><span>{client.credits.length} crédito{client.credits.length === 1 ? "" : "s"} activo{client.credits.length === 1 ? "" : "s"}</span></footer></article>)}</div>
    {!filtered.length && <EmptyState icon={<ContactRound />} title="No encontramos clientes" text={canOperate ? "Prueba otro término o crea el primer cliente." : "Prueba con otro término de búsqueda."} action={canOperate ? <button className="primary-button" onClick={() => setCreateOpen(true)}><Plus />Crear cliente</button> : undefined} />}

    {createOpen && canOperate && <Modal title="Nuevo cliente" subtitle={`Paso ${step} de 3 · ${step === 1 ? "Datos y zona" : step === 2 ? "Documentos y ubicación" : "Crédito inicial"}`} onClose={resetOnboarding} wide><form className="modal-form" onSubmit={create} noValidate>
      <div className="wizard-progress"><i className="done">1</i><span className={step >= 2 ? "done" : ""}></span><i className={step >= 2 ? "done" : ""}>2</i><span className={step >= 3 ? "done" : ""}></span><i className={step >= 3 ? "done" : ""}>3</i></div>
      <section className={step === 1 ? "wizard-step form-grid" : "wizard-step hidden"}>
        <label className="field span-2"><span>Nombre completo *</span><input name="name" required minLength={3} autoFocus /></label>
        <label className="field"><span>DNI / documento *</span><input name="documentNumber" required minLength={5} /></label>
        <label className="field"><span>Teléfono *</span><input name="phone" inputMode="tel" required /></label>
        <label className="field"><span>Teléfono alternativo</span><input name="alternatePhone" inputMode="tel" /></label>
        <label className="field"><span>Nombre del negocio *</span><input name="businessName" required /></label>
        <label className="field"><span>Tipo de negocio</span><input name="businessType" placeholder="Bodega, mercado, taller…" /></label>
        <label className="field"><span>Zona de trabajo actual *</span><select name="zoneId" required><option value="">Selecciona una zona</option>{zones.map((zone) => <option key={zone.id} value={zone.id}>{zone.name}</option>)}</select></label>
        <label className="field span-2"><span>Dirección</span><input name="address" /></label>
        <label className="field span-2"><span>Indicaciones de ubicación</span><textarea name="locationNotes" placeholder="Referencia para encontrar el negocio" /></label>
        <label className="field span-2"><span>Referencia personal/comercial</span><input name="reference" /></label>
        <label className="field span-2"><span>Observaciones</span><textarea name="notes" /></label>
        <div className="form-actions span-2"><button type="button" className="secondary-button" onClick={resetOnboarding}>Cancelar</button><button type="button" className="primary-button" onClick={(event) => validateFirstStep(event.currentTarget.form!)}>Siguiente: documentos</button></div>
      </section>

      <section className={step === 2 ? "wizard-step evidence-grid" : "wizard-step hidden"}>
        <button type="button" className={`location-capture ${location ? "captured" : ""}`} onClick={() => void locate(setLocation)} disabled={locating}><LocateFixed /><span><strong>{location ? "Ubicación GPS capturada" : "Capturar ubicación en tiempo real *"}</strong><small>{location ? `${location.latitude.toFixed(6)}, ${location.longitude.toFixed(6)} · precisión ${Math.round(location.locationAccuracyMeters)} m` : "Usaremos la posición actual del dispositivo"}</small></span>{location && <CheckCircle2 />}</button>
        <label className="upload-drop"><FileBadge /><strong>DNI / documento *</strong><span>Foto o PDF legible</span><input type="file" accept="image/*,application/pdf" multiple onChange={(event) => setIdentityFiles(Array.from(event.target.files ?? []))} />{identityFiles.length > 0 && <b>{identityFiles.length} archivo(s)</b>}</label>
        <label className="upload-drop"><Camera /><strong>Fotos del negocio *</strong><span>Fachada, interior y actividad</span><input type="file" accept="image/*" multiple onChange={(event) => setBusinessPhotos(Array.from(event.target.files ?? []))} />{businessPhotos.length > 0 && <b>{businessPhotos.length} foto(s)</b>}</label>
        <label className="upload-drop"><Video /><strong>Vídeo del negocio *</strong><span>Al menos un vídeo actual</span><input type="file" accept="video/*" multiple onChange={(event) => setBusinessVideos(Array.from(event.target.files ?? []))} />{businessVideos.length > 0 && <b>{businessVideos.length} vídeo(s)</b>}</label>
        <div className="form-actions"><button type="button" className="secondary-button" onClick={() => setStep(1)}>Atrás</button><button type="button" className="primary-button" onClick={validateEvidenceStep}>Siguiente: crédito</button></div>
      </section>

      <section className={step === 3 ? "wizard-step form-grid" : "wizard-step hidden"}>
        <label className="field"><span>Valor del préstamo (S/) *</span><input type="number" min="1" step="0.01" value={principal} onChange={(event) => setPrincipal(event.target.value)} required /></label>
        <label className="field"><span>Microseguro pagado (S/)</span><input type="number" min="0" step="0.01" value={microinsurance} onChange={(event) => setMicroinsurance(event.target.value)} required /></label>
        <label className="field"><span>Primera cuota pagada (S/) *</span><input type="number" min={preview ? preview.minimumAdvancePaymentCents / 100 : 0.01} step="0.01" value={advancePayment} onChange={(event) => setAdvancePayment(event.target.value)} required /></label>
        <label className="field"><span>Fecha de desembolso</span><input type="date" value={disbursedAt} onChange={(event) => setDisbursedAt(event.target.value)} required /></label>
        {preview && <div className="loan-preview span-2"><div><span>Total a pagar</span><strong>{currency.money(preview.totalDueCents)}</strong></div><div><span>24 cuotas desde</span><strong>{currency.money(preview.minimumAdvancePaymentCents)}</strong></div><div><span>Pago inicial</span><strong>{currency.money(preview.advancePaymentCents)}</strong></div><div><span>Efectivo entregado</span><strong>{currency.money(preview.cashDeliveredCents)}</strong></div></div>}
        {previewError && <p className="form-error span-2">{previewError}</p>}
        <label className="field span-2"><span>Observaciones del crédito</span><textarea value={creditNotes} onChange={(event) => setCreditNotes(event.target.value)} /></label>
        <div className="form-actions span-2"><button type="button" className="secondary-button" onClick={() => setStep(2)}>Atrás</button><button type="submit" className="primary-button" disabled={saving}>{saving ? "Creando expediente…" : "Crear cliente y desembolsar"}</button></div>
      </section>
    </form></Modal>}

    {selected && <Modal title={selected.name} subtitle={`${selected.code} · ${selected.businessName || "Cliente"}`} onClose={() => setSelected(null)} wide><div className="client-detail">
      <div className="detail-summary"><span className="large-avatar">{selected.name.slice(0, 2).toUpperCase()}</span><div><h3>{selected.businessName || "Negocio sin registrar"}</h3><p><Phone /> {selected.phone || "Sin teléfono"}</p><p><MapPin /> {selected.address || selected.zone?.name || "Sin dirección"}</p><p><FileBadge /> DNI: {selected.documentNumber || "Sin registrar"}</p></div>{canOperate && <button className="upload-button" onClick={() => void updateLocation(selected)} disabled={locating}><LocateFixed />{locating ? "Localizando…" : "Actualizar GPS"}</button>}</div>
      {selected.latitude != null && selected.longitude != null ? <a className="saved-location" href={mapsUrl(selected.latitude, selected.longitude)} target="_blank" rel="noreferrer"><MapPin /><span><strong>Ubicación en tiempo real guardada</strong><small>{selected.latitude.toFixed(6)}, {selected.longitude.toFixed(6)}{selected.locationAccuracyMeters ? ` · precisión ${Math.round(selected.locationAccuracyMeters)} m` : ""}{selected.locationCapturedAt ? ` · ${dateTime(selected.locationCapturedAt)}` : ""}</small></span><strong>Abrir mapa</strong></a> : <div className="warning-box"><MapPin /><span>Este cliente todavía no tiene una ubicación GPS guardada.</span></div>}
      <div className="detail-kpis"><div><span>Saldo pendiente</span><strong>{currency.money(selected.credits.reduce((sum, credit) => sum + credit.balanceCents, 0))}</strong></div><div><span>Créditos</span><strong>{selected.credits.length}</strong></div><div><span>Riesgo</span><strong>{selected.riskStatus}</strong></div></div>
      {canOperate && <div className="document-actions"><label className="secondary-button file-label"><FileBadge />Actualizar DNI<input type="file" accept="image/*,application/pdf" multiple onChange={(event) => void upload(event, selected, "CLIENT_ID")} /></label><label className="secondary-button file-label"><Camera />Fotos/vídeos<input type="file" accept="image/*,video/*" multiple onChange={(event) => void upload(event, selected, "BUSINESS")} /></label></div>}
      <section className="detail-section"><h3><CreditCard />Historial de créditos</h3>{selected.credits.length ? selected.credits.map((credit) => <div className="credit-row" key={credit.id}><div><strong>{credit.code}</strong><span>{shortDate(credit.disbursedAt)} · {credit.status}</span></div><div><small>Capital</small><strong>{currency.money(credit.principalCents)}</strong></div><div><small>Saldo</small><strong>{currency.money(credit.balanceCents)}</strong></div>{canOperate && ["ACTIVE", "OVERDUE"].includes(credit.status) && <button className="renew-inline" onClick={() => router.push(`/app/creditos/${credit.id}?action=renew`)}><RefreshCw />Renovar</button>}</div>) : <p className="muted-box">Aún no tiene créditos.</p>}</section>
      <section className="detail-section"><h3><Upload />Documentación y evidencias</h3>{selected.documents?.length ? selected.documents.map((document) => <a className="document-row" key={document.id} href={`/api/documents/${document.id}`} target="_blank"><span><strong>{document.label || document.fileName}</strong><small>{document.fileName}</small></span><small>{dateTime(document.createdAt)}</small></a>) : <p className="muted-box">No hay archivos cargados.</p>}</section>
      <section className="detail-section"><h3>Actividad visible para administración</h3>{selected.activities?.map((activity) => <div className="timeline-row" key={activity.id}><i></i><div><strong>{activity.title}</strong><span>{activity.description || activity.actor?.name || "Sistema"} · {dateTime(activity.createdAt)}</span></div></div>)}</section>
      {user.role === "MASTER" && <div className="danger-zone admin-delete-zone"><AlertTriangle /><div><strong>Eliminar cliente</strong><span>Disponible solo si sus movimientos todavía no forman parte de un cierre diario.</span></div><button className="danger-button" onClick={() => { setDeleteTarget(selected); setDeleteConfirmation(""); setSelected(null); }}><Trash2 />Eliminar</button></div>}
    </div></Modal>}

    {deleteTarget && <Modal title="Eliminar cliente definitivamente" subtitle={`${deleteTarget.name} · ${deleteTarget.code}`} onClose={() => { if (!deleting) { setDeleteTarget(null); setDeleteConfirmation(""); } }}><form className="modal-form" onSubmit={deleteClient}>
      <div className="warning-box"><AlertTriangle /><span>Se borrarán el cliente, sus créditos, pagos, movimientos sin cerrar y documentos. Esta acción no se puede deshacer.</span></div>
      <label className="field"><span>Escribe <strong>{deleteTarget.code}</strong> para confirmar</span><input value={deleteConfirmation} onChange={(event) => setDeleteConfirmation(event.target.value)} autoFocus autoComplete="off" /></label>
      <div className="form-actions"><button type="button" className="secondary-button" onClick={() => { setDeleteTarget(null); setDeleteConfirmation(""); }} disabled={deleting}>Cancelar</button><button className="danger-button" disabled={deleting || deleteConfirmation !== deleteTarget.code}>{deleting ? "Eliminando…" : "Eliminar definitivamente"}</button></div>
    </form></Modal>}
  </div>;
}

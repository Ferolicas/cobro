"use client";

import { useEffect, useMemo, useState } from "react";
import { Check, CircleDollarSign, FileUp, MapPin, Phone, Search, UserX, WalletCards } from "lucide-react";
import { toast } from "sonner";
import { mapsUrl } from "@/components/crm/location";
import { EmptyState, LoadingState, Modal } from "@/components/crm/Modal";
import type { Credit, StoredDocument } from "@/components/crm/types";
import { api } from "@/components/crm/utils";

type Currency = { money: (cents: number) => string };

export function TodayView({ currency, refreshKey }: { currency: Currency; refreshKey: number }) {
  const [credits, setCredits] = useState<Credit[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<Credit | null>(null);
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState("CASH");
  const [note, setNote] = useState("");
  const [proofs, setProofs] = useState<File[]>([]);
  const [saving, setSaving] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const data = await api<{ credits: Credit[] }>("/api/credits?status=ALL");
      setCredits(data.credits.filter((credit) => ["ACTIVE", "OVERDUE"].includes(credit.status) && (credit.dueTodayCents > 0 || credit.daysRemaining < 0)));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, [refreshKey]);

  const filtered = useMemo(() => credits
    .filter((credit) => `${credit.client.name} ${credit.client.businessName ?? ""} ${credit.client.phone ?? ""}`.toLowerCase().includes(query.toLowerCase()))
    .sort((a, b) => Number(a.noPaymentToday) - Number(b.noPaymentToday) || a.daysRemaining - b.daysRemaining), [credits, query]);

  function open(credit: Credit) {
    setSelected(credit);
    setAmount((credit.dueTodayCents / 100).toFixed(2));
    setMethod("CASH");
    setNote("");
    setProofs([]);
  }

  async function uploadProofs(credit: Credit) {
    if (method === "CASH") return [];
    if (!proofs.length) throw new Error("Adjunta el justificante obligatorio de Yape o transferencia");
    const form = new FormData();
    proofs.forEach((file) => form.append("files", file));
    form.append("category", method === "YAPE" ? "PAYMENT_YAPE" : "PAYMENT_TRANSFER");
    form.append("creditId", credit.id);
    const result = await api<{ documents: StoredDocument[] }>("/api/uploads", { method: "POST", body: form });
    return result.documents.map((document) => document.id);
  }

  async function pay(event: React.FormEvent) {
    event.preventDefault();
    if (!selected) return;
    setSaving(true);
    try {
      const proofDocumentIds = await uploadProofs(selected);
      await api(`/api/credits/${selected.id}/payments`, {
        method: "POST",
        body: JSON.stringify({ amount: Number(amount), method, note: note || null, proofDocumentIds }),
      });
      toast.success("Pago guardado y saldo actualizado");
      setSelected(null);
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "No se pudo guardar");
    } finally {
      setSaving(false);
    }
  }

  async function noPayment() {
    if (!selected) return;
    setSaving(true);
    try {
      await api(`/api/credits/${selected.id}/no-payment`, {
        method: "POST",
        body: JSON.stringify({ note: note || null }),
      });
      setCredits((items) => items.map((item) => item.id === selected.id ? { ...item, noPaymentToday: true } : item));
      setSelected(null);
      toast.success("Visita sin pago registrada y enviada al maestro");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "No se pudo registrar la visita");
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <LoadingState />;
  const pendingVisits = filtered.filter((credit) => !credit.noPaymentToday).length;

  return <div className="page-stack">
    <section className="route-summary"><div><p>COBRO ESPERADO HOY</p><h2>{currency.money(filtered.reduce((sum, credit) => sum + credit.dueTodayCents, 0))}</h2><span>{pendingVisits} visitas pendientes · {filtered.length - pendingVisits} sin pago</span></div><WalletCards /></section>
    <div className="toolbar"><div className="search-box"><Search /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar en mi ruta…" /></div><span className="result-count">{filtered.length} clientes</span></div>
    {filtered.length ? <div className="collection-list">{filtered.map((credit, index) => <article key={credit.id} className={`${credit.daysRemaining < 0 ? "overdue" : ""} ${credit.noPaymentToday ? "no-payment" : ""}`}>
      <div className="route-number">{index + 1}</div>
      <div className="customer-main"><span className="customer-avatar">{credit.client.name.slice(0, 2).toUpperCase()}</span><div><h3>{credit.client.name}</h3><p><MapPin /> {credit.client.businessName || "Negocio sin nombre"}</p>{credit.client.phone && <a href={`tel:${credit.client.phone}`}><Phone /> {credit.client.phone}</a>}{credit.client.latitude != null && credit.client.longitude != null && <a href={mapsUrl(credit.client.latitude, credit.client.longitude)} target="_blank" rel="noreferrer"><MapPin /> Abrir ubicación GPS</a>}</div></div>
      <div className="collection-status"><span>{credit.noPaymentToday ? "NO PAGÓ HOY" : credit.daysRemaining < 0 ? "VENCIDO" : "POR COBRAR"}</span><strong>{currency.money(credit.dueTodayCents)}</strong><small>Cuota {credit.currentInstallmentNumber} de {credit.installmentCount} · {credit.paidInstallmentsCount} pagadas</small><small>Saldo: {currency.money(credit.balanceCents)}</small></div>
      <button className="pay-button" onClick={() => open(credit)}><CircleDollarSign />Registrar pago</button>
    </article>)}</div> : <EmptyState icon={<Check />} title="Ruta completada" text="No quedan pagos exigibles para hoy." />}

    {selected && <Modal title="Registrar pago" subtitle={`${selected.client.name} · cuota ${selected.currentInstallmentNumber} de ${selected.installmentCount}`} onClose={() => setSelected(null)}><form className="modal-form" onSubmit={pay}>
      <div className="amount-hero"><span>Importe sugerido</span><strong>{currency.money(selected.dueTodayCents)}</strong><small>Saldo total {currency.money(selected.balanceCents)} · {selected.paidInstallmentsCount} cuotas pagadas</small></div>
      <label className="field"><span>Importe recibido (S/)</span><input type="number" min="0.01" max={selected.balanceCents / 100} step="0.01" value={amount} onChange={(event) => setAmount(event.target.value)} required autoFocus /></label>
      <div className="method-grid">{[["CASH", "Efectivo"], ["YAPE", "Yape"], ["TRANSFER", "Transferencia"]].map(([id, label]) => <button type="button" key={id} className={method === id ? "active" : ""} onClick={() => { setMethod(id); setProofs([]); }}>{label}</button>)}</div>
      {method !== "CASH" && <label className="upload-drop required-proof"><FileUp /><strong>Justificante obligatorio</strong><span>{method === "YAPE" ? "Se guardará como Yape 1, Yape 2…" : "Se guardará como Transferencia 1, 2…"}</span><input type="file" accept="image/*,application/pdf" multiple required onChange={(event) => setProofs(Array.from(event.target.files ?? []))} />{proofs.length > 0 && <b>{proofs.length} justificante(s) listo(s)</b>}</label>}
      <label className="field"><span>Nota de la visita</span><textarea value={note} onChange={(event) => setNote(event.target.value)} placeholder="Observación opcional o motivo del no pago" /></label>
      <div className="form-actions payment-actions"><button type="button" className="secondary-button no-pay-button" onClick={() => void noPayment()} disabled={saving}><UserX />No pagó</button><button className="primary-button" disabled={saving}>{saving ? "Guardando…" : "Confirmar pago"}</button></div>
    </form></Modal>}
  </div>;
}

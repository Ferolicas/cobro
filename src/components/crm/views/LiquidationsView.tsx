"use client";

import { useEffect, useMemo, useState } from "react";
import { Calculator, CheckCircle2, Eye, FileImage, History, LockKeyhole, RefreshCw, Upload } from "lucide-react";
import { toast } from "sonner";
import { LoadingState } from "@/components/crm/Modal";
import type { AppUser, Collector, Liquidation, LiquidationSummary } from "@/components/crm/types";
import { api, shortDate, todayInput } from "@/components/crm/utils";

type Currency = { money: (cents: number) => string };

function centsInput(cents?: number) {
  return ((cents ?? 0) / 100).toFixed(2);
}

export function LiquidationsView({ user, currency, refreshKey }: { user: AppUser; currency: Currency; refreshKey: number }) {
  const isMaster = user.role === "MASTER";
  const [date, setDate] = useState(todayInput());
  const [collectorId, setCollectorId] = useState(isMaster ? "" : user.id);
  const [collectors, setCollectors] = useState<Collector[]>([]);
  const [summary, setSummary] = useState<LiquidationSummary | null>(null);
  const [history, setHistory] = useState<Liquidation[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [files, setFiles] = useState<File[]>([]);
  const [openingBase, setOpeningBase] = useState("0.00");
  const [expenses, setExpenses] = useState("0.00");
  const [withdrawal, setWithdrawal] = useState("0.00");
  const [closingCash, setClosingCash] = useState("");
  const [notes, setNotes] = useState("");

  const selectedClose = useMemo(
    () => history.find((item) => item.date.slice(0, 10) === date) ?? null,
    [date, history],
  );

  useEffect(() => {
    if (!isMaster) return;
    void api<{ collectors: Collector[] }>("/api/collectors").then((data) => {
      const active = data.collectors.filter((collector) => collector.active);
      setCollectors(active);
      setCollectorId((current) => current || active[0]?.id || "");
    });
  }, [isMaster]);

  async function load() {
    const id = isMaster ? collectorId : user.id;
    if (!id) {
      setSummary(null);
      setHistory([]);
      return;
    }
    setLoading(true);
    try {
      const data = await api<{ liquidations: Liquidation[]; summary: LiquidationSummary }>(`/api/liquidations?date=${date}&collectorId=${id}`);
      setHistory(data.liquidations);
      setSummary(data.summary);
      const close = data.liquidations.find((item) => item.date.slice(0, 10) === date);
      setOpeningBase(centsInput(data.summary.openingBaseCents));
      setExpenses(centsInput(data.summary.expensesCents));
      setWithdrawal(centsInput(data.summary.collectorWithdrawalCents));
      setClosingCash(close ? centsInput(close.closingCashCents) : "");
      setNotes(close?.notes ?? "");
      setFiles([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, [collectorId, date, refreshKey, isMaster, user.id]);

  const expectedClosingCents = useMemo(() => {
    if (!summary) return 0;
    return Math.round(Number(openingBase || 0) * 100) + summary.collectedCashCents - summary.cashOutCents - Math.round(Number(expenses || 0) * 100) - Math.round(Number(withdrawal || 0) * 100);
  }, [expenses, openingBase, summary, withdrawal]);
  const declaredClosingCents = Math.round(Number(closingCash || 0) * 100);
  const differenceCents = declaredClosingCents - expectedClosingCents;

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    try {
      const data = await api<{ liquidation: Liquidation }>("/api/liquidations", {
        method: "POST",
        body: JSON.stringify({ date, openingBase, expenses, collectorWithdrawal: withdrawal, closingCash, notes }),
      });
      if (files.length) {
        const upload = new FormData();
        files.forEach((file) => upload.append("files", file));
        upload.append("category", "YAPE");
        upload.append("liquidationId", data.liquidation.id);
        await api("/api/uploads", { method: "POST", body: upload });
      }
      toast.success("Cierre automático confirmado y enviado al maestro");
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "No se pudo guardar");
    } finally {
      setSaving(false);
    }
  }

  return <div className="liquidation-layout">
    <section className="liquidation-form-card">
      <header><span><Calculator /></span><div><h3>{isMaster ? "Control automático de jornada" : "Cierre automático de jornada"}</h3><p>{isMaster ? "Todas las cifras provienen de la actividad registrada por el cobrador." : "Cobros, préstamos, cuotas y microseguro se calculan solos."}</p></div></header>
      <div className={`automatic-banner ${isMaster ? "master" : ""}`}>{isMaster ? <Eye /> : <RefreshCw />}<div><strong>{isMaster ? "Vista administrativa · solo lectura" : "Liquidación conectada a tus movimientos"}</strong><span>{isMaster ? "Puedes revisar todo, pero únicamente el cobrador confirma su jornada." : "No necesitas volver a escribir cobros, préstamos ni clientes."}</span></div>{isMaster && <LockKeyhole />}</div>
      <div className="liquidation-filters">{isMaster && <label className="field"><span>Cobrador</span><select value={collectorId} onChange={(event) => setCollectorId(event.target.value)}><option value="">Selecciona un cobrador</option>{collectors.map((collector) => <option value={collector.id} key={collector.id}>{collector.name}</option>)}</select></label>}<label className="field"><span>Fecha de la jornada</span><input type="date" max={todayInput()} value={date} onChange={(event) => setDate(event.target.value)} /></label></div>

      {loading ? <LoadingState /> : summary ? <>
        <div className="system-values expanded"><div><span>Cobro total</span><strong>{currency.money(summary.totalCollectedCents)}</strong></div><div><span>En efectivo</span><strong>{currency.money(summary.collectedCashCents)}</strong></div><div><span>Yape / transferencia</span><strong>{currency.money(summary.collectedDigitalCents)}</strong></div><div><span>Capital prestado</span><strong>{currency.money(summary.disbursedCents)}</strong></div><div><span>Efectivo entregado</span><strong>{currency.money(summary.cashOutCents)}</strong></div><div><span>Microseguro</span><strong>{currency.money(summary.microinsuranceCents)}</strong></div><div><span>Primera cuota retenida</span><strong>{currency.money(summary.advancePaymentCents)}</strong></div><div><span>Saldo renovado</span><strong>{currency.money(summary.renewalSettlementCents)}</strong></div></div>
        <div className="automatic-stats"><span><strong>{summary.movementCount}</strong> movimientos</span><span><strong>{summary.newClientsCount}</strong> clientes nuevos</span><span><strong>{summary.totalAssignedClients}</strong> clientes totales</span><span><strong>{summary.overdue30Count}</strong> con más de 30 días</span><span><strong>{summary.zeroBalanceCount}</strong> cerrados hoy</span></div>

        {isMaster ? <div className="master-liquidation-review">{selectedClose ? <><div className="review-status success"><CheckCircle2 /><div><strong>Cierre confirmado por {selectedClose.collector.name}</strong><span>{shortDate(selectedClose.date)}</span></div></div><div className="detail-kpis four"><div><span>Base inicial</span><strong>{currency.money(selectedClose.openingBaseCents)}</strong></div><div><span>Caja esperada</span><strong>{currency.money(selectedClose.expectedClosingCents)}</strong></div><div><span>Caja declarada</span><strong>{currency.money(selectedClose.closingCashCents)}</strong></div><div><span>Diferencia</span><strong className={selectedClose.differenceCents === 0 ? "success-text" : "danger-text"}>{currency.money(selectedClose.differenceCents)}</strong></div></div>{selectedClose.notes && <p className="liquidation-note"><strong>Nota del cobrador:</strong> {selectedClose.notes}</p>}{selectedClose.documents?.length ? <div className="detail-section"><h3><FileImage />Comprobantes</h3>{selectedClose.documents.map((document) => <a className="document-row" key={document.id} href={`/api/documents/${document.id}`} target="_blank"><span>{document.fileName}</span><small>Ver archivo</small></a>)}</div> : null}</> : <div className="review-status pending"><History /><div><strong>Jornada todavía sin confirmar</strong><span>La vista automática ya está disponible; falta el conteo final del cobrador.</span></div></div>}</div> :
          <form className="liquidation-form" onSubmit={submit}>
            <div className="form-grid">
              <label className="field"><span>Base inicial (S/)</span><input type="number" min="0" step="0.01" value={openingBase} onChange={(event) => setOpeningBase(event.target.value)} required /></label>
              <div className="field-help"><strong>{summary.previousClosingCents == null ? "Primera base" : "Base recuperada"}</strong><span>{summary.previousClosingCents == null ? "Indica el dinero con el que inició la ruta." : `Viene del cierre anterior: ${currency.money(summary.previousClosingCents)}`}</span></div>
              <label className="field"><span>Gastos del día (S/)</span><input type="number" min="0" step="0.01" value={expenses} onChange={(event) => setExpenses(event.target.value)} required /></label>
              <label className="field"><span>Retiro del cobrador (S/)</span><input type="number" min="0" step="0.01" value={withdrawal} onChange={(event) => setWithdrawal(event.target.value)} required /></label>
            </div>
            <div className="cash-reconciliation"><div><span>Caja esperada automáticamente</span><strong>{currency.money(expectedClosingCents)}</strong><small>Base + cobro efectivo − efectivo entregado − gastos − retiro</small></div><label className="field"><span>Caja real contada (S/)</span><input type="number" min="0" step="0.01" value={closingCash} onChange={(event) => setClosingCash(event.target.value)} required /></label><div className={differenceCents === 0 ? "cash-difference balanced" : "cash-difference"}><span>Diferencia</span><strong>{closingCash ? currency.money(differenceCents) : "—"}</strong></div></div>
            <label className="field"><span>Notas de la jornada</span><textarea value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Solo si necesitas explicar un gasto o una diferencia" /></label>
            <label className="upload-drop"><Upload /><strong>Comprobantes Yape del día</strong><span>Fotos o vídeos, puedes seleccionar varios</span><input type="file" accept="image/*,video/*" multiple onChange={(event) => setFiles(Array.from(event.target.files ?? []))} />{files.length > 0 && <b>{files.length} archivo(s) listo(s)</b>}</label>
            <button className="primary-button full" disabled={saving}>{saving ? "Confirmando cierre…" : selectedClose ? "Actualizar cierre automático" : "Confirmar cierre automático"}</button>
          </form>}
      </> : <div className="muted-box">Selecciona un cobrador para revisar su jornada.</div>}
    </section>

    <aside className="liquidation-history"><header><History /><div><h3>Historial</h3><p>Últimos cierres confirmados</p></div></header>{history.length ? history.map((item) => <article key={item.id}><div><strong>{shortDate(item.date)}</strong><span>{item.collector.name}</span></div><div><small>Diferencia</small><strong className={item.differenceCents === 0 ? "success-text" : "danger-text"}>{currency.money(item.differenceCents)}</strong></div><CheckCircle2 /></article>) : <p className="muted-box"><FileImage /> Aún no hay cierres confirmados.</p>}</aside>
  </div>;
}

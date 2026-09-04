"use client";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { BarChart3, Calculator, CheckCircle2, Eye, FileImage, History, LockKeyhole, RefreshCw, ShieldCheck, Upload, UsersRound } from "lucide-react";
import { toast } from "sonner";
import { LoadingState } from "@/components/crm/Modal";
import type { AppUser, Collector, FinancialDay, FinancialOverview, Liquidation, LiquidationSummary } from "@/components/crm/types";
import { api, shortDate, todayInput } from "@/components/crm/utils";

type Currency = { money: (cents: number) => string };
type ResponseData = {
  collector: { id: string; name: string; email: string };
  liquidations: Liquidation[];
  summary: LiquidationSummary;
  overview: FinancialOverview;
};

function centsInput(cents?: number) {
  return ((cents ?? 0) / 100).toFixed(2);
}

function value(currency: Currency, cents: number | null, future = false) {
  if (future || cents == null) return "—";
  return currency.money(cents);
}

function DailyWeekCard({ day, currency }: { day: FinancialDay; currency: Currency }) {
  const rows = [
    ["BASE", day.openingBaseCents],
    ["E. COBRADOR", day.collectorWithdrawalCents],
    ["COBRADO", day.ledgerCollectedCashCents],
    ["M.S", day.microinsuranceCents],
    ["TOTAL INGRESADO", day.totalIncomeCents],
    ["PRÉSTAMOS", day.disbursedCents],
    ["GASTOS", day.expensesCents],
    ["ENTREGA ESPERADA", day.expectedClosingCents],
    ["CAJA", day.closingCashCents],
    ["DIFERENCIA", day.differenceCents],
  ] as const;
  return <article className={`excel-day-card ${day.isFuture ? "future" : ""}`}>
    <header><div><strong>{day.dayName}</strong><span>{shortDate(day.date)}</span></div><b className={`source-pill ${day.source.toLowerCase()}`}>{day.source === "EXCEL" ? "Excel" : day.source === "SUBMITTED" ? "Cerrado" : day.isFuture ? "Próximo" : "En vivo"}</b></header>
    <div className="excel-day-values">{rows.map(([label, cents]) => <div className={label === "M.S" ? "micro-row" : label === "TOTAL INGRESADO" ? "total-income-row" : label === "DIFERENCIA" ? "difference-row" : ""} key={label}><span>{label}</span><strong>{value(currency, cents, day.isFuture)}</strong></div>)}</div>
    <footer><span><UsersRound />{day.newClientsCount} clientes nuevos</span><span>Yape/transfer.: {value(currency, day.collectedDigitalCents, day.isFuture)}</span><span>{day.movementCount} movimientos</span></footer>
    {(day.notes || day.detailNotes.length > 0) && <div className="legacy-notes"><strong>Notas del registro</strong>{day.notes && <p>{day.notes}</p>}{day.detailNotes.map((note) => <p key={note}>• {note}</p>)}</div>}
  </article>;
}

function FullBalance({ overview, currency }: { overview: FinancialOverview; currency: Currency }) {
  return <div className="excel-overview-stack">
    <section className="weekly-board">
      <header className="section-title"><span><BarChart3 /></span><div><p>BALANCE DE LUNES A SÁBADO</p><h2>Control semanal completo</h2><small>La misma información del Excel, calculada y ordenada automáticamente.</small></div></header>
      <div className="excel-week-grid">{overview.days.map((day) => <DailyWeekCard day={day} currency={currency} key={day.date} />)}</div>
    </section>

    <section className="weekly-summary-card">
      <header><div><p>BALANCE SEMANAL</p><h2>Resultado de la semana</h2></div><span className="weekly-profit"><small>GANANCIA</small><strong>{currency.money(overview.weekly.profitCents)}</strong></span></header>
      <div className="weekly-summary-grid">
        <div><span>COBRADO</span><strong>{currency.money(overview.weekly.collectedBeforeMicroinsuranceCents)}</strong><small>Sin sumar el M.S</small></div>
        <div className="micro-highlight"><span>M.S</span><strong>{currency.money(overview.weekly.microinsuranceCents)}</strong><small>Microseguro acumulado</small></div>
        <div><span>TOTAL INGRESADO</span><strong>{currency.money(overview.weekly.collectedCents)}</strong><small>Cobrado + M.S</small></div>
        <div><span>% COBRADOR</span><strong>{currency.money(overview.weekly.collectionCommissionCents)}</strong><small>3% del cobro</small></div>
        <div><span>PRÉSTAMOS</span><strong>{currency.money(overview.weekly.disbursedCents)}</strong><small>Capital colocado</small></div>
        <div><span>INTERÉS</span><strong>{currency.money(overview.weekly.projectedInterestCents)}</strong><small>20% del capital</small></div>
        <div><span>GASTOS</span><strong>{currency.money(overview.weekly.expensesCents)}</strong><small>Salidas declaradas</small></div>
        <div><span>E. COBRADOR</span><strong>{currency.money(overview.weekly.collectorWithdrawalCents)}</strong><small>Entrega/retiro confirmado</small></div>
        <div><span>RESULTADO NETO</span><strong>{currency.money(overview.weekly.netResultCents)}</strong><small>Interés + M.S − gastos − 3% − retiro</small></div>
      </div>
      <div className="new-clients-week"><div><UsersRound /><span><strong>CLIENTES NUEVOS SEMANALES</strong><small>Altas registradas por cada día</small></span></div><div>{overview.days.map((day) => <span key={day.date}><small>{day.dayName.slice(0, 3)}</small><strong>{day.isFuture ? "—" : day.newClientsCount}</strong></span>)}<span className="total"><small>TOTAL</small><strong>{overview.weekly.newClientsCount}</strong></span></div></div>
    </section>

    <section className="chain-card">
      <header><div><p>BALANCE DE COBRO X 11 SEMANAS</p><h2>Cadena de resultados</h2></div><span><small>BASE DE CADENA</small><strong>{currency.money(overview.chain.initialCapitalCents)}</strong></span></header>
      <div className="chain-table"><div className="chain-head"><span>SEMANA</span><span>CADENA</span><span>FECHA</span><span>GANANCIA</span></div>{overview.chain.rows.map((row) => <div className="chain-row" key={row.week}><span>{row.week}</span><span>{row.chain}</span><span>{row.date ? shortDate(row.date) : "Pendiente"}</span><strong className={row.profitCents != null && row.profitCents < 0 ? "danger-text" : "success-text"}>{row.profitCents == null ? "—" : currency.money(row.profitCents)}</strong></div>)}<div className="chain-total"><span>TOTAL ACUMULADO</span><strong className={overview.chain.totalProfitCents < 0 ? "danger-text" : "success-text"}>{currency.money(overview.chain.totalProfitCents)}</strong></div></div>
    </section>

    {overview.undatedSnapshots.length > 0 && <section className="legacy-snapshots"><header><History /><div><h3>Registros adicionales del Excel</h3><p>El archivo no contiene una fecha para estos cuadros; se conservan sin inventarla.</p></div></header>{overview.undatedSnapshots.map((snapshot) => <article key={snapshot.label}><strong>{snapshot.label}</strong><div><span>BASE <b>{currency.money(Number(snapshot.baseCents))}</b></span><span>COBRO <b>{currency.money(Number(snapshot.collectedCents))}</b></span><span>PRESTÓ <b>{currency.money(Number(snapshot.disbursedCents))}</b></span><span>GASTOS <b>{currency.money(Number(snapshot.expensesCents))}</b></span><span>COBRADOR <b>{currency.money(Number(snapshot.collectorCents))}</b></span><span>CAJA <b>{currency.money(Number(snapshot.closingCashCents))}</b></span><span>DIFERENCIA <b>{currency.money(Number(snapshot.differenceCents))}</b></span></div></article>)}</section>}
  </div>;
}

export function LiquidationsView({ user, currency, refreshKey }: { user: AppUser; currency: Currency; refreshKey: number }) {
  const params = useSearchParams();
  const isMaster = user.role === "MASTER";
  const requestedCollectorId = params.get("collectorId") ?? "";
  const [date, setDate] = useState(params.get("date") ?? todayInput());
  const [collectorId, setCollectorId] = useState(isMaster ? requestedCollectorId : user.id);
  const [collectorName, setCollectorName] = useState("");
  const [collectors, setCollectors] = useState<Collector[]>([]);
  const [summary, setSummary] = useState<LiquidationSummary | null>(null);
  const [overview, setOverview] = useState<FinancialOverview | null>(null);
  const [history, setHistory] = useState<Liquidation[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [files, setFiles] = useState<File[]>([]);
  const [expenses, setExpenses] = useState("0.00");
  const [withdrawal, setWithdrawal] = useState("0.00");
  const [closingCash, setClosingCash] = useState("");
  const [notes, setNotes] = useState("");

  const selectedClose = useMemo(() => history.find((item) => item.date.slice(0, 10) === date) ?? null, [date, history]);

  useEffect(() => {
    if (!isMaster) return;
    void api<{ collectors: Collector[] }>("/api/collectors").then((data) => {
      const active = data.collectors.filter((collector) => collector.active);
      setCollectors(active);
      setCollectorId((current) => current || active[0]?.id || "");
    });
  }, [isMaster]);

  useEffect(() => {
    if (isMaster && requestedCollectorId) setCollectorId(requestedCollectorId);
  }, [isMaster, requestedCollectorId]);

  async function load() {
    const id = isMaster ? collectorId : user.id;
    if (!id) {
      setSummary(null); setOverview(null); setHistory([]); return;
    }
    setLoading(true);
    try {
      const data = await api<ResponseData>(`/api/liquidations?date=${date}&collectorId=${id}`);
      setCollectorName(data.collector.name);
      setHistory(data.liquidations);
      setSummary(data.summary);
      setOverview(data.overview);
      const close = data.liquidations.find((item) => item.date.slice(0, 10) === date);
      setExpenses(centsInput(data.summary.expensesCents));
      setWithdrawal(centsInput(data.summary.collectorWithdrawalCents));
      setClosingCash(close ? centsInput(close.closingCashCents) : "");
      setNotes(close?.notes ?? "");
      setFiles([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, [collectorId, date, refreshKey, isMaster, user.id]);

  const expectedClosingCents = useMemo(() => {
    if (!summary) return 0;
    return summary.openingBaseCents + summary.totalIncomeCents - summary.disbursedCents - Math.round(Number(expenses || 0) * 100) - Math.round(Number(withdrawal || 0) * 100);
  }, [expenses, summary, withdrawal]);
  const declaredClosingCents = Math.round(Number(closingCash || 0) * 100);
  const differenceCents = declaredClosingCents - expectedClosingCents;

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setSaving(true);
    try {
      const data = await api<{ liquidation: Liquidation }>("/api/liquidations", { method: "POST", body: JSON.stringify({ date, expenses, collectorWithdrawal: withdrawal, closingCash, notes }) });
      if (files.length) {
        const upload = new FormData(); files.forEach((file) => upload.append("files", file)); upload.append("category", "YAPE"); upload.append("liquidationId", data.liquidation.id);
        await api("/api/uploads", { method: "POST", body: upload });
      }
      toast.success("Cierre automático confirmado y enviado al maestro"); await load();
    } catch (error) { toast.error(error instanceof Error ? error.message : "No se pudo guardar"); }
    finally { setSaving(false); }
  }

  return <div className="page-stack">
    <div className="liquidation-layout">
      <section className="liquidation-form-card">
        <header><span><Calculator /></span><div><h3>{isMaster ? `Control completo${collectorName ? ` · ${collectorName}` : ""}` : "Cierre automático de jornada"}</h3><p>{isMaster ? "Liquidación diaria, semana y cadena del cobrador." : "Cobros, préstamos, cuotas y microseguro se calculan solos."}</p></div></header>
        <div className={`automatic-banner ${isMaster ? "master" : ""}`}>{isMaster ? <Eye /> : <RefreshCw />}<div><strong>{isMaster ? "Vista administrativa · solo lectura" : "Liquidación conectada a tus movimientos"}</strong><span>{isMaster ? "Puedes revisar todo, pero únicamente el cobrador confirma su jornada." : "No necesitas volver a escribir cobros, préstamos ni clientes."}</span></div>{isMaster && <LockKeyhole />}</div>
        <div className="liquidation-filters">{isMaster && <label className="field"><span>Cobrador</span><select value={collectorId} onChange={(event) => setCollectorId(event.target.value)}><option value="">Selecciona un cobrador</option>{collectors.map((collector) => <option value={collector.id} key={collector.id}>{collector.name}</option>)}</select></label>}<label className="field"><span>Fecha de la jornada</span><input type="date" max={todayInput()} value={date} onChange={(event) => setDate(event.target.value)} /></label></div>

        {loading ? <LoadingState /> : summary ? <>
          <div className="daily-ledger">
            <header><div><p>LIQUIDACIÓN DEL DÍA</p><h3>{collectorName || user.name}</h3></div><span className="ledger-ms"><small>TOTAL INGRESADO</small><strong>{currency.money(summary.totalIncomeCents)}</strong></span></header>
            <div className="ledger-lines">
              <div><span>BASE</span><strong>{currency.money(summary.openingBaseCents)}</strong></div>
              <div><span>E. COBRADOR</span><strong>{currency.money(Math.round(Number(withdrawal || 0) * 100))}</strong></div>
              <div><span>COBRADO</span><strong>{currency.money(summary.ledgerCollectedCashCents)}</strong></div>
              <div className="micro-row"><span>MICROSEGURO (M.S)</span><strong>{currency.money(summary.microinsuranceCents)}</strong></div>
              <div className="total-income-row"><span>TOTAL INGRESADO</span><strong>{currency.money(summary.totalIncomeCents)}</strong></div>
              <div><span>PRÉSTAMOS</span><strong>{currency.money(summary.disbursedCents)}</strong></div>
              <div><span>GASTOS</span><strong>{currency.money(Math.round(Number(expenses || 0) * 100))}</strong></div>
              <div className="delivery-row"><span>ENTREGA ESPERADA</span><strong>{currency.money(expectedClosingCents)}</strong></div>
              <div><span>CAJA</span><strong>{closingCash || selectedClose ? currency.money(declaredClosingCents) : "Por confirmar"}</strong></div>
              <div className={differenceCents === 0 && closingCash ? "balanced-row" : "difference-row"}><span>DIFERENCIA</span><strong>{closingCash || selectedClose ? currency.money(differenceCents) : "—"}</strong></div>
            </div>
            <footer><span><strong>{summary.totalAssignedClients}</strong> clientes totales</span><span><strong>{summary.newClientsCount}</strong> clientes nuevos</span><span><strong>{summary.overdue30Count}</strong> con más de 30 días</span><span><strong>{summary.zeroBalanceCount}</strong> cerrados hoy</span><span>Yape/transferencias fuera de caja: <strong>{currency.money(summary.collectedDigitalCents)}</strong></span>{summary.advancePaymentCents > 0 && <span>Primeras cuotas incluidas: <strong>{currency.money(summary.advancePaymentCents)}</strong></span>}{summary.renewalSettlementCents > 0 && <span>Liquidaciones anteriores incluidas: <strong>{currency.money(summary.renewalSettlementCents)}</strong></span>}</footer>
          </div>

          {isMaster || selectedClose?.status === "LEGACY_IMPORTED" ? <div className="master-liquidation-review">{selectedClose ? <><div className="review-status success"><CheckCircle2 /><div><strong>{selectedClose.status === "LEGACY_IMPORTED" ? "Registro preservado del Excel" : `Cierre confirmado por ${selectedClose.collector.name}`}</strong><span>{shortDate(selectedClose.date)}</span></div></div>{selectedClose.notes && <p className="liquidation-note"><strong>Nota:</strong> {selectedClose.notes}</p>}{selectedClose.documents?.length ? <div className="detail-section"><h3><FileImage />Comprobantes</h3>{selectedClose.documents.map((document) => <a className="document-row" key={document.id} href={`/api/documents/${document.id}`} target="_blank"><span>{document.fileName}</span><small>Ver archivo</small></a>)}</div> : null}</> : <div className="review-status pending"><History /><div><strong>Jornada todavía sin confirmar</strong><span>Los movimientos ya están calculados; falta el conteo final del cobrador.</span></div></div>}</div> :
            <form className="liquidation-form" onSubmit={submit}>
              <div className="form-grid"><div className="field-help"><strong>Base automática · {currency.money(summary.openingBaseCents)}</strong><span>{summary.previousClosingCents == null ? "Base inicial fija de S/30.000 para un cobrador nuevo." : `Es la caja del cierre anterior: ${currency.money(summary.previousClosingCents)}`}</span></div><label className="field"><span>Gastos del día (S/)</span><input type="number" min="0" step="0.01" value={expenses} onChange={(event) => setExpenses(event.target.value)} required /></label><label className="field"><span>E. cobrador (S/)</span><input type="number" min="0" step="0.01" value={withdrawal} onChange={(event) => setWithdrawal(event.target.value)} required /></label></div>
              <div className="cash-reconciliation"><div><span>Caja esperada automáticamente</span><strong>{currency.money(expectedClosingCents)}</strong><small>Base + cobrado + M.S − préstamos − gastos − E. cobrador</small></div><label className="field"><span>Caja real contada (S/)</span><input type="number" min="0" step="0.01" value={closingCash} onChange={(event) => setClosingCash(event.target.value)} required /></label><div className={differenceCents === 0 ? "cash-difference balanced" : "cash-difference"}><span>Diferencia</span><strong>{closingCash ? currency.money(differenceCents) : "—"}</strong></div></div>
              <label className="field"><span>Notas de la jornada</span><textarea value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Explica gastos, diferencias u observaciones" /></label>
              <label className="upload-drop"><Upload /><strong>Comprobantes Yape del día</strong><span>Fotos o vídeos, puedes seleccionar varios</span><input type="file" accept="image/*,video/*" multiple onChange={(event) => setFiles(Array.from(event.target.files ?? []))} />{files.length > 0 && <b>{files.length} archivo(s) listo(s)</b>}</label>
              <button className="primary-button full" disabled={saving}>{saving ? "Confirmando cierre…" : selectedClose ? "Actualizar cierre automático" : "Confirmar cierre automático"}</button>
            </form>}
        </> : <div className="muted-box">Selecciona un cobrador para revisar su jornada.</div>}
      </section>

      <aside className="liquidation-history"><header><History /><div><h3>Historial diario</h3><p>Cierres y registros del Excel</p></div></header>{history.length ? history.map((item) => <button key={item.id} onClick={() => setDate(item.date.slice(0, 10))}><div><strong>{shortDate(item.date)}</strong><span>{item.status === "LEGACY_IMPORTED" ? "Importado del Excel" : item.collector.name}</span></div><div><small>M.S</small><strong>{currency.money(item.microinsuranceCents)}</strong></div><div><small>Diferencia</small><strong className={item.differenceCents === 0 ? "success-text" : "danger-text"}>{currency.money(item.differenceCents)}</strong></div><CheckCircle2 /></button>) : <p className="muted-box"><FileImage /> Aún no hay cierres confirmados.</p>}</aside>
    </div>

    {overview && !loading && <FullBalance overview={overview} currency={currency} />}
    <div className="integrity-note"><ShieldCheck /><div><strong>Todos los datos del Excel están conservados</strong><span>Los registros sin fecha se muestran aparte; el sistema nunca inventa una fecha ni mezcla M.S con la deuda del cliente.</span></div></div>
  </div>;
}

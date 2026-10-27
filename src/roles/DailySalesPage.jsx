import CheckoutInbox from './CheckoutInbox.jsx';
import { SearchField } from "./owner/ui.jsx";
import { PaginatedTable } from "../components/Pagination.jsx";
import {useFollowingClinicDay} from "../useClinicDay.js";
import { useEffect, useState } from "react";
import {
  DollarSign,
  CreditCard,
  Calendar,
  Clock,
  Printer,
  ChevronLeft,
  ChevronRight,
  Coins
} from "lucide-react";
import { today } from "../booking.js";
import { paymentDate, paymentMethod, paymentTime, money } from "../assistantWorkflow.js";
import { PERIODS, DIGITAL_METHODS, periodRange, periodLabel, stepPeriod, rangeCollections, rangePendingCheckout } from "../salesPeriods.js";
import { ownerBill } from "../ownerBilling.js";
import { salesCsv, METHOD_LABELS } from "../salesCsv.js";
import { api } from "../api.js";
import BillingModal from "./BillingModal.jsx";
import "./sales-report.css";

const PERIOD_NAME = Object.fromEntries(PERIODS);
const PERIOD_NOUN = { day: "day", week: "week", month: "month", year: "year" };
const MIN_DATE = "2020-01-01";

// Which KPI card a filter belongs to, so the card and the ledger stay in step.
const activeCard = (view, method) => view === "pending" ? "pending" : method === "all" ? "total" : method === "cash" ? "cash" : method === "digital" ? "digital" : null;

function KpiCard({ id, active, onSelect, tone, title, icon, value, detail, controls }) {
  return (
    <button type="button" className={`sales-kpi sales-kpi-${tone}${active ? " is-active" : ""}`} aria-pressed={active} aria-controls={controls} onClick={() => onSelect(id)}>
      <span className="sales-kpi-head"><span>{title}</span>{icon}</span>
      <span className="sales-kpi-value">{value}</span>
      <span className="sales-kpi-detail">{detail}</span>
      <span className="sales-kpi-hint">{active ? "Showing in table below" : "Show in table"}</span>
    </button>
  );
}

export default function DailySalesPage({ db, setDb, me, go, say }) {
  const TODAY = today();
  const [selDate, setSelDate] = useFollowingClinicDay();
  const [period, setPeriod] = useState("day");
  // The picker keeps what was typed; the report only moves once the date is valid.
  const dateProblem = d => !d ? "Choose a report date." : !/^\d{4}-\d{2}-\d{2}$/.test(d) ? "Enter a full date." : d > TODAY ? "Reports can’t be dated in the future." : d < MIN_DATE ? "Reports start from January 1, 2020." : "";
  const [dateDraft, setDateDraft] = useState(selDate);
  useEffect(() => { setDateDraft(selDate); }, [selDate]);
  const dateError = dateProblem(dateDraft);
  const [showUndated, setShowUndated] = useState(false);
  const [search, setSearch] = useState("");
  const [methodFilter, setMethodFilter] = useState("all");
  const [view, setView] = useState("payments");
  const [receiptAppt, setReceiptAppt] = useState(null);
  const [clinic, setClinic] = useState(null);

  // Verified clinic details for the printed letterhead; administrators only, with a plain fallback.
  useEffect(() => {
    if (me.role !== "admin") return;
    let live = true;
    api.get("/api/clinic-document-profile").then(r => { if (live) setClinic(r?.profile?.details || null); }).catch(() => {});
    return () => { live = false; };
  }, [me.role]);

  const { from, to } = periodRange(period, selDate);
  const rangeText = periodLabel(period, selDate);
  const reportTitle = `${PERIOD_NAME[period]} sales report`;
  const collections = rangeCollections(db.appts || [], from, to);
  const pending = rangePendingCheckout(db.appts || [], from, to);
  const paidAppts = collections.paid, unbilledCompleted = pending.visits;
  const multiDay = from !== to;
  const searchTerm = search.trim().toLowerCase();
  const people = a => {
    const pet = (db.pets || []).find(p => p.id === a.petId) || {};
    const owner = (db.owners || []).find(o => o.id === pet.ownerId) || {};
    return { pet, owner };
  };
  const matchesSearch = a => {
    if (!searchTerm) return true;
    const { pet, owner } = people(a);
    return [pet.name, owner.name, a.ownerName, a.reason, a.id, a.paymentMethod, a.paymentReference].some(v => v && String(v).toLowerCase().includes(searchTerm));
  };

  const filteredPaid = (showUndated ? collections.undated : paidAppts).filter(a => {
    const method = paymentMethod(a.paymentMethod);
    if (methodFilter === "digital" ? !DIGITAL_METHODS.includes(method) : methodFilter !== "all" && method !== methodFilter) return false;
    return matchesSearch(a);
  });
  const filteredPending = unbilledCompleted.filter(matchesSearch);

  const selectCard = card => {
    setShowUndated(false);
    if (card === "pending") { setView("pending"); return; }
    setView("payments");
    setMethodFilter({ total: "all", cash: "cash", digital: "digital" }[card]);
  };
  const card = activeCard(view, methodFilter);
  const atLatest = to >= TODAY;
  const isCurrent = from <= TODAY && to >= TODAY;
  const step = steps => {
    const next = stepPeriod(period, selDate, steps);
    setSelDate(next > TODAY ? TODAY : next < MIN_DATE ? MIN_DATE : next);
  };
  const listedCents = filteredPaid.reduce((sum, a) => sum + Math.round((ownerBill(a).amount || 0) * 100), 0);

  if (db.summary && !db.historyComplete && !(period === "day" && selDate === TODAY)) return <section className="card"><h3>Historical sales</h3><p>Load all saved history above before viewing totals for {rangeText}.</p><button className="btn ghost" onClick={() => { setPeriod("day"); setSelDate(TODAY); }}>Today's sales</button></section>;

  const ledgerTitle = view === "pending" ? `Ready for checkout • ${rangeText}` : `Payment ledger • ${showUndated ? "Payment date not recorded" : rangeText}`;

  return (
    <div className="staff-sales">
      {/* Top Controls Toolbar */}
      <div className="no-print sales-toolbar">
        <div className="sales-period-tabs" role="group" aria-label="Report period">
          {PERIODS.map(([key, name]) => (
            <button key={key} type="button" aria-pressed={period === key} className={`btn sm ${period === key ? "gold" : "ghost"}`} onClick={() => { setPeriod(key); setShowUndated(false); }}>{name}</button>
          ))}
        </div>

        <div className="sales-date-controls" style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
          <button type="button" className="btn ghost sm" onClick={() => step(-1)} disabled={from <= MIN_DATE} style={{ padding: "6px 8px" }} title={`Previous ${PERIOD_NOUN[period]}`} aria-label={`Previous ${PERIOD_NOUN[period]}`}>
            <ChevronLeft size={16} />
          </button>

          <div className="fld sales-date-fld">
            <div className="sales-date-field" style={{ display: "flex", alignItems: "center", gap: "6px", background: "#f8fafc", padding: "4px 10px", borderRadius: "8px", border: `1px solid ${dateError ? "#dc2626" : "#cbd5e1"}` }}>
              <Calendar size={16} color="var(--navy)" />
              <input
                type="date"
                value={dateDraft}
                min={MIN_DATE} max={TODAY}
                aria-label={period === "day" ? "Report date" : `Any day in the report ${PERIOD_NOUN[period]}`} aria-invalid={!!dateError} aria-describedby="sales-date-msg"
                onChange={e => { setDateDraft(e.target.value); if (!dateProblem(e.target.value)) setSelDate(e.target.value); }}
                onBlur={() => { if (dateError) setDateDraft(selDate); }}
                style={{ border: "none", background: "transparent", fontWeight: 700, fontSize: "calc(14px * var(--fs, 1))", color: "var(--navy)", outline: "none", cursor: "pointer" }}
              />
            </div>
            <span id="sales-date-msg" className={dateError ? "err" : "sales-range-note"} role="status" aria-live="polite">{dateError || (multiDay ? `${from} to ${to}` : "")}</span>
          </div>

          <button type="button" className="btn ghost sm" onClick={() => step(1)} disabled={atLatest} style={{ padding: "6px 8px" }} title={`Next ${PERIOD_NOUN[period]}`} aria-label={`Next ${PERIOD_NOUN[period]}`}>
            <ChevronRight size={16} />
          </button>

          {!isCurrent && (
            <button type="button" className="btn sm gold" onClick={() => setSelDate(TODAY)} style={{ padding: "5px 12px", fontSize: "calc(12px * var(--fs, 1))", fontWeight: 700 }}>
              {period === "day" ? "Today" : `This ${PERIOD_NOUN[period]}`}
            </button>
          )}
        </div>

        <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
          <button className="btn sm ghost" onClick={() => window.print()} style={{ display: "flex", alignItems: "center", gap: "6px", fontWeight: 600, border: "1px solid #cbd5e1" }}>
            <Printer size={15} /> Print {PERIOD_NAME[period].toLowerCase()} report
          </button>
          <button
            className="btn sm ghost"
            disabled={!filteredPaid.length}
            title={filteredPaid.length ? "Download the listed payments and totals as a spreadsheet" : "No payments to export for these filters"}
            onClick={() => {
              const blob = new Blob([salesCsv({visits: filteredPaid, db, label: showUndated ? "Payment date not recorded" : `${reportTitle}: ${rangeText} (${from} to ${to})`, collections})], {type: "text/csv;charset=utf-8;"});
              const url = URL.createObjectURL(blob), link = document.createElement("a");
              link.href = url; link.download = `pawcare-sales-${showUndated ? "undated" : `${period}-${from}`}.csv`;
              document.body.appendChild(link); link.click(); link.remove(); URL.revokeObjectURL(url);
            }}
            style={{ display: "flex", alignItems: "center", gap: "6px", fontWeight: 600, border: "1px solid #cbd5e1" }}
          >
            Export CSV
          </button>
        </div>
      </div>

      <div className="no-print">
        <p>Collections use the recorded payment date in Philippine time. Checkout counts refer to visits completed {multiDay ? `from ${from} to ${to}` : `on ${from}`}; saved draft charges may change before payment. Select a card to list its records below.</p>
        {(collections.missingAmounts > 0 || collections.methods.unrecorded !== 0 || collections.methods.other !== 0) && <p role="status">{collections.missingAmounts} payment(s) without a usable amount, excluded from totals. Other recorded methods: {money(collections.methods.other)}. Method not recorded: {money(collections.methods.unrecorded)}.</p>}
        {collections.undated.length > 0 && <p role="status">{collections.undated.length} payment(s) have no usable payment date and are excluded from period totals. <button className="btn ghost sm" onClick={() => { setView("payments"); setShowUndated(v => !v); }}>{showUndated ? "Show selected period" : "View undated payments"}</button></p>}

        {/* Financial Overview Metrics Cards — each one filters the table below */}
        <div className="sales-kpis">
          <KpiCard id="total" active={card === "total" && !showUndated} onSelect={selectCard} controls="sales-ledger" tone="primary"
            title={`Total collections (${period === "day" && selDate === TODAY ? "today" : PERIOD_NAME[period].toLowerCase()})`} icon={<DollarSign size={20} />}
            value={money(collections.total)} detail={`${paidAppts.length} settled transaction${paidAppts.length === 1 ? "" : "s"}`} />
          <KpiCard id="cash" active={card === "cash" && !showUndated} onSelect={selectCard} controls="sales-ledger" tone="cash"
            title="Cash received" icon={<Coins size={18} />}
            value={money(collections.methods.cash)} detail={`${collections.counts.cash} cash invoice(s)`} />
          <KpiCard id="digital" active={card === "digital" && !showUndated} onSelect={selectCard} controls="sales-ledger" tone="digital"
            title="Digital (GCash / Card / Maya)" icon={<CreditCard size={18} />}
            value={money(collections.digitalTotal)} detail={`GCash: ${money(collections.methods.gcash)} • Card: ${money(collections.methods.card)} • Maya: ${money(collections.methods.maya)}`} />
          <KpiCard id="pending" active={card === "pending"} onSelect={selectCard} controls="sales-ledger" tone={unbilledCompleted.length ? "warn" : "muted"}
            title="Ready for checkout" icon={<Clock size={18} />}
            value={unbilledCompleted.length} detail={unbilledCompleted.length ? `${money(pending.draftTotal)} saved draft charges · ${pending.awaitingInvoice} awaiting invoice` : "No pending checkouts"} />
        </div>

        {me.role==='assistant' && period === "day" && selDate === TODAY && <CheckoutInbox me={me} db={db} blocked={!!receiptAppt} onOpen={task=>{
          const visit=db.appts.find(a=>a.id===task.appointmentId);
          if(!visit || visit.status!=='Completed' || visit.billingStatus==='Paid' || visit.admissionStatus==='Admitted')return false;
          setReceiptAppt(visit);return true;
        }}/>}

        {/* Ledger Table */}
        <section className="card" id="sales-ledger" style={{ padding: "0", overflow: "hidden" }}>
          <div style={{ padding: "14px 20px", background: "#f8fafc", borderBottom: "1px solid #e2e8f0", display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "12px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "12px", flexWrap: "wrap", flex: "1 1 320px" }}>
              <h3 style={{ margin: 0, fontSize: "calc(16px * var(--fs, 1))", color: "var(--navy)" }}>{ledgerTitle}</h3>
              {view === "payments" ? (
                <select
                  value={methodFilter}
                  aria-label="Payment method filter"
                  onChange={e => setMethodFilter(e.target.value)}
                  style={{ width: "auto", minWidth: "200px", padding: "5px 10px", fontSize: "calc(12px * var(--fs, 1))", borderRadius: "6px", border: "1px solid #cbd5e1" }}
                >
                  <option value="all">All Payment Methods</option>
                  <option value="cash">Cash</option>
                  <option value="digital">Digital (GCash / Card / Maya)</option>
                  <option value="gcash">GCash</option>
                  <option value="maya">Maya</option>
                  <option value="card">Credit / Debit Card</option>
                  <option value="unrecorded">Not recorded</option>
                  <option value="other">Other recorded methods</option>
                </select>
              ) : (
                <button type="button" className="btn sm ghost" onClick={() => selectCard("total")}>Back to payments</button>
              )}
            </div>
            <div className="desk-search-inline"><SearchField id="sales-search" label={view === "pending" ? "Search checkouts" : "Search payments"} value={search} onChange={setSearch} placeholder="Owner, pet or reference" /></div>
          </div>

          {view === "pending" ? (
            filteredPending.length ? (
              <div style={{ overflowX: "auto" }}>
                <PaginatedTable label="Ready for checkout" resetKey={[from, to, search, view]} style={{ width: "100%", fontSize: "calc(13px * var(--fs, 1))", borderCollapse: "collapse" }}>
                  <thead>
                    <tr style={{ textAlign: "left", background: "#f8fafc", color: "#475569", borderBottom: "2px solid #e2e8f0" }}>
                      <th style={{ padding: "12px 16px" }}>Visit date • Reference</th>
                      <th style={{ padding: "12px 16px" }}>Patient • Owner</th>
                      <th style={{ padding: "12px 16px" }}>Reason for visit</th>
                      <th style={{ padding: "12px 16px", textAlign: "right" }}>Draft charges</th>
                      <th style={{ padding: "12px 16px", textAlign: "right" }}>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredPending.map(a => {
                      const { pet, owner } = people(a), amount = ownerBill(a).amount;
                      return (
                        <tr key={a.id} onClick={() => setReceiptAppt(a)} className="sales-row" title="Open the visit's checkout">
                          <td data-label="Visit date • Reference" style={{ padding: "12px 16px", whiteSpace: "nowrap" }}>
                            <b style={{ color: "var(--navy)" }}>{a.date}{a.time ? ` · ${a.time}` : ""}</b>
                            <small style={{ display: "block", color: "#64748b", fontFamily: "monospace" }}>{a.id}</small>
                          </td>
                          <td data-label="Patient • Owner" style={{ padding: "12px 16px" }}>
                            <div style={{ fontWeight: 700, color: "var(--navy)" }}>{pet.name || "Patient"}</div>
                            <div style={{ fontSize: "calc(12px * var(--fs, 1))", color: "#64748b" }}>Owner: {owner.name || a.ownerName || "Walk-in Client"}</div>
                          </td>
                          <td data-label="Reason for visit" style={{ padding: "12px 16px" }}>{a.reason || "Clinical Consultation / Exam"}</td>
                          <td data-label="Draft charges" style={{ padding: "12px 16px", textAlign: "right", whiteSpace: "nowrap" }}>
                            <b>{amount === null ? "Awaiting invoice" : money(amount)}</b>
                          </td>
                          <td data-label="Action" style={{ padding: "12px 16px", textAlign: "right" }}>
                            <button type="button" className="btn sm ghost" onClick={e => { e.stopPropagation(); setReceiptAppt(a); }} style={{ padding: "4px 8px", fontWeight: 600, border: "1px solid #cbd5e1" }}>
                              {me.role === "assistant" ? "Open checkout" : "View visit bill"}
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </PaginatedTable>
              </div>
            ) : (
              <div className="empty sm" style={{ padding: "36px 20px", textAlign: "center" }}>No completed visits are waiting for checkout {multiDay ? `in ${rangeText}` : `on ${from}`}{searchTerm ? " for this search" : ""}.</div>
            )
          ) : filteredPaid.length ? (
            <div style={{ overflowX: "auto" }}>
              <PaginatedTable label="Payment ledger" resetKey={[from, to, showUndated, methodFilter, search, view]} style={{ width: "100%", fontSize: "calc(13px * var(--fs, 1))", borderCollapse: "collapse" }}>
                <thead>
                  <tr style={{ textAlign: "left", background: "#f8fafc", color: "#475569", borderBottom: "2px solid #e2e8f0" }}>
                    <th style={{ padding: "12px 16px" }}>{multiDay ? "Payment date & time" : "Payment time"} &bull; Visit reference</th>
                    <th style={{ padding: "12px 16px" }}>Patient &bull; Owner</th>
                    <th style={{ padding: "12px 16px" }}>Services Rendered</th>
                    <th style={{ padding: "12px 16px" }}>Payment Method</th>
                    <th style={{ padding: "12px 16px", textAlign: "right" }}>Amount Collected</th>
                    <th style={{ padding: "12px 16px", textAlign: "right" }}>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredPaid.map(a => {
                    const { pet, owner } = people(a), isCash = paymentMethod(a.paymentMethod) === "cash";
                    return (
                      <tr key={a.id} onClick={() => setReceiptAppt(a)} className="sales-row" title="Click to view the paid invoice and print it">
                        <td data-label="Payment time • Visit reference" style={{ padding: "12px 16px", whiteSpace: "nowrap" }}>
                          <b style={{ color: "var(--navy)" }}>{multiDay && paymentDate(a.paidAt) ? `${paymentDate(a.paidAt)} · ` : ""}{paymentTime(a.paidAt)}</b>
                          <small style={{ display: "block", color: "#64748b", fontFamily: "monospace", fontSize: "calc(11px * var(--fs, 1))" }}>{a.id}</small>
                        </td>
                        <td data-label="Patient • Owner" style={{ padding: "12px 16px" }}>
                          <div style={{ fontWeight: 700, color: "var(--navy)" }}>{pet.name || "Patient"}</div>
                          <div style={{ fontSize: "calc(12px * var(--fs, 1))", color: "#64748b" }}>Owner: {owner.name || a.ownerName || "Walk-in Client"}</div>
                        </td>
                        <td data-label="Services Rendered" style={{ padding: "12px 16px", maxWidth: "260px" }}>
                          <div style={{ fontWeight: 500, color: "#1e293b" }}>{a.reason || "Clinical Consultation / Exam"}</div>
                          {a.invoiceItems && a.invoiceItems.length > 1 && <small style={{ color: "#64748b" }}>+{a.invoiceItems.length - 1} additional procedure/medication item(s)</small>}
                        </td>
                        <td data-label="Payment Method" style={{ padding: "12px 16px" }}>
                          <span style={{ padding: "3px 8px", borderRadius: "6px", fontSize: "calc(11.5px * var(--fs, 1))", fontWeight: 700, background: isCash ? "#ecfdf5" : "#eff6ff", color: isCash ? "#047857" : "#0369a1", border: isCash ? "1px solid #a7f3d0" : "1px solid #bfdbfe" }}>
                            {a.paymentMethod?.trim() || "Not recorded"}
                          </span>
                        </td>
                        <td data-label="Amount Collected" style={{ padding: "12px 16px", textAlign: "right", whiteSpace: "nowrap" }}>
                          <b style={{ fontSize: "calc(14.5px * var(--fs, 1))", color: "#0f172a" }}>{money(ownerBill(a).amount)}</b>
                        </td>
                        <td data-label="Action" style={{ padding: "12px 16px", textAlign: "right" }}>
                          <button type="button" className="btn sm ghost" onClick={e => { e.stopPropagation(); setReceiptAppt(a); }} style={{ padding: "4px 8px", fontSize: "calc(11.5px * var(--fs, 1))", fontWeight: 600, color: "var(--navy)", border: "1px solid #cbd5e1" }}>
                            View Invoice
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr style={{ background: "#f8fafc", borderTop: "2px solid #e2e8f0" }}>
                    <td colSpan={4} style={{ padding: "12px 16px", fontWeight: 700 }}>Total of {filteredPaid.length} listed payment{filteredPaid.length === 1 ? "" : "s"}</td>
                    <td style={{ padding: "12px 16px", textAlign: "right", fontWeight: 800 }}>{money(listedCents / 100)}</td>
                    <td />
                  </tr>
                </tfoot>
              </PaginatedTable>
            </div>
          ) : (
            <div className="empty sm" style={{ padding: "36px 20px", textAlign: "center" }}>
              {showUndated ? "No payments with an unrecorded date match these filters." : `No settled transactions match these filters ${multiDay ? `in ${rangeText}` : `on ${from}`}.`}
            </div>
          )}
        </section>
      </div>

      {/* The printed report: an official document, not a copy of the screen. Hidden while an invoice is open so that prints instead. */}
      {!receiptAppt && <SalesReportDocument {...{ db, me, clinic, period, reportTitle, rangeText, from, to, collections, pending, payments: filteredPaid, methodFilter, search: search.trim(), showUndated, people }} />}

      {receiptAppt && (
        <BillingModal
          appt={receiptAppt}
          db={db}
          setDb={setDb}
          me={me}
          onClose={() => setReceiptAppt(null)}
          onPaid={(amount) => {
            setReceiptAppt(null);
            say && say(`Payment of ${money(amount)} settled successfully!`);
          }}
        />
      )}
    </div>
  );
}

const METHOD_ROWS = ["cash", "gcash", "maya", "card", "other", "unrecorded"];
const FILTER_LABEL = { all: "All payment methods", digital: "Digital (GCash / Card / Maya)", ...METHOD_LABELS };

function SalesReportDocument({ me, clinic, period, reportTitle, rangeText, from, to, collections, pending, payments, methodFilter, search, showUndated, people }) {
  const generated = new Date();
  const generatedText = generated.toLocaleString("en-PH", { timeZone: "Asia/Manila", dateStyle: "long", timeStyle: "short" });
  const reportNo = `SR-${period[0].toUpperCase()}-${from.replace(/-/g, "")}${from !== to ? `-${to.replace(/-/g, "")}` : ""}`;
  const filtered = methodFilter !== "all" || !!search || showUndated;
  const listedCents = payments.reduce((sum, a) => sum + Math.round((ownerBill(a).amount || 0) * 100), 0);
  const multiDay = from !== to;
  return (
    <article className="print-document sales-report-doc" aria-hidden="true">
      <header className="srd-letterhead">
        <div>
          <strong className="srd-clinic">{clinic?.name || "PawCare Veterinary Clinic"}</strong>
          {clinic?.address && <span>{clinic.address}</span>}
          {(clinic?.phone || clinic?.email) && <span>{[clinic.phone && `Tel. ${clinic.phone}`, clinic.email].filter(Boolean).join(" · ")}</span>}
          {clinic?.registration && <span>Registration / License: {clinic.registration}</span>}
        </div>
        <dl className="srd-meta">
          <div><dt>Report no.</dt><dd>{reportNo}</dd></div>
          <div><dt>Generated</dt><dd>{generatedText}</dd></div>
        </dl>
      </header>

      <h1 className="srd-title">{reportTitle.toUpperCase()}</h1>
      <p className="srd-subtitle">Statement of collections · Amounts in Philippine Peso (PHP)</p>

      <table className="srd-info">
        <tbody>
          <tr><th>Period covered</th><td>{showUndated ? "Payments without a recorded date" : `${rangeText}${multiDay ? ` (${from} to ${to})` : ""}`}</td><th>Prepared by</th><td>{me.name}</td></tr>
          <tr><th>Report type</th><td>{PERIOD_NAME[period]}</td><th>Position</th><td>{me.role === "admin" ? "Clinic Administrator" : me.role === "assistant" ? "Vet Assistant" : "Staff"}</td></tr>
          {filtered && <tr><th>Filters applied</th><td colSpan={3}>{FILTER_LABEL[methodFilter] || methodFilter}{search && ` · Search: “${search}”`}</td></tr>}
        </tbody>
      </table>

      <h2 className="srd-section">I. Summary of collections</h2>
      <table className="srd-table srd-summary">
        <thead><tr><th>Payment method</th><th className="num">No. of transactions</th><th className="num">Amount (PHP)</th></tr></thead>
        <tbody>
          {METHOD_ROWS.filter(key => collections.counts[key] || ["cash", "gcash", "maya", "card"].includes(key)).map(key => (
            <tr key={key}><td>{METHOD_LABELS[key]}</td><td className="num">{collections.counts[key]}</td><td className="num">{money(collections.methods[key]).replace("₱", "")}</td></tr>
          ))}
        </tbody>
        <tfoot><tr><th>Total collections</th><th className="num">{collections.paid.length}</th><th className="num">{money(collections.total).replace("₱", "")}</th></tr></tfoot>
      </table>
      <p className="srd-note">
        Completed visits not yet paid in this period: {pending.visits.length}{pending.visits.length ? ` (saved draft charges ${money(pending.draftTotal)}; not included above)` : ""}.
        {collections.missingAmounts > 0 && ` ${collections.missingAmounts} payment(s) have no usable amount and are excluded from totals.`}
        {collections.undated.length > 0 && !showUndated && ` ${collections.undated.length} payment(s) without a recorded payment date are excluded.`}
      </p>

      <h2 className="srd-section">II. Register of payments{filtered ? " (filtered)" : ""}</h2>
      <table className="srd-table srd-register">
        <thead>
          <tr><th className="num">#</th><th>{multiDay ? "Date / time paid" : "Time paid"}</th><th>Visit reference</th><th>Patient</th><th>Owner</th><th>Particulars</th><th>Method</th><th className="num">Amount (PHP)</th></tr>
        </thead>
        <tbody>
          {payments.length ? payments.map((a, i) => {
            const { pet, owner } = people(a), bill = ownerBill(a);
            return (
              <tr key={a.id}>
                <td className="num">{i + 1}</td>
                <td>{multiDay && paymentDate(a.paidAt) ? `${paymentDate(a.paidAt)} ` : ""}{paymentTime(a.paidAt)}</td>
                <td className="mono">{a.id}{a.paymentReference ? <small>Ref. {a.paymentReference}</small> : null}</td>
                <td>{pet.name || "—"}</td>
                <td>{owner.name || a.ownerName || "Walk-in client"}</td>
                <td>{bill.items?.length ? bill.items.map(item => `${item.qty} × ${item.name}`).join("; ") : a.reason || "Consultation"}</td>
                <td>{METHOD_LABELS[paymentMethod(a.paymentMethod)]}</td>
                <td className="num">{money(bill.amount).replace("₱", "")}</td>
              </tr>
            );
          }) : <tr><td colSpan={8} className="srd-empty">No payments recorded for this period{filtered ? " and filter" : ""}.</td></tr>}
        </tbody>
        <tfoot><tr><th colSpan={7}>Total of {payments.length} listed payment{payments.length === 1 ? "" : "s"}</th><th className="num">{(listedCents / 100).toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</th></tr></tfoot>
      </table>

      <p className="srd-certify">I hereby certify that the above is a true and correct statement of collections recorded in the PawCare clinic system for the period stated.</p>
      <div className="srd-signatures">
        {[["Prepared by", me.name], ["Reviewed by", ""], ["Approved by", ""]].map(([role, name]) => (
          <div key={role}><span className="srd-sign-role">{role}:</span><span className="srd-sign-line">{name}</span><span className="srd-sign-caption">Signature over printed name · Date</span></div>
        ))}
      </div>
      <footer className="srd-footer">System-generated report · {reportNo} · Printed {generatedText} · This document is for internal clinic records.</footer>
    </article>
  );
}

import {useHistoryComplete} from '../ClinicHistory.jsx';
import {today,plus} from '../booking.js';
import {currentVaccinationDue,vaccinationStatus} from '../ownerVaccination.js';
import { PaginatedTable } from "../components/Pagination.jsx";
import { categoryOf, categoryOptions, summarize, CATEGORY_LABEL } from "../reportSummary.js";
import { useState, useMemo } from "react";
import { E, scope, Badge } from "../lib.jsx";
import {
  FileText,
  Download,
  Printer,
  Calendar,
  Search,
  Filter,
  CheckCircle2,
  Syringe,
  Stethoscope,
  PawPrint,
  Clock,
  Receipt,
  Sparkles,
  ChevronDown
} from "lucide-react";

const CLINIC = {
  name: "PawCare Veterinary Clinic",
  subtitle: "Animal Health Care & Digital Immunization Services"
};

const REPORT_CONFIG = {
  appts: {
    title: "Appointments & Visits Audit",
    sub: "Clinic appointment scheduling, attendance records, and consultation slots.",
    icon: Calendar,
    color: "#2563eb",
    bg: "#eff6ff",
    statusColumn: true,
    headers: ["Date", "Time", "Patient", "Species", "Owner", "Veterinarian", "Reason / Service", "Status"],
    toCsvRow: (x, db) => {
      const p = (db.pets || []).find(p => p.id === x.petId) || {};
      const o = (db.owners || []).find(o => o.id === p.ownerId) || {};
      const vet = (db.vets || []).find(v => v.id === x.vetId)?.name || (x.vetId ? "Veterinarian not recorded" : "Unassigned");
      return [
        x.date || "",
        x.time || "",
        p.name || x.petId || "",
        p.species || "",
        o.name || "",
        vet,
        x.reason || x.service || "",
        x.status || "Pending Approval"
      ];
    }
  },
  vacc: {
    title: "Vaccination & Booster Recalls",
    sub: "Administered vaccines, core booster protocols, batch lots, and recall schedules.",
    icon: Syringe,
    color: "#d97706",
    bg: "#fffbeb",
    statusColumn: true,
    headers: ["Recorded / Planned Date", "Patient", "Species", "Owner", "Vaccine Name", "Brand", "Lot / Batch", "Next Booster Due", "Status"],
    toCsvRow: (x, db) => {
      const p = (db.pets || []).find(p => p.id === x.petId) || {};
      const o = (db.owners || []).find(o => o.id === p.ownerId) || {};
      return [
        x.date || "",
        p.name || x.petId || "",
        p.species || "",
        o.name || "",
        x.vaccine || "",
        x.brand || "",
        x.batch || "",
        x.nextDue || "",
        vaccinationStatus(x, currentVaccinationDue(db.vacc || []), today())
      ];
    }
  },
  records: {
    title: "Veterinary Consultations & EMR",
    sub: "Saved clinical visit records, assessments, and treatments.",
    icon: Stethoscope,
    color: "#059669",
    bg: "#ecfdf5",
    headers: ["Date", "Patient", "Owner", "Attending Veterinarian", "Diagnosis / Assessment", "Treatment & Plan", "Prescriptions"],
    toCsvRow: (x, db) => {
      const p = (db.pets || []).find(p => p.id === x.petId) || {};
      const o = (db.owners || []).find(o => o.id === p.ownerId) || {};
      const vet = (db.vets || []).find(v => v.id === x.vetId)?.name || "Veterinarian not recorded";
      return [
        x.date || "",
        p.name || x.petId || "",
        o.name || "",
        vet,
        x.diagnosis || "",
        x.treatment || "",
        x.prescription || ""
      ];
    }
  },
  sales: {
    title: "Sales & Payments Report",
    sub: "Paid invoices with the services and products sold, payment method and amount collected.",
    icon: Receipt,
    color: "#0f766e",
    bg: "#f0fdfa",
    adminOnly: true,
    headers: ["Visit Date", "Patient", "Owner", "Items Sold", "Payment Method", "Reference", "Amount Paid (PHP)"],
    toCsvRow: (x, db) => {
      const p = (db.pets || []).find(p => p.id === x.petId) || {};
      const o = (db.owners || []).find(o => o.id === p.ownerId) || {};
      return [
        x.date || "",
        p.name || x.petId || "",
        o.name || "",
        (Array.isArray(x.invoiceItems) ? x.invoiceItems : []).map(i => `${i.qty}x ${i.name}`).join("; "),
        x.paymentMethod || "Not recorded",
        x.paymentReference || "",
        Number(x.amount || 0).toFixed(2)
      ];
    }
  },
  pets: {
    title: "Registered Patients Masterlist",
    sub: "Animal patient demographics, breeds, birth dates, weights, and owner links.",
    icon: PawPrint,
    color: "#7c3aed",
    bg: "#f5f3ff",
    headers: ["Patient ID", "Pet Name", "Species", "Breed", "Sex", "Birth Date", "Weight (kg)", "Owner Name", "Owner Phone", "Card ID"],
    toCsvRow: (x, db) => {
      const o = (db.owners || []).find(o => o.id === x.ownerId) || {};
      return [
        x.id || "",
        x.name || "",
        x.species || "",
        x.breed || "",
        x.sex || "",
        x.birth || "",
        x.weight || "",
        o.name || "",
        o.phone || "",
        x.vaccinationCardId || ""
      ];
    }
  }
};

export default function ReportsPage({ db, me }) {
  const historyComplete = useHistoryComplete();
  const [reportType, setReportType] = useState("appts");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("");

  const currentCfg = (REPORT_CONFIG[reportType]?.adminOnly && me.role !== "admin" ? null : REPORT_CONFIG[reportType]) || REPORT_CONFIG.appts;
  const isDateFiltered = reportType !== "pets";
  const isDateInvalid = from && to && from > to;

  // Retrieve base list
  const rawList = useMemo(() => {
    const l = reportType === "sales"
      ? (scope(db, me, "appts") || []).filter(a => a.billingStatus === "Paid")
      : [...(scope(db, me, reportType) || [])];
    if (reportType === "sales") l.sort((a, b) => String(b.date).localeCompare(String(a.date)));
    else if (E[reportType]?.sort) l.sort(E[reportType].sort);
    return l;
  }, [db, me, reportType]);

  // Apply date and search filters
  const filteredList = useMemo(() => {
    let l = rawList;
    if (isDateFiltered) {
      if (from) l = l.filter(x => (x.date || "") >= from);
      if (to) l = l.filter(x => (x.date || "") <= to);
    }
    if (category) l = l.filter(x => categoryOf(reportType, x, db) === category);
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      l = l.filter(x => {
        const p = (db.pets || []).find(p => p.id === x.petId) || {};
        const o = (db.owners || []).find(o => o.id === (p.ownerId || x.ownerId)) || {};
        const text = [
          x.name, x.reason, x.vaccine, x.diagnosis, x.treatment,
          p.name, p.species, p.breed, o.name, o.phone, x.batch, x.brand
        ].filter(Boolean).join(" ").toLowerCase();
        return text.includes(q);
      });
    }
    return l;
  }, [rawList, isDateFiltered, from, to, search, category, reportType, db]);
  const categories = useMemo(() => categoryOptions(reportType, rawList, db), [rawList, reportType, db]);
  const summary = useMemo(() => summarize(reportType, filteredList, db), [reportType, filteredList, db]);

  const canExport = historyComplete && !isDateInvalid && filteredList.length > 0;

  // Quick Date Range Presets
  const applyPreset = (preset) => {
    const date = today();
    if (preset === "all") { setFrom(""); setTo(""); }
    else { setFrom(preset === "week" ? plus(-6) : preset === "month" ? date.slice(0,7)+"-01" : date); setTo(date); }
  };

  // CSV Export Generation
  const handleExportCsv = () => {
    if (!canExport) return;
    const cfg = REPORT_CONFIG[reportType];
    const headers = cfg.headers;
    const rows = filteredList.map(item => cfg.toCsvRow(item, db));

    const escapeCsv = (val) => {
      const raw = String(val ?? "");
      const str = /^[\s]*[=+@-]/.test(raw) ? "'" + raw : raw;
      if (str.includes(",") || str.includes('"') || /[\r\n]/.test(str)) {
        return `"${str.replace(/"/g, '""')}"`;
      }
      return str;
    };

    const csvContent = [
      headers.map(escapeCsv).join(","),
      ...rows.map(r => r.map(escapeCsv).join(",")),
      "",
      ["Summary", "Value"].map(escapeCsv).join(","),
      ...summary.map(r => r.map(escapeCsv).join(",")),
      ["Filters", `${from || "Beginning"} to ${to || "Present"}${category ? `; ${CATEGORY_LABEL[reportType]}: ${category}` : ""}${search.trim() ? `; Search: ${search.trim()}` : ""}`].map(escapeCsv).join(",")
    ].join("\r\n");

    const blob = new Blob(["\uFEFF" + csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    const todayStr = today();
    link.setAttribute("href", url);
    link.setAttribute("download", `pawcare-${reportType}-report-${todayStr}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handlePrint = () => {
    if (canExport) window.print();
  };

  const IconCmp = currentCfg.icon;

  return (
    <>
      <style>{`
        @media print {
          body { background: #ffffff !important; color: #000000 !important; font-size: 11pt !important; }
          .side, .sidefoot, .rep-noprint, button, input, select { display: none !important; }
          .main { padding: 0 !important; margin: 0 !important; max-width: 100% !important; }
          .rep-sheet { box-shadow: none !important; border: none !important; padding: 0 !important; }
          .rep-print-header { display: block !important; margin-bottom: 20px !important; }
          .rep-print-footer { display: block !important; margin-top: 30px !important; }
          table { width: 100% !important; border-collapse: collapse !important; }
          th, td { border: 1px solid #cbd5e1 !important; padding: 6px 8px !important; font-size: 9.5pt !important; }
          th { background: #ffffff !important; font-weight: bold !important; }
        }
      `}</style>

      {/* Screen Header & Report Switcher (Hidden in Print) */}
      <div className="rep-noprint" style={{ marginBottom: "20px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: "14px", marginBottom: "18px" }}>
          <div>
            <h2 style={{ margin: "0 0 4px", fontSize: "calc(22px * var(--fs, 1))", color: "var(--navy, #0f172a)", fontWeight: 800 }}>
              Clinical Reports
            </h2>
            <p style={{ margin: 0, fontSize: "calc(13.5px * var(--fs, 1))", color: "#64748b" }}>
              Filter, audit clinical records, export CSV spreadsheets, and print saved record summaries.
            </p>
          </div>

          <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
            <button
              type="button"
              className="btn gold"
              onClick={handleExportCsv}
              disabled={!canExport}
              style={{ display: "inline-flex", alignItems: "center", gap: "7px", fontWeight: 700 }}
              title="Download spreadsheet in CSV format"
            >
              <Download size={16} />
              <span>Export CSV</span>
            </button>
            <button
              type="button"
              className="btn ghost"
              onClick={handlePrint}
              disabled={!canExport}
              style={{ display: "inline-flex", alignItems: "center", gap: "7px", fontWeight: 700 }}
              title="Print report"
            >
              <Printer size={16} />
              <span>Print Document</span>
            </button>
          </div>
        </div>

        {/* Report Type Selector Pills */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "10px", marginBottom: "16px" }}>
          {Object.entries(REPORT_CONFIG).filter(([, cfg]) => !cfg.adminOnly || me.role === "admin").map(([key, cfg]) => {
            const isSel = reportType === key;
            const ItemIcon = cfg.icon;
            const count = key === "sales" ? (scope(db, me, "appts") || []).filter(a => a.billingStatus === "Paid").length : (scope(db, me, key) || []).length;
            return (
              <button
                key={key}
                type="button"
                onClick={() => { setReportType(key); setFrom(""); setTo(""); setSearch(""); setCategory(""); }}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "12px",
                  padding: "12px 14px",
                  borderRadius: "14px",
                  border: isSel ? `2px solid ${cfg.color}` : "1.5px solid #e2e8f0",
                  background: isSel ? cfg.bg : "#ffffff",
                  cursor: "pointer",
                  textAlign: "left",
                  transition: "all 0.15s ease",
                  boxShadow: isSel ? "0 4px 12px rgba(0,0,0,0.04)" : "none"
                }}
              >
                <div style={{
                  width: "38px",
                  height: "38px",
                  borderRadius: "10px",
                  background: isSel ? cfg.color : "#f1f5f9",
                  color: isSel ? "#ffffff" : "#475569",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  flexShrink: 0
                }}>
                  <ItemIcon size={20} />
                </div>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ fontSize: "calc(13px * var(--fs, 1))", fontWeight: 700, color: isSel ? cfg.color : "#0f172a", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                    {cfg.title.split("&")[0].trim()}
                  </div>
                  <div style={{ fontSize: "calc(11px * var(--fs, 1))", color: "#64748b" }}>
                    <b>{count}</b> saved record{count === 1 ? "" : "s"}
                  </div>
                </div>
              </button>
            );
          })}
        </div>

        {/* Filter Controls Bar */}
        <div style={{ background: "#ffffff", padding: "16px 20px", borderRadius: "16px", border: "1px solid #e2e8f0", boxShadow: "0 2px 6px rgba(0,0,0,0.02)", display: "flex", flexWrap: "wrap", gap: "14px", alignItems: "center", justifyContent: "space-between" }}>
          {/* Date Range & Presets */}
          {isDateFiltered && (
            <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
              <span style={{ fontSize: "calc(12.5px * var(--fs, 1))", fontWeight: 700, color: "#475569" }}>Date Range:</span>
              <input
                type="date"
                value={from}
                min="2000-01-01" max={to || "2100-12-31"}
                onChange={e => setFrom(e.target.value)}
                style={{ fontSize: "calc(12.5px * var(--fs, 1))", padding: "6px 10px" }}
                aria-label="Filter from date"
              />
              <span style={{ color: "#94a3b8" }}>➜</span>
              <input
                type="date"
                value={to}
                min={from || "2000-01-01"} max="2100-12-31"
                onChange={e => setTo(e.target.value)}
                style={{ fontSize: "calc(12.5px * var(--fs, 1))", padding: "6px 10px" }}
                aria-label="Filter to date"
              />

              <div style={{ display: "flex", flexWrap: "wrap", gap: "4px" }}>
                {[
                  ["all", "All Time"],
                  ["today", "Today"],
                  ["week", "Last 7D"],
                  ["month", "This Month"]
                ].map(([key, label]) => (
                  <button
                    key={key}
                    type="button"
                    className="btn ghost sm"
                    onClick={() => applyPreset(key)}
                    style={{ fontSize: "calc(11px * var(--fs, 1))", padding: "3px 8px" }}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
          )}

          <label style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "calc(12.5px * var(--fs, 1))", fontWeight: 700, color: "#475569" }}>{CATEGORY_LABEL[reportType]}:
            <select value={category} onChange={e => setCategory(e.target.value)} aria-label={`Filter by ${CATEGORY_LABEL[reportType].toLowerCase()}`} style={{ fontSize: "calc(12.5px * var(--fs, 1))", padding: "6px 10px" }}>
              <option value="">All</option>{categories.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </label>

          {/* Quick Search Within Report */}
          <div style={{ position: "relative", flex: "1 1 240px" }}>
            <Search size={14} color="#94a3b8" style={{ position: "absolute", left: "10px", top: "50%", transform: "translateY(-50%)" }} />
            <input
              type="search"
              placeholder={`Search in ${currentCfg.title.toLowerCase()}...`}
              value={search}
              onChange={e => setSearch(e.target.value)}
              style={{ width: "100%", paddingLeft: "32px", fontSize: "calc(12.5px * var(--fs, 1))" }}
            />
          </div>
        </div>

        {isDateInvalid && (
          <div role="alert" style={{ background: "#fef2f2", border: "1px solid #fecaca", color: "#991b1b", borderRadius: "10px", padding: "8px 12px", fontSize: "calc(12.5px * var(--fs, 1))", marginTop: "10px" }}>
            The "From" date cannot be after the "To" date.
          </div>
        )}
      </div>

      {!historyComplete && <p role="status">Showing loaded records only. Use “Load all history” above before exporting or printing.</p>}
      {/* Main Report Document Sheet */}
      <section className="card rep-sheet">
        
        {/* Official letterhead */}
        <header className="rep-print-header rep-letterhead">
          <PawPrint size={26} aria-hidden="true" />
          <h1>{CLINIC.name}</h1>
          <p className="rep-tagline">{CLINIC.subtitle}</p>
          <h2 className="rep-doc-title">{currentCfg.title}</h2>
          <p className="rep-doc-sub">{currentCfg.sub}</p>
          <dl className="rep-meta">
            <div><dt>Report type</dt><dd>Saved records report</dd></div>
            <div><dt>Date generated</dt><dd>{new Date().toLocaleDateString("en-PH", { timeZone: "Asia/Manila", month: "short", day: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit" })}</dd></div>
            <div><dt>Prepared by</dt><dd>{me.name} ({String(me.role).toUpperCase()})</dd></div>
            <div><dt>Records shown</dt><dd>{filteredList.length}</dd></div>
            {isDateFiltered && (from || to) && <div><dt>Date range</dt><dd>{from || "Beginning"} to {to || "Present"}</dd></div>}
            {category && <div><dt>{CATEGORY_LABEL[reportType]}</dt><dd>{category}</dd></div>}
          </dl>
        </header>

        {/* Summary calculated from the filtered records; also prints with the report */}
        <h3 className="rep-section">Summary</h3>
        <dl className="rep-summary" aria-label="Report summary">
          {summary.map(([label, value]) => <div key={label}>
            <dt>{label}</dt>
            <dd>{value}</dd>
          </div>)}
        </dl>

        <h3 className="rep-section">Records</h3>
        {/* Data Table */}
        {filteredList.length === 0 ? (
          <div className="empty sm" style={{ padding: "40px 20px" }}>
            <p style={{ margin: 0, fontWeight: 600, color: "#64748b" }}>
              No records match your selected report filters.
            </p>
          </div>
        ) : (
          <div className="rep-table-wrap">
            <PaginatedTable label="Report records" resetKey={[reportType,from,to,search,category]} className="tbl rep-table">
              <thead>
                <tr>
                  {currentCfg.headers.map((h, i) => (
                    <th key={i} scope="col">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filteredList.map((item, idx) => {
                  const row = currentCfg.toCsvRow(item, db);
                  return (
                    <tr key={item.id || idx}>
                      {row.map((cell, cIdx) => (
                        <td key={cIdx} data-label={currentCfg.headers[cIdx]}>
                          {currentCfg.statusColumn && cIdx === row.length - 1 && cell ? (
                            <span className="rep-status">{cell}</span>
                          ) : (
                            <span>{cell || "—"}</span>
                          )}
                        </td>
                      ))}
                    </tr>
                  );
                })}
              </tbody>
            </PaginatedTable>
          </div>
        )}

        {/* Sign-off block */}
        <footer className="rep-print-footer rep-signoff">
          <p>This report is a summary exported directly from the PawCare Clinic Portal and reflects the saved records at the time it was generated.</p>
          <div className="rep-sign">
            <div><span className="rep-line" /><b>{me.name}</b><small>Prepared by</small></div>
            <div><span className="rep-line" /><b>&nbsp;</b><small>Reviewed by</small></div>
          </div>
        </footer>

      </section>
    </>
  );
}


import { PaginatedTable } from "../../components/Pagination.jsx";
import { OwnerBillDetails } from "./Bills.jsx";
import { today } from "../../booking.js";
import { ownerFollowUp, ownerFollowUpBooking } from "../../ownerCare.js";
import { useState } from "react";
import { scope, petName } from "../../lib.jsx";
import { useLive, Icon, Modal, setPrefill, pick, fmt12 } from "./ui.jsx";
import { VISIT_TYPES, recordKind, recordDoses, recordHeadline } from "../../ownerVisitType.js";

const fmtDate = d => d ? new Date(d + "T00:00:00").toLocaleDateString("en-PH", { month: "short", day: "numeric", year: "numeric" }) : "—";


/* Owner care summary reads the saved consultation and its explicitly linked follow-up. */
export function OwnerVisits({ db, me, go }) {
  const TODAY = today();
  const vetName = id => (db.vets || []).find(v => v.id === id)?.name || "Veterinarian details unavailable";
  const [pet, setPet] = useState(""), [q, setQ] = useState(""), [openId, setOpenId] = useState(null), [care, setCare] = useState(""), [type, setType] = useState("");
  const pets = scope(db, me, "pets");
  const f = useLive({ from: "", to: "" }, v => { const e = {}; if (v.from && v.to && v.from > v.to) e.to = "“To” must be on or after “From”"; return e; });
  const all = scope(db, me, "records").slice().sort((a, b) => b.date.localeCompare(a.date));
  const appointments = scope(db, me, "appts"), vaccinations = scope(db, me, "vacc");
  const kindOf = r => recordKind(r, appointments);
  const openCard = r => { pick.petId = r.petId; go("vacc"); };
  const open = all.find(r => r.id === openId);
  const billedVisit = open ? appointments.find(a => a.id === open.apptId) : null;
  const plan = open ? ownerFollowUp(open, appointments) : null;
  const book = r => { setPrefill(ownerFollowUpBooking(r)); go("appts"); };
  let list = all;
  if (pet) list = list.filter(r => r.petId === pet);
  if (!f.errs.to) list = list.filter(r => (!f.v.from || r.date >= f.v.from) && (!f.v.to || r.date <= f.v.to));
  if (care) list = list.filter(r => ownerFollowUp(r, appointments)?.status === care);
  if (type) list = list.filter(r => kindOf(r) === type);
  if (q.trim()) list = list.filter(r => [petName(db, r.petId), vetName(r.vetId), r.diagnosis, r.treatment, r.prescription, r.careStatus, r.followUpReason, ...(r.prescriptionItems || []).map(p => `${p.name} ${p.instructions}`)].join(" ").toLowerCase().includes(q.trim().toLowerCase()));
  const filtered = !!(pet || q.trim() || f.v.from || f.v.to || care || type);
  const clear = () => { setPet(""); setQ(""); setCare(""); setType(""); f.quiet({ from: "", to: "" }); };
  const cell = { flex: "1 1 150px", minWidth: 0, width: "auto" };
  const wrap = { overflowWrap: "anywhere", whiteSpace: "pre-wrap" };
  return (<div className="vh">
    <div className="portal-metrics" aria-label="Visit history summary"><div><b>{all.length}</b><span>Saved visit records</span></div><div><b>{all.filter(r => ownerFollowUp(r, appointments)?.status === "Needs booking").length}</b><span>Follow-ups to book</span></div><div><b>{all.filter(r => ownerFollowUp(r, appointments)?.status === "Booked").length}</b><span>Follow-ups booked</span></div></div>
    <div className="vh-filters" style={{ display: "flex", flexWrap: "wrap", gap: 12, alignItems: "flex-end" }}>
      <div className="vh-f vh-search" style={{ ...cell, flex: "2 1 260px" }}>
        <label htmlFor="vh-q">Search visits</label>
        <div className="vh-sbox"><Icon n="search" size={16} /><input id="vh-q" className="vh-in" type="search" value={q} onChange={e => setQ(e.target.value)} placeholder="Pet, vet or diagnosis" /></div>
      </div>
      <div className="vh-f" style={cell}><label htmlFor="vh-pet">Pet</label><select id="vh-pet" className="vh-in" value={pet} onChange={e => setPet(e.target.value)}><option value="">All my pets</option>{pets.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select></div>
      <div className="vh-f" style={cell}><label htmlFor="vh-type">Visit type</label><select id="vh-type" className="vh-in" value={type} onChange={e => setType(e.target.value)}><option value="">All visit types</option>{Object.entries(VISIT_TYPES).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></div>
      <div className="vh-f" style={cell}><label htmlFor="vfrom">From date</label><input id="vfrom" className="vh-in" type="date" max={TODAY} value={f.v.from} onChange={e => f.set("from", e.target.value)} /></div>
      <div className="vh-f" style={cell}><label htmlFor="vto">To date</label><input id="vto" className="vh-in" type="date" max={TODAY} value={f.v.to} onChange={e => f.set("to", e.target.value)} aria-invalid={!!f.errs.to} />{f.errs.to && <span className="err">{f.errs.to}</span>}</div>
      <div className="vh-f" style={cell}><label htmlFor="vh-care">Follow-up</label><select id="vh-care" className="vh-in" value={care} onChange={e => setCare(e.target.value)}><option value="">All follow-ups</option>{["Needs booking", "Booked", "Completed"].map(status => <option key={status}>{status}</option>)}</select></div>
      {filtered && <button className="btn ghost vh-btn" onClick={clear}>Clear filters</button>}
    </div>
    <p className="vh-count" aria-live="polite"><b>{list.length}</b> visit record{list.length === 1 ? "" : "s"}{filtered ? ` of ${all.length}` : ""}</p>
    {list.length ? <>
      <p className="ow-hint vh-tip">Open a visit to read the veterinarian’s instructions, prescription and next steps.</p>
      <div className="tw"><PaginatedTable label="Visit history" resetKey={[pet,q,care,type,f.v.from,f.v.to]} className="vh-tbl"><thead><tr><th>Date</th><th>Pet</th><th>Visit</th><th>Veterinarian</th><th>Diagnosis / what was done</th><th>Follow-up</th><th>Details</th></tr></thead><tbody>{list.map(r => {
        const followUp = ownerFollowUp(r, appointments), kind = kindOf(r), doses = recordDoses(r, vaccinations);
        return <tr key={r.id} className="vh-r" title="Open visit details" onClick={() => setOpenId(r.id)}>
          <td data-label="Date">{fmtDate(r.date)}</td><td data-label="Pet">{petName(db, r.petId)}</td><td data-label="Visit"><span className={`vh-type is-${kind}`}>{VISIT_TYPES[kind]}</span></td><td data-label="Veterinarian">{vetName(r.vetId)}</td><td data-label="Diagnosis">{recordHeadline(r, kind, doses)}{doses.length > 0 && kind === "consultation" && <small className="ow-sub">Also given: {doses.map(d => d.vaccine).join(", ")}</small>}</td>
          <td data-label="Follow-up">{followUp ? <span><b>{followUp.status}{followUp.overdue ? " · Overdue" : ""}</b><small className="ow-sub">Target: {fmtDate(r.followUpDate)}</small></span> : "None requested"}</td>
          <td data-label="Details"><button className="btn sm ghost" aria-label={`View visit for ${petName(db, r.petId)} on ${fmtDate(r.date)}`} onClick={e => { e.stopPropagation(); setOpenId(r.id); }}>View visit</button></td>
        </tr>;
      })}</tbody></PaginatedTable></div>
    </> : <div className="empty"><div><Icon n="file" size={34} /></div>{all.length ? "No visits match these filters." : "No visit records yet. They appear here after your pet is seen by the vet."}</div>}

    {open && <Modal title={`${petName(db, open.petId)} · ${fmtDate(open.date)}`} onClose={() => setOpenId(null)}>
      <div className="vh-care-details" style={{ maxHeight: "70vh", overflowY: "auto", paddingRight: 2 }}>
        {plan && <section className="vh-care-plan" aria-label="Follow-up plan">
          <h4>{open.careStatus}</h4>
          <p><b>{plan.status}{plan.overdue ? " · Overdue" : ""}</b> · Target: {fmtDate(open.followUpDate)}</p>
          {open.followUpReason && <p className="vh-directions">{open.followUpReason}</p>}
          {plan.visit && <p>{plan.status === "Needs booking" ? "Previous visit" : "Linked visit"}: {fmtDate(plan.visit.date)} {plan.visit.time ? fmt12(plan.visit.time) : ""} · {plan.visit.status}</p>}
          <p className="ow-hint">The target date is the veterinarian’s recommendation. A visit requires an available time and clinic confirmation.</p>
          {go && (plan.status === "Needs booking" ? <button className="btn sm" onClick={() => book(open)}>Book this follow-up</button> : <button className="btn sm ghost" onClick={() => { setPrefill(null); go("appts"); }}>View appointments</button>)}
        </section>}
        {(() => { const doses = recordDoses(open, vaccinations); return doses.length > 0 && <section className="vh-doses" aria-label="Recorded on the vaccination card">
          <h4>Recorded on the vaccination card</h4>
          <ul>{doses.map(d => <li key={d.id}><b>{d.vaccine}</b>{d.brand ? ` · ${d.brand}` : ""}{d.batch ? ` · Lot ${d.batch}` : ""}<small className="ow-sub">Given {fmtDate(d.date)}{d.nextDue ? ` · Next due ${fmtDate(d.nextDue)}` : ""}</small></li>)}</ul>
          {go && <button className="btn sm ghost" onClick={() => openCard(open)}>Open {petName(db, open.petId)}’s vaccination card</button>}
        </section>; })()}
        {!!open.prescriptionItems?.length && <section aria-label="Prescribed products" className="vh-rx"><h4>Prescribed products & directions</h4><ul>{open.prescriptionItems.map(p => <li key={p.catalogId}><b>{p.name}</b><p>Prescribed supply: {p.quantity} {p.unit || "item / package"}</p><p className="vh-directions">{p.instructions}</p></li>)}</ul><p className="ow-hint">These are the veterinarian’s prescribed quantities. Reception confirms the products actually supplied at checkout.</p></section>}

        <dl style={{ display: "grid", gridTemplateColumns: "1fr", gap: 12, margin: 0 }}>
          {[["Visit type", VISIT_TYPES[kindOf(open)]], ["Care status", open.careStatus || "Routine care"], ["Veterinarian", vetName(open.vetId)], ["Diagnosis", open.diagnosis], ["Treatment", open.treatment || "—"], ["Full prescription & home-care instructions", open.prescription || (open.prescriptionItems?.length ? "See prescribed products and directions above." : "No prescription recorded")], open.notes ? ["Notes", open.notes] : null].filter(Boolean).map(([k, x]) =>
            <div key={k}><dt style={{ fontSize: "calc(12.5px * var(--fs, 1))", fontWeight: 700, color: "var(--mu)" }}>{k}</dt><dd style={{ margin: "2px 0 0", ...wrap }}>{x}</dd></div>)}
        </dl>
        {billedVisit && <OwnerBillDetails appointment={billedVisit} />}
      </div>
      <div className="row end" style={{ marginTop: 14 }}><button className="btn" onClick={() => setOpenId(null)}>Close</button></div>
    </Modal>}
  </div>);
}
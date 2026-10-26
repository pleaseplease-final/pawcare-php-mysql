import {chronologicalAppointments} from '../../appointmentOrder.js';
import {useFollowingClinicDay} from "../../useClinicDay.js";
import { useState } from "react";
import VisitCard from "../../components/VisitCard.jsx";
import { VETS, TODAY, scope, petName, dueState } from "../../lib.jsx";
import { fmt12, ymdLocal, setPrefill } from "./ui.jsx";
import { holidayName } from "./services.jsx";

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const KIND = { visit: ["Visit", "k-visit"], done: ["Past visit", "k-done"], given: ["Vaccine given", "k-given"], due: ["Vaccine due", "k-due"], over: ["Overdue vaccine", "k-over"] };

export default function OwnerCalendar({ db, me, go }) {
  const t = new Date(TODAY+"T00:00:00"), [cur, setCur] = useState({ y: t.getFullYear(), m: t.getMonth() }), [pet, setPet] = useState(""), [peek, setPeek] = useState(null), [sel, setSel] = useFollowingClinicDay();
  const pets = scope(db, me, "pets"), ev = {};
  const add = (d, e) => { if (d) (ev[d] = ev[d] || []).push(e); };
  scope(db, me, "appts").filter(a => !["Cancelled","Rejected"].includes(a.status) && (!pet || a.petId === pet)).forEach(a => add(a.date, { kind: ["Completed", "No-show"].includes(a.status) || a.date < TODAY ? "done" : "visit", time: a.time, text: `${petName(db, a.petId)}: ${a.reason}`, sub: `${(VETS.find(v => v[0] === a.vetId) || [])[1] || ""} · ${a.status}`, appt: a }));
  scope(db, me, "vacc").filter(v => !pet || v.petId === pet).forEach(v => {
    if(v.done) add(v.date, { kind: "given", text: `${petName(db, v.petId)}: ${v.vaccine} given`, sub: v.notes || "", vacc: v });
    if (!v.done && v.nextDue) add(v.nextDue, { kind: dueState(v.nextDue) === "Overdue" ? "over" : "due", text: `${petName(db, v.petId)}: ${v.vaccine} due`, sub: dueState(v.nextDue), vacc: v });
  });
  Object.values(ev).forEach(events=>events.sort(chronologicalAppointments));
  const first = new Date(cur.y, cur.m, 1), cells = Array.from({ length: 42 }, (_, i) => new Date(cur.y, cur.m, 1 - first.getDay() + i));
  const move = n => { const d = new Date(cur.y, cur.m + n, 1); setCur({ y: d.getFullYear(), m: d.getMonth() }); };
  const list = (ev[sel] || []).slice().sort(chronologicalAppointments);
  const book = (petId, reason, date) => { setPrefill({ petId, reason, date }); go("appts"); };
  const nice = new Date(sel + "T00:00:00").toLocaleDateString("en-PH", { weekday: "long", month: "long", day: "numeric", year: "numeric" });
  return (<>
    <div className="ow-cal">
      <div className="ow-calhd">
        <button className="btn ghost sm" onClick={() => move(-1)} aria-label="Previous month">‹</button>
        <h2 aria-live="polite">{MONTHS[cur.m]} {cur.y}</h2>
        <select value={pet} onChange={e => setPet(e.target.value)} aria-label="Pet" style={{ width: "auto" }}><option value="">All my pets</option>{pets.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select>
        <button className="btn ghost sm" onClick={() => { setCur({ y: t.getFullYear(), m: t.getMonth() }); setSel(TODAY); }}>Today</button>
        <button className="btn ghost sm" onClick={() => move(1)} aria-label="Next month">›</button>
      </div>
      <div className="ow-grid" role="grid" aria-label="Calendar">
        {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map(d => <div key={d} className="ow-dow">{d}</div>)}
        {cells.map(d => {
          const k = ymdLocal(d), items = ev[k] || [], out = d.getMonth() !== cur.m, past = k < TODAY, hol = holidayName(k);
          return <button key={k} className={`ow-day${out ? " out" : ""}${past ? " past" : ""}${hol ? " hol" : ""}${k === TODAY ? " today" : ""}${k === sel ? " sel" : ""}`} disabled={past} onClick={e => { if (past) return; setSel(k); if (out) setCur({ y: d.getFullYear(), m: d.getMonth() }); const chip = e.target.closest?.("[data-ev]"); if (chip) setPeek({ k, i: Number(chip.getAttribute("data-ev")) }); }} aria-label={`${d.toDateString()}, ${items.length} event(s)${past ? ", past day, not available" : ""}`}>
            <b>{d.getDate()}</b>
            {hol && <span className="ow-hol" title={hol}>{hol}</span>}
            <div className="ow-evs">{items.slice(0, 3).map((e, i) => <div key={i} data-ev={i} className={`ow-ev ${KIND[e.kind][1]}`} title={e.text}><i className="ow-dot" /><span>{e.text}</span></div>)}</div>
            {items.length > 3 && <span className="ow-more">+{items.length - 3} more</span>}
          </button>;
        })}
      </div>
      <div className="ow-legend">{Object.values(KIND).map(([l, c]) => <span key={l} className={`ow-ev ${c}`}><i className="ow-dot" />{l}</span>)}<span className="ow-pastkey"><i />Past day (not available)</span><span className="ow-holkey"><i />Holiday (clinic closed)</span></div>
    </div>
    <div className="ow-dayp">
      <h3>{nice}{sel === TODAY ? " (today)" : ""}</h3>
      {list.length ? list.map((e, i) => <div className="ow-evrow" key={i}>
        <span className={`ow-ev ${KIND[e.kind][1]}`}><i className="ow-dot" />{KIND[e.kind][0]}</span>
        <div><b>{e.time ? `${fmt12(e.time)} · ` : ""}{e.text}</b>{e.sub && <small>{e.sub}</small>}</div>
        <button className="btn ghost sm" onClick={() => setPeek({ k: sel, i })}>Details</button>
        {e.appt && (e.kind === "visit") && <button className="btn ghost sm" onClick={() => go("appts")}>Manage</button>}
        {(e.kind === "due" || e.kind === "over") && <button className="btn sm" onClick={() => book(e.vacc.petId, e.vacc.vaccine === "Deworming" ? "Deworming" : "Vaccination")}>Book a visit</button>}
      </div>) : <p className="ow-hint">Nothing scheduled on this day.</p>}
      {holidayName(sel) && <p className="ow-note">Holiday: {holidayName(sel)}. The clinic is closed, so visits can’t be booked on this day.</p>}
      {sel >= TODAY && !holidayName(sel) && pets.length > 0 && <div style={{ marginTop: 10 }}><button className="btn ghost sm" onClick={() => book(pet || "", "", sel)}>+ Book a visit on this day</button></div>}
    </div>
    {(() => {
      const e = peek && (ev[peek.k] || []).slice().sort(chronologicalAppointments)[peek.i];
      if (!e) return null;
      const a = e.appt, v = e.vacc, [kindLabel] = KIND[e.kind];
      return <VisitCard title={e.text.split(":")[0]} subtitle={kindLabel} tone="#2563eb" onClose={() => setPeek(null)}
        icon={<span style={{ fontWeight: 800 }}>{String(e.text).charAt(0)}</span>}
        status={<span className={`ow-ev ${KIND[e.kind][1]}`}><i className="ow-dot" />{kindLabel}</span>}
        rows={a ? [["Date", a.date], ["Time", a.time && fmt12(a.time)], ["Reason", a.reason], ["Veterinarian", (VETS.find(x => x[0] === a.vetId) || [])[1]], ["Status", a.status]]
          : [["Date", e.kind === "given" ? v.date : v.nextDue], ["Vaccine", v.vaccine], ["Notes", v.notes], ["Status", e.sub]]}>
        {a && e.kind === "visit" && <button className="btn sm" onClick={() => { setPeek(null); go("appts"); }}>Manage visit</button>}
        {(e.kind === "due" || e.kind === "over") && <button className="btn sm" onClick={() => { setPeek(null); book(v.petId, v.vaccine === "Deworming" ? "Deworming" : "Vaccination"); }}>Book a visit</button>}
      </VisitCard>;
    })()}
  </>);
}

import VisitNextStep from '../../components/VisitNextStep.jsx';
import { VaccineEstimate } from "../../components/VaccineBooking.jsx";
import { OwnerBillDetails } from "./Bills.jsx";
import { today } from "../../booking.js";
import { Badge } from "../../lib.jsx";
import { Modal, fmt12 } from "./ui.jsx";
import { SERVICES, addMin, durOf, durText } from "./services.jsx";

const OPEN = ["Pending Approval", "Scheduled"];

/* Pop-up card with the full details of one visit. Edit and Cancel show only while the visit can still change. */
export default function ApptDetails({ a, db, note, onClose, onEdit, onCancel }) {
  const p = db.pets.find(x => x.id === a.petId) || {}, S = a.service && SERVICES[a.service];
  const open = OPEN.includes(a.status) && a.date >= today();
  const rows = [
    ["Date", a.date], ["Time", `${fmt12(a.time)}${S ? ` to ${fmt12(addMin(a.time, durOf(a)))}` : ""}`],
    ["Pet", p.name], ["Veterinarian", (db.vets || []).find(v => v.id === a.vetId)?.name || "Veterinarian details unavailable"],
    ["Service", S ? `${S.label} · ${durText(durOf(a))}` : ""], ["Reason", a.reason],
    ["Payment status", a.billingStatus || "Unbilled"], ["Your note", a.notes], [a.status === "Rejected" ? "Rejection reason" : "Cancel reason", a.cancelReason],
  ].filter(([, x]) => x);
  return (
    <Modal title="Visit details" onClose={onClose}>
      <div style={{ maxHeight: "70vh", overflowY: "auto" }}>
        <p style={{ margin: "0 0 12px" }}><Badge v={a.status} />{note && <small className="ow-sub">{note}</small>}</p>
        <dl style={{ display: "grid", gridTemplateColumns: "1fr", gap: 12, margin: 0 }}>
          {rows.map(([k, x]) => <div key={k}><dt style={{ fontSize: "calc(12.5px * var(--fs, 1))", fontWeight: 700, color: "var(--mu)" }}>{k}</dt><dd style={{ margin: "2px 0 0", overflowWrap: "anywhere", whiteSpace: "pre-wrap" }}>{x}</dd></div>)}
        </dl>
        <VisitNextStep visit={a} />
        <VaccineEstimate appointment={a} />
        <OwnerBillDetails appointment={db.appts.find(x => x.id === a.id) || a} />
      </div>
      <div className="row end" style={{ marginTop: 14 }}>
        {open && <><button className="btn ghost" onClick={onEdit}>Edit</button><button className="btn danger" onClick={onCancel}>Cancel visit</button></>}
        <button className="btn" onClick={onClose}>Close</button>
      </div>
    </Modal>
  );
}
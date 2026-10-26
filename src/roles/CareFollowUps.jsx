import { PaginatedList } from "../components/Pagination.jsx";
import { ownerFollowUp, ownerFollowUpBooking } from "../ownerCare.js";
import { petName } from "../lib.jsx";
import { setPrefill } from "./owner/ui.jsx";
export default function CareFollowUps({db, go, owner = false}) {
  const records = db.records.filter(r => r.followUpDate && r.careStatus !== 'Routine care');
  if (!records.length) return null;
  return <section className="card care-followups"><h3>Follow-up care</h3><PaginatedList label="Follow-up care" resetKey={null}>{records.map(r => {
    const plan = ownerFollowUp(r, db.appts);
    const visit = plan.visit;
    const completed = plan.status === 'Completed';
    const booked = plan.status === 'Booked';
    return <div key={r.id} className="care-followup"><b>{petName(db,r.petId)} · {r.careStatus}</b>
      <p className="care-followup-target">Target: {r.followUpDate}{plan.overdue ? ' · Overdue' : ''}</p><p style={{whiteSpace:"pre-wrap"}}>{r.followUpReason}</p>
      <p className="care-followup-status">{completed ? `Completed · ${visit.date}` : booked ? `Booked · ${visit.date} · ${visit.status}` : `Needs booking${visit ? ` · Previous visit ${visit.status.toLowerCase()}` : ''}`}</p>
      {!completed && !booked && <button className="btn sm" onClick={() => { setPrefill(ownerFollowUpBooking(r)); go(owner ? 'appts' : 'cal'); }}>Book follow-up</button>}
    </div>;
  })}</PaginatedList></section>;
}

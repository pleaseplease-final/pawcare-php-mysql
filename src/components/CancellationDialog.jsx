import {useUnsavedChanges} from './useUnsavedChanges.jsx';
import LiveControl from './LiveControl.jsx';
import { useEffect, useRef, useState } from 'react';
import { sameIntakeVisit } from '../intakeVisit.js';
import { useSubmissionReview } from './SubmissionReview.jsx';

export default function CancellationDialog({visit,currentVisit,onClose,onSubmit,error,reject=false}) {
  const action = reject ? "Reject request" : "Cancel appointment";
  const reviewTitle = reject ? "Review rejection" : "Review cancellation";
  const dialog = useRef(null);
  const [reason,setReason] = useState(''), [saving,setSaving] = useState(false);
  const pending = useRef(false);
  const unsaved=useUnsavedChanges({value:reason,saving,onClose});
  const stale = !currentVisit || !sameIntakeVisit(visit,currentVisit);
  const review = useSubmissionReview([reason,visit,currentVisit]);
  useEffect(()=>{dialog.current.showModal();},[]);
  return <dialog ref={dialog} className="submission-review" aria-label={action} onCancel={e=>{e.preventDefault();if(!pending.current)unsaved.close();}}>
    {review.card}{unsaved.card}
    <form onSubmit={async e=>{
      e.preventDefault();
      if(pending.current || stale || !reason.trim() || reason.length>500)return;
      if(!await review.ask({title:reviewTitle,confirmLabel:action,description:reject ? 'The owner will see this reason. Rejection releases the reserved time.' : 'This cancels the saved visit and releases its reserved time.',fields:[['Visit',`${visit.date} ${visit.time}`],['Reason',reason.trim()]]}))return;
      pending.current=true;setSaving(true);
      try {await onSubmit(reason.trim());} finally {pending.current=false;setSaving(false);}
    }}>
      <h3>{action}</h3>
      <label>{reject ? "Rejection reason" : "Cancellation reason"}<LiveControl as="textarea" required maxLength={500} value={reason} disabled={saving} onChange={e=>setReason(e.target.value)} /></label>
      {(error || stale) && <p role="alert" className="err">{stale ? 'The visit changed. Close this form and reopen its current action.' : error}</p>}
      <div className="row end"><button type="button" className="btn ghost" disabled={saving} onClick={unsaved.close}>Keep appointment</button>
        <button className="btn danger" disabled={saving || stale || !reason.trim()}>{saving ? 'Saving…' : reviewTitle}</button></div>
    </form>
  </dialog>;
}

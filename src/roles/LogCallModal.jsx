import ClinicDialog from '../components/ClinicDialog.jsx';
import {useUnsavedChanges} from '../components/useUnsavedChanges.jsx';
import LiveControl from '../components/LiveControl.jsx';
import { PaginatedList } from "../components/Pagination.jsx";
import {useEffect,useRef,useState} from 'react';
import {Phone,X} from 'lucide-react';
import {api} from '../api.js';
import {addLog} from '../lib.jsx';
import {currentVaccinationDue} from '../ownerVaccination.js';
import {CALL_OUTCOMES,validateReminderCall,savedReminderCall} from '../reminderCall.js';

const callTime=value=>new Intl.DateTimeFormat('en-PH',{timeZone:'Asia/Manila',dateStyle:'medium',timeStyle:'short'}).format(new Date(value));
export default function LogCallModal({target,db,onClose,onLogged,me,setDb,say}) {
  const [outcome,setOutcome]=useState(''),[notes,setNotes]=useState(''),[saving,setSaving]=useState(false),[error,setError]=useState('');
  const [calls,setCalls]=useState([]),[historyError,setHistoryError]=useState(''),[saved,setSaved]=useState(null),[historyLoading,setHistoryLoading]=useState(true);
  const requestId=useRef(crypto.randomUUID()),inFlight=useRef(false);
  const pet=(db?.pets || []).find(p=>p.id===target?.p?.id);
  const owner=(db?.owners || []).find(o=>o.id===pet?.ownerId);
  const recall=currentVaccinationDue(db?.vacc || db?.vaccs || []).find(v=>v.id===target?.v?.id);
  const phone=(owner?.phone || '').trim();
  const stale=!pet || !owner || !recall || recall.petId!==pet.id || recall.nextDue!==target?.v?.nextDue || owner.id!==target?.o?.id || phone!==(target?.o?.phone || '').trim();
  const loadHistory=async()=>{
    setHistoryLoading(true);setHistoryError('');
    try {
      const data=await api.get(`/api/reminders/calls?petId=${encodeURIComponent(target.p.id)}`);
      if (!data?.success || !Array.isArray(data.calls)) throw Error('The server did not confirm saved call history.');
      setCalls(previous=>[...new Map([...data.calls,...previous].map(call=>[call.id,call])).values()].sort((a,b)=>Date.parse(b.createdAt)-Date.parse(a.createdAt)));
    } catch(e) {setHistoryError(e.message);}
    finally {setHistoryLoading(false);}
  };
  useEffect(()=>{if(target?.p?.id)loadHistory();},[target?.p?.id]);
  if (!target) return null;
  const submit=async event=>{
    event.preventDefault();if(inFlight.current) return;
    setError('');
    if(stale){setError('The recall or contact details changed. Refresh clinic records and reopen this form.');return;}
    let body;
    try {body=validateReminderCall({requestId:requestId.current,vaccinationId:recall.id,petId:pet.id,ownerId:owner.id,dueDate:recall.nextDue,expectedPhone:phone,outcome,notes});}
    catch(e){setError(e.message);return;}
    inFlight.current=true;setSaving(true);
    try {
      const call=savedReminderCall(await api.post('/api/reminders/log-call',{...body,logOnly:true}),body);
      setSaved(call);setCalls(previous=>[call,...previous.filter(c=>c.id!==call.id)]);
      setDb?.(previous=>({...previous,log:addLog(previous,me,`Recorded reminder call ${call.id} for ${call.petId}: ${call.outcome}`)}));
      say?.(`Call outcome saved: ${call.outcome}.`);
    } catch(e){setError(e.message);inFlight.current=false;}
    finally {setSaving(false);}
  };
  const done=()=>{if(saved)onLogged?.(saved);onClose();};
  const unsaved=useUnsavedChanges({value:{outcome,notes},saving,active:!saved,onClose:done});
  return <ClinicDialog label="Record reminder call" onClose={unsaved.close}>
    {unsaved.card}
    <div className="modal" aria-labelledby="reminder-call-title" style={{width:'min(560px,100%)',maxHeight:'94vh',overflowY:'auto',overflowWrap:'anywhere'}}>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',gap:12}}>
        <h3 id="reminder-call-title"><Phone size={20} aria-hidden="true"/> Record reminder call</h3>
        <button type="button" className="btn ghost sm" aria-label="Close call record" disabled={saving} onClick={unsaved.close}><X size={18}/></button>
      </div>
      <p>Record the outcome of your phone call. Automatic email and SMS results appear in the front desk reminder panel.</p>
      <section className="sf-note">
        <b>{pet?.name || target.p.name}</b> · {owner?.name || target.o.name}
        <p>{recall?.vaccine || target.v.vaccine} · Booster due {recall?.nextDue || target.v.nextDue}</p>
        <p>Phone: {phone || 'No phone number recorded'}</p>
      </section>
      {stale&&!saved&&<p className="err" role="alert">The recall or contact details changed. Refresh clinic records and reopen this form.</p>}
      {saved ? <section role="status" className="sf-note">
        <b>Call record saved: {saved.outcome}</b>
        <p>{callTime(saved.createdAt)} · {saved.staffName}</p>
        {saved.notes&&<p style={{whiteSpace:'pre-wrap'}}>{saved.notes}</p>}
        <button className="btn gold" onClick={unsaved.close}>Done</button>
      </section> : <form onSubmit={submit}>
        <div className="sf-field"><label htmlFor="reminder-call-outcome">Call outcome *</label>
          <LiveControl as="select" required id="reminder-call-outcome" value={outcome} disabled={saving||stale} onChange={e=>setOutcome(e.target.value)}>
            <option value="">Choose what happened</option>{CALL_OUTCOMES.map(value=><option key={value} value={value}>{value}</option>)}
          </LiveControl>
        </div>
        <div className="sf-field"><label htmlFor="reminder-call-notes">Call notes (optional, up to 2,000 characters)</label>
          <LiveControl as="textarea" id="reminder-call-notes" rows={3} maxLength={2000} value={notes} disabled={saving||stale} onChange={e=>setNotes(e.target.value)} placeholder="Record the owner's response and agreed next step."/>
        </div>
        {error&&<p className="err" role="alert">{error}</p>}
        <div className="row end" style={{flexWrap:'wrap',gap:10}}>
          <button type="button" className="btn ghost" disabled={saving} onClick={unsaved.close}>Cancel</button>
          <button type="submit" className="btn gold" disabled={saving||stale}>{saving?'Saving call…':'Save call outcome'}</button>
        </div>
      </form>}
      <section style={{marginTop:20}} aria-label="Saved call history">
        <h4>Recent call history for this patient</h4>
        {historyLoading&&<p>Loading saved calls…</p>}
        {historyError&&<p className="err" role="alert">{historyError} <button className="btn ghost sm" onClick={loadHistory}>Reload history</button></p>}
        {!historyLoading&&!historyError&&!calls.length&&<p>No call outcomes recorded.</p>}
        <PaginatedList label="Call history" resetKey={null}>{calls.map(call=><article key={call.id} className="sf-note" style={{marginBottom:10}}>
          <b>{call.outcome}</b> · {callTime(call.createdAt)}
          <p>{call.vaccine} · Due {call.dueDate} · {call.staffName}</p>
          <p>Phone: {call.phone || 'Not recorded'}</p>
          {call.notes&&<p style={{whiteSpace:'pre-wrap'}}>{call.notes}</p>}
        </article>)}</PaginatedList>
      </section>
    </div>
  </ClinicDialog>;
}

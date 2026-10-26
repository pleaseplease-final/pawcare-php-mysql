import ClinicDialog from "../components/ClinicDialog.jsx";
import {useUnsavedChanges} from '../components/useUnsavedChanges.jsx';
import {useFormValidation} from '../components/useFormValidation.jsx';
import { useSubmissionReview } from "../components/SubmissionReview.jsx";
import { useRef, useState } from "react";
import { api } from "../api.js";
import { applyClinicState } from "../clinicState.js";
import { intakeVisitSnapshot, sameIntakeVisit } from "../intakeVisit.js";
import { removeHandedOffVisit, savedHandoff } from "../vetHandoff.js";

export default function HandoffModal({ appt, db, me, setDb, onClose }) {
  const [vetId,setVet]=useState(''),[note,setNote]=useState(''),[error,setError]=useState(''),[saving,setSaving]=useState(false);
  const [saved,setSaved]=useState(null),[refreshError,setRefreshError]=useState(''),[refreshing,setRefreshing]=useState(false);
  const inFlight=useRef(false),refreshFlight=useRef(false);
  const current=db.appts.find(a=>a.id===appt.id),pet=db.pets.find(p=>p.id===appt.petId);
  const recipients=db.vets.filter(v=>![me.id,me.vetId].includes(v.id));
  const stale=!pet || !current || !sameIntakeVisit(current,appt) || ![me.id,me.vetId].includes(current.vetId) || !['Checked-in','In consultation'].includes(current.status);
  const validation=useFormValidation({vetId:!recipients.some(v=>v.id===vetId)?'Choose a receiving veterinarian.':'',note:!note.trim()?'Handoff instructions are required.':note.length>3000?'Keep instructions under 3,000 characters.':''});
  const unsaved=useUnsavedChanges({value:{vetId,note},saving:saving||refreshing,active:!saved,onClose});
  const review = useSubmissionReview([vetId,note,current,pet,recipients,stale]);
  async function refresh() {
    if(refreshFlight.current)return;
    refreshFlight.current=true;setRefreshing(true);setRefreshError('');
    try {
      const state=await api.get('/api/state');
      if(!['appts','pets','owners','vets','vaccs','consults'].every(key=>Array.isArray(state?.[key])))throw Error('Unconfirmed clinic state');
      setDb(p=>applyClinicState(p,state));
    }
    catch {setRefreshError('Care was transferred, but clinic records could not refresh. Retry the refresh to load your current queue.');}
    finally {refreshFlight.current=false;setRefreshing(false);}
  }
  async function submit(e) {
    e.preventDefault();if(inFlight.current)return;setError('');
    if(!validation.validate(e))return;
    if(stale){setError('This visit has changed. Refresh clinic records and reopen the handoff.');return;}
    if (!await review.ask({title:"Review care transfer",confirmLabel:"Confirm care transfer",description:"The receiving veterinarian gets this visit and patient history. Your access changes after transfer; include the findings needed to continue care.",fields:[
        ["Patient",pet.name],
        ["Visit",`${appt.date} at ${appt.time}`],
        ["Receiving veterinarian",recipients.find(v=>v.id===vetId)?.name],
        ["Handoff instructions",note.trim()]]}))return;
    inFlight.current=true;setSaving(true);
    try {
      const result=savedHandoff(await api.post(`/api/appointments/${appt.id}/handoff`,{vetId,note:note.trim(),expectedVisit:intakeVisitSnapshot(appt)}),appt,vetId,note,me);
      setSaved(result);setDb(p=>removeHandedOffVisit(p,appt.id,me));
      await refresh();
    } catch(e){setError(e.message);inFlight.current=false;}
    finally {setSaving(false);}
  }
  return <ClinicDialog labelledBy="handoff-title" onClose={unsaved.close}><div className="modal" aria-labelledby="handoff-title" style={{width:'min(600px,100%)',maxHeight:'94vh',overflowY:'auto',overflowWrap:'anywhere'}}>
    {review.card}{unsaved.card}<h3 id="handoff-title">Hand over patient care</h3>
    {saved ? <>
      <section role="status" className="sf-note"><b>Care transferred to {saved.to}</b><p>The visit is in the receiving veterinarian’s waiting queue.</p><p>{new Intl.DateTimeFormat('en-PH',{timeZone:'Asia/Manila',dateStyle:'medium',timeStyle:'short'}).format(new Date(saved.at))}</p><p style={{whiteSpace:'pre-wrap'}}>{saved.note}</p></section>
      {refreshing&&<p>Refreshing your clinic records…</p>}
      {refreshError&&<p role="alert" className="err">{refreshError}</p>}
      <div className="row end" style={{flexWrap:'wrap',gap:10}}>{refreshError&&<button type="button" className="btn" disabled={refreshing} onClick={refresh}>{refreshing?'Refreshing…':'Retry refresh'}</button>}<button type="button" className="btn gold" disabled={saving||refreshing} onClick={onClose}>Done</button></div>
    </> : <form {...validation.formProps} onSubmit={submit}>
      <p><b>{pet?.name || 'Patient unavailable'}</b> · Visit {appt.date} at {appt.time}</p>
      <p>The receiving veterinarian gets the visit, intake and patient history. Include current findings, care already given and next steps.</p>
      {appt.intakeVitals&&<p className="sf-note">Saved intake: {appt.intakeVitals.weight} kg · {appt.intakeVitals.temp}°C{appt.intakeVitals.triageLevel?` · ${appt.intakeVitals.triageLevel}`:''}</p>}
      {stale&&<p role="alert" className="err">This visit has changed. Refresh clinic records and reopen the handoff.</p>}
      <div className="sf-field">
        <label htmlFor="handoff-vet">Receiving veterinarian *</label>
        <select {...validation.field('vetId')} id="handoff-vet" value={vetId} disabled={saving||stale} onChange={e=>{setVet(e.target.value);setError('');}}>
          <option value="">Choose veterinarian</option>
          {recipients.map(v=><option key={v.id} value={v.id}>{v.name}</option>)}
        </select>
        {validation.feedback('vetId')}
      </div>
      {!recipients.length&&<p>No other active veterinarian is available in the directory.</p>}
      <div className="sf-field">
        <label htmlFor="handoff-note">Handoff instructions *</label>
        <textarea {...validation.field('note')} id="handoff-note" rows={4} maxLength={3000} value={note} disabled={saving||stale} onChange={e=>{setNote(e.target.value);setError('');}} placeholder="Enter findings, symptoms, current vital signs, and next examination steps..."/>
        <div style={{display:'flex',justifyContent:'space-between',fontSize:"calc(11.5px * var(--fs, 1))",color:'#64748b',marginTop:2}}>
          <span>Saved intake and clinical notes are forwarded with this patient</span>
          <span>{note.length} / 3000</span>
        </div>
        {validation.feedback('note')}
      </div>
      <p>The visit returns to the receiving vet’s waiting queue. Save any relevant draft findings in these instructions before transferring.</p>
      {error&&<p role="alert" className="err">{error}</p>}<div className="row end" style={{flexWrap:'wrap',gap:10}}><button type="button" className="btn ghost" disabled={saving} onClick={unsaved.close}>Close</button><button type="submit" className="btn gold" disabled={saving||stale||!recipients.length}>{saving?'Transferring…':'Review care transfer'}</button></div>
    </form>}
  </div></ClinicDialog>;
}

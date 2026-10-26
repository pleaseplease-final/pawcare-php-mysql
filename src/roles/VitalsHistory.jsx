import {useEffect,useRef,useState} from 'react';
import {clinicRequest} from '../clinicApi.js';
import {useFormValidation} from '../components/useFormValidation.jsx';
import {correctionErrors} from '../vitalValidation.js';
const when=value=>value?new Date(value).toLocaleString('en-PH',{timeZone:'Asia/Manila'}):'Exact measurement time not recorded';
export function Correction({entry,onCancel,onSaved}) {
 const [value,setValue]=useState(String(entry.value)),[reason,setReason]=useState(''),[error,setError]=useState(''),[saving,setSaving]=useState(false);
 const pending=useRef(false),request=useRef(null),validation=useFormValidation(correctionErrors(value,reason,entry.kind));
 const submit=async event=>{
  event.preventDefault();if(pending.current||!validation.validate(event))return;
  const body={value:Number(value),reason:reason.trim()},signature=JSON.stringify(body);
  if(request.current?.signature!==signature)request.current={signature,id:crypto.randomUUID()};
  pending.current=true;setSaving(true);setError('');
  try{
   const result=await clinicRequest('POST',`/api/pets/${entry.petId}/vitals/${encodeURIComponent(entry.id)}/correct`,{...body,requestId:request.current.id});
   if(!result.success||result.measurement?.correctsId!==entry.id)throw Error('The clinic did not confirm this correction. Refresh history before retrying.');
   onSaved();
  }catch(e){setError(e.message);}finally{pending.current=false;setSaving(false);}
 };
 return <form {...validation.formProps} onSubmit={submit} aria-label="Correct measurement">
  <p>The original entry stays in the history. Use intake or admission recording for a new measurement.</p>
  <label>Correct value ({entry.unit})<input type="number" step="0.01" min={entry.kind==='weight'?0.01:33} max={entry.kind==='weight'?120:45} required {...validation.field('value')} value={value} onChange={e=>setValue(e.target.value)} disabled={saving}/>{validation.feedback('value')}</label>
  <label>Reason for correction<textarea required minLength={3} maxLength={500} {...validation.field('reason')} value={reason} onChange={e=>setReason(e.target.value)} disabled={saving}/>{validation.feedback('reason')}</label>
  {error&&<p role="alert" className="err">{error}</p>}<button type="submit" className="btn sm" disabled={saving}>Save linked correction</button><button type="button" className="btn ghost sm" onClick={onCancel} disabled={saving}>Cancel</button>
 </form>;
}
export function VitalEntries({entries=[],canCorrect=false,onCorrect=()=>{}}) {
 return <ol>{entries.map(entry=><li key={entry.id} style={{marginBottom:14}}>
  <b>{entry.kind==='weight'?'Weight':entry.kind==='temp'?'Temperature':'Admission observation'}{entry.value!==null?`: ${entry.value} ${entry.unit}`:''}</b>
  <p>{entry.origin==='registration'?'Reported at registration · not a clinic measurement':entry.origin==='legacy_unknown'?'Historical source unknown':`Clinic · ${entry.source}`} · Visit: {entry.visitId || 'Not linked in historical record'}</p>
  <p>{entry.measuredAt?when(entry.measuredAt):`${entry.date} · exact measurement time unknown`} · Recorded {when(entry.recordedAt)} by {entry.staffName}{entry.staffRole?` (${entry.staffRole})`:''}</p>
  {entry.correctsId&&<p><b>Correction of {entry.correctsId}:</b> {entry.correctionReason}</p>}{entry.supersededBy&&<p><b>Corrected by {entry.supersededBy}</b> · original retained</p>}
  {entry.notes&&<p style={{whiteSpace:'pre-wrap'}}>{entry.notes}</p>}
  {canCorrect && entry.origin==='clinic' && entry.kind!=='observation' && !entry.supersededBy && <button className="btn ghost sm" onClick={()=>onCorrect(entry)}>Correct entry</button>}
 </li>)}</ol>;
}
export default function VitalsHistory({petId,me,refreshKey,onChanged}) {
 const [entries,setEntries]=useState([]),[reports,setReports]=useState([]),[page,setPage]=useState(null),[loading,setLoading]=useState(false),[error,setError]=useState(''),[correcting,setCorrecting]=useState(null),[version,setVersion]=useState(0);
 const pending=useRef(null),generation=useRef(0);
 const load=async(cursor=null,token=generation.current)=>{
  if(pending.current)return;
  const controller=new AbortController();pending.current=controller;setLoading(true);setError('');
  const timer=setTimeout(()=>controller.abort(),20000);
  try{
   const result=await clinicRequest('GET',`/api/pets/${petId}/vitals${cursor?'?'+new URLSearchParams({cursor}):''}`,undefined,{signal:controller.signal});
   if(controller.signal.aborted||token!==generation.current)return;
   if(!result.success||!Array.isArray(result.measurements)||!result.page)throw Error('Vital history could not be confirmed. Retry loading.');
   setEntries(previous=>cursor?[...new Map([...previous,...result.measurements].map(r=>[r.id,r])).values()]:result.measurements);setReports(result.registrationReports || []);setPage(result.page);
  }catch(e){if(token===generation.current&&!controller.signal.aborted)setError(e.message);else if(token===generation.current)setError('History loading timed out. Retry loading.');}
  finally{clearTimeout(timer);if(pending.current===controller){pending.current=null;setLoading(false);}}
 };
 useEffect(()=>{generation.current++;pending.current?.abort();pending.current=null;setEntries([]);setReports([]);setPage(null);setCorrecting(null);load();return()=>{generation.current++;pending.current?.abort();pending.current=null;};},[petId,refreshKey,version]);
 return <section className="card" aria-label="Vitals and observations history">
  <h3>Vitals and observations history</h3><p>Clinic times are shown in Manila. Every saved measurement is retained; corrections link to the earlier entry.</p>
  {reports.length>0&&<aside><h4>Registration weight reports</h4>{reports.map(r=><p key={r.id}>{r.date} · {r.value} {r.unit} · reported at registration, not clinic measured</p>)}</aside>}
  {error&&<p role="alert" className="err">{error}</p>}{loading&&<p role="status">Loading history…</p>}
  <VitalEntries entries={entries} canCorrect={['vet','assistant'].includes(me?.role)} onCorrect={setCorrecting}/>
  {!entries.length&&!loading&&!error&&page&&<p>No saved measurements.</p>}
  {correcting&&<Correction key={correcting.id} entry={correcting} onCancel={()=>setCorrecting(null)} onSaved={()=>{setCorrecting(null);setVersion(v=>v+1);onChanged?.();}}/>}
  {(!page||page.hasMore||error)&&<button className="btn sm" disabled={loading} onClick={()=>load(page?.cursor || null)}>{error?'Retry loading':page?'Load earlier measurements':'Load history'}</button>}
  {page&&!page.hasMore&&!loading&&!error&&<p>Complete measurement history loaded.</p>}
 </section>;
}

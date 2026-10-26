import {useEffect,useRef,useState} from 'react';
import {api} from '../api.js';
import {useFormValidation} from '../components/useFormValidation.jsx';
import {clinicDocumentErrors,clinicDocumentFields} from '../clinicDocumentValidation.js';
import './digital-vet-card.css';

const blank=()=>Object.fromEntries([...clinicDocumentFields.map(([key])=>[key,'']),['confirmed',false]]);
const hints={
 name:'Use the registered clinic name shown on your records.',
 address:'Include the street, city or municipality, and province.',
 phone:'Include the area or country code.',
 email:'Use the clinic’s current contact email.',
 registration:'Copy the reference from the clinic’s current registration or license.',
 verificationSource:'Identify the document or record you checked, including its date or reference.'
};

function ClinicDetailsForm({profile,onSaved,onReload}){
 const [form,setForm]=useState(()=>({...blank(),...profile.details,verificationSource:profile.verification_source||''}));
 const [saving,setSaving]=useState(false),[error,setError]=useState(''),[message,setMessage]=useState(''),[edited,setEdited]=useState(false);
 const [serverErrors,setServerErrors]=useState({});
 const validation=useFormValidation({...clinicDocumentErrors(form),...serverErrors}),pending=useRef(false);
 const edit=(key,value)=>{
  setMessage('');setEdited(true);
  setServerErrors(previous=>{const next={...previous};delete next[key];if(key!=='confirmed')delete next.confirmed;return next;});
  setForm(previous=>({...previous,[key]:value,...(key==='confirmed'?{}:{confirmed:false})}));
 };
 const submit=async event=>{
  event.preventDefault();
  if(pending.current||!validation.validate(event))return;
  pending.current=true;setSaving(true);setError('');setMessage('');
  try{
   const response=await api.put('/api/clinic-document-profile',{...form,revision:profile.revision});
   onSaved(response.profile);setEdited(false);
   setMessage('Verified clinic details saved. Eligible cards refresh automatically when opened or downloaded.');
  }catch(e){setError(e.message);setServerErrors(e.fields||{});}
  finally{pending.current=false;setSaving(false);}
 };
 const field=key=>{
  const [,label,max]=clinicDocumentFields.find(([name])=>name===key);
  const props=validation.field(key),long=key==='address'||key==='verificationSource';
  const inputProps={...props,required:true,maxLength:max,value:form[key],onChange:e=>edit(key,e.target.value),'aria-describedby':`${props['aria-describedby']} ${props.id}-hint`,autoComplete:'off'};
  return <div className={`clinic-document-field${!['phone','email'].includes(key)?' clinic-document-field-wide':''}`} key={key}>
   <label htmlFor={props.id}>{label} <span aria-hidden="true">*</span></label>
   {long?<textarea {...inputProps} rows={2}/>:<input {...inputProps} type={key==='email'?'email':key==='phone'?'tel':'text'}/>}
   <small id={`${props.id}-hint`}>{hints[key]}</small>
   {validation.feedback(key)}
  </div>;
 };
 return <form {...validation.formProps} onSubmit={submit} aria-label="Clinic document details" aria-busy={saving}>
  <fieldset className="clinic-document-fields" disabled={saving}>
   <legend>Clinic identity &amp; contact</legend>
   <p className="clinic-document-section-note">These details appear on published cards and downloaded PDFs. All fields are required.</p>
   <div className="clinic-document-grid">{['name','address','phone','email'].map(field)}</div>
  </fieldset>
  <fieldset className="clinic-document-fields" disabled={saving}>
   <legend>Registration &amp; verification</legend>
   <div className="clinic-document-grid">{['registration','verificationSource'].map(field)}</div>
   <div className="clinic-document-confirmation">
    <label className="clinic-confirm" htmlFor={validation.field('confirmed').id}>
     <input type="checkbox" {...validation.field('confirmed')} checked={form.confirmed} onChange={e=>edit('confirmed',e.target.checked)}/>
     <span>I checked these clinic details against the source above.<small>Editing any detail requires a new confirmation.</small></span>
    </label>
    {validation.feedback('confirmed')}
   </div>
  </fieldset>
  {error && <p className="clinic-document-notice clinic-document-error" role="alert">{error}</p>}
  {message && <p className="clinic-document-notice clinic-document-success" role="status">{message}</p>}
  <div className="clinic-document-actions">
   <button type="submit" className="btn gold" disabled={saving}>{saving?'Saving…':'Save verified clinic details'}</button>
   <button type="button" className="btn ghost" onClick={onReload} disabled={saving}>Reload saved details</button>
   {edited && <span role="status">Unsaved changes</span>}
  </div>
 </form>;
}

export default function ClinicDocumentSettings(){
 const [profile,setProfile]=useState(null),[loading,setLoading]=useState(true),[error,setError]=useState(''),[version,setVersion]=useState(0);
 const load=async()=>{
  setLoading(true);setError('');
  try{const response=await api.get('/api/clinic-document-profile');setProfile(response.profile);setVersion(previous=>previous+1);}
  catch(e){setError(e.message);}
  finally{setLoading(false);}
 };
 useEffect(()=>{load();},[]);
 return <section className="card clinic-document-settings" aria-labelledby="clinic-document-title">
  <header className="clinic-document-heading"><div><span className="clinic-document-eyebrow">Document settings</span><h2 id="clinic-document-title">Clinic details for official documents</h2><p>Check these details against the clinic’s current registration and contact records.</p></div>
   {!loading && profile && <span className={`clinic-document-status${profile.verified_at?' is-verified':''}`}>{profile.verified_at?'Saved details verified':'Verification required'}</span>}
  </header>
  <p className="clinic-document-notice">Official Digital Vet Cards require verified clinic details, a completed consultation and saved payment.</p>
  {profile?.verified_at && <p className="clinic-document-audit">Last verified by {profile.verified_by_name} on {new Date(profile.verified_at).toLocaleString('en-PH')} · Revision {profile.revision}</p>}
  {loading?<p role="status">Loading saved clinic details…</p>:error?<div className="clinic-document-notice clinic-document-error" role="alert"><p>{error}</p><button className="btn ghost" onClick={load}>Retry loading details</button></div>:profile && <ClinicDetailsForm key={version} profile={profile} onSaved={setProfile} onReload={load}/>}
 </section>;
}

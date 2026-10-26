import { useFormValidation } from '../components/useFormValidation.jsx';
import { medicineErrors, medicineEventTime } from '../formValidation.js';
import { useEffect, useRef, useState } from 'react';
import { api } from '../api.js';
import ClinicDialog from '../components/ClinicDialog.jsx';
import { useSubmissionReview } from '../components/SubmissionReview.jsx';

const nowInManila = () => new Date(Date.now()+8*3600000).toISOString().slice(0,19);
const titles = {order:'Add veterinarian medicine order',medication:'Record medicine administration','stop-medication':'Stop medicine order','correct-medication':'Mark medicine entry as entered in error'};
export default function AdmissionMedicineForm({action,admission,order,event,onClose,onSaved}) {
  const revision = useRef(admission.revision).current;
  const [form,setForm] = useState({medicine:'',dose:'',route:'',frequency:'',instructions:'',catalogId:'',supplyLimit:'0',result:'',occurredAt:nowInManila(),billableQuantity:'0',clinicalNote:'',ownerUpdate:''});
  const validation = useFormValidation(medicineErrors(form,{action,admission,order,event}));
  const baseline = useRef(JSON.stringify(form)).current;
  const [catalog,setCatalog] = useState([]), [catalogError,setCatalogError] = useState('');
  const [error,setError] = useState(''), [saving,setSaving] = useState(false), [discard,setDiscard] = useState(false);
  const pending = useRef(false), request = useRef(null), review = useSubmissionReview([form,admission.revision,admission.status]);
  const dirty = JSON.stringify(form) !== baseline, creating = action === 'order', recording = action === 'medication';
  const set = (key,value) => setForm(previous=>({...previous,[key]:value}));
  useEffect(() => {
    if (!creating) return;
    let active = true;
    api.get('/api/services/prices').then(r=>{if(active)setCatalog(r.catalog.filter(p=>(p.requiresPrescription || ['Pet medicine','Pet vitamins'].includes(p.category)) && p.category!=='Prescription diet'));}).catch(e=>{if(active)setCatalogError(e.message);});
    return ()=>{active=false;};
  },[creating]);
  useEffect(() => {
    if (!dirty) return;
    const warn = e=>{e.preventDefault();e.returnValue='';};window.addEventListener('beforeunload',warn);
    return ()=>window.removeEventListener('beforeunload',warn);
  },[dirty]);
  const close = ()=>{if(!pending.current)dirty?setDiscard(true):onClose();};
  const submit = async e => {
    e.preventDefault();if(pending.current)return;setError('');
    if(!validation.validate(e))return;
    const body = {revision,clinicalNote:form.clinicalNote.trim(),ownerUpdate:form.ownerUpdate.trim(),
      ...(creating?{medicine:form.medicine.trim(),dose:form.dose.trim(),route:form.route.trim(),frequency:form.frequency.trim(),instructions:form.instructions.trim(),catalogId:form.catalogId || null,supplyLimit:form.catalogId?Number(form.supplyLimit):0}:{}),
      ...(order?{orderId:order.id}:{}),...(event?{eventId:event.id}:{}),
      ...(recording?{result:form.result,occurredAt:new Date(medicineEventTime(form.occurredAt)).toISOString(),billableQuantity:form.result==='Given'?Number(form.billableQuantity):0}:{})};
    const details = creating ? [['Medicine',body.medicine],['Dose',body.dose],['Route',body.route],['Frequency',body.frequency],['Instructions',body.instructions],['Clinic supply authorization',body.catalogId?`${catalog.find(p=>p.id===body.catalogId)?.name} · maximum ${body.supplyLimit} whole items/packages`:'No additional clinic medicine supply charge']] : [['Medicine',order?.medicine || event?.medication?.medicine],...(recording?[['Ordered dose / route',`${order.dose} · ${order.route}`],['Actual event',`${body.result} · ${form.occurredAt} Manila time`],['Whole clinic items/packages used',body.billableQuantity]]:[])];
    if (!await review.ask({title:titles[action],confirmLabel:recording?'Save actual medicine event':'Save medicine record',description:'Review the medicine record. A prescription or payment does not prove that a dose was given. Only the exact owner message below is shared.',fields:[['Pet',admission.petName],...details,['Clinic-only observation / reason',body.clinicalNote],['Message visible to owner',body.ownerUpdate || 'No new owner message']]}))return;
    const signature=JSON.stringify(body);if(request.current?.signature!==signature)request.current={signature,id:crypto.randomUUID()};
    pending.current=true;setSaving(true);
    try {
      const result=await api.post(`/api/admissions/${admission.id}/${action}`,{...body,requestId:request.current.id});
      if(!result.success || result.admission?.id!==admission.id || !Number.isInteger(result.admission.revision))throw Error('The server did not confirm this save. Keep your entries and retry.');
      onSaved(result.admission);
    } catch(e){setError(e.message);pending.current=false;setSaving(false);}
  };
  return <ClinicDialog label={titles[action]} onClose={close}><section className="card admission-form">
    {review.card}<h2>{titles[action]}</h2>
    <p>{creating?'The veterinarian enters the medicine, dose and schedule. No dose or treatment is suggested automatically.':recording?'Record what actually happened, including missed or held doses and observed reactions.':'The original medicine record stays in the timeline. Enter the reason for this change.'}</p>
    {order && <section className="admission-plan"><b>{order.medicine}</b><p>{order.dose} · {order.route} · {order.frequency}</p><p>{order.instructions}</p></section>}
    <form {...validation.formProps} onSubmit={submit}><fieldset disabled={saving}>
      {creating && <>
        {[['medicine','Medicine name',200],['dose','Dose (include units)',200],['route','Route',100],['frequency','Frequency / schedule',200]].map(([key,label,max])=><label key={key}>{label} *<input required maxLength={max} {...validation.field(key)} value={form[key]} onChange={e=>set(key,e.target.value)} />{validation.feedback(key)}</label>)}
        <label>Additional medicine instructions<textarea maxLength={1000} {...validation.field('instructions')} value={form.instructions} onChange={e=>set('instructions',e.target.value)} />{validation.feedback('instructions')}</label>
        <label>Clinic medicine supply product (optional)<select disabled={!!catalogError} value={form.catalogId} onChange={e=>{set('catalogId',e.target.value);set('supplyLimit',e.target.value?'1':'0');}}><option value="">No additional clinic supply charge</option>{catalog.map(p=><option key={p.id} value={p.id}>{p.name} · ₱{p.price} per item/package</option>)}</select></label>
        {catalogError && <p role="alert">{catalogError} You can record an order without an additional supply charge, or reopen this form to reload the catalog.</p>}
        {form.catalogId && <label>Maximum whole items/packages authorized for clinic use *<input type="number" required min="1" max="1000" step="1" {...validation.field('supplyLimit')} value={form.supplyLimit} onChange={e=>set('supplyLimit',e.target.value)} />{validation.feedback('supplyLimit')}</label>}
        <p>Item/package quantities are for billing supplies. They are separate from the medicine dose. Take-home supply is prescribed in the clinical visit record.</p>
      </>}
      {recording && <>
        <label>Actual result *<select required {...validation.field('result')} value={form.result} onChange={e=>set('result',e.target.value)}><option value="">Choose what happened</option>{['Given','Missed','Held'].map(v=><option key={v}>{v}</option>)}</select>{validation.feedback('result')}</label>
        <label>Actual date and time (Manila) *<input required type="datetime-local" step="1" {...validation.field('occurredAt')} value={form.occurredAt} onChange={e=>set('occurredAt',e.target.value)} />{validation.feedback('occurredAt')}</label>
        {order.catalog_id && form.result==='Given' && <label>Whole clinic items/packages actually used *<input type="number" required min="0" max={order.supply_limit} step="1" {...validation.field('billableQuantity')} value={form.billableQuantity} onChange={e=>set('billableQuantity',e.target.value)} />{validation.feedback('billableQuantity')}<small>Enter 0 if no additional item/package should be billed. Never enter the dose here. The total cannot exceed the vet’s {order.supply_limit}-item/package authorization.</small></label>}
      </>}
      <label>{recording?'Observed response, reaction, or reason for missed/held dose':'Clinic-only reason / note'} *<textarea required maxLength={3000} rows={3} {...validation.field('clinicalNote')} value={form.clinicalNote} onChange={e=>set('clinicalNote',e.target.value)} />{validation.feedback('clinicalNote')}</label>
      <label>Message visible to owner {event?.ownerUpdate?'* (the original entry was shared)':'(optional)'}<textarea required={!!event?.ownerUpdate} rows={3} maxLength={2000} {...validation.field('ownerUpdate')} value={form.ownerUpdate} onChange={e=>set('ownerUpdate',e.target.value)} />{validation.feedback('ownerUpdate')}</label>
      {error && <p role="alert" className="err">{error} Your entries remain here.</p>}
      <div className="row end"><button type="button" className="btn ghost" onClick={close}>Cancel</button><button className="btn gold">{saving?'Saving…':'Review and save'}</button></div>
    </fieldset></form>
  </section>{discard && <ClinicDialog label="Discard unsaved medicine entries?" onClose={()=>setDiscard(false)}><section className="card admission-form"><h3>Discard unsaved medicine entries?</h3><p>These entries have not been saved to the clinic.</p><div className="row end"><button className="btn gold" data-dialog-autofocus onClick={()=>setDiscard(false)}>Keep editing</button><button className="btn ghost" onClick={onClose}>Discard entries</button></div></section></ClinicDialog>}</ClinicDialog>;
}

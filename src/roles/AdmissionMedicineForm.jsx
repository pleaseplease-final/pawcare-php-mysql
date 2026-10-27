import { useFormValidation } from '../components/useFormValidation.jsx';
import { medicineErrors, medicineEventTime } from '../formValidation.js';
import { OTHER, LIMITS, MEDICINE_ROUTES, MEDICINE_FREQUENCIES, MEDICINE_DOSE_UNITS, orderParts, orderFieldErrors } from '../medicineOrder.js';
import { useEffect, useRef, useState } from 'react';
import { api } from '../api.js';
import ClinicDialog from '../components/ClinicDialog.jsx';
import { useSubmissionReview } from '../components/SubmissionReview.jsx';

const nowInManila = () => new Date(Date.now()+8*3600000).toISOString().slice(0,19);
const titles = {order:'Add veterinarian medicine order',medication:'Record medicine administration','stop-medication':'Stop medicine order','correct-medication':'Mark medicine entry as entered in error'};
const left = (value,max) => `${max-String(value||'').length} characters left`;
export default function AdmissionMedicineForm({action,admission,order,event,onClose,onSaved}) {
  const revision = useRef(admission.revision).current;
  const [form,setForm] = useState({medicineChoice:'',medicineOther:'',doseAmount:'',doseUnit:'',routeChoice:'',routeOther:'',frequencyChoice:'',frequencyOther:'',instructions:'',catalogId:'',supplyLimit:'0',result:'',occurredAt:nowInManila(),billableQuantity:'0',clinicalNote:'',ownerUpdate:''});
  const [catalog,setCatalog] = useState([]), [catalogError,setCatalogError] = useState('');
  const creating = action === 'order', recording = action === 'medication';
  // The medicine, dose, route and schedule that are saved are built from the choices; every control explains itself as you type.
  const parts = creating ? orderParts(form,catalog) : null;
  const combined = medicineErrors({...form,...(parts||{})},{action,admission,order,event});
  const errors = creating ? {...combined,...orderFieldErrors(form,catalog),medicine:'',dose:'',route:'',frequency:''} : combined;
  if (creating && form.medicineChoice && form.medicineChoice !== OTHER && !errors.medicineChoice) errors.medicineChoice = combined.medicine;
  const validation = useFormValidation(errors);
  const baseline = useRef(JSON.stringify(form)).current;
  const [error,setError] = useState(''), [saving,setSaving] = useState(false), [discard,setDiscard] = useState(false);
  const pending = useRef(false), request = useRef(null), review = useSubmissionReview([form,admission.revision,admission.status]);
  const dirty = JSON.stringify(form) !== baseline;
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
      ...(creating?{medicine:parts.medicine,dose:parts.dose,route:parts.route,frequency:parts.frequency,instructions:form.instructions.trim(),catalogId:form.catalogId || null,supplyLimit:form.catalogId?Number(form.supplyLimit):0}:{}),
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
  // A list of choices with an "Other" that opens a text box, like the reason choice when admitting a patient.
  const choice = (key,label,list,otherLabel,placeholder,max) => <>
    <label>{label} *<select aria-required="true" {...validation.field(`${key}Choice`)} value={form[`${key}Choice`]} onChange={e=>set(`${key}Choice`,e.target.value)}>
      <option value="">Choose the {key === 'route' ? 'route' : 'schedule'}</option>{list.map(([code,text])=><option key={code} value={code}>{text}</option>)}</select>{validation.feedback(`${key}Choice`)}</label>
    {form[`${key}Choice`]===OTHER && <label>{otherLabel} *<input autoComplete="off" maxLength={max} placeholder={placeholder} {...validation.field(`${key}Other`)} value={form[`${key}Other`]} onChange={e=>set(`${key}Other`,e.target.value)} />{validation.feedback(`${key}Other`)}<small className="hint">{left(form[`${key}Other`],max)}</small></label>}
  </>;
  return <ClinicDialog label={titles[action]} onClose={close}><section className="card admission-form">
    {review.card}<h2>{titles[action]}</h2>
    <p>{creating?'Choose the medicine, dose, route and schedule. Each field is checked as you type.':recording?'Record what actually happened, including missed or held doses and observed reactions.':'The original medicine record stays in the timeline. Enter the reason for this change.'}</p>
    {order && <section className="admission-plan"><b>{order.medicine}</b><p>{order.dose} · {order.route} · {order.frequency}</p><p>{order.instructions}</p></section>}
    <form {...validation.formProps} onSubmit={submit}><fieldset disabled={saving}>
      {creating && <>
        <label>Medicine *
          <select aria-required="true" {...validation.field('medicineChoice')} value={form.medicineChoice} onChange={e=>set('medicineChoice',e.target.value)}>
            <option value="">Choose a medicine</option>
            {catalog.length>0 && <optgroup label="Clinic medicines">{catalog.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</optgroup>}
            <option value={OTHER}>+ Add another medicine (type its name)</option>
          </select>{validation.feedback('medicineChoice')}
          {!catalog.length && !catalogError && <small className="hint">Loading the clinic’s medicines… you can add another medicine meanwhile.</small>}
        </label>
        {form.medicineChoice===OTHER && <label>New medicine name *<input autoComplete="off" maxLength={LIMITS.medicine} placeholder="e.g. Metronidazole" {...validation.field('medicineOther')} value={form.medicineOther} onChange={e=>set('medicineOther',e.target.value)} />{validation.feedback('medicineOther')}<small className="hint">{left(form.medicineOther,LIMITS.medicine)}</small></label>}
        <fieldset className="admission-dose"><legend>Dose each time *</legend>
          <label>Amount<input inputMode="decimal" autoComplete="off" maxLength={10} placeholder="e.g. 2.5" {...validation.field('doseAmount')} value={form.doseAmount} onChange={e=>set('doseAmount',e.target.value)} />{validation.feedback('doseAmount')}</label>
          <label>Unit<select aria-required="true" {...validation.field('doseUnit')} value={form.doseUnit} onChange={e=>set('doseUnit',e.target.value)}><option value="">Choose the unit</option>{MEDICINE_DOSE_UNITS.map(u=><option key={u}>{u}</option>)}</select>{validation.feedback('doseUnit')}</label>
        </fieldset>
        {choice('route','Route',MEDICINE_ROUTES,'Other route','e.g. Nebulized',LIMITS.route)}
        {choice('frequency','Frequency / schedule',MEDICINE_FREQUENCIES,'Other schedule','e.g. Every 36 hours',LIMITS.frequency)}
        <label>Additional medicine instructions<textarea maxLength={1000} {...validation.field('instructions')} value={form.instructions} onChange={e=>set('instructions',e.target.value)} />{validation.feedback('instructions')}<small className="hint">{left(form.instructions,1000)}</small></label>
        <label>Clinic medicine supply product (optional)<select disabled={!!catalogError} value={form.catalogId} onChange={e=>{set('catalogId',e.target.value);set('supplyLimit',e.target.value?'1':'0');}}><option value="">No additional clinic supply charge</option>{catalog.map(p=><option key={p.id} value={p.id}>{p.name} · ₱{p.price} per item/package</option>)}</select></label>
        {catalogError && <p role="alert">{catalogError} You can add another medicine and record the order without an additional supply charge, or reopen this form to reload the catalog.</p>}
        {form.catalogId && <label>Maximum whole items/packages authorized for clinic use *<input type="number" required min="1" max="1000" step="1" {...validation.field('supplyLimit')} value={form.supplyLimit} onChange={e=>set('supplyLimit',e.target.value)} />{validation.feedback('supplyLimit')}</label>}
        <p>Item/package quantities are for billing supplies. They are separate from the medicine dose. Take-home supply is prescribed in the clinical visit record.</p>
      </>}
      {recording && <>
        <label>Actual result *<select required {...validation.field('result')} value={form.result} onChange={e=>set('result',e.target.value)}><option value="">Choose what happened</option>{['Given','Missed','Held'].map(v=><option key={v}>{v}</option>)}</select>{validation.feedback('result')}</label>
        <label>Actual date and time (Manila) *<input required type="datetime-local" step="1" max={nowInManila()} {...validation.field('occurredAt')} value={form.occurredAt} onChange={e=>set('occurredAt',e.target.value)} />{validation.feedback('occurredAt')}</label>
        {order.catalog_id && form.result==='Given' && <label>Whole clinic items/packages actually used *<input type="number" required min="0" max={order.supply_limit} step="1" {...validation.field('billableQuantity')} value={form.billableQuantity} onChange={e=>set('billableQuantity',e.target.value)} />{validation.feedback('billableQuantity')}<small>Enter 0 if no additional item/package should be billed. Never enter the dose here. The total cannot exceed the vet’s {order.supply_limit}-item/package authorization.</small></label>}
      </>}
      <label>{recording?'Observed response, reaction, or reason for missed/held dose':'Clinic-only reason / note'} *<textarea required maxLength={3000} rows={3} {...validation.field('clinicalNote')} value={form.clinicalNote} onChange={e=>set('clinicalNote',e.target.value)} />{validation.feedback('clinicalNote')}<small className="hint">{left(form.clinicalNote,3000)}</small></label>
      <label>Message visible to owner {event?.ownerUpdate?'* (the original entry was shared)':'(optional)'}<textarea required={!!event?.ownerUpdate} rows={3} maxLength={2000} {...validation.field('ownerUpdate')} value={form.ownerUpdate} onChange={e=>set('ownerUpdate',e.target.value)} />{validation.feedback('ownerUpdate')}<small className="hint">{left(form.ownerUpdate,2000)}</small></label>
      {error && <p role="alert" className="err">{error} Your entries remain here.</p>}
      <div className="row end"><button type="button" className="btn ghost" onClick={close}>Cancel</button><button className="btn gold">{saving?'Saving…':'Review and save'}</button></div>
    </fieldset></form>
  </section>{discard && <ClinicDialog label="Discard unsaved medicine entries?" onClose={()=>setDiscard(false)}><section className="card admission-form"><h3>Discard unsaved medicine entries?</h3><p>These entries have not been saved to the clinic.</p><div className="row end"><button className="btn gold" data-dialog-autofocus onClick={()=>setDiscard(false)}>Keep editing</button><button className="btn ghost" onClick={onClose}>Discard entries</button></div></section></ClinicDialog>}</ClinicDialog>;
}

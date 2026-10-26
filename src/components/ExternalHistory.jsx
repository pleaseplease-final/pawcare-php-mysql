import {useState} from 'react';
import {Field} from '../roles/owner/ui.jsx';
import {externalVaccineChoices} from '../externalHistory.js';
export function ExternalHistorySummary({patient}) {
  if (!patient?.priorVaccines?.length && !patient?.externalClinicNotes) return null;
  return <section className="op-sec external-history"><h4>Previous-clinic vaccination references</h4><p>Owner-reported · unverified. These entries do not certify a dose or set a booster date. Bring the previous clinic’s records for the veterinarian to review.</p><ul>{(patient.priorVaccines || []).map(name=><li key={name}>{name}</li>)}</ul>{patient.externalClinicNotes && <p style={{whiteSpace:'pre-wrap'}}>{patient.externalClinicNotes}</p>}</section>;
}
export default function ExternalHistory({form,species}) {
  const [other,setOther]=useState('');
  const list=form.v.priorVaccines || [];
  const otherError=other && (!/[\p{L}]/u.test(other) || other.trim().length>120 || /[\u0000-\u001f\u007f]/.test(other)) ? 'Enter a vaccine name with words (up to 120 characters).' : '';
  const toggle = name => {if(name===other)setOther('');form.set('priorVaccines',list.includes(name)?list.filter(v=>v!==name):[...list,name]);};
  const editOther=value=>{form.set('priorVaccines',[...list.filter(v=>v!==other),...(value.trim()?[value]:[])]);setOther(value);};
  return <section className="op-sec external-history"><h4>Prior vaccinations from previous vet clinics (reference guide)</h4><p>Optional owner report. Leave unknown details blank. The veterinarian must review the original records before deciding future doses.</p>
    <div className="ow-chips">{[...new Set([...externalVaccineChoices(species),...list])].map(name=><button type="button" className="ow-chip" aria-pressed={list.includes(name)} key={name} onClick={()=>toggle(name)}>{list.includes(name)?'✓ ': '+ '}{name}</button>)}</div>
    {form.show('priorVaccines') && <p className="err" role="alert">{form.show('priorVaccines')}</p>}
    <Field id="external-vaccine-other" label="Other vaccine name (optional)" value={other} error={otherError} onChange={editOther} hint="Included in the review as you type. Clear this field to remove it." />
    <Field id="external-clinic-notes" label="Previous clinic, reported dates and notes (optional)" type="textarea" value={form.v.externalClinicNotes} max={1000} error={form.show('externalClinicNotes')} onChange={v=>form.set('externalClinicNotes',v)} onBlur={()=>form.blur('externalClinicNotes')} hint="Include the clinic and dates if known. These are unverified reference details, separate from clinic-administered vaccines." />
  </section>;
}

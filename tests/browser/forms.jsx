// Open /tests/browser/forms.html with the repository's Vite dev server running.
// Real DOM regressions: controlled selects, native constraints and custom validity.
import React, {useState} from 'react';
import {createRoot} from 'react-dom/client';
import {flushSync} from 'react-dom';
import {useFormValidation} from '../../src/components/useFormValidation.jsx';
import {VaccinePicker} from '../../src/components/VaccineBooking.jsx';
import {vaccineChoiceError} from '../../src/vaccineBooking.js';
import AdmissionForm from '../../src/roles/AdmissionForm.jsx';

const root=createRoot(document.getElementById('form-tests'));
const frame=()=>new Promise(resolve=>requestAnimationFrame(resolve));
const assert=(condition,message)=>{if(!condition)throw Error(message);};
const field=name=>document.querySelector(`[name="${name}"]`);
async function edit(name,value) {
  const control=field(name);
  const prototype=control instanceof HTMLSelectElement ? HTMLSelectElement.prototype : control instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  flushSync(()=>{
    Object.getOwnPropertyDescriptor(prototype,'value').set.call(control,value);
    control.dispatchEvent(new Event('input',{bubbles:true}));
  });
  if(control instanceof HTMLSelectElement)flushSync(()=>control.dispatchEvent(new Event('change',{bubbles:true})));
  await frame();
}
async function submit(){flushSync(()=>document.querySelector('form').requestSubmit());await frame();}
async function click(id){flushSync(()=>document.getElementById(id).click());await frame();}
function ValidationFixture() {
  const [vaccine,setVaccine]=useState(''),[quantity,setQuantity]=useState('2'),[extra,setExtra]=useState(false),[disabled,setDisabled]=useState(false),[saves,setSaves]=useState(0);
  const validation=useFormValidation({vaccineId:vaccineChoiceError(vaccine,'Canine')});
  return <form {...validation.formProps} onSubmit={event=>{event.preventDefault();if(validation.validate(event))setSaves(n=>n+1);}}>
    <VaccinePicker value={vaccine} onChange={value=>{setVaccine(value);validation.changed('vaccineId');}} species="Canine" error={validation.errors.vaccineId} />
    <label>Quantity<input {...validation.field('quantity')} type="number" required min="1" max="3" step="1" value={quantity} onChange={event=>setQuantity(event.target.value)} /></label>{validation.feedback('quantity')}
    {extra && <label>Extra note<input {...validation.field('extra')} required disabled={disabled} /></label>}{validation.feedback('extra')}
    <button id="toggle-extra" type="button" onClick={()=>setExtra(v=>!v)}>Toggle extra note</button>
    <button id="disable-extra" type="button" onClick={()=>setDisabled(v=>!v)}>Toggle disabled</button>
    <button>Save</button><output id="saves">{saves}</output>
  </form>;
}
async function run() {
  flushSync(()=>root.render(<ValidationFixture />));await frame();
  await submit();assert(field('vaccineId').getAttribute('aria-invalid')==='true','Missing vaccine must show inline');
  await edit('vaccineId','canine-core');await submit();
  assert(document.getElementById('saves').textContent==='1','Correcting a required vaccine must clear custom/native feedback and allow submit');
  await edit('quantity','4');await submit();
  assert(field('quantity').getAttribute('aria-invalid')==='true','Out-of-range quantity must show inline');
  assert(document.getElementById('saves').textContent==='1','Invalid numeric range must block save');
  await edit('quantity','2');await click('toggle-extra');await submit();
  assert(field('extra').getAttribute('aria-invalid')==='true','Required extra note must show inline');
  await click('disable-extra');await submit();
  assert(document.getElementById('saves').textContent==='2','Disabled controls must not retain native errors');
  await click('disable-extra');await submit();await click('toggle-extra');await submit();
  assert(document.getElementById('saves').textContent==='3','Removed controls must not retain native errors');
  const visit={id:'synthetic',petName:'Synthetic patient',ownerName:'Synthetic owner',date:'2026-10-26',time:'09:00'};
  flushSync(()=>root.render(<AdmissionForm mode="create" visits={[visit]} consultationContext={visit} me={{role:'vet'}} onClose={()=>{}} onSaved={()=>{throw Error('Incomplete admission must not save');}} />));await frame();
  await submit();
  for(let pass=0;pass<3;pass++) {
    await edit('reasonChoice','Post-procedure recovery');await edit('planTemplate','General observation');await edit('observationTemplate','Recovery observation');await submit();
    assert(field('reasonChoice').value==='Post-procedure recovery','Admission reason reset after validation');
    assert(field('planTemplate').value==='General observation','Care plan template reset');
    assert(field('observationTemplate').value==='Recovery observation','Monitoring template reset');
    assert(field('carePlan').value.includes('veterinarian-directed'),'Care template must populate instructions');
    assert(field('observationInstructions').value.includes('responsiveness'),'Monitoring template must populate instructions');
    await edit('reasonChoice','Other');assert(!!field('clinicalNote'),'Other admission reason must expose its note');
  }
  flushSync(()=>root.unmount());
  return {passed:true,checks:['corrected vaccine selection','numeric range','disabled/removed controls','repeated admission selections after invalid submission']};
}
window.formInteractionResult=run().then(result=>{document.getElementById('results').textContent=JSON.stringify(result,null,2);return result;}).catch(error=>{document.getElementById('results').textContent=error.stack;throw error;});

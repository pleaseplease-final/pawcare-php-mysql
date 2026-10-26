import {useId} from 'react';
import {SERVICES} from '../booking.js';

export default function BookingReason({service,choice,other,onChoice,onOther,errors={}}) {
  const id=useId(),options=SERVICES[service]?.options;
  if(!options || service==='vaccination')return null;
  return <div className="booking-reason-fields">
    <label htmlFor={`${id}-choice`}>Reason for visit / pet symptoms *</label>
    <select id={`${id}-choice`} name="reasonChoice" value={choice} onChange={e=>onChoice(e.target.value)} aria-invalid={!!errors.reasonChoice} aria-describedby={`${id}-choice-error`}>
      <option value="">Choose the closest reason</option>{options.map(option=><option key={option}>{option}</option>)}
    </select>
    <span id={`${id}-choice-error`} className="err field-feedback" aria-live="polite">{errors.reasonChoice || ''}</span>
    {choice==='Other' && <><label htmlFor={`${id}-other`}>Describe the reason or symptoms *</label>
      <textarea id={`${id}-other`} name="otherReason" value={other} rows={3} onChange={e=>onOther(e.target.value)} aria-invalid={!!errors.otherReason} aria-describedby={`${id}-other-error`}/>
      <span id={`${id}-other-error`} className="err field-feedback" aria-live="polite">{errors.otherReason || ''}</span><small>{String(other || '').length}/200 characters</small></>}
  </div>;
}

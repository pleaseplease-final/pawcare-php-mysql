import { useEffect, useId, useRef, useState } from 'react';

// For forms using HTML constraints. Keep native submit blocking and provide the
// same constraint feedback while typing, including when related bounds change.
export default function LiveControl({as:Control='input',error='',onChange,onInput,onBlur,onInvalid,id,children,...props}) {
  const generated=useId(), control=useRef(null);
  const [touched,setTouched]=useState(false), [message,setMessage]=useState('');
  const errorId=`${generated}-error`;
  const check=()=>{
    const input=control.current;
    if(!input)return;
    input.setCustomValidity('');
    const blank=input.required && typeof input.value==='string' && !input.value.trim();
    const length=String(input.value).trim().length;
    const lengthError=length && props.minLength>0 && length<props.minLength ? `Use at least ${props.minLength} characters.` : props.maxLength>=0 && String(input.value).length>props.maxLength ? `Use at most ${props.maxLength} characters.` : '';
    input.setCustomValidity(error || (blank ? 'Complete this field.' : '') || lengthError);
    setMessage(input.validationMessage);
  };
  // Re-evaluate after controlled values and dependent constraints have rendered.
  useEffect(check,[props.value,props.checked,props.required,props.min,props.max,props.minLength,props.maxLength,props.pattern,props.disabled,props.readOnly,error]);
  const visible=(touched || !!error || String(props.value ?? '').trim()!=='') && !props.disabled && !props.readOnly ? error || message : '';
  return <><Control {...props} id={id || generated} ref={control}
    aria-invalid={!!visible} aria-describedby={[props['aria-describedby'],errorId].filter(Boolean).join(' ')}
    onChange={event=>{setTouched(true);onChange?.(event);check();}}
    onInput={event=>{
      // Native select input precedes change. Do not render the previous value
      // back into the select before the owner's change handler commits it.
      if(event.currentTarget.tagName==='SELECT'){onInput?.(event);return;}
      setTouched(true);onInput?.(event);check();
    }}
    onBlur={event=>{setTouched(true);onBlur?.(event);check();}}
    onInvalid={event=>{setTouched(true);check();onInvalid?.(event);}}>{children}</Control>
    <span id={errorId} className="err field-feedback" aria-live="polite">{visible}</span></>;
}

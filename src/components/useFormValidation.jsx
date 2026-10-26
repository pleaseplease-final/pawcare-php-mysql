import { useId, useState } from 'react';

// Field errors are derived from current values on every render, including changes
// to related fields. Untouched empty fields stay quiet until submit or blur.
export function useFormValidation(errors) {
  const prefix = useId();
  const [touched, setTouched] = useState({});
  const [submitted, setSubmitted] = useState(false);
  const [inputErrors,setInputErrors] = useState({});
  const allErrors={...errors};
  for(const [key,error] of Object.entries(inputErrors)) if(error)allErrors[key]=error;
  const touch = key => setTouched(previous => ({...previous,[key]:true}));
  const show = key => (submitted || touched[key]) ? allErrors[key] || '' : '';
  const field = key => ({name:key, id:`${prefix}-${key}`, 'aria-invalid':!!show(key), 'aria-describedby':`${prefix}-${key}-error`, onBlur:event=>edited(event)});
  const feedback = key => <span id={`${prefix}-${key}-error`} className="err field-feedback" aria-live="polite">{show(key)}</span>;
  const nativeError = control => {
    if(control.disabled || control.readOnly) return '';
    if(control.validity?.badInput) return control.type==='number' ? 'Enter a valid number.' : 'Enter a valid value.';
    if(control.required && !['checkbox','radio'].includes(control.type) && !String(control.value ?? '').trim()) return 'Complete this field.';
    const length=String(control.value ?? '').length;
    if(length && control.minLength>0 && length<control.minLength) return `Use at least ${control.minLength} characters.`;
    if(control.maxLength>=0 && length>control.maxLength) return `Use at most ${control.maxLength} characters.`;
    // LiveControl owns its custom validity. Feeding its previous custom message
    // back into derived field errors would keep a corrected choice invalid.
    const nativeInvalid=['valueMissing','typeMismatch','patternMismatch','rangeUnderflow','rangeOverflow','stepMismatch','tooLong','tooShort'].some(key=>control.validity?.[key]);
    return nativeInvalid ? control.validity.customError ? 'Check this value.' : control.validationMessage : '';
  };
  const edited = event => {
    const control=event.target, name=control.name, error=nativeError(control);
    if(name) {
      touch(name);
      setInputErrors(previous=>({...previous,[name]:error}));
    }
  };
  // Input also fires for incomplete number edits (for example '-' or '1e')
  // when the browser value remains '' and React does not dispatch onChange.
  // Handle input during bubbling so controlled values update before validation renders.
  // Selects commit their controlled value on change, after the native input
  // event. Rendering validation on input restores the old selected option.
  const formProps = {noValidate:true,onInput:event=>{if(event.target.tagName!=='SELECT')edited(event);},onChange:edited};
  // Call after assigning a value with a preset or other programmatic edit.
  const changed = key => {
    touch(key);
    setInputErrors(previous=>({...previous,[key]:''}));
  };
  const validate = event => {
    setSubmitted(true);
    const controls=Array.from(event.currentTarget.elements).filter(control=>control.name && !control.disabled && !control.readOnly);
    const currentNative=Object.fromEntries(controls.map(control=>[control.name,nativeError(control)]));
    setInputErrors(currentNative);
    const currentErrors={...errors};
    for(const [key,error] of Object.entries(currentNative)) if(error) currentErrors[key]=error;
    const first=controls.find(control=>currentErrors[control.name]);
    first?.focus();
    return !Object.values(currentErrors).some(Boolean);
  };
  return {field,feedback,formProps,validate,touch,changed,errors:Object.fromEntries(Object.keys(allErrors).map(key=>[key,show(key)]))};
}

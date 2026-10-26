import {useEffect,useRef} from 'react';
import {useSubmissionReview} from './SubmissionReview.jsx';

// Guard explicit close, Escape, backdrop and reload with the same form values.
// Successful saves call the parent's completion handler directly.
export function useUnsavedChanges({value,saving=false,active=true,onClose}) {
 const signature=JSON.stringify(value),baseline=useRef(signature);
 const dirty=active && baseline.current!==signature;
 const review=useSubmissionReview([signature,saving]);
 const close=async()=>{
  if(saving)return;
  if(!dirty || await review.ask({title:'Discard unsaved changes?',confirmLabel:'Discard changes',description:'Your changes have not been saved. Go back to keep editing or discard them to close this form.',fields:[['Status','Unsaved changes']]}))onClose();
 };
 useEffect(()=>{
  if(!dirty)return;
  const leave=event=>{event.preventDefault();event.returnValue='';};
  window.addEventListener('beforeunload',leave);
  return()=>window.removeEventListener('beforeunload',leave);
 },[dirty]);
 return {close,card:review.card,dirty};
}

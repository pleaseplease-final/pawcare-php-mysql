// Documentation prompts only. The treating veterinarian reviews every saved plan.
export const admissionReasons=['Observation and diagnostic monitoring','Pre-procedure preparation','Post-procedure recovery','Supportive care and stabilization','Isolation and infectious-disease monitoring','Other'];
export const carePlanTemplates={
 'Pre-procedure preparation':'Prepare the patient for the procedure as directed by the treating veterinarian. Confirm fasting status and consent, record measured observations, and notify the veterinarian about concerns. Follow separate saved medicine orders.',
 'General observation':'Provide the veterinarian-directed care in this consultation. Keep the patient comfortable, record intake/output and changes in condition, and notify the treating veterinarian about concerns. Follow separate saved medicine orders.',
 'Post-procedure recovery':'Monitor recovery and comfort as directed by the treating veterinarian. Record responsiveness, wound observations and intake/output. Notify the veterinarian about concerns. Follow separate saved medicine orders.',
 'Isolation care':'Follow the clinic’s isolation and hygiene procedures. Record clinical changes and intake/output. Notify the treating veterinarian about concerns. Follow separate saved medicine orders.'
};
export const monitoringTemplates={
 'Pre-procedure observation':'Confirm fasting status, record measured weight/temperature when taken, comfort and any vomiting or changes in condition. Notify the veterinarian about concerns.',
 'General observation':'Record measured weight/temperature when taken, appetite, water intake, activity, urine/stool and changes in condition. Notify the veterinarian about concerns.',
 'Recovery observation':'Record responsiveness, breathing, comfort, wound observations and intake/output. Notify the veterinarian about concerns.',
 'Isolation observation':'Record measured observations, appetite, water intake, urine/stool and changes in condition; follow isolation precautions and notify the veterinarian about concerns.'
};
export function admissionChoiceErrors(form,{create=false,vet=false}={}) {
 const errors={};
 if(form.reasonChoice!==undefined && create && form.reasonChoice==='Other' && String(form.clinicalNote || '').length>3000)errors.clinicalNote='Use at most 3,000 characters.';
 if(create && form.reasonChoice!==undefined) {
  if(!admissionReasons.includes(form.reasonChoice)) errors.reasonChoice='Choose the reason for admission.';
  if(form.reasonChoice==='Other' && (!String(form.clinicalNote || '').trim() || !/[\p{L}]/u.test(form.clinicalNote))) errors.clinicalNote='Describe the reason for admission using words.';
 }
 for(const [key,choices] of [['planTemplate',carePlanTemplates],['observationTemplate',monitoringTemplates]]) if(form[key]!==undefined && form[key]!=='' && form[key]!=='Custom' && !Object.hasOwn(choices,form[key])) errors[key]='Choose a template from the list, or Custom.';
 if(vet && ['planTemplate','observationTemplate','planConfirmed'].some(key=>form[key]!==undefined) && (create || form.carePlan || form.observationInstructions) && form.planConfirmed!==true) errors.planConfirmed='Review and confirm the care plan and monitoring instructions for this patient.';
 return errors;
}

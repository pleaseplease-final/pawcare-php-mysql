export function vitalValueError(value,kind,required=true,minimumWeight=0.05) {
  const label=kind==='weight'?'Weight (kg)':'Temperature (°C)',min=kind==='weight'?minimumWeight:33,max=kind==='weight'?120:45;
  if(value==='' || value==null) return required?`Enter ${label.toLowerCase()}.`:'';
  const n=Number(value);
  if(typeof value==='string' && !/^\d*(?:\.\d*)?$/.test(value) || !Number.isFinite(n) || n<min || n>max) return `${label} must be between ${min} and ${max}.`;
  return Math.abs(n*100-Math.round(n*100))>0.000001?'Use at most two decimal places.':'';
}
export function correctionErrors(value,reason,kind) {
  return {value:vitalValueError(value,kind,true,0.01),reason:typeof reason!=='string'||reason.trim().length<3?'Explain the correction using at least 3 characters.':reason.length>500?'Use at most 500 characters.':''};
}

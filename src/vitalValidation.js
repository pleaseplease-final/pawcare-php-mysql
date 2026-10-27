// Temperatures are recorded as measured so critical readings are never blocked. The wide bounds only catch typing
// mistakes (e.g. 385 or 3.8); assessTemp() flags critical hypothermia / hyperthermia for the care team.
export const TEMP_MIN = 20, TEMP_MAX = 50;
export const TEMP_CRITICAL_LOW = 35, TEMP_CRITICAL_HIGH = 41.5;
export function vitalValueError(value,kind,required=true,minimumWeight=0.05) {
  const label=kind==='weight'?'Weight (kg)':'Temperature (°C)',min=kind==='weight'?minimumWeight:TEMP_MIN,max=kind==='weight'?120:TEMP_MAX;
  if(value==='' || value==null) return required?`Enter ${label.toLowerCase()}.`:'';
  const n=Number(value);
  if(typeof value==='string' && !/^\d*(?:\.\d*)?$/.test(value) || !Number.isFinite(n) || n<min || n>max) return `${label} must be between ${min} and ${max}.`;
  return Math.abs(n*100-Math.round(n*100))>0.000001?'Use at most two decimal places.':'';
}
export function correctionErrors(value,reason,kind) {
  return {value:vitalValueError(value,kind,true,0.01),reason:typeof reason!=='string'||reason.trim().length<3?'Explain the correction using at least 3 characters.':reason.length>500?'Use at most 500 characters.':''};
}

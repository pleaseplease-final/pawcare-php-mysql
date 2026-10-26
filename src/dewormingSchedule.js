import {boosterDate} from './clinicalWorkflow.js';
export const DEWORMING_REFERENCE='https://www.esccap.org/link-document/27/';
const dateOnly=value=>typeof value==='string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0,10)===value;
function monthsAfter(date,months){
 const d=new Date(`${date}T00:00:00Z`),day=d.getUTCDate();
 d.setUTCDate(1);d.setUTCMonth(d.getUTCMonth()+months);
 const end=new Date(Date.UTC(d.getUTCFullYear(),d.getUTCMonth()+1,0)).getUTCDate();
 d.setUTCDate(Math.min(day,end));return d.toISOString().slice(0,10);
}
// ESCCAP GL1 (June 2025), pp. 9–13. A suggestion, never clinical approval.
// Weaning cannot be inferred from birth date. Unknown stage uses the early-life
// suggestion with an explicit stage confirmation, rather than assuming weaning.
export function dewormingSchedule({date,birth,species,weaned=false,monthlyRisk=false}){
 if(!dateOnly(date)||!dateOnly(birth)||birth>date)return null;
 const dog=/^(canine|dog)$/i.test(species || ''),cat=/^(feline|cat)$/i.test(species || '');
 const ageDays=(Date.parse(date)-Date.parse(birth))/86400000;
 if((!dog&&!cat)||ageDays<(dog?14:21))return null;
 const juvenile=date<monthsAfter(birth,6);
 const early=juvenile&&!weaned;
 const nextDue=early?boosterDate(date,14):monthsAfter(date,juvenile||monthlyRisk?1:3);
 return {intervalDays:String((Date.parse(nextDue)-Date.parse(date))/86400000),nextDue,
  juvenile,reason:early?'Early-life schedule · confirm weaning stage':juvenile?'Monthly juvenile schedule · review infection risk':monthlyRisk?'Monthly schedule · increased risk':'Quarterly schedule · risk not established'};
}
export function availableDewormingLots(product,date){
 return (product?.lots || []).filter(lot=>dateOnly(date)&&dateOnly(lot.expiresOn)&&lot.expiresOn>=date)
  .sort((a,b)=>a.expiresOn.localeCompare(b.expiresOn)||a.batch.localeCompare(b.batch));
}

import {currentVaccinationDue} from './vaccinationDue.js';
export function eventTitle(event){
 if(event.kind==='reference')return `Previous-clinic reference · ${event.vaccine} · Unverified`;
 if(event.kind==='deworming')return `Deworming · ${event.vaccine}`;
 if(event.kind==='vaccination')return `Administered vaccine · ${event.vaccine}`;
 if(event.kind==='planned')return `Planned vaccine · ${event.vaccine} · Not administered`;
 if(event.kind==='registration')return 'Owner-entered registration weight · Not clinic measured';
 if(event.kind==='weight')return event.origin==='legacy_unknown'?'Historical weight · Source unknown':'Measured weight';
 if(event.kind==='temp')return event.origin==='legacy_unknown'?'Historical temperature · Source unknown':'Measured temperature';
 return 'Admission observation · Staff only';
}
export function filterCardEvents(events,filters){
 const q=(filters.query || '').trim().toLowerCase();
 return events.filter(e=>(!filters.kind||e.kind===filters.kind) && (!filters.from||e.date>=filters.from) && (!filters.to||e.date<=filters.to) && (!q||[eventTitle(e),e.notes,e.brand,e.batch,e.manufacturer,e.serialNumber,e.staffName,e.vetName,e.visitId].join(' ').toLowerCase().includes(q)));
}

// Card history contains administered care only. A newer dose without a next date
// clears the earlier reminder, just as in the clinic recall list.
export function cardCareDue(events = []) {
 return currentVaccinationDue(events.filter(e=>['vaccination','deworming'].includes(e.kind)).map(e=>({...e,petId:'card',done:true,vetId:'recorded'})))
  .sort((a,b)=>a.nextDue.localeCompare(b.nextDue) || a.id.localeCompare(b.id));
}

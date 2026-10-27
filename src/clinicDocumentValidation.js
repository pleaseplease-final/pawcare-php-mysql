import {dateRangeErrors} from './dateRules.js';
export const clinicDocumentFields = [
 ['name','Clinic name',150],['address','Clinic address',500],['phone','Clinic phone',40],
 ['email','Clinic email',254],['registration','Clinic registration / license reference',150],
 ['verificationSource','Source checked for these details',500]
];
export function clinicDocumentErrors(form) {
 const errors={};
 for(const [key,label,max] of clinicDocumentFields)if(typeof form[key]!=='string'||!form[key].trim()||form[key].length>max)errors[key]=`${label} is required (up to ${max} characters).`;
 if(form.phone && (!/^\+?[\d\s()./-]{7,40}$/.test(form.phone.trim()) || form.phone.replace(/\D/g,'').length<7))errors.phone='Enter a valid clinic phone number.';
 if(form.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim()))errors.email='Enter a valid clinic email address.';
 if(form.confirmed!==true)errors.confirmed='Confirm that you checked the clinic details against the recorded source.';
 return errors;
}
// Card timeline filters: real dates from the pet's registration day (or 2000-01-01) to today, in order.
export function timelineFilterErrors(filters, registeredAt = '') {
 const errors=dateRangeErrors(filters.from,filters.to);
 if(registeredAt)for(const key of ['from','to'])if(!errors[key] && filters[key] && filters[key]<registeredAt)errors[key]=`Choose a date on or after ${registeredAt}, when this pet was registered.`;
 return errors;
}

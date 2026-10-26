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
export function timelineFilterErrors(filters) {
 const errors={};
 for(const key of ['from','to'])if(filters[key] && (!/^\d{4}-\d{2}-\d{2}$/.test(filters[key]) || !Number.isFinite(Date.parse(filters[key])) || new Date(filters[key]).toISOString().slice(0,10)!==filters[key]))errors[key]='Enter a real date.';
 if(!errors.from && !errors.to && filters.from && filters.to && filters.to<filters.from)errors.to='End date must be on or after the start date.';
 return errors;
}

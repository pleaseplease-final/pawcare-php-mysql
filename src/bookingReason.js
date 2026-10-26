import {SERVICES,makeReason} from './booking.js';

export function bookingReasonErrors(service,reasonChoice,otherReason) {
  if(!SERVICES[service])return {service:'Choose a service from the list.'};
  if(service==='vaccination')return {};
  if(!SERVICES[service].options.includes(reasonChoice))return {reasonChoice:'Choose a reason from the list.'};
  if(reasonChoice!=='Other')return {};
  if(typeof otherReason!=='string')return {otherReason:'Describe the reason or symptoms in words.'};
  const text=otherReason.trim();
  if(text.length<3)return {otherReason:'Describe the reason or symptoms in at least 3 characters.'};
  if(text.length>200)return {otherReason:'Keep the description under 200 characters.'};
  if(!/\p{L}/u.test(text))return {otherReason:'Describe the reason or symptoms in words.'};
  return {};
}
export const bookingReason = (service,choice,other) => makeReason(service,choice,String(other || '').trim());

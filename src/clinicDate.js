import {today,plus} from './booking.js';
// Live ES module binding for existing date consumers. Subscription is owned by React.
export let TODAY=today();
const listeners=new Set();
let timer;
export function refreshClinicDate() {
  const value=today();
  if(value!==TODAY){TODAY=value;for(const notify of listeners)notify();}
  return TODAY;
}
function schedule() {
  clearTimeout(timer);
  // Manila has no daylight-saving changes. Also recheck on focus after suspension.
  const midnight=Date.parse(plus(1)+'T00:00:00+08:00');
  timer=setTimeout(()=>{refreshClinicDate();schedule();},Math.max(1,midnight-Date.now()+20));
}
const resume=()=>{refreshClinicDate();schedule();};
export function subscribeClinicDate(notify) {
  listeners.add(notify);
  if(listeners.size===1){refreshClinicDate();schedule();globalThis.window?.addEventListener('focus',resume);globalThis.document?.addEventListener('visibilitychange',resume);}
  return ()=>{listeners.delete(notify);if(!listeners.size){clearTimeout(timer);globalThis.window?.removeEventListener('focus',resume);globalThis.document?.removeEventListener('visibilitychange',resume);}};
}
export const clinicDateSnapshot=()=>TODAY;

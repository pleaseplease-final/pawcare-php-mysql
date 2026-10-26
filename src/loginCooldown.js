const key='pawcare_login_cooldown';
export function readLoginCooldown() {
  try {const end=Number(sessionStorage.getItem(key));return Number.isFinite(end) && end>Date.now()?end:0;} catch {return 0;}
}
export function saveLoginCooldown(value) {
  const end=Date.parse(value);
  if(!Number.isFinite(end))return 0;
  try {sessionStorage.setItem(key,String(end));} catch { /* Server enforcement does not depend on storage. */ }
  return Math.max(0,Math.ceil((end-Date.now())/1000));
}

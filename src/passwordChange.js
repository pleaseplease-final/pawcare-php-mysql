// Rules for changing your own password. No browser-only imports, so tests can load this file directly.
import { pwOk } from './textRules.js';

export const PW_RULE_MESSAGE = '12+ characters with upper, lower, number and special character.';
export const identityPart = (identity = '') => String(identity).split('@')[0].toLowerCase();
export function validatePasswordChange(d, identity = '') {
  const e = {}, next = String(d.next ?? ''), local = identityPart(identity);
  if (!d.cur) e.cur = 'Enter your current password';
  if (!pwOk(next)) e.next = PW_RULE_MESSAGE;
  else if (local.length >= 4 && next.toLowerCase().includes(local)) e.next = 'Do not include your email name in the password';
  if (next && next === d.cur) e.next = 'New password must be different from your current password';
  if (!d.conf) e.conf = 'Retype the new password';
  else if (d.conf !== d.next) e.conf = 'Passwords do not match';
  return e;
}

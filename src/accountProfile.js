import {parsePhoneNumberFromString} from 'libphonenumber-js/max';
import {addressErrors} from './addressRules.js';

export const formatAccountAddress = address => [address.houseStreet, address.city,
  [address.state, address.zipCode].filter(Boolean).join(' '), address.country].filter(Boolean).join(', ');

/** Account data is keyed by user ID, including staff who have no owner record. */
export function accountProfile(db, me) {
  const owner = me.role === 'owner' ? (db.owners || []).find(o => o.userId === me.id || o.id === me.ownerId) : null;
  const profile = { ...me, ...owner, ...db.accountProfiles?.[me.id] };
  const address = typeof profile.address === 'object' && profile.address ? profile.address : {};
  return { ...profile, id: me.id, ...address, address: typeof profile.address === 'string' ? profile.address : formatAccountAddress(address), birthday: String(profile.birthday || '').slice(0, 10) };
}

export function saveAccountProfile(db, userId, profile) {
  return {
    ...db,
    accountProfiles: { ...db.accountProfiles, [userId]: { ...db.accountProfiles?.[userId], ...profile } },
    owners: (db.owners || []).map(o => profile.role === 'owner' && (o.userId === userId || o.id === profile.ownerId)
      ? { ...o, ...profile, id: o.id, userId, ...(typeof profile.address === 'object' ? { ...profile.address, address: formatAccountAddress(profile.address) } : {}) } : o),
  };
}

// Keep profile feedback aligned with the account contact API's existing rules.
export function contactFieldErrors(input) {
  const errors={};
  const email=String(input.email || '').trim();
  if(!email || email.length>255 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) errors.email='Enter a valid email address.';
  if(!parsePhoneNumberFromString(String(input.phone || ''),'PH')?.isValid()) errors.phone='Enter a valid mobile number including its country code.';
  for(const [key,limit] of Object.entries({houseStreet:255,city:100,state:100,country:100,zipCode:20})) {
    const value=input[key] ?? '';
    if(typeof value!=='string' || value.length>limit || /[\u0000-\u001f\u007f]/.test(value)) errors[key]=`Check this field (up to ${limit} characters).`;
  }
  // Same address rules as registration, so a profile edit cannot leave the clinic without a usable address.
  for(const [key,message] of Object.entries(addressErrors(input))) errors[key] ||= message;
  return errors;
}
export function contactCodeErrors(pending,{emailCode,phoneCode}) {
  const errors={};
  if(pending?.requireEmail && !/^\d{6}$/.test(emailCode || '')) errors.emailCode='Enter the 6-digit code sent to your new email.';
  if(pending?.requirePhone && !/^\d{6}$/.test(phoneCode || '')) errors.phoneCode='Enter the 6-digit code sent to your new mobile.';
  return errors;
}

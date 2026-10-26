export const ownerPhoneKey = value => {
  const digits=String(value || '').replace(/\D/g,'');
  return digits.startsWith('09') && digits.length===11 ? `63${digits.slice(1)}` : digits;
};
export function matchingOwners(owners,{email,phone}) {
  const emailKey=String(email || '').trim().toLowerCase(),phoneKey=ownerPhoneKey(phone);
  return owners.filter(o=>(emailKey && String(o.email || '').trim().toLowerCase()===emailKey) || (phoneKey && ownerPhoneKey(o.phone)===phoneKey));
}

import { parsePhoneNumberFromString } from 'libphonenumber-js/min';

export function consentErrors(form, required = true) {
  if (!required && !form.consentConfirmed) return {};
  const alternate = form.alternateContact === true || [form.emergencyName,form.emergencyPhone,form.emergencyRelationship].some(value => value != null && value !== '');
  return {
    consentConfirmed:form.consentConfirmed === true ? '' : 'Confirm that consent was received from the owner or authorized representative.',
    consentName:typeof form.consentName!=='string' || !/[\p{L}]/u.test(form.consentName) || form.consentName.length>150 ? 'Enter the consenting person’s name (up to 150 characters).' : '',
    consentMethod:['In person','Phone','Written'].includes(form.consentMethod) ? '' : 'Choose how consent was received.',
    emergencyName:!alternate ? '' : typeof form.emergencyName!=='string' || !/[\p{L}]/u.test(form.emergencyName) || form.emergencyName.length>150 ? 'Enter an alternate contact name (up to 150 characters).' : '',
    emergencyPhone:!alternate ? '' : typeof form.emergencyPhone==='string' && form.emergencyPhone.length<=40 && parsePhoneNumberFromString(form.emergencyPhone,'PH')?.isValid() ? '' : 'Enter a valid alternate phone number, including its area or country code.',
    emergencyRelationship:!alternate ? '' : typeof form.emergencyRelationship!=='string' || !/[\p{L}]/u.test(form.emergencyRelationship) || form.emergencyRelationship.length>100 ? 'Enter the contact’s relationship to the owner (up to 100 characters).' : '',
  };
}

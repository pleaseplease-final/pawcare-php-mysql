export const AUDIT_TYPES = ['Appointments','Clinical care','Payments','Patients & owners','Staff access','Account & sign-in','Reminders','Other activity'];
export function auditActivity(entry) {
  const action=String(entry.action || entry.msg || 'Activity details were not recorded.');
  const actor=entry.actor || entry.by || entry.user_name || entry.user?.name || 'System';
  const role=entry.role || entry.user_role || entry.user?.role || 'system';
  const type=/staff access|invitation|invite.*staff/i.test(action)?'Staff access'
    :/sign(?:ed)?[ -]?in|log(?:ged)?[ -]?in|password|own profile|own contact|contact details|profile photo|verified (email|mobile)|session/i.test(action)?'Account & sign-in'
    :/payment|billing|checkout|invoice/i.test(action)?'Payments'
    :/reminder|phone call|call outcome/i.test(action)?'Reminders'
    :/^registered|^(approved|declined|updated) pet request/i.test(action)?'Patients & owners'
    :/^(booked|rescheduled)\b|^updated appointment|check.?in|intake|visit status/i.test(action)?'Appointments'
    :/consultation|soap|clinical|administered|handoff|transferred.*vet/i.test(action)?'Clinical care'
    :/appointment|booked|check.?in|intake|arrival|visit status/i.test(action)?'Appointments'
    :/pet request|registered|registration|owner|patient|pet.*photo/i.test(action)?'Patients & owners':'Other activity';
  const rawDate=entry.at || entry.created_at || entry.ts;
  const date=rawDate ? new Date(rawDate) : null;
  const timestamp=date && Number.isFinite(date.getTime()) ? date.toLocaleString('en-PH',{timeZone:'Asia/Manila',dateStyle:'medium',timeStyle:'short'}) : 'Time not recorded';
  return {action,actor,role,type,timestamp,dateTime:date && Number.isFinite(date.getTime())?date.toISOString():undefined};
}

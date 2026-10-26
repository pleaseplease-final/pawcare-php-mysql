import { useState } from 'react';
import { CalendarDays, CreditCard, Users, ShieldCheck, UserRound, Bell, ClipboardList, Activity, ChevronDown, Clock } from 'lucide-react';
import { auditActivity } from '../auditActivity.js';
const tones={'Appointments':'appointments','Clinical care':'clinical','Payments':'payments','Patients & owners':'patients','Staff access':'staff','Account & sign-in':'account','Reminders':'reminders','Other activity':'other'};
const icons={'Appointments':CalendarDays,'Clinical care':ClipboardList,'Payments':CreditCard,'Patients & owners':Users,'Staff access':ShieldCheck,'Account & sign-in':UserRound,'Reminders':Bell};
export default function AuditActivity({entry,className=''}) {
  const [open,setOpen]=useState(false),a=auditActivity(entry),Icon=icons[a.type]||Activity;
  const role={admin:'Administrator',vet:'Veterinarian',assistant:'Vet assistant',owner:'Pet owner',system:'System'}[a.role]||a.role;
  return <article className={`audit-entry ${className}`} data-activity={tones[a.type]}>
    <span className="audit-event-icon"><Icon size={18} aria-hidden="true" /></span>
    <div className="audit-entry-content">
      <span className="audit-type">{a.type}</span>
      <p className="audit-action" title={a.action}>{a.action}</p>
      <div className="audit-actor"><UserRound size={13} aria-hidden="true" /><span><b>{a.actor}</b><small>{role}</small></span></div>
      <time className="audit-time" dateTime={a.dateTime}><Clock size={12} aria-hidden="true" /><span>{a.timestamp}<small>Manila time</small></span></time>
      <button type="button" className="audit-detail-toggle" aria-expanded={open} aria-label={`${open?'Hide':'View'} saved details: ${a.type} by ${a.actor}`} onClick={()=>setOpen(!open)}>{open?'Less':'Details'}<ChevronDown size={14} aria-hidden="true" /></button>
      {open&&<dl className="audit-saved-details"><div><dt>Activity type</dt><dd>{a.type}</dd></div><div><dt>Performed by</dt><dd>{a.actor} · {role}</dd></div><div><dt>Saved action</dt><dd>{a.action}</dd></div><div><dt>Time (Manila)</dt><dd>{a.timestamp}</dd></div><div><dt>Record reference</dt><dd>{entry.id || 'Not recorded'}</dd></div></dl>}
    </div>
  </article>;
}

import { useRef, useState } from 'react';
import ClinicDialog from '../components/ClinicDialog.jsx';
import { clinicRequest } from '../clinicApi.js';
import { useLive, Field } from './owner/ui.jsx';
import { CLOSE_REASONS, CLOSE_NOTE_MAX, closeVisitErrors, openDays, openAgeLabel } from '../visitClosure.js';
import { today } from '../booking.js';

/* Closing is for visits that never produced a clinical record. The server refuses it if notes, vaccines, charges or an admission exist. */
export default function CloseVisitModal({ visit, petName, onClose, onClosed }) {
  const f = useLive({ reasonCode: '', note: '' }, closeVisitErrors);
  const [top, setTop] = useState(''), [saving, setSaving] = useState(false), flight = useRef(false);
  const submit = async event => {
    event.preventDefault();
    if (flight.current) return;
    f.submit(event);
    if (!f.valid) return;
    flight.current = true; setSaving(true); setTop('');
    try {
      const result = await clinicRequest('POST', `/api/appointments/${visit.id}/close`, { ...f.v, expectedStatus: visit.status });
      if (!result?.success || result.appointment?.id !== visit.id || result.appointment.status !== 'Cancelled') throw new Error('The server did not confirm the change. Refresh clinic records and review this visit.');
      onClosed({ id: visit.id, status: 'Cancelled', cancelReason: result.appointment.cancel_reason ?? result.appointment.cancelReason ?? '' });
    } catch (error) { setTop(error.message); flight.current = false; setSaving(false); }
  };
  const days = openDays(visit, today());
  return <ClinicDialog label={`Close visit for ${petName}`} onClose={() => { if (!saving) onClose(); }}>
    <form className="modal record-edit" onSubmit={submit} noValidate aria-busy={saving}>
      <h3>Close visit for {petName}</h3>
      <p className="sf-sub">{visit.date} {visit.time || ''} · {visit.reason} · {openAgeLabel(days)}</p>
      <p className="ow-note">Use this only when no care was recorded. The visit is closed without a clinical record, nothing is billed, and the reason is saved to the audit trail. If you have already examined the patient, complete the visit notes instead.</p>
      <fieldset disabled={saving} className="record-edit-fields">
        <Field id="cv-reason" label="Why is this visit being closed?" req type="select" value={f.v.reasonCode} options={CLOSE_REASONS} onChange={v => f.set('reasonCode', v)} onBlur={() => f.blur('reasonCode')} error={f.show('reasonCode')} valid={f.ok('reasonCode')} />
        <Field id="cv-note" label="What happened?" req type="textarea" rows={3} max={CLOSE_NOTE_MAX} value={f.v.note} onChange={v => f.set('note', v)} onBlur={() => f.blur('note')} error={f.show('note')} valid={f.ok('note')} hint="For example: owner left at 3 PM before the exam; no treatment was given." />
      </fieldset>
      {top && <p className="err" role="alert">{top}</p>}
      {f.submitted && !f.valid && <p className="err" role="alert">Please fix {f.count} field{f.count > 1 ? 's' : ''} above.</p>}
      <div className="row end">
        <button type="button" className="btn ghost" disabled={saving} onClick={onClose}>Keep visit open</button>
        <button className="btn danger" disabled={saving}>{saving ? 'Closing…' : 'Close visit'}</button>
      </div>
    </form>
  </ClinicDialog>;
}

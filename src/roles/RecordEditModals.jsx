import { useRef, useState } from 'react';
import ClinicDialog from '../components/ClinicDialog.jsx';
import { api } from '../api.js';
import { useLive, Field, onlyDigitsPlus } from './owner/ui.jsx';
import { ownerDetailErrors, petDetailErrors, PET_SEXES, PET_NEUTERED, PET_EARLIEST_BIRTH, changedFields } from '../recordCorrection.js';
import { today } from '../booking.js';
import { ownerContactConflicts, findDuplicatePet, duplicatePetMessage } from '../duplicateRules.js';

const phoneChanged = (a, b) => String(a).replace(/[\s-]/g, '') !== String(b || '').replace(/[\s-]/g, '');
const LABELS = { name: 'name', phone: 'mobile number', email: 'email', address: 'address', breed: 'breed', sex: 'sex', birth: 'birth date', color: 'colour', neutered: 'spayed/neutered status', notes: 'notes' };

/* Shared shell: live validation, a "what will change" summary and server errors shown on the matching field. */
function EditShell({ title, intro, keys, initial, validate, send, onClose, onSaved, children }) {
  const f = useLive(initial, validate);
  const [top, setTop] = useState(''), [server, setServer] = useState({}), [saving, setSaving] = useState(false), flight = useRef(false);
  const changed = changedFields(initial, f.v, keys);
  const set = (key, value) => { setServer(previous => ({ ...previous, [key]: '' })); f.set(key, value); };
  const submit = async event => {
    event.preventDefault();
    if (flight.current) return;
    f.submit(event);
    if (!f.valid || !changed.length) return;
    flight.current = true; setSaving(true); setTop('');
    try { onSaved(await send(f.v)); }
    catch (error) { setTop(error.message); setServer(error.fields || error.errors || {}); flight.current = false; setSaving(false); }
  };
  return <ClinicDialog label={title} onClose={() => { if (!saving) onClose(); }}>
    <form className="modal record-edit" onSubmit={submit} noValidate aria-busy={saving}>
      <h3>{title}</h3>
      <p className="sf-sub">{intro}</p>
      <fieldset disabled={saving} className="record-edit-fields">{children(f, server, set)}</fieldset>
      <p className={`record-edit-changes${changed.length ? ' has' : ''}`} role="status" aria-live="polite">
        {changed.length ? `Will update: ${changed.map(key => LABELS[key]).join(', ')}.` : 'No changes yet.'}
      </p>
      {top && <p className="err" role="alert">{top}</p>}
      {f.submitted && !f.valid && <p className="err" role="alert">Please fix {f.count} field{f.count > 1 ? 's' : ''} above.</p>}
      <div className="row end">
        <button type="button" className="btn ghost" disabled={saving} onClick={onClose}>Cancel</button>
        <button className="btn gold" disabled={saving || !changed.length}>{saving ? 'Saving…' : 'Save corrections'}</button>
      </div>
    </form>
  </ClinicDialog>;
}

export function EditOwnerModal({ owner, owners = [], onClose, onSaved }) {
  const initial = { name: owner.name || '', phone: owner.phone || '', email: owner.email || '', address: owner.address || '' };
  return <EditShell title={`Edit ${owner.name}`} intro="Correct the owner’s contact record. Every change is saved to the audit trail." keys={Object.keys(initial)} initial={initial}
    validate={v => {
      const errors = ownerDetailErrors(v), clash = ownerContactConflicts(owners, v, owner.id);
      if (!errors.phone && clash.phone && phoneChanged(v.phone, owner.phone)) errors.phone = `This mobile number is already on ${clash.phone.name}’s record.`;
      if (!errors.email && clash.email && v.email.trim().toLowerCase() !== String(owner.email || '').trim().toLowerCase()) errors.email = `This email is already on ${clash.email.name}’s record.`;
      return errors;
    }} onClose={onClose} onSaved={saved => onSaved(saved.owner)}
    send={async v => {
      const result = await api.put(`/api/owners/${owner.id}/details`, { ...v, expected: initial });
      if (!result?.success || result.owner?.id !== owner.id) throw new Error('The server did not confirm the change. Refresh clinic records and review the owner.');
      return result;
    }}>
    {(f, server, set) => {
      const err = key => server[key] || f.show(key);
      return <>
        <Field id="eo-name" label="Full name" req value={f.v.name} maxLen={60} onChange={v => set('name', v)} onBlur={() => f.blur('name')} error={err('name')} valid={f.ok('name') && !server.name} hint="As it should appear on invoices and cards" autoComplete="off" />
        <div className="record-edit-pair">
          <Field id="eo-phone" label="Mobile number" req type="tel" value={f.v.phone} filter={onlyDigitsPlus} filterMsg="Numbers and a leading + only" inputMode="tel" maxLen={13} onChange={v => set('phone', v)} onBlur={() => f.blur('phone')} error={err('phone')} valid={f.ok('phone') && !server.phone} hint="09XXXXXXXXX or +639XXXXXXXXX" />
          <Field id="eo-email" label="Email (optional)" type="email" value={f.v.email} maxLen={255} onChange={v => set('email', v.replace(/\s/g, ''))} onBlur={() => f.blur('email')} error={err('email')} valid={f.ok('email') && !server.email} hint="Used for reminders" />
        </div>
        <Field id="eo-address" label="Address (optional)" type="textarea" rows={2} max={150} value={f.v.address} onChange={v => set('address', v)} onBlur={() => f.blur('address')} error={err('address')} valid={f.ok('address') && !server.address} hint="Street or locality" />
      </>;
    }}
  </EditShell>;
}

export function EditPetModal({ pet, siblings = [], onClose, onSaved }) {
  const initial = { name: pet.name || '', breed: pet.breed || '', sex: pet.sex || '', birth: pet.birth || '', color: pet.color || '', neutered: pet.neutered || '', notes: pet.notes || '' };
  const TODAY = today();
  return <EditShell title={`Edit ${pet.name}`} intro="Correct the patient’s record. Species and weight history are kept as recorded; use vitals to log new weights." keys={Object.keys(initial)} initial={initial}
    validate={v => {
      const errors = petDetailErrors(v, TODAY);
      const twin = !errors.name && !errors.birth && findDuplicatePet(siblings, { ownerId: pet.ownerId, name: v.name, species: pet.species, birth: v.birth }, pet.id);
      if (twin) errors.name = duplicatePetMessage(twin);
      return errors;
    }} onClose={onClose} onSaved={saved => onSaved(saved.pet)}
    send={async v => {
      const result = await api.put(`/api/pets/${pet.id}/details`, { ...v, expected: initial });
      if (!result?.success || result.pet?.id !== pet.id) throw new Error('The server did not confirm the change. Refresh clinic records and review the patient.');
      return result;
    }}>
    {(f, server, set) => {
      const err = key => server[key] || f.show(key);
      return <>
        <div className="record-edit-pair">
          <Field id="ep-name" label="Pet name" req value={f.v.name} maxLen={30} onChange={v => set('name', v)} onBlur={() => f.blur('name')} error={err('name')} valid={f.ok('name') && !server.name} />
          <Field id="ep-breed" label="Breed" value={f.v.breed} maxLen={60} onChange={v => set('breed', v)} onBlur={() => f.blur('breed')} error={err('breed')} valid={f.ok('breed') && !server.breed} hint="Leave blank for Mixed Breed" />
        </div>
        <div className="record-edit-pair">
          <Field id="ep-sex" label="Sex" req type="select" value={f.v.sex} options={PET_SEXES.map(s => [s, s])} onChange={v => set('sex', v)} onBlur={() => f.blur('sex')} error={err('sex')} valid={f.ok('sex') && !server.sex} />
          <Field id="ep-birth" label="Birth date" req type="date" min={PET_EARLIEST_BIRTH} maxDate={TODAY} value={f.v.birth} onChange={v => set('birth', v)} onBlur={() => f.blur('birth')} error={err('birth')} valid={f.ok('birth') && !server.birth} />
        </div>
        <div className="record-edit-pair">
          <Field id="ep-neutered" label="Spayed or neutered?" req type="select" value={f.v.neutered} options={PET_NEUTERED.map(s => [s, s])} onChange={v => set('neutered', v)} onBlur={() => f.blur('neutered')} error={err('neutered')} valid={f.ok('neutered') && !server.neutered} />
          <Field id="ep-color" label="Colour / markings" value={f.v.color} maxLen={60} onChange={v => set('color', v)} onBlur={() => f.blur('color')} error={err('color')} valid={f.ok('color') && !server.color} />
        </div>
        <Field id="ep-notes" label="Care notes" type="textarea" rows={2} max={300} value={f.v.notes} onChange={v => set('notes', v)} onBlur={() => f.blur('notes')} error={err('notes')} valid={f.ok('notes') && !server.notes} hint="Behaviour or handling notes for staff" />
      </>;
    }}
  </EditShell>;
}

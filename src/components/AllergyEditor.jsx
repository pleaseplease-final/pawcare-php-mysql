import { useRef, useState } from 'react';
import { api } from '../api.js';
import { allergyEntryError, allergyListError, allergyName, MAX_ALLERGIES } from '../allergyRules.js';

// Known reactions are the first thing a veterinarian checks. This is where the clinic records or corrects them.
export default function AllergyEditor({pet, setDb, say}) {
  const saved = pet.allergies || [];
  const [list, setList] = useState(saved), [draft, setDraft] = useState(''), [touched, setTouched] = useState(false);
  const [saving, setSaving] = useState(false), [error, setError] = useState('');
  const inFlight = useRef(false);
  const entryError = touched ? allergyEntryError(draft, list) : '';
  const changed = JSON.stringify(list) !== JSON.stringify(saved);
  const add = () => {
    setTouched(true);
    if (allergyEntryError(draft, list)) return;
    setList(previous => [...previous, allergyName(draft)]); setDraft(''); setTouched(false); setError('');
  };
  const save = async () => {
    if (inFlight.current || !changed) return;
    const problem = allergyListError(list);
    if (problem) { setError(problem); return; }
    inFlight.current = true; setSaving(true); setError('');
    try {
      const result = await api.put(`/api/pets/${encodeURIComponent(pet.id)}/allergies`, {allergies: list, expected: saved});
      if (result?.petId !== pet.id || !Array.isArray(result.allergies)) throw new Error('The clinic did not confirm the allergy list. Reload the pet and check before retrying.');
      setDb(previous => ({...previous, pets: previous.pets.map(p => p.id === pet.id ? {...p, allergies: result.allergies} : p)}));
      setList(result.allergies); say?.(`Allergies saved for ${pet.name}.`);
    } catch (e) { setError(e.message); }
    finally { inFlight.current = false; setSaving(false); }
  };
  return <details className="allergy-editor" open={!saved.length || undefined} style={{marginBottom: 14}}>
    <summary><b>{saved.length ? 'Update known allergies' : 'Record known allergies'}</b>{!saved.length && <small> · none on file yet</small>}</summary>
    <div style={{padding: '8px 0'}}>
      <ul className="allergy-chips" aria-label={`Allergies for ${pet.name}`} style={{display: 'flex', flexWrap: 'wrap', gap: 6, listStyle: 'none', padding: 0, margin: '0 0 8px'}}>
        {!list.length && <li style={{color: '#64748b'}}>No allergies listed. Add one below if the owner reports any.</li>}
        {list.map(item => <li key={item} style={{background: '#fef2f2', color: '#991b1b', border: '1px solid #fecaca', borderRadius: 99, padding: '3px 6px 3px 12px', display: 'flex', alignItems: 'center', gap: 6}}>
          {item}<button type="button" className="btn ghost sm" style={{padding: '0 6px'}} aria-label={`Remove ${item}`} disabled={saving} onClick={() => { setList(previous => previous.filter(x => x !== item)); setError(''); }}>×</button></li>)}
      </ul>
      <div className="row" style={{gap: 8, flexWrap: 'wrap', alignItems: 'flex-start'}}>
        <div style={{flex: '1 1 220px'}}>
          <input name="allergy" value={draft} maxLength={40} placeholder="e.g. Chicken, Penicillin, Pollen" aria-label="Add an allergy" aria-invalid={!!entryError} aria-describedby="allergy-error" disabled={saving || list.length >= MAX_ALLERGIES}
            onChange={e => { setDraft(e.target.value); setTouched(true); }} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); add(); } }} />
          <span id="allergy-error" className="err" aria-live="polite">{entryError}</span>
        </div>
        <button type="button" className="btn sm ghost" disabled={saving || !draft.trim()} onClick={add}>Add</button>
        <button type="button" className="btn sm gold" disabled={saving || !changed} onClick={save}>{saving ? 'Saving…' : 'Save allergies'}</button>
      </div>
      <small>{list.length} of {MAX_ALLERGIES} · Saved allergies appear as a red alert for every veterinarian who sees {pet.name}.</small>
      {error && <p role="alert" className="err">{error}</p>}
    </div>
  </details>;
}

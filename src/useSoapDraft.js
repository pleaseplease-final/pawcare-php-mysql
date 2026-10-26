import { useLayoutEffect, useEffect, useRef, useState } from 'react';
import { soapDraftKey, readSoapDraft, writeSoapDraft } from './soapDraft.js';

export function useSoapDraft({userId, appt, petId, initialForm, consultationId, vaccinationId, expectedVisit}) {
  const key = useRef(soapDraftKey(userId, appt.id, petId)).current;
  const initial = useRef(null);
  if (!initial.current) {
    let recovered = null, error = '';
    try {
      recovered = readSoapDraft(localStorage, key, initialForm);
      if (recovered && (recovered.expectedVisit.id !== appt.id || recovered.expectedVisit.petId !== petId)) throw Error('Mismatched draft');
    }
    catch { recovered = null; error = 'A saved draft could not be read. Keep this form open and copy your notes before leaving.'; }
    initial.current = {recovered, error, baseline:JSON.stringify({form:initialForm,prescriptionItems:[],performedServices:[]})};
  }
  const [draft, setDraft] = useState(() => initial.current.recovered || {form:initialForm,prescriptionItems:[],performedServices:[],consultationId,vaccinationId,expectedVisit});
  const [error, setError] = useState(initial.current.error);
  const [saved, setSaved] = useState(false);
  const cleared = useRef(false);
  const stored = useRef(!!initial.current.recovered);
  const dirty = !!initial.current.recovered || JSON.stringify({form:draft.form,prescriptionItems:draft.prescriptionItems,performedServices:draft.performedServices}) !== initial.current.baseline;
  const latest = useRef(draft); latest.current = draft;
  const persist = () => {
    if (cleared.current || !dirty) return true;
    try { writeSoapDraft(localStorage, key, latest.current); stored.current = true; setSaved(true); setError(''); return true; }
    catch { setSaved(false); setError('Draft recovery is unavailable in this browser. Keep this form open and copy your notes before leaving.'); return false; }
  };
  // Persist every committed edit, including before a parent can unmount the form.
  useLayoutEffect(() => {
    if (dirty) persist();
    else if (stored.current) {
      try { localStorage.removeItem(key); stored.current = false; setSaved(false); }
      catch { setError('An earlier draft could not be removed. Try closing the form and discarding it.'); }
    }
  }, [draft, dirty]);
  useEffect(() => {
    if (!dirty) return;
    const leave = event => { if (cleared.current) return; persist(); event.preventDefault(); event.returnValue = ''; };
    window.addEventListener('beforeunload', leave);
    return () => window.removeEventListener('beforeunload', leave);
  }, [dirty]);
  const clear = () => {
    try { localStorage.removeItem(key); cleared.current = true; return true; }
    catch { setError('The browser could not remove the saved draft. Try again before closing.'); return false; }
  };
  const setPart = (part, value) => setDraft(previous => ({...previous,[part]:typeof value === 'function' ? value(previous[part]) : value}));
  return {draft, setPart, dirty, persist, clear, error, saved, recovered:!!initial.current.recovered};
}

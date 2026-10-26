import { useCallback, useEffect, useState } from 'react';
import { clinicRequest } from './clinicApi.js';

export function useAvailability({ vetId, date, service, excludeId }) {
  const [result, setResult] = useState({ key: '', slots: [], loading: false, error: '' });
  const [version, setVersion] = useState(0);
  const key = JSON.stringify([vetId, date, service, excludeId]);
  const refresh = useCallback(() => setVersion(v => v + 1), []);
  useEffect(() => {
    if (!vetId || !date || !service) return;
    let active = true;
    const load = async () => {
      setResult(r => ({ key, slots: r.key === key ? r.slots : [], loading: true, error: '' }));
      try {
        const data = await clinicRequest('GET', `/api/appointments/availability?${new URLSearchParams({ vetId, date, service, ...(excludeId ? { excludeId } : {}) })}`);
        if (active) setResult({ key, slots: data.slots || [], loading: false, error: '' });
      } catch (error) {
        if (active) setResult({ key, slots: [], loading: false, error: error.message });
      }
    };
    load();
    const interval = setInterval(load, 30000);
    return () => { active = false; clearInterval(interval); };
  }, [key, version]);
  return { ...(result.key === key ? result : { slots: [], loading: Boolean(vetId && date && service), error: '' }), refresh };
}

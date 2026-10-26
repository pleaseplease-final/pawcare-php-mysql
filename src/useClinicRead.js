import { useCallback, useEffect, useRef, useState } from 'react';
import { clinicRequest } from './clinicApi.js';

// Manual refresh replaces old reads; polling waits until the current read ends.
export function useClinicRead(path, pollInterval = 0) {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const pending = useRef(null);
  const mounted = useRef(false);
  const load = useCallback(async (nextPath = path, merge) => {
    pending.current?.abort();
    const controller = new AbortController();
    pending.current = controller;
    setLoading(true);
    setError('');
    const timeout = setTimeout(() => controller.abort(), 20000);
    try {
      const result = await clinicRequest('GET', nextPath, undefined, { signal: controller.signal });
      if (mounted.current && pending.current === controller && !controller.signal.aborted) {
        setData(previous => merge ? merge(previous, result) : result);
      }
    } catch (err) {
      if (mounted.current && pending.current === controller) {
        setError(controller.signal.aborted ? 'Loading took too long. Please retry.' : err.message);
      }
    } finally {
      clearTimeout(timeout);
      if (pending.current === controller) {
        pending.current = null;
        if (mounted.current) setLoading(false);
      }
    }
  }, [path]);

  useEffect(() => {
    mounted.current = true;
    load();
    const timer = pollInterval ? setInterval(() => {
      if (!pending.current && document.visibilityState !== 'hidden') load();
    }, pollInterval) : null;
    return () => {
      mounted.current = false;
      clearInterval(timer);
      pending.current?.abort();
      pending.current = null;
    };
  }, [load, pollInterval]);
  return { data, error, loading, load };
}

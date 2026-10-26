// One full-state request at a time. Poll after completion so slow connections do
// not queue duplicate work; hidden/offline tabs resume immediately when active.
export function startClinicSync({load, onData, onError, getBaseline, onLoading = () => {},
  document: page = globalThis.document, window: events = globalThis.window,
  interval = 3000, timeout = 20000, setTimer = setTimeout, clearTimer = clearTimeout}) {
  let stopped = false, pending = null, timer, deadline;
  const available = () => page?.visibilityState !== 'hidden' && events?.navigator?.onLine !== false;
  const schedule = () => {
    clearTimer(timer);
    if (!stopped && available()) timer = setTimer(refresh, interval);
  };
  async function refresh() {
    if (stopped || pending || !available()) return;
    clearTimer(timer);
    const controller = new AbortController();
    pending = controller;
    const baseline = getBaseline?.();
    onLoading(true);
    deadline = setTimer(() => controller.abort(), timeout);
    try {
      const remote = await load(controller.signal);
      if (!stopped) onData(remote, baseline);
    } catch (error) {
      if (!stopped) onError(controller.signal.aborted
        ? new Error('Loading clinic records took too long. Please retry.') : error);
    } finally {
      clearTimer(deadline);
      pending = null;
      if (!stopped) { onLoading(false); schedule(); }
    }
  }
  const resume = () => {
    if (available()) refresh();
    else clearTimer(timer);
  };
  page?.addEventListener('visibilitychange', resume);
  events?.addEventListener('focus', resume);
  events?.addEventListener('online', resume);
  events?.addEventListener('offline', resume);
  refresh();
  return {refresh, stop() {
    stopped = true;
    clearTimer(timer); clearTimer(deadline); pending?.abort();
    page?.removeEventListener('visibilitychange', resume);
    events?.removeEventListener('focus', resume);
    events?.removeEventListener('online', resume);
    events?.removeEventListener('offline', resume);
  }};
}

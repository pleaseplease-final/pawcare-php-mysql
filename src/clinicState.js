export const emptyClinicState = () => ({ users: [], owners: [], pets: [], appts: [], vacc: [], vaccs: [], records: [], consults: [], petRequests: [], vets: [], log: [] });

const collections = {owners:'owners', pets:'pets', appts:'appts', vacc:'vaccs', vaccs:'vaccs', records:'consults', consults:'consults', petRequests:'petRequests', vets:'vets', log:'log'};
function shareRecords(previous = [], incoming = []) {
  if (previous === incoming) return previous;
  const byId = new Map(previous.map(record => [record.id, record]));
  const next = incoming.map(record => {
    const old = byId.get(record.id);
    return old && (old === record || JSON.stringify(old) === JSON.stringify(record)) ? old : record;
  });
  return previous.length === next.length && next.every((record, i) => record === previous[i]) ? previous : next;
}

// Empty results remain authoritative; unchanged rows retain identity. A poll
// started before a local saved mutation cannot undo that acknowledged change.
export function applyClinicState(previous, remote, baseline) {
  if (baseline && Object.keys(collections).some(key => previous[key] !== baseline[key])) return previous;
  const next = {...previous, totals:remote.totals, summary:remote.summary};
  const shared = {};
  for (const [key, source] of Object.entries(collections)) {
    next[key] = shared[source] ||= shareRecords(previous[key], remote[source] || []);
  }
  return Object.keys(collections).every(key => previous[key] === next[key]) && JSON.stringify(previous.totals)===JSON.stringify(next.totals) && previous.summary===next.summary ? previous : next;
}

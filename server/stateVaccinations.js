// Preserve the state endpoint's existing suggestion suppression rules while
// indexing administered doses once instead of scanning the full card per row.
const groups = ['rabies', 'dhpp', '5-in-1', 'deworm'];
export function visibleStateVaccinations(records) {
  const administered = new Map();
  for (const record of records) {
    if (!record.done) continue;
    let index = administered.get(record.petId);
    if (!index) { index = {names: new Set(), groups: new Set()}; administered.set(record.petId, index); }
    const name = record.vaccine?.toLowerCase();
    index.names.add(name);
    for (const group of groups) if (name?.includes(group)) index.groups.add(group);
  }
  return records.filter(record => {
    if (record.done) return true;
    const index = administered.get(record.petId);
    if (!index) return true;
    const name = record.vaccine?.toLowerCase();
    return !index.names.has(name) && !groups.some(group => name?.includes(group) && index.groups.has(group));
  });
}

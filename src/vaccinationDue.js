// Keep reception recall lists consistent with the worker's latest certified dose.
export const vaccineFamily = name => /rabies/i.test(name) ? 'rabies' : /dhpp|[568]-in-1/i.test(name) ? 'canine-core' : /fvrcp|feline.*4.in.1/i.test(name) ? 'feline-core' : String(name || '').trim().toLowerCase();
export function currentVaccinationDue(records = []) {
  const latest = new Map();
  for (const v of records.filter(v => v.done && v.vetId)) {
    const key = `${v.petId}:${vaccineFamily(v.vaccine)}`;
    const prev = latest.get(key);
    if (!prev || `${v.date || ''}:${v.createdAt || ''}:${v.id}` > `${prev.date || ''}:${prev.createdAt || ''}:${prev.id}`) latest.set(key, v);
  }
  return [...latest.values()].filter(v => v.nextDue);
}

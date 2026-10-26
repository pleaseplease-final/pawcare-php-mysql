// Confirm the transfer itself before removing the sending veterinarian's records.
export function savedHandoff(response, visit, recipientId, note, me) {
  const a=response?.appointment,h=response?.handoff;
  if (!response?.success || a?.id !== visit.id || a?.petId !== visit.petId || a?.vetId !== recipientId || a?.status !== 'Checked-in'
      || h?.toId !== recipientId || ![me.id,me.vetId].filter(Boolean).includes(h?.fromId) || h?.note !== note.trim()
      || typeof h?.to !== 'string' || !h.to.trim() || !Number.isFinite(Date.parse(h?.at))) {
    throw Error('The server did not confirm this handoff. Refresh clinic records before trying again.');
  }
  return h;
}

// Match the server's appointment-based patient scope even if state refresh fails.
export function removeHandedOffVisit(previous, visitId, me) {
  const assigned=a=>[me.id,me.vetId].filter(Boolean).includes(a.vetId);
  const appts=previous.appts.filter(a=>a.id!==visitId && assigned(a));
  const petIds=new Set(appts.filter(assigned).map(a=>a.petId));
  const pets=previous.pets.filter(p=>petIds.has(p.id));
  const ownerIds=new Set(pets.map(p=>p.ownerId));
  const scoped={...previous,appts,pets,owners:previous.owners.filter(o=>ownerIds.has(o.id))};
  for (const key of ['vacc','vaccs','records','consults']) if (Array.isArray(previous[key])) scoped[key]=previous[key].filter(r=>petIds.has(r.petId));
  return scoped;
}

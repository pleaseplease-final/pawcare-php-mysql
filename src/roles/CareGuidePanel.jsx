import { useMemo, useState } from 'react';
import { matchGuides, mergeGuides, prescriptionLine, checkupSnapshot, courseDays } from '../clinicalGuide.js';

const money = n => `₱${Number(n).toLocaleString()}`;
const courseText = spec => `${spec.timesPerDay}× a day for ${spec.duration} ${spec.durationUnit}`;

// Diagnosis -> suggested plan -> products. Nothing is saved until the vet applies it,
// and every added line stays editable in the form below.
export function CareGuidePanel({diagnosis, catalog, selectedIds, onApply, petName}) {
  const guides = useMemo(() => matchGuides(diagnosis), [diagnosis]);
  const merged = useMemo(() => mergeGuides(guides), [guides]);
  const [off, setOff] = useState(() => new Set()), [picks, setPicks] = useState({}), [done, setDone] = useState('');
  if (!guides.length) return diagnosis.trim() ? <p className="ow-hint" role="status">No saved care suggestions match this diagnosis. Write the plan and choose products yourself.</p> : null;
  const byId = new Map(catalog.map(p => [p.id, p]));
  const toggle = key => setOff(previous => { const next = new Set(previous); next.has(key) ? next.delete(key) : next.add(key); return next; });
  const medicineChoices = m => catalog.filter(p => (p.category === 'Pet medicine' || p.requiresPrescription) && m.re.test(p.name));
  const apply = () => {
    const plan = merged.plan.filter(l => !off.has(`plan:${l}`));
    const lines = [];
    for (const spec of merged.products) {
      const product = byId.get(spec.id);
      if (product && !off.has(`product:${spec.id}`) && !selectedIds.has(product.id)) lines.push(prescriptionLine(spec, product));
    }
    for (const m of merged.medicines) {
      const product = byId.get(picks[m.key]);
      if (product && !selectedIds.has(product.id) && !lines.some(l => l.catalogId === product.id)) lines.push(prescriptionLine({...m, dosed: true}, product));
    }
    const followUpDays = merged.followUpDays && !off.has('followUp') ? merged.followUpDays : 0;
    onApply({plan, lines, followUpDays, reason: `Recheck for ${guides.map(g => g.title.toLowerCase()).join(', ')}`});
    setDone(`Applied: ${plan.length} plan line(s), ${lines.length} product(s)${followUpDays ? `, recheck in ${followUpDays} day(s)` : ''}. Review and edit below.`);
  };
  return <section className="care-guide ow-note info" aria-label="Suggested care for this diagnosis" style={{gridColumn: '1/-1'}}>
    <b>Suggested care for {guides.map(g => g.title).join(' + ')}</b>
    <p>Matched from your diagnosis ({guides.map(g => `“${g.because}”`).join(', ')}). Untick anything you do not want, then apply. The veterinarian decides every treatment and product.</p>
    <h5>Treatment plan lines</h5>
    {merged.plan.map(l => <label key={l} className="service-check"><input type="checkbox" checked={!off.has(`plan:${l}`)} onChange={() => toggle(`plan:${l}`)} /> {l}</label>)}
    {!!merged.products.length && <><h5>Products from the clinic catalog</h5>
      {merged.products.map(spec => { const p = byId.get(spec.id), have = selectedIds.has(spec.id); return <label key={spec.id} className="service-check"><input type="checkbox" disabled={!p || have} checked={!!p && !have && !off.has(`product:${spec.id}`)} onChange={() => toggle(`product:${spec.id}`)} />
        {p ? <span><b>{p.name}</b> · {money(p.price)} · {spec.dosed ? `${courseText(spec)} (enter the dose to calculate the quantity)` : spec.directions}{have ? ' · already in the prescription' : ''}</span> : <span>{spec.id.replace('product_', '').replace(/_/g, ' ')} — not in this clinic’s catalog</span>}</label>; })}</>}
    {merged.medicines.map(m => { const choices = medicineChoices(m); return <div className="fld" key={m.key}><label htmlFor={`guide-${m.key}`}>{m.label} · {courseText(m)}</label>
      {choices.length ? <select id={`guide-${m.key}`} value={picks[m.key] || ''} onChange={e => setPicks(previous => ({...previous, [m.key]: e.target.value}))}><option value="">Do not add</option>{choices.map(p => <option key={p.id} value={p.id}>{p.name} · {money(p.price)}</option>)}</select>
        : <p className="ow-hint">No matching medicine is configured in the clinic catalog. Add one from the product list or write it in the prescription notes.</p>}</div>; })}
    {!!merged.services.length && <p>Consider confirming these services if you perform them for {petName}: {merged.services.map(id => byId.get(id)?.name || id.replace('srv_', '')).join(', ')}.</p>}
    {!!merged.followUpDays && <label className="service-check"><input type="checkbox" checked={!off.has('followUp')} onChange={() => toggle('followUp')} /> Request a recheck in {merged.followUpDays} day(s)</label>}
    {merged.admitHint && <p role="note"><b>Consider admission</b> if {petName} is dehydrated, weak or not eating. Use Admit below.</p>}
    {merged.procedure && <p role="note">A dental scaling is a procedure. Record your decision under “Surgery / dental decision” below.</p>}
    <button type="button" className="btn gold sm" onClick={apply}>Apply selected suggestions</button>
    {done && <p role="status">{done}</p>}
  </section>;
}

// Facts worked out from the saved intake and records. The vet can add them to the notes.
export function SnapshotPanel({pet, vitals, vaccs, today, objective, onAddFindings, onAddPlan, treatment}) {
  const snap = useMemo(() => checkupSnapshot({pet, vitals, vaccs, today}), [pet, vitals, vaccs, today]);
  if (!snap.lines.length) return null;
  const findingsIn = snap.lines.every(l => objective.includes(l));
  const missingPlan = snap.plan.filter(l => !treatment.includes(l));
  return <section className="care-guide ow-note info" aria-label="Calculated patient snapshot" style={{gridColumn: '1/-1'}}>
    <b>Calculated from saved records</b>
    <ul style={{margin: '6px 0'}}>{snap.lines.map(l => <li key={l}>{l}</li>)}</ul>
    <button type="button" className="btn sm ghost" disabled={findingsIn} onClick={() => onAddFindings(snap.lines)}>{findingsIn ? 'Added to examination findings' : 'Add to examination findings'}</button>
    {!!snap.plan.length && <><p>Suggested follow-through:</p><ul>{snap.plan.map(l => <li key={l}>{l}</li>)}</ul>
      <button type="button" className="btn sm ghost" disabled={!missingPlan.length} onClick={() => onAddPlan(missingPlan)}>{missingPlan.length ? 'Add to plan' : 'Added to plan'}</button></>}
  </section>;
}

export { courseDays };

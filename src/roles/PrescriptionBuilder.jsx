import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { calculateSupply, editablePrescription, prescriptionText, rxLineErrors } from '../prescription.js';
import { courseDays, DOSE_UNITS, DOSE_ROUTES } from '../clinicalGuide.js';

const COURSE_CHIPS = [['3 days', 3, 'days'], ['5 days', 5, 'days'], ['7 days', 7, 'days'], ['10 days', 10, 'days'], ['14 days', 14, 'days'], ['2 weeks', 2, 'weeks'], ['4 weeks', 4, 'weeks'], ['8 weeks', 8, 'weeks']];
const NEW_DOSE = {amount: '', unit: 'tablet', route: 'by mouth', timesPerDay: 1, days: 7, unitsPerItem: ''};

// The dose, frequency, course length and package size decide the quantity and the directions.
function recompute(item) {
  if (!item.dose) return item;
  const days = courseDays(item.durationValue, item.durationUnit), dose = {...item.dose, days: Number.isFinite(days) ? days : ''};
  try {
    const supply = calculateSupply({amount: Number(dose.amount), timesPerDay: Number(dose.timesPerDay), days, unitsPerItem: Number(dose.unitsPerItem), unit: dose.unit, route: dose.route});
    return {...item, dose, quantity: supply.quantity, instructions: supply.directions, totalUnits: supply.totalUnits};
  } catch { return {...item, dose, totalUnits: null}; }
}

export default function PrescriptionBuilder({items, onChange, notes, onNotes, error, showAll = false}) {
  const [catalog, setCatalog] = useState([]), [loadError, setLoadError] = useState(''), [attempt, retry] = useState(0);
  const [search, setSearch] = useState(''), [category, setCategory] = useState('');
  const [touched, setTouched] = useState(() => new Set());
  useEffect(() => {
    let active = true; setLoadError('');
    api.get('/api/services/prices').then(r => { if (active) setCatalog(r.catalog.filter(p => p.id.startsWith('product_') || p.requiresPrescription)); }).catch(e => { if (active) setLoadError(e.message); });
    return () => { active = false; };
  }, [attempt]);
  const touch = (id, field) => setTouched(previous => new Set(previous).add(`${id}:${field}`));
  const shown = (id, field) => showAll || touched.has(`${id}:${field}`);
  const update = (id, patch) => onChange(items.map(p => p.catalogId === id ? recompute({...p, ...patch}) : p));
  const updateDose = (id, patch) => onChange(items.map(p => p.catalogId === id ? recompute({...p, dose: {...p.dose, ...patch}}) : p));
  const selected = new Set(items.map(p => p.catalogId));
  const found = catalog.filter(p => (!category || p.category === category) && `${p.name} ${p.group || ''} ${p.need || ''}`.toLowerCase().includes(search.toLowerCase()));
  const preview = items.map(editablePrescription);
  return <section className="rx-builder" aria-label="Product prescriptions">
    <h4>Prescription &amp; take-home products</h4>
    <p>Select the product, then enter the dose, how often and for how long. The quantity and directions are calculated for you. Selected products load into reception billing when you finalize the consultation.</p>
    <div className="rx-grid"><label>Find product<input type="search" value={search} onChange={e => setSearch(e.target.value)} /></label><label>Product category<select value={category} onChange={e => setCategory(e.target.value)}><option value="">All products</option>{[...new Set(catalog.map(p => p.category))].map(c => <option key={c}>{c}</option>)}</select></label></div>
    {loadError ? <p role="alert">{loadError} <button type="button" className="btn sm" onClick={() => retry(n => n + 1)}>Retry products</button></p> : !catalog.length ? <p role="status">Loading products…</p> : <div className="rx-catalog">{found.map(p => <button type="button" className="rx-product" key={p.id} disabled={selected.has(p.id) || items.length >= 30} onClick={() => onChange([...items, {catalogId: p.id, name: p.name, price: p.price, unit: p.unit || 'item / package', category: p.category, quantity: 1, instructions: ''}])}><span><b>{p.name}</b><small>{p.category}{p.group ? ` · ${p.group}` : ''}{p.requiresPrescription ? ' · Prescription required' : ''}</small></span><b>₱{p.price.toLocaleString()} {selected.has(p.id) ? '✓' : '+'}</b></button>)}{!found.length && <p>No products match.</p>}</div>}
    {items.map(item => {
      const p = item, id = p.catalogId, errors = rxLineErrors(p), d = p.dose;
      const err = field => shown(id, field) && errors[field] ? <span id={`rx-${id}-${field}-error`} className="err" aria-live="polite" style={{fontSize: "calc(11.5px * var(--fs, 1))", marginTop: 2, display: 'block'}}>{errors[field]}</span> : null;
      const attrs = field => ({'aria-invalid': shown(id, field) && !!errors[field], 'aria-describedby': `rx-${id}-${field}-error`, className: shown(id, field) ? (errors[field] ? 'bad' : 'ok') : '', onBlur: () => touch(id, field)});
      const lineDays = d ? courseDays(p.durationValue, p.durationUnit) : NaN;
      return <fieldset className="rx-line" key={id}><legend>{p.name}</legend><p>₱{p.price.toLocaleString()} each · {p.unit || 'item / package'}</p>
        <label className="service-check"><input type="checkbox" checked={!!d} onChange={e => onChange(items.map(x => x.catalogId === id ? recompute(e.target.checked ? {...x, dose: x.dose || NEW_DOSE, durationValue: x.durationValue || 7, durationUnit: x.durationUnit || 'days'} : {...x, dose: null}) : x))} /> Calculate quantity from the dose and course length</label>
        {d && <div className="rx-course">
          <div className="rx-grid">
            <label>Dose each time *<input type="number" min="0" step="any" name={`rx-${id}-amount`} value={d.amount} onChange={e => updateDose(id, {amount: e.target.value})} {...attrs('amount')} />{err('amount')}</label>
            <label>Unit *<select name={`rx-${id}-unit`} value={d.unit} onChange={e => updateDose(id, {unit: e.target.value})} {...attrs('unit')}>{DOSE_UNITS.map(u => <option key={u}>{u}</option>)}</select>{err('unit')}</label>
            <label>Given *<select name={`rx-${id}-route`} value={d.route} onChange={e => updateDose(id, {route: e.target.value})} {...attrs('route')}>{DOSE_ROUTES.map(r => <option key={r}>{r}</option>)}</select>{err('route')}</label>
            <label>Times per day *<input type="number" min="1" max="24" step="1" name={`rx-${id}-timesPerDay`} value={d.timesPerDay} onChange={e => updateDose(id, {timesPerDay: e.target.value})} {...attrs('timesPerDay')} />{err('timesPerDay')}</label>
            <label>Course length *<input type="number" min="1" step="1" name={`rx-${id}-duration`} value={p.durationValue ?? ''} onChange={e => update(id, {durationValue: e.target.value === '' ? '' : Number(e.target.value)})} {...attrs('duration')} />{err('duration')}</label>
            <label>Counted in<select name={`rx-${id}-durationUnit`} value={p.durationUnit || 'days'} onChange={e => update(id, {durationUnit: e.target.value})}><option value="days">days</option><option value="weeks">weeks</option></select></label>
            <label>Units in one item / package *<input type="number" min="0" step="any" name={`rx-${id}-unitsPerItem`} value={d.unitsPerItem} onChange={e => updateDose(id, {unitsPerItem: e.target.value})} {...attrs('unitsPerItem')} />{err('unitsPerItem')}</label>
          </div>
          <div style={{display: 'flex', gap: 6, flexWrap: 'wrap', margin: '6px 0'}}>{COURSE_CHIPS.map(([label, value, unit]) => <button key={label} type="button" className={`btn sm ${p.durationValue === value && p.durationUnit === unit ? 'primary' : 'ghost'}`} onClick={() => update(id, {durationValue: value, durationUnit: unit})}>{label}</button>)}</div>
          {Number.isFinite(lineDays) && <p role="status">Course: {lineDays} day(s){p.durationUnit === 'weeks' ? ` (${p.durationValue} week${p.durationValue > 1 ? 's' : ''})` : lineDays % 7 === 0 && lineDays >= 14 ? ` (${lineDays / 7} weeks)` : ''}{p.totalUnits ? ` · ${p.totalUnits} ${d.unit}(s) in total` : ''}</p>}
        </div>}
        <div className="rx-grid">
          <label>Directions / clinical instructions *
            <textarea
              name={`rx-${id}-instructions`} required maxLength={1000}
              value={p.instructions}
              placeholder="e.g. Give 1 tablet twice daily with meals for 7 days"
              onChange={e => update(id, {instructions: e.target.value})}
              {...attrs('instructions')}
            />
            {err('instructions')}
          </label>
          <label>Quantity {d ? '(calculated)' : '*'}
            <input
              type="number" name={`rx-${id}-quantity`} required
              min="1" max="1000" step="1"
              value={p.quantity} readOnly={!!d}
              onChange={e => update(id, {quantity: e.target.value === '' ? '' : Number(e.target.value)})}
              {...attrs('quantity')}
            />
            {err('quantity')}
          </label>
        </div>
        <div className="row end"><b>Product total: ₱{(Number(p.quantity || 0) * p.price).toLocaleString()}</b><button className="btn sm ghost" type="button" aria-label={`Remove ${p.name}`} onClick={() => onChange(items.filter(x => x.catalogId !== id))}>Remove</button></div>
      </fieldset>;
    })}
    <label>External prescriptions / additional home-care instructions<textarea name="prescription" aria-invalid={!!error || notes.length > 3000} aria-describedby="rx-notes-error" rows={3} maxLength={3000} value={notes} onChange={e => onNotes(e.target.value)} /></label>
    <p>External prescriptions are recorded for the owner; only selected catalog products are added to clinic billing. {notes.length > 2500 && <b>{3000 - notes.length} characters left.</b>}</p>
    {!!items.length && <div className="rx-preview"><b>Prescription preview</b><p style={{whiteSpace: 'pre-wrap'}}>{prescriptionText(preview, notes)}</p></div>}
    {error && <p id="rx-notes-error" className="err" role="alert">{error}</p>}
  </section>;
}

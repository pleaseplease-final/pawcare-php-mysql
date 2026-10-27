import { useEffect, useId, useRef, useState } from 'react';
import { searchCountries, searchStates, searchCities, findState, states, phCities, getZips } from '../geo.js';
import { Field } from '../roles/owner/ui.jsx';

const fold = value => String(value ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
const codeOf = name => searchCountries(name).find(country => fold(country.name) === fold(name))?.code || '';

/* Type-ahead list: choose from the options, or (where allowed) keep what was typed. */
function Combo({ label, text, setText, load, pick, disabled, placeholder, error, valid, onTouch, hint, req = true }) {
  const id = useId();
  const [items, setItems] = useState([]), [open, setOpen] = useState(false), [active, setActive] = useState(-1);
  const seq = useRef(0), timer = useRef(), chosen = useRef(null);
  useEffect(() => () => clearTimeout(timer.current), []);
  const run = async query => {
    if (disabled) return;
    const mine = ++seq.current, result = await load(query);
    if (mine === seq.current) { setItems(Array.isArray(result) ? result : []); setActive(-1); setOpen(true); }
  };
  const choose = option => { chosen.current = option.value; setText(option.label); setOpen(false); pick(option); };
  return (
    <div className={`fld${error ? ' is-error' : valid ? ' is-valid' : ''}`}>
      <label htmlFor={id}>{label}{req && <i> *</i>}</label>
      <div className="combo">
        <input id={id} name={id} value={text} placeholder={placeholder} disabled={disabled} autoComplete="off" role="combobox"
          aria-expanded={open} aria-controls={`${id}-options`} aria-autocomplete="list" aria-invalid={!!error} aria-describedby={`${id}-m`}
          aria-activedescendant={open && active >= 0 ? `${id}-option-${active}` : undefined}
          className={valid && !error ? 'ow-valid' : ''}
          onFocus={() => run(text)} onClick={() => { if (!open) run(text); }}
          onChange={event => {
            chosen.current = null; setText(event.target.value); pick(null, event.target.value);
            clearTimeout(timer.current); timer.current = setTimeout(() => run(event.target.value), 150);
          }}
          onKeyDown={event => {
            if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
              event.preventDefault();
              if (!open) return run(text);
              setActive(Math.max(0, Math.min(items.length - 1, active + (event.key === 'ArrowDown' ? 1 : -1))));
            } else if (event.key === 'Enter' && open) { event.preventDefault(); if (active >= 0) choose(items[active]); }
            else if (event.key === 'Escape') setOpen(false);
          }}
          onBlur={() => setTimeout(() => {
            setOpen(false);
            const match = items.find(option => fold(option.label) === fold(text));
            if (match && text && chosen.current !== match.value) choose(match);
            onTouch?.();
          }, 140)} />
        {open && <ul className="cbl" id={`${id}-options`} role="listbox">
          {items.length ? items.map((option, index) => <li key={option.value} id={`${id}-option-${index}`} role="option" aria-selected={index === active} className={index === active ? 'on' : ''}
            onMouseDown={event => { event.preventDefault(); choose(option); }}>{option.label}</li>) : <li className="no">No matches</li>}
        </ul>}
      </div>
      <span id={`${id}-m`} className={error ? 'err' : 'ow-hint'} aria-live="polite">{error || hint || ''}</span>
    </div>
  );
}

/* Country, province / state, city and ZIP from the same location data used at registration.
   value = {houseStreet, city, state, country, zipCode}; onChange gets a patch; errorFor(key) is the message to show;
   onListErrors receives the "choose from the list" problems so the parent can block saving. */
export default function AddressPicker({ value, onChange, errorFor, touch, onListErrors, houseStreetField }) {
  const { houseStreet, city, state, country, zipCode } = value;
  const code = codeOf(country), isPH = code === 'PH';
  const [hasStates, setHasStates] = useState(true), [zips, setZips] = useState({ zips: [], exact: true });

  useEffect(() => {
    let live = true;
    (async () => {
      const errors = {};
      if (!code) errors.country = country ? 'Choose a country from the list.' : '';
      else {
        const list = await states(code), provinces = list.length > 0;
        const found = provinces && state ? await findState(code, state) : null;
        if (provinces && state && !found) errors.state = isPH ? 'Choose a province from the list.' : 'Choose a state or province from the list.';
        if (isPH && city) {
          const cities = found ? await phCities(found) : [];
          if (!cities.some(name => fold(name) === fold(city))) errors.city = found ? 'Choose a city or municipality from the list.' : 'Choose a province first, then a city from the list.';
        }
        const available = isPH ? getZips('PH', state, city) : { zips: [], exact: true };
        if (isPH && zipCode && !available.zips.some(z => z.zip === zipCode)) errors.zipCode = 'Choose a ZIP code from the list.';
        if (live) { setHasStates(provinces); setZips(available); }
      }
      if (live) onListErrors?.(errors);
    })();
    return () => { live = false; };
  }, [country, state, city, zipCode]); // eslint-disable-line react-hooks/exhaustive-deps

  const ok = key => !!value[key] && !errorFor(key);
  const cityList = async query => (await searchCities(code, state, query)).map(name => ({ value: name, label: name }));

  return <>
    {houseStreetField}
    <Combo label="Country" placeholder="Type a country…" text={country} setText={text => onChange({ country: text })}
      error={errorFor('country')} valid={ok('country')} onTouch={() => touch('country')}
      load={async query => searchCountries(query).slice(0, 60).map(c => ({ value: c.code, label: c.name }))}
      pick={option => { if (option && fold(option.label) !== fold(country)) onChange({ country: option.label, state: '', city: '', zipCode: '' }); }} />
    <div className="ow-account-fields">
      <Combo label={isPH ? 'Province' : 'State / Province'} placeholder={code ? (isPH ? 'Choose a province' : 'Choose a state') : 'Choose a country first'} text={state}
        disabled={!code || !hasStates} setText={text => onChange({ state: text })}
        error={errorFor('state')} valid={ok('state')} onTouch={() => touch('state')} hint={code && !hasStates ? 'This country has no provinces to choose from.' : ''} req={hasStates}
        load={async query => (await searchStates(code, query)).map(s => ({ value: s.name, label: s.name }))}
        pick={option => { if (option && fold(option.label) !== fold(state)) onChange({ state: option.label, city: '', zipCode: '' }); }} />
      <Combo label={isPH ? 'City / Municipality' : 'City'} placeholder={isPH && !state ? 'Choose a province first' : 'Choose or type a city'} text={city}
        disabled={!code || (isPH && !state)} setText={text => onChange({ city: text })}
        error={errorFor('city')} valid={ok('city')} onTouch={() => touch('city')} load={cityList}
        pick={option => {
          if (!option) return;
          const available = isPH ? getZips('PH', state, option.label) : { zips: [] };
          onChange({ city: option.label, zipCode: available.zips.length === 1 ? available.zips[0].zip : '' });
        }} />
    </div>
    {isPH
      ? <Field id="addr-zip" label="ZIP / Postal code" req type="select" value={zipCode} disabled={!city || !zips.zips.length}
          options={zips.zips.map(z => [z.zip, `${z.zip} – ${z.area}`])} emptyLabel={!city ? 'Choose a city first' : zips.zips.length ? 'Choose a ZIP code' : 'No ZIP codes found'}
          onChange={zip => onChange({ zipCode: zip })} onBlur={() => touch('zipCode')} error={errorFor('zipCode')} valid={ok('zipCode')}
          hint={city && zips.zips.length && !zips.exact ? 'No postal area matches this place exactly, so these are the ZIP codes of its province. Pick the one on your mail.' : ''} />
      : <Field id="addr-zip" label="ZIP / Postal code" req value={zipCode} maxLen={20} onChange={zip => onChange({ zipCode: zip })} onBlur={() => touch('zipCode')} error={errorFor('zipCode')} valid={ok('zipCode')} autoComplete="postal-code" />}
  </>;
}

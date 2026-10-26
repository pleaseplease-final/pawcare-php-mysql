import { Syringe, Pill, Stethoscope, Scissors, HeartPulse } from "lucide-react";
import { fmt12 } from "./ui.jsx";
import { SERVICES, STEP, durText, addMin, niceDay, bookableServices } from "../../booking.js";
export * from "../../booking.js";
import { lastDay } from "../../booking.js";
export const LAST = lastDay();

const serviceIcons = {vaccination:Syringe, deworming:Pill, surgery:Stethoscope, grooming:Scissors, checkup:HeartPulse};

export function ServicePicker({ value, onChange, error }) {
  // A saved retired service stays selectable only while editing that visit.
  return (
    <div className="fld">
      <label id="svc-l">What is the visit for?<i> *</i></label>
      <div className="ow-svcs" role="radiogroup" aria-labelledby="svc-l">
        {bookableServices(value).map(([k, s]) => { const ServiceIcon = serviceIcons[k] || Stethoscope; return <button type="button" key={k} role="radio" aria-checked={value === k} className={`ow-svc${value === k ? " on" : ""}`} onClick={() => onChange(k)}>
          <span className="ic" aria-hidden="true"><ServiceIcon size={22} /></span><b>{s.label}</b><small>{s.blurb}</small><small>{durText(s.dur)}</small>
        </button>; })}
      </div>
      <span className={error ? "err" : "ow-hint"} aria-live="polite">{error || "Pick a service first. The times below change to fit it"}</span>
    </div>
  );
}

/* Only start times that fit are shown, so there is nothing to pick wrong. */
export function SlotPicker({ times, value, onChange, error, hint, dur, suggest, onSuggest }) {
  return (
    <div className="fld">
      <label id="time-l">Time<i> *</i></label>
      {times.length
        ? <div className="ow-slots" role="radiogroup" aria-labelledby="time-l">{times.map(t => <button type="button" key={t} role="radio" aria-checked={value === t} className={`ow-slot${value === t ? " on" : ""}`} onClick={() => onChange(t)}>{fmt12(t)}{dur > STEP && <small>to {fmt12(addMin(t, dur))}</small>}</button>)}</div>
        : <div className="ow-slotempty">{hint}{suggest && <> <button type="button" className="ow-link" onClick={onSuggest}>Jump to {niceDay(suggest)}</button></>}</div>}
      <span className={error ? "err" : "ow-hint"} aria-live="polite">{error || (times.length ? hint : "")}</span>
    </div>
  );
}

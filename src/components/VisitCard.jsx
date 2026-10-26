import ClinicDialog from './ClinicDialog.jsx';
import {X} from 'lucide-react';

// The pop-up card for one calendar entry: who, when, why, and the actions that apply to it.
// `rows` is [[label, value], …]; empty values are left out so the card never shows blank lines.
export default function VisitCard({title, subtitle, tone = '#1d4ed8', icon, status, rows, note, onClose, children}) {
  return <ClinicDialog label={`${title} details`} onClose={onClose}>
    <div className="modal vcard" role="document" style={{'--vcard-tone': tone}}>
      <header className="vcard-head">
        <span className="vcard-icon" aria-hidden="true">{icon}</span>
        <div className="vcard-title"><h3>{title}</h3>{subtitle && <p>{subtitle}</p>}</div>
        {status}
        <button type="button" className="btn ghost sm vcard-x" onClick={onClose} aria-label="Close details"><X size={16} aria-hidden="true" /></button>
      </header>
      <dl className="vcard-grid">
        {rows.filter(([, value]) => value !== undefined && value !== null && String(value).trim() !== '').map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}
      </dl>
      {note && <p className="vcard-note">{note}</p>}
      {children && <footer className="vcard-actions" onClick={e => e.stopPropagation()}>{children}</footer>}
    </div>
  </ClinicDialog>;
}

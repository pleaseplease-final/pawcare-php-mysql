// Shared parts of every printed clinic document: letterhead, title block, signature lines and footer.
// The letterhead uses the clinic details the administrator verified (Clinic document settings); until those
// are saved it falls back to the clinic name alone.
import { useEffect, useState } from 'react';
import { api } from '../api.js';
import './official-document.css';

const FALLBACK = { name: 'PawCare Veterinary Clinic', address: '', phone: '', email: '', registration: '' };
let cached = null, pending = null;
const listeners = new Set();

function loadLetterhead() {
  if (cached || pending) return;
  pending = api.get('/api/clinic-letterhead')
    .then(r => { cached = { ...FALLBACK, ...Object.fromEntries(Object.entries(r?.letterhead || {}).filter(([, v]) => v)) }; })
    .catch(() => { cached = FALLBACK; })
    .finally(() => { pending = null; listeners.forEach(fn => fn(cached)); });
}

/** Clinic details for document headers. Loads once per session. */
export function useClinicLetterhead() {
  const [details, setDetails] = useState(cached || FALLBACK);
  useEffect(() => {
    if (cached) { setDetails(cached); return; }
    listeners.add(setDetails); loadLetterhead();
    return () => listeners.delete(setDetails);
  }, []);
  return details;
}

export const manilaDateTime = (value = new Date()) => new Date(value).toLocaleString('en-PH', { timeZone: 'Asia/Manila', dateStyle: 'long', timeStyle: 'short' });
export const documentNumber = (prefix, id) => `${prefix}-${String(id ?? '').replace(/[^a-z0-9]/gi, '').slice(-8).toUpperCase() || '000000'}`;

/**
 * Clinic letterhead and document title. Printed only, unless `screen` is set.
 * `meta` is a list of [label, value] pairs shown at the right (document number, dates).
 */
export function OfficialLetterhead({ title, subtitle, meta = [], screen = false, children }) {
  const clinic = useClinicLetterhead();
  return (
    <header className={`official-letterhead${screen ? ' is-screen' : ''}`}>
      <div className="ol-top">
        <div className="ol-clinic">
          <span className="ol-seal" aria-hidden="true">🐾</span>
          <div>
            <strong className="ol-name">{clinic.name}</strong>
            {clinic.address && <span>{clinic.address}</span>}
            {(clinic.phone || clinic.email) && <span>{[clinic.phone && `Tel. ${clinic.phone}`, clinic.email && `Email: ${clinic.email}`].filter(Boolean).join(' · ')}</span>}
            {clinic.registration && <span>Registration / License No.: {clinic.registration}</span>}
          </div>
        </div>
        {meta.length > 0 && <dl className="ol-meta">{meta.filter(([, v]) => v).map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>}
      </div>
      {title && <h1 className="ol-title">{title}</h1>}
      {subtitle && <p className="ol-subtitle">{subtitle}</p>}
      {children && <p className="ol-details">{children}</p>}
    </header>
  );
}

/** Signature lines and a document footer. Printed only, unless `screen` is set. */
export function DocumentSignoff({ signers = [], statement, reference, screen = false }) {
  return (
    <footer className={`official-signoff${screen ? ' is-screen' : ''}`}>
      {statement && <p className="os-statement">{statement}</p>}
      {signers.length > 0 && <div className="os-signers" style={{ gridTemplateColumns: `repeat(${Math.min(signers.length, 3)}, minmax(0, 1fr))` }}>
        {signers.map(([role, name, caption]) => (
          <div key={role}>
            <span className="os-role">{role}</span>
            <span className="os-line">{name || ' '}</span>
            <span className="os-caption">{caption || 'Signature over printed name · Date'}</span>
          </div>
        ))}
      </div>}
      <p className="os-footer">{[reference, `Printed ${manilaDateTime()}`, 'System-generated document from PawCare clinic records'].filter(Boolean).join(' · ')}</p>
    </footer>
  );
}

const ONES = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
const TENS = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];
function under1000(n) {
  const h = Math.floor(n / 100), rest = n % 100;
  const tail = rest < 20 ? ONES[rest] : `${TENS[Math.floor(rest / 10)]}${rest % 10 ? '-' + ONES[rest % 10] : ''}`;
  return [h ? `${ONES[h]} Hundred` : '', tail].filter(Boolean).join(' ');
}
/** 1250.5 → "One Thousand Two Hundred Fifty Pesos and 50/100". */
export function pesoWords(amount) {
  if (!Number.isFinite(amount) || amount < 0) return '';
  const cents = Math.round(amount * 100), whole = Math.floor(cents / 100), centavos = cents % 100;
  const parts = [];
  [[1e9, 'Billion'], [1e6, 'Million'], [1e3, 'Thousand'], [1, '']].reduce((left, [size, name]) => {
    const chunk = Math.floor(left / size);
    if (chunk) parts.push(`${under1000(chunk)}${name ? ' ' + name : ''}`);
    return left % size;
  }, whole);
  return `${parts.join(' ') || 'Zero'} Peso${whole === 1 ? '' : 's'} and ${String(centavos).padStart(2, '0')}/100`;
}

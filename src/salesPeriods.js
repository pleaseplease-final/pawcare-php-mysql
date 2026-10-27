// Sales report periods. Dates are clinic-day strings (YYYY-MM-DD, Asia/Manila); weeks run Monday to Sunday.
import { ownerBill } from './ownerBilling.js';
import { paymentDate, paymentMethod } from './assistantWorkflow.js';

export const PERIODS = [['day', 'Daily'], ['week', 'Weekly'], ['month', 'Monthly'], ['year', 'Yearly']];
export const DIGITAL_METHODS = ['gcash', 'card', 'maya'];
const METHOD_KEYS = ['cash', 'gcash', 'maya', 'card', 'other', 'unrecorded'];

const parse = date => { const [y, m, d] = date.split('-').map(Number); return new Date(Date.UTC(y, m - 1, d)); };
const format = date => date.toISOString().slice(0, 10);
const label = (date, options) => parse(date).toLocaleDateString('en-PH', { timeZone: 'UTC', ...options });

/** First and last clinic day of the period containing `anchor`. */
export function periodRange(period, anchor) {
  const d = parse(anchor);
  if (period === 'week') {
    const start = new Date(d); start.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
    const end = new Date(start); end.setUTCDate(start.getUTCDate() + 6);
    return { from: format(start), to: format(end) };
  }
  if (period === 'month') return { from: format(new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1))), to: format(new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0))) };
  if (period === 'year') return { from: `${d.getUTCFullYear()}-01-01`, to: `${d.getUTCFullYear()}-12-31` };
  return { from: anchor, to: anchor };
}

/** The same day moved by `steps` whole periods (month and year steps clamp to the last day of the month). */
export function stepPeriod(period, anchor, steps) {
  const d = parse(anchor);
  if (period === 'week') d.setUTCDate(d.getUTCDate() + 7 * steps);
  else if (period === 'month' || period === 'year') {
    const months = period === 'year' ? 12 * steps : steps, day = d.getUTCDate();
    d.setUTCDate(1); d.setUTCMonth(d.getUTCMonth() + months);
    d.setUTCDate(Math.min(day, new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate()));
  } else d.setUTCDate(d.getUTCDate() + steps);
  return format(d);
}

/** "October 27, 2026", "Oct 26 – Nov 1, 2026", "October 2026" or "2026". */
export function periodLabel(period, anchor) {
  const { from, to } = periodRange(period, anchor);
  if (period === 'year') return from.slice(0, 4);
  if (period === 'month') return label(from, { month: 'long', year: 'numeric' });
  if (period === 'week') return `${label(from, { month: 'short', day: 'numeric', ...(from.slice(0, 4) !== to.slice(0, 4) && { year: 'numeric' }) })} – ${label(to, { month: 'short', day: 'numeric', year: 'numeric' })}`;
  return label(from, { month: 'long', day: 'numeric', year: 'numeric' });
}

function sumAmounts(visits) {
  let cents = 0;
  for (const a of visits) { const amount = ownerBill(a).amount; if (amount !== null) cents += Math.round(amount * 100); }
  return Number.isSafeInteger(cents) ? cents / 100 : null;
}

/** Paid visits whose payment date falls in [from, to], with totals per payment method. */
export function rangeCollections(appointments, from, to) {
  const allPaid = appointments.filter(a => a.billingStatus === 'Paid');
  const paid = allPaid.filter(a => { const day = paymentDate(a.paidAt); return day && day >= from && day <= to; })
    .sort((a, b) => Date.parse(a.paidAt) - Date.parse(b.paidAt) || a.id.localeCompare(b.id));
  const undated = allPaid.filter(a => !paymentDate(a.paidAt));
  const byMethod = key => paid.filter(a => paymentMethod(a.paymentMethod) === key);
  const methods = Object.fromEntries(METHOD_KEYS.map(key => [key, sumAmounts(byMethod(key))]));
  const counts = Object.fromEntries(METHOD_KEYS.map(key => [key, byMethod(key).length]));
  const digital = paid.filter(a => DIGITAL_METHODS.includes(paymentMethod(a.paymentMethod)));
  return { paid, undated, total: sumAmounts(paid), methods, counts, digitalTotal: sumAmounts(digital), digitalCount: digital.length,
    missingAmounts: paid.filter(a => ownerBill(a).amount === null).length };
}

/** Completed, unpaid, not-admitted visits dated in [from, to]. */
export function rangePendingCheckout(appointments, from, to) {
  const visits = appointments.filter(a => a.date >= from && a.date <= to && a.status === 'Completed' && a.billingStatus !== 'Paid' && a.admissionStatus !== 'Admitted')
    .sort((a, b) => (a.date + (a.time || '')).localeCompare(b.date + (b.time || '')));
  return { visits, draftTotal: sumAmounts(visits), awaitingInvoice: visits.filter(a => ownerBill(a).amount === null).length };
}

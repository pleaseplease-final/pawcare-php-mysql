// Owner views read saved invoices. Never use a booking's default amount as a bill
// or reprice a historical payment against today's catalog.
const cents = value => typeof value === 'number' && Number.isFinite(value) && value >= 0 && Number.isSafeInteger(Math.round(value * 100)) && Math.abs(value * 100 - Math.round(value * 100)) < 0.000001 ? Math.round(value * 100) : null;
export function ownerBill(appointment) {
  const paid = appointment.billingStatus === 'Paid';
  const admitted = !paid && appointment.admissionStatus === 'Admitted';
  const items = Array.isArray(appointment.invoiceItems) ? appointment.invoiceItems : [];
  const validLines = items.length > 0 && items.every(p => typeof p?.name === 'string' && p.name.trim() && cents(p.price) !== null && Number.isSafeInteger(p.qty) && p.qty > 0);
  const subtotal = validLines ? items.reduce((sum, p) => sum + cents(p.price) * p.qty, 0) : null;
  const discount = cents(appointment.discount ?? 0);
  const total = subtotal !== null && Number.isSafeInteger(subtotal) && discount !== null && discount <= subtotal ? subtotal - discount : null;
  const paidAmount = cents(appointment.amount);
  return {
    paid,
    status: paid ? 'Paid' : admitted ? 'Awaiting discharge approval' : items.length || appointment.status === 'Completed' ? 'Awaiting checkout' : 'No bill yet',
    items: validLines && Number.isSafeInteger(subtotal) ? items : [],
    subtotal: validLines && Number.isSafeInteger(subtotal) ? subtotal / 100 : null,
    discount: discount !== null ? discount / 100 : null,
    amount: admitted ? null : paid ? paidAmount !== null ? paidAmount / 100 : null : total !== null ? total / 100 : null,
    mismatch: paid && total !== null && paidAmount !== null && total !== paidAmount
  };
}

export function recentTransactions(appointments, limit=5) {
  const timestamp = a => {
    const paid = a.billingStatus==='Paid' && typeof a.paidAt==='string' && a.paidAt.includes('T') ? Date.parse(a.paidAt) : NaN;
    return Number.isFinite(paid) ? paid : Date.parse(`${a.date}T${a.time || '00:00'}+08:00`) || 0;
  };
  return appointments.filter(a=>a.billingStatus==='Paid' || a.status==='Completed')
    .sort((a,b)=>timestamp(b)-timestamp(a) || String(b.id).localeCompare(String(a.id))).slice(0,limit);
}

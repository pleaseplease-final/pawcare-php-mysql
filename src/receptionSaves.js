import { intakeVisitSnapshot, sameIntakeVisit } from './intakeVisit.js';
import { ownerBill } from './ownerBilling.js';

export function confirmedBooking(response, expected) {
  const visit = response?.appointment;
  if (response?.success !== true || !visit || visit.status !== (expected.status || 'Pending Approval')
      || ['id', 'petId', 'vetId', 'date', 'time', 'service'].some(key => visit[key] !== expected[key])
      || (expected.vaccineId !== undefined && visit.reason !== expected.reason)
      || (visit.followUpId || null) !== (expected.followUpId || null)) {
    throw Error('The server did not confirm this booking. Refresh the calendar to check whether it was saved before retrying.');
  }
  return visit;
}

const sameAmount = (a, b) => Number.isFinite(a) && Number.isFinite(b) && Math.round(a * 100) === Math.round(b * 100);
export function confirmedPayment(response, visit, submitted) {
  const payment = response?.appointment;
  const bill = payment && ownerBill(payment);
  if (response?.success !== true || payment?.id !== visit.id || payment?.petId !== visit.petId
      || payment?.status !== 'Completed' || payment?.billingStatus !== 'Paid'
      || !payment.paidAt || !Number.isFinite(Date.parse(payment.paidAt))
      || !bill?.items.length || bill.mismatch || !sameAmount(bill.amount, submitted.amount)
      || !sameAmount(payment.discount ?? 0, submitted.discount ?? 0) || !sameAmount(payment.cashTendered, submitted.cashTendered)
      || !sameAmount(payment.changeAmount, submitted.changeAmount)
      || payment.paymentMethod !== submitted.paymentMethod || payment.paymentReference !== submitted.paymentReference) {
    throw Error('The server did not confirm this payment. Refresh the visit to check whether payment was saved before retrying.');
  }
  return payment;
}

export function confirmedCancellation(response, expected) {
  const saved = intakeVisitSnapshot(response?.appointment);
  if (response?.success !== true || !sameIntakeVisit(saved, {...expected,status:'Cancelled'})) {
    throw Error('The server did not confirm this cancellation. Refresh your appointments before retrying.');
  }
  return {...saved, cancelReason: response.appointment.cancelReason ?? response.appointment.cancel_reason ?? ''};
}

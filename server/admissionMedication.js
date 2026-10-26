import { admissionError } from './admissions.js';
import { priceCatalog } from './priceCatalog.js';

export function medicineProduct(id) {
  const product = priceCatalog().find(p => p.id === id && (p.requiresPrescription || ['Pet medicine','Pet vitamins'].includes(p.category)) && p.category !== 'Prescription diet');
  if (!product) throw admissionError('Choose a medicine product from the clinic catalog, or record a medicine without an additional supply charge.');
  return product;
}
// The appointment must be locked first, as in admission, discharge and payment.
export async function assertAdmissionCheckout(client, appointmentId) {
  const stay = (await client.query('SELECT status FROM admissions WHERE appt_id=$1', [appointmentId])).rows[0];
  if (stay?.status === 'Admitted') throw admissionError('The pet is still admitted. The veterinarian must approve discharge before final checkout.',409);
}
export async function admissionCharges(client, appointmentId) {
  const {rows} = await client.query(`SELECT e.medication->>'catalogId' AS catalog_id,e.medication->>'productName' AS name,
    e.medication->>'category' AS category,(e.medication->>'price')::numeric AS price,
    SUM((e.medication->>'billableQuantity')::int)::int AS qty
    FROM admission_updates e JOIN admissions d ON d.id=e.admission_id
    WHERE d.appt_id=$1 AND e.kind='Medicine administration' AND e.medication->>'result'='Given'
      AND (e.medication->>'billableQuantity')::int>0
      AND NOT EXISTS (SELECT 1 FROM admission_updates c WHERE c.admission_id=e.admission_id AND c.kind='Medication correction' AND c.medication->>'voids'=e.id::text)
    GROUP BY e.medication->>'catalogId',e.medication->>'productName',e.medication->>'category',e.medication->>'price'
    ORDER BY e.medication->>'catalogId',e.medication->>'price'`,[appointmentId]);
  return rows.map(row => ({catalogId:row.catalog_id,name:row.name,category:row.category,price:Number(row.price),qty:row.qty,source:'admission'}));
}
export function validateAdmissionCharges(invoice, expected) {
  const actual = invoice.filter(line => line.source === 'admission');
  if (actual.length !== expected.length || expected.some(line => {
    const matches = actual.filter(row => row.catalogId === line.catalogId && row.price === line.price);
    return matches.length !== 1 || matches[0].qty !== line.qty || matches[0].name !== line.name;
  })) return 'Retain each recorded admission medicine supply once at its saved quantity and price. Clinic use is separate from medicine supplied for home.';
  return null;
}
export async function saveMedicineAction(client, req, admission, data) {
  const base = {clinicalNote:data.clinicalNote,ownerUpdate:data.ownerUpdate};
  if (data.action === 'order') {
    if (data.catalogId) medicineProduct(data.catalogId);
    if ((await client.query('SELECT count(*)::int n FROM admission_medication_orders WHERE admission_id=$1',[admission.id])).rows[0].n >= 100) throw admissionError('This stay already has 100 medicine orders. Review its existing orders.');
    return {...base,kind:'Medication order',medication:{medicine:data.medicine,dose:data.dose,route:data.route,frequency:data.frequency,instructions:data.instructions,catalogId:data.catalogId,supplyLimit:data.supplyLimit}};
  }
  if (data.action === 'correct-medication') {
    const event = (await client.query("SELECT id,owner_update FROM admission_updates WHERE id=$1 AND admission_id=$2 AND kind='Medicine administration'",[data.eventId,admission.id])).rows[0];
    if (!event) throw admissionError('Medicine administration entry not found in this stay.',404);
    if (event.owner_update && !data.ownerUpdate) throw admissionError('The original entry was shared. Include a correction message for the owner.');
    if ((await client.query("SELECT id FROM admission_updates WHERE admission_id=$1 AND kind='Medication correction' AND medication->>'voids'=$2",[admission.id,data.eventId])).rows.length) throw admissionError('This medicine entry is already marked as entered in error.',409);
    return {...base,kind:'Medication correction',medication:{voids:data.eventId}};
  }
  const order = (await client.query('SELECT * FROM admission_medication_orders WHERE id=$1 AND admission_id=$2 FOR UPDATE',[data.orderId,admission.id])).rows[0];
  if (!order) throw admissionError('Choose a veterinarian medicine order for this stay.',404);
  if (order.stopped_at) throw admissionError('This medicine order has been stopped. Review current orders.',409);
  if (data.action === 'stop-medication') {
    await client.query('UPDATE admission_medication_orders SET stopped_at=clock_timestamp() WHERE id=$1',[order.id]);
    return {...base,kind:'Medication stopped',medication:{orderId:order.id,medicine:order.medicine}};
  }
  const when = Date.parse(data.occurredAt), now = (await client.query('SELECT clock_timestamp() now')).rows[0].now;
  if (when < Math.floor(new Date(admission.admitted_at).getTime()/1000)*1000 || when < Math.floor(new Date(order.ordered_at).getTime()/1000)*1000 || when > new Date(now).getTime()) throw admissionError('Record the actual event time after this medicine was ordered and no later than now.');
  const used = (await client.query(`SELECT COALESCE(SUM((e.medication->>'billableQuantity')::int),0)::int qty FROM admission_updates e
    WHERE e.admission_id=$1 AND e.kind='Medicine administration' AND e.medication->>'orderId'=$2
      AND NOT EXISTS (SELECT 1 FROM admission_updates c WHERE c.admission_id=e.admission_id AND c.kind='Medication correction' AND c.medication->>'voids'=e.id::text)`,[admission.id,order.id])).rows[0].qty;
  if (used + data.billableQuantity > order.supply_limit || (data.billableQuantity && !order.catalog_id)) throw admissionError('Clinic supplies used cannot exceed the veterinarian’s authorized item/package limit.');
  const product = data.billableQuantity ? medicineProduct(order.catalog_id) : null;
  return {...base,kind:'Medicine administration',medication:{orderId:order.id,medicine:order.medicine,dose:order.dose,route:order.route,result:data.result,occurredAt:data.occurredAt,billableQuantity:data.billableQuantity,
    ...(product ? {catalogId:product.id,productName:product.name,category:product.category,price:product.price} : {})}};
}

import ClinicDialog from '../components/ClinicDialog.jsx';
import DocumentHeader from '../components/DocumentHeader.jsx';
import { OwnerBillDetails } from './owner/Bills.jsx';
import { useClinicRead } from '../useClinicRead.js';
import '../print-documents.css';

const time = value => value ? new Date(value).toLocaleString('en-PH',{timeZone:'Asia/Manila',dateStyle:'medium',timeStyle:'short'}) : 'Not recorded';
export function DischargeDocument({data}) {
  const {admission:a,consultation:c} = data;
  return <article className="print-document discharge-document">
    <DocumentHeader title="Pet discharge summary">Admission reference: {a.id}</DocumentHeader>
    <h2>Discharge summary · {a.petName}</h2>
    <p>Owner: {data.ownerName} · Veterinarian: {a.vetName}</p>
    <p><b>{a.status}</b>{a.status==='Ready for discharge' && ' · Release to owner has not yet been confirmed.'}</p>
    <p>Admitted: {time(a.admittedAt)}<br />Discharge approved: {time(a.dischargeApprovedAt)}<br />Released to owner: {time(a.dischargedAt)}</p>
    <h3>Veterinarian assessment</h3><p>{c.diagnosis || 'Not recorded'}</p>
    <h3>Treatment recorded at consultation</h3><p>{c.treatment || 'Not recorded'}</p>
    <h3>Take-home medicines and directions</h3><p>{c.prescription || 'No free-text prescription recorded.'}</p>
    {!!c.prescriptionItems?.length && <ul>{c.prescriptionItems.map((item,i)=><li key={i}><b>{item.name}</b> · Prescribed supply: {item.quantity} {item.unit || 'items/packages'}<p>{item.instructions}</p></li>)}</ul>}
    <p>Prescribed supply is separate from products actually supplied, shown in the payment details. Clinic-use medicines and their administration history remain in the clinic care record; they are not additional take-home directions.</p>
    <h3>Discharge and home-care instructions</h3><p>{a.dischargeInstructions || 'Not recorded'}</p>
    <OwnerBillDetails appointment={data.appointment} />
    <p>Document retrieved: {time(data.generatedAt)} · All times in Manila (UTC+08:00).</p>
  </article>;
}
export default function AdmissionDischargeSummary({id,onClose}) {
  const read = useClinicRead(`/api/admissions/${id}/discharge-summary`);
  return <ClinicDialog label="Printable discharge summary" onClose={onClose}><section className="card admission-form admission-discharge">
    <div className="row end no-print"><button className="btn ghost" onClick={onClose}>Close</button><button className="btn gold" disabled={!read.data || !!read.error || read.loading} onClick={()=>window.print()}>Print discharge summary</button></div>
    {read.error && <p role="alert">{read.error} <button className="btn" onClick={()=>read.load()}>Retry summary</button></p>}
    {!read.data && !read.error && <p role="status">Loading saved discharge and payment records…</p>}
    {read.data && !read.error && <DischargeDocument data={read.data} />}
  </section></ClinicDialog>;
}

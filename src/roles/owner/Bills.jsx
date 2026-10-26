import { PaginatedList } from "../../components/Pagination.jsx";
import { useState } from "react";
import { scope, petName } from "../../lib.jsx";
import { ownerBill, recentTransactions } from "../../ownerBilling.js";
import { Modal } from "./ui.jsx";

const money = amount => new Intl.NumberFormat("en-PH", {style:"currency", currency:"PHP"}).format(amount);
const dateLabel = date => date ? new Date(`${date}T00:00:00`).toLocaleDateString("en-PH", {month:"short",day:"numeric",year:"numeric"}) : "Not recorded";
const paidDate = date => {
  const parsed = date ? new Date(date) : null;
  return parsed && Number.isFinite(parsed.getTime()) ? parsed.toLocaleString("en-PH", {timeZone:"Asia/Manila",dateStyle:"medium",timeStyle:"short"}) : "Not recorded";
};

export function OwnerBillDetails({ appointment }) {
  const bill = ownerBill(appointment);
  return <section className="ow-bill-details" aria-label="Bill and payment details">
    <h4>{bill.paid ? "Payment record" : "Checkout details"}</h4>
    <p><b>Payment: {appointment.billingStatus || "Unbilled"}</b> · {bill.status}</p>
    {!bill.paid && <p className="ow-hint">{bill.status === "Awaiting discharge approval" ? "Your pet is still admitted. The veterinarian must approve discharge before reception prepares final checkout. These draft lines may not include all care provided during the stay." : bill.status === "No bill yet" ? "Booking a visit does not issue a bill. Charges appear after the veterinarian records the care provided." : "Reception will confirm the services and products supplied at checkout. The itemization below is a draft, and quantities may change before payment."}</p>}
    {bill.items.length ? <>
      <PaginatedList as="ul" label="Invoice items" resetKey={appointment.id} className="ow-bill-lines">{bill.items.map((item, index) => <li key={index}><div><b>{item.name}{item.source === 'admission' && ' (clinic use)'}</b><small>{item.qty} × {money(item.price)}</small></div><strong>{money(item.qty * item.price)}</strong></li>)}</PaginatedList>
      <dl className="ow-bill-totals"><div><dt>Item subtotal</dt><dd>{money(bill.subtotal)}</dd></div>{bill.discount > 0 && <div><dt>Earlier recorded discount</dt><dd>{money(bill.discount)}</dd></div>}</dl>
    </> : bill.status !== "No bill yet" && <p>Itemized charges are not available. Please ask reception for the breakdown.</p>}
    {bill.amount !== null && <p className="ow-bill-total">{bill.paid ? "Paid amount" : "Draft total"}<strong>{money(bill.amount)}</strong></p>}
    {bill.paid && bill.amount === null && <p>The paid amount is not available. Please contact reception.</p>}
    {bill.mismatch && <p>The saved itemization differs from the recorded paid amount. Reception can clarify this payment record.</p>}
    {bill.paid && <dl className="ow-bill-payment">
      {[["Payment method",appointment.paymentMethod || "Not recorded"], ["Recorded payment date (Manila)",paidDate(appointment.paidAt)], ["Payment reference",appointment.paymentReference || "Not recorded"]].map(([label,value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}
      {appointment.paymentMethod === "Cash" && <>{typeof appointment.cashTendered === "number" && Number.isFinite(appointment.cashTendered) && appointment.cashTendered >= 0 && <div><dt>Cash received</dt><dd>{money(appointment.cashTendered)}</dd></div>}{typeof appointment.changeAmount === "number" && Number.isFinite(appointment.changeAmount) && appointment.changeAmount >= 0 && <div><dt>Change recorded</dt><dd>{money(appointment.changeAmount)}</dd></div>}</>}
    </dl>}
    <p className="ow-hint">Visit reference: {appointment.id}</p>
  </section>;
}

export default function OwnerBills({db, me, go}) {
  const [pet, setPet] = useState(""), [status, setStatus] = useState(""), [search, setSearch] = useState(""), [openId, setOpenId] = useState(null);
  const pets = scope(db,me,"pets");
  const all = scope(db,me,"appts").slice().sort((a,b) => `${b.date}${b.time}`.localeCompare(`${a.date}${a.time}`));
  const selected = all.find(a => a.id === openId);
  const query = search.trim().toLowerCase();
  const list = all.filter(a => (!pet || a.petId === pet) && (!status || (a.billingStatus || "Unbilled") === status) && (!query || [petName(db,a.petId),a.date,a.id,a.reason,...ownerBill(a).items.map(p => p.name)].join(" ").toLowerCase().includes(query)));
  const filtered = !!(pet || status || query);
  return <section className="card ow-bills" aria-label="Bills and payments">
    <h3>Bills & Payments</h3><p>View your pets’ saved charges and payments. Reception confirms and records payments at the clinic.</p>
    {go && <button className="btn sm ghost" onClick={() => go("prices")}>View clinic prices</button>}
    <div className="portal-metrics" aria-label="Payment summary">{["Unbilled","Unpaid","Paid"].map(status => <div key={status}><b>{all.filter(a => (a.billingStatus || "Unbilled") === status).length}</b><span>{status}</span></div>)}</div>
    <div className="ow-bill-filters">
      <label>Search visits or charges<input type="search" value={search} onChange={e=>setSearch(e.target.value)} placeholder="Pet, date, product or visit reference" /></label>
      <label>Pet<select value={pet} onChange={e=>setPet(e.target.value)}><option value="">All my pets</option>{pets.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
      <label>Payment status<select value={status} onChange={e=>setStatus(e.target.value)}><option value="">All statuses</option>{["Unbilled","Unpaid","Paid"].map(s=><option key={s}>{s}</option>)}</select></label>
    </div>
    {filtered && <button className="btn sm ghost" onClick={() => {setPet("");setStatus("");setSearch("");}}>Clear filters</button>}
    <p role="status">{list.length} {list.length === 1 ? "visit" : "visits"}</p>
    {!list.length ? <p className="empty">{all.length ? "No visits match these filters." : "No visits yet. Charges and payments will appear here as your pets receive care."}</p> : <PaginatedList as="ul" label="Bills and payments" resetKey={[pet,status,search]} className="ow-bill-list">{list.map(a=>{
      const bill=ownerBill(a);
      return <li key={a.id}><div><h4>{petName(db,a.petId)} · {dateLabel(a.date)}</h4><p>{a.reason}</p><span className="ow-status-line"><span className={`ow-chip-status is-${a.billingStatus || "Unbilled"}`}>{a.billingStatus || "Unbilled"}</span>{bill.status !== (a.billingStatus || "Unbilled") && <small>{bill.status}</small>}</span>{bill.amount !== null && <p className="ow-amount">{bill.paid ? "Amount paid" : "Draft total"}: <b>{money(bill.amount)}</b></p>}</div><button className="btn sm ghost" aria-label={`View ${bill.paid ? "payment" : "bill"} for ${petName(db,a.petId)} on ${dateLabel(a.date)}`} onClick={()=>setOpenId(a.id)}>{bill.paid ? "View payment" : "View bill"}</button></li>;
    })}</PaginatedList>}
    {selected && <Modal title={`${petName(db,selected.petId)} · ${dateLabel(selected.date)}`} onClose={()=>setOpenId(null)}><div className="ow-bill-scroll"><OwnerBillDetails appointment={selected} /></div><div className="row end"><button className="btn" onClick={()=>setOpenId(null)}>Close</button></div></Modal>}
  </section>;
}


export function RecentTransactions({db,me,go}) {
  const [openId,setOpenId]=useState(null);
  const appointments=scope(db,me,'appts');
  const recent=recentTransactions(appointments);
  const selected=appointments.find(a=>a.id===openId);
  return <section className="card ow-bills" aria-label="Recent transactions">
    <h3>Recent transactions</h3>
    <p>Your latest care charges and recorded payments.</p>
    {!recent.length && <p>No transactions yet. Completed visits and payments will appear here.</p>}
    <ul className="ow-bill-list">{recent.map(a=>{
      const bill=ownerBill(a);
      return <li key={a.id}><div>
        <h4>{petName(db,a.petId)} · {a.reason || 'Clinic visit'}</h4>
        <small>Visit: {dateLabel(a.date)}</small>
        <p>{bill.status}{bill.amount!==null ? ` · ${bill.paid?'Paid':'Draft'}: ${money(bill.amount)}` : ''}</p>
        {bill.paid && <small>Payment recorded: {paidDate(a.paidAt)} · {a.paymentMethod || 'Method not recorded'}</small>}
      </div><button className="btn sm ghost" onClick={()=>setOpenId(a.id)} aria-label={`View ${bill.paid?'payment':'bill'} for ${petName(db,a.petId)} visit ${a.id}`}>{bill.paid?'View payment':'View bill'}</button></li>;
    })}</ul>
    <button className="btn ghost sm" onClick={()=>go('bills')}>View all bills &amp; payments</button>
    {selected && <Modal title={`${petName(db,selected.petId)} · ${dateLabel(selected.date)}`} onClose={()=>setOpenId(null)}><div className="ow-bill-scroll"><OwnerBillDetails appointment={selected}/></div><div className="row end"><button type="button" className="btn" onClick={()=>setOpenId(null)}>Close</button></div></Modal>}
  </section>;
}

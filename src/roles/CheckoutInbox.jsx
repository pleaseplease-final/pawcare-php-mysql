import {money} from '../assistantWorkflow.js';
import {ownerBill} from '../ownerBilling.js';
import { PaginatedList } from "../components/Pagination.jsx";
import { useEffect, useRef } from 'react';
import { useClinicRead } from '../useClinicRead.js';

export default function CheckoutInbox({ me, blocked, onOpen, db }) {
  const {data,error,loading,load} = useClinicRead('/api/checkout-inbox', 3000);
  const tasks = data?.tasks || [];
  const seen=useRef(new Set()),openRef=useRef(onOpen);
  openRef.current=onOpen;
  const ready=task=>{
    if(!db)return true;
    const visit=db.appts.find(a=>a.id===task.appointmentId);
    const pet=db.pets.find(p=>p.id===visit?.petId);
    return visit?.status==='Completed' && visit.billingStatus!=='Paid' && visit.admissionStatus!=='Admitted' && !!pet && db.owners.some(o=>o.id===pet.ownerId);
  };
  useEffect(()=>{
    if (!data) return;
    if(blocked || error || document.querySelector('dialog[open], .scrim, [aria-modal="true"]'))return;
    const fresh=tasks.find(t=>t.status==='pending'&&!seen.current.has(t.appointmentId)&&ready(t));
    if(fresh && openRef.current(fresh)!==false)seen.current.add(fresh.appointmentId);
  },[data,blocked,error,db?.appts,db?.pets,db?.owners]);
  const open=task=>{if(onOpen(task)!==false){seen.current.add(task.appointmentId);}};
  return <section className="card" style={{marginBottom:16}} aria-label="Checkout inbox">
    <h3>Ready for checkout ({data ? tasks.length : "—"})</h3>
    <p>Completed visits stay here until payment is saved. Admitted pets appear after the veterinarian approves discharge. The oldest waiting visits appear first.</p>
    {error && <p role="alert">{error} {data && "Showing the last loaded inbox."} <button className="btn ghost sm" disabled={loading} onClick={()=>load()}>Retry inbox</button></p>}
    {(!data || loading) && !error && <p role="status">{data ? "Refreshing checkout inbox…" : "Loading checkout inbox…"}</p>}
    <div aria-live="polite">{data && !error && !tasks.length && <p>No visits waiting for checkout.</p>}</div>
    <PaginatedList label="Checkout inbox" resetKey={null}>{tasks.map(t=>{
      const visit=db?.appts.find(a=>a.id===t.appointmentId);
      const bill=ownerBill(visit || {});
      return <div className="sf-row" key={t.appointmentId}>
      <div className="sf-body"><b>{t.petName}</b><div>{t.ownerName} · {t.date} {t.time}</div>
        {db && <div>{visit?.reason} · {bill.amount===null ? 'Awaiting invoice' : `${money(bill.amount)} saved charges`}</div>}
        <small>{t.status==='claimed' ? t.claimedBy===me.id ? 'Open in another checkout window for your account.' : `Being handled by ${t.claimedName || 'reception'}.` : 'Visit record saved. Prepare invoice and collect payment.'}</small>
      </div>
      <button className="btn sm gold" disabled={blocked || !!error || t.status==='claimed' || !ready(t)} onClick={()=>open(t)}>New transaction · {t.petName}</button>
    </div>;})}</PaginatedList>
  </section>;
}

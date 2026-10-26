import {vaccinationAppointment,vaccinationStatus,vaccinationBooking} from '../ownerVaccination.js';
import {fmt12} from './owner/ui.jsx';
import {useEffect,useRef,useState} from 'react';
import {api} from '../api.js';
import {clinicRequest} from '../clinicApi.js';
import {useFormValidation} from '../components/useFormValidation.jsx';
import {timelineFilterErrors} from '../clinicDocumentValidation.js';
import {PaginatedList} from '../components/Pagination.jsx';
import {filterCardEvents,cardCareDue} from '../vetCardTimeline.js';
import {today} from '../booking.js';
import './digital-vet-card.css';
const daysUntil=date=>Math.round((Date.parse(date)-Date.parse(today()))/86400000);
// One glance at where the pet stands: what has been given and what is coming next.
const dueTone=days=>days<0?['overdue',`${-days} day${days===-1?'':'s'} overdue`]:days<=30?['soon',days===0?'Due today':`Due in ${days} day${days===1?'':'s'}`]:['ok',`In ${days} days`];
export function CardSummary({history}){
 const events=history.events,given=events.filter(e=>e.kind==='vaccination').length,worms=events.filter(e=>e.kind==='deworming').length,weight=events.find(e=>e.kind==='weight');
 const next=cardCareDue(events)[0],tone=next?dueTone(daysUntil(next.nextDue)):null;
 return <dl className="vc-summary" aria-label="Card summary">
  <div className="is-vaccination"><dt>Vaccines given</dt><dd>{given}</dd></div>
  <div className="is-deworming"><dt>Deworming</dt><dd>{worms}</dd></div>
  <div className="is-weight"><dt>Latest weight</dt><dd>{weight?`${weight.value} kg`:'None yet'}</dd></div>
  <div className={`is-next${tone?` is-${tone[0]}`:''}`}><dt>Next care due</dt><dd>{next?next.nextDue:'Nothing scheduled'}</dd>{next&&<small>{next.vaccine} · {tone[1]}</small>}</div>
 </dl>;
}
export function VetCardTimeline({history,filters={}}){
 const events=filterCardEvents(history.events,filters);
 return <>
  {[["vaccination","Vaccinations"],["deworming","Deworming history"],["weight","Weight per visit"]].map(([kind,title])=>{
   const rows=events.filter(e=>e.kind===kind);
   return <section key={kind} className={`vc-section is-${kind}`}><h4>{title} <span className="vc-count">{rows.length}</span></h4>
    <PaginatedList label={title} resetKey={JSON.stringify(filters)} className="vet-card-timeline">
     {rows.map(event=><article key={event.id} className={`vet-card-event is-${kind}`}>
      <header><strong>{kind==='weight'?`${event.value} kg`:event.vaccine}</strong><time dateTime={event.date}>{event.date || 'Not recorded'}</time></header>
      {kind!=='weight' && event.nextDue && (()=>{const [tone,label]=dueTone(daysUntil(event.nextDue));return <p className={`vc-due is-${tone}`}><b>Next due {event.nextDue}</b> · {label}</p>;})()}
      {kind!=='weight' && <><dl className="vet-card-patient-fields">
       {[[kind==='deworming'?'Medication / brand':'Vaccine brand',event.brand],['Next due',event.nextDue],...(kind==='vaccination'?[['Manufacturer',event.manufacturer],['Lot / batch number',event.batch],['Serial number',event.serialNumber]]:[]),['Veterinarian',event.vetName]].map(([label,value])=><div key={label}><dt>{label}</dt><dd>{value || 'Not recorded'}</dd></div>)}
      </dl><p className="vet-card-signature">Veterinarian signature: <span className="vc-sign-line" role="img" aria-label="Space for handwritten signature"/></p></>}
     </article>)}
    </PaginatedList>{!rows.length && <p>No {kind==='weight'?'visit weights':kind==='deworming'?'deworming administrations':'vaccinations'} recorded{Object.values(filters).some(Boolean)?' matching these filters':''}.</p>}
   </section>;
  })}
 </>;
}
export function NextPreventiveCare({history,appointments,onBook}) {
 const due=cardCareDue(history.events);
 return <section className="vet-card-next-care" aria-label="Next deworming and vaccination">
  <h4>Next preventive care</h4>
  {!due.length && <p>No next deworming or vaccination date recorded.</p>}
  {due.map(event=>{
   const recall={...event,petId:history.pet.id,done:true};
   const appointment=appointments && vaccinationAppointment(recall,appointments);
   const name=event.kind==='deworming'?'deworming':'vaccination';
   const [tone,label]=dueTone(daysUntil(event.nextDue));
   return <article key={event.id} className={`vc-care is-${tone}`}>
    <h5>Next {name}: {event.vaccine} <span className={`vc-chip is-${tone}`}>{label}</span></h5>
    <p><b>Vet-approved due: <time dateTime={event.nextDue}>{event.nextDue}</time></b> · {vaccinationStatus(recall,[recall])}</p>
    {appointments && <p>{appointment ? <>Booked visit: {appointment.date}{appointment.time?` at ${fmt12(appointment.time)}`:''} · {appointment.status}</> : 'No appointment booked for this treatment.'}</p>}
    {onBook && !appointment && <button type="button" className="btn gold sm" onClick={()=>onBook(vaccinationBooking(recall))}>Book {name}</button>}
   </article>;
  })}
  {!!due.length && <small>A due date is the veterinarian’s recommended return date. A booked visit is shown separately.</small>}
 </section>;
}
export default function DigitalVetCard({petId,refreshKey,portrait,appointments,onBook}){
 const [data,setData]=useState(null),[loading,setLoading]=useState(true),[error,setError]=useState(''),[exporting,setExporting]=useState(false);
 const [flipped,setFlipped]=useState(false);
 const [filters,setFilters]=useState({kind:'',from:'',to:'',query:''});
 const validation=useFormValidation(timelineFilterErrors(filters)),exportPending=useRef(false),generation=useRef(0);
 const load=async()=>{
  const id=++generation.current;setLoading(true);setError('');
  try{const next=await api.get(`/api/pets/${encodeURIComponent(petId)}/vet-card`);if(generation.current===id)setData(next);}
  catch(e){if(generation.current===id)setError(e.message);}
  finally{if(generation.current===id)setLoading(false);}
 };
 useEffect(()=>{setData(null);setFlipped(false);load();return()=>{generation.current++;};},[petId,refreshKey]);
 const edit=(key,value)=>setFilters(previous=>({...previous,[key]:value}));
 const download=async(print=false)=>{
  if(exportPending.current)return;
  const printWindow=print?window.open('','_blank'):null;
  if(print&&!printWindow){setError('Allow a new window to open the complete PDF for printing.');return;}
  if(printWindow)printWindow.opener=null;
  exportPending.current=true;setExporting(true);setError('');
  try{
   // Export the full saved card, independent of screen filters.
   const blob=await clinicRequest('GET',`/api/pets/${encodeURIComponent(petId)}/vet-card/pdf`,undefined,{blob:true});
   const url=URL.createObjectURL(blob);
   if(printWindow){printWindow.location.href=url;setTimeout(()=>URL.revokeObjectURL(url),60000);}
   else{const anchor=window.document.createElement('a');anchor.href=url;anchor.download=`Digital-Vet-Card-${petId}.pdf`;anchor.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
  }catch(e){printWindow?.close();setError(e.message);}finally{exportPending.current=false;setExporting(false);}
 };
 const history=data?.history,document=data?.document;
 return <section className="digital-vet-card" aria-label="Digital Vet Card">
  <header className="vet-card-heading"><div><h3>Digital Vet Card</h3><p>Pet and owner details, vaccinations, deworming and visit weights.</p></div><div className="row">
   <button type="button" className="btn gold sm" disabled={!document||loading||exporting} onClick={()=>download()}>{exporting?'Preparing PDF…':'Download PDF'}</button>
   <button type="button" className="btn ghost sm" disabled={!document||loading||exporting} title="Open the vaccination card PDF for printing" onClick={()=>download(true)}>Print Card</button>
   <button type="button" className="btn ghost sm" disabled={loading||exporting} onClick={load}>Refresh card</button>
  </div></header>
  {loading && <p role="status">Loading vaccination card…</p>}
  {error && <p role="alert" className="err">{error}</p>}
  {history && <>
   <CardSummary history={history}/>
   <NextPreventiveCare history={history} appointments={appointments} onBook={onBook}/>
   <div className="vet-card-face-controls"><span>Vaccination card</span><button type="button" className="btn gold sm" aria-pressed={flipped} onClick={()=>setFlipped(value=>!value)}>{flipped?'View pet profile':'Flip to vaccination records'} <span aria-hidden="true">↔</span></button></div>
   <div className="vc-flip-stage"><div className={`vc-flip-card${flipped?' is-flipped':''}`}>
    <section className={`vc-page-front${!flipped?' is-active':''}`} aria-label="Pet profile" aria-hidden={flipped} inert={flipped?'':undefined}>
     <div className="vc-booklet-spine"/>
     <header className="vc-passport-header"><small>Vaccination card</small><h4>Digital Vet Card</h4></header>
     <div className="vet-card-profile-body">
      <div className="vet-card-profile-title">{portrait}<div><h4>{history.pet.name}</h4><p>{history.pet.speciesOther || history.pet.species} · {history.pet.breed || 'Breed not recorded'}</p></div></div>
      <dl className="vet-card-patient-fields">{[['Sex',history.pet.sex],['Date of birth',history.pet.birth],['Color / distinguishing features',history.pet.color],['Spayed / neutered',history.pet.neutered],...(history.pet.microchipNumber?[['Microchip number',history.pet.microchipNumber],['Implantation / scan date',history.pet.microchipDate]]:[])].map(([label,value])=><div key={label}><dt>{label}</dt><dd>{value || 'Not recorded'}</dd></div>)}</dl>
      <h4>Owner information</h4><dl className="vet-card-patient-fields">{[['Full name',history.owner.name],['Home address',history.owner.address],['Contact number',history.owner.phone],['Email address',history.owner.email]].map(([label,value])=><div key={label}><dt>{label}</dt><dd>{value || 'Not recorded'}</dd></div>)}</dl>
     </div>
    </section>
    <section className={`vc-page-back${flipped?' is-active':''}`} aria-label="Vaccination records" aria-hidden={!flipped} inert={!flipped?'':undefined}>
     <header className="vc-passport-header"><small>{history.pet.name}</small><h4>Vaccination records</h4><span className="vc-passport-stamp">Vaccinations · Deworming · Weight</span></header>
     <div className="vet-card-history-body">
   <form {...validation.formProps} className="vet-card-filters" onSubmit={e=>e.preventDefault()}>
    <label>History type<select {...validation.field('kind')} value={filters.kind} onChange={e=>edit('kind',e.target.value)}><option value="">All records</option><option value="vaccination">Vaccinations</option><option value="deworming">Deworming</option><option value="weight">Visit weights</option></select>{validation.feedback('kind')}</label>
    <label>From date<input type="date" min="2000-01-01" max={filters.to || today()} {...validation.field('from')} value={filters.from} onChange={e=>edit('from',e.target.value)}/>{validation.feedback('from')}</label>
    <label>To date<input type="date" min={filters.from || '2000-01-01'} max={today()} {...validation.field('to')} value={filters.to} onChange={e=>edit('to',e.target.value)}/>{validation.feedback('to')}</label>
    <label>Search history<input type="search" {...validation.field('query')} value={filters.query} onChange={e=>edit('query',e.target.value)}/>{validation.feedback('query')}</label>
   </form>
   {!Object.values(timelineFilterErrors(filters)).some(Boolean) && <VetCardTimeline history={history} document={document} filters={filters}/>}
     </div></section>
   </div></div>
  </>}
 </section>;
}

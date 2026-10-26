import DigitalVetCard from '../DigitalVetCard.jsx';
import PetPortrait from '../PetPortrait.jsx';
import {useState,useEffect} from 'react';
import {scope} from '../../lib.jsx';
import {usePetPhoto} from '../../components/usePetPhoto.jsx';
import {pick,setPrefill} from './ui.jsx';
export function OwnerVacc({db,setDb,me,go}){
 const registeredPets=scope(db,me,'pets');
 const pets=registeredPets.filter(p=>!p.registrationStatus || p.registrationStatus==='Verified');
 const [selected,setSelected]=useState(()=>pick.petId || pets[0]?.id || '');
 const sel=pets.some(p=>p.id===selected)?selected:pets[0]?.id;
 const p=pets.find(p=>p.id===sel);
 const {fileInputRef,photoBusy,photoError,photoStatus,savePhoto,handlePhotoFileChange}=usePetPhoto(sel,setDb);
 useEffect(()=>{pick.petId=null;},[]);

 if(!p)return <div className="empty"><h3>{registeredPets.length ? 'Registration review needed' : 'No registered pets yet'}</h3><p>{registeredPets.length ? 'Open My Pets to check the registration status or correct the existing request. The card becomes available after approval.' : 'Add your pet in My Pets to create their vaccination card.'}</p><button className="btn gold" onClick={()=>go('home')}>My Pets</button></div>;
 return <section aria-label={`${p.name}’s vaccination card`}>
  {photoError && <p className="err" role="alert">{photoError}</p>}
  <p role="status" aria-live="polite">{photoBusy ? 'Saving pet photo…' : photoStatus}</p>
  <fieldset disabled={photoBusy} style={{border:0,padding:0,margin:0,minWidth:0}}>
  <div className="row" style={{flexWrap:'wrap',gap:12,alignItems:'center',marginBottom:12}}><label htmlFor="card-pet" style={{margin:0,fontWeight:700}}>Pet</label><select id="card-pet" style={{width:'auto',minWidth:220,maxWidth:'100%',flex:'0 1 320px'}} value={sel} onChange={e=>setSelected(e.target.value)}>{pets.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select><button className="btn ghost sm" onClick={()=>{setPrefill({petId:p.id});go('appts');}}>Book a visit</button></div>
  <DigitalVetCard key={p.id} petId={p.id} appointments={scope(db,me,'appts')} onBook={prefill=>{setPrefill(prefill);go('appts');}} portrait={<PetPortrait pet={p} inputRef={fileInputRef} onChange={handlePhotoFileChange} onRemove={()=>savePhoto()}/>}/>
  </fieldset>
 </section>;
}

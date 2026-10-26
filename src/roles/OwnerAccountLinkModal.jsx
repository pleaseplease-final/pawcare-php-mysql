import {useUnsavedChanges} from '../components/useUnsavedChanges.jsx';
import {useRef,useState} from 'react';
import ClinicDialog from '../components/ClinicDialog.jsx';
import {useFormValidation} from '../components/useFormValidation.jsx';
import {api} from '../api.js';

export default function OwnerAccountLinkModal({owner,onClose,onLinked}) {
  const [email,setEmail]=useState(''),[review,setReview]=useState(null),[confirmed,setConfirmed]=useState(false);
  const [busy,setBusy]=useState(false),[error,setError]=useState('');
  const saving=useRef(false);
  const validation=useFormValidation({email:!/^\S+@\S+\.\S+$/.test(email.trim())?'Enter the owner’s online account email.':'',confirmed:review&&!confirmed?'Confirm the owner’s identity and listed pets.':''});
  const unsaved=useUnsavedChanges({value:{email,confirmed},saving:busy,onClose});
  const close=unsaved.close;
  const submit=async event=>{
    event.preventDefault();
    if(saving.current || !validation.validate(event))return;
    saving.current=true;setBusy(true);setError('');
    try {
      if(!review) {
        const data=await api.post(`/api/owners/${owner.id}/account-link/review`,{email:email.trim()});
        setReview(data);setConfirmed(false);
      } else {
        const data=await api.post(`/api/owners/${owner.id}/account-link/confirm`,{email:email.trim(),revision:review.revision,identityConfirmed:confirmed});
        if(!data.success || data.ownerId!==owner.id)throw Error('The server did not confirm the link. Refresh the owner record.');
        onLinked(data);onClose();
      }
    } catch(err){setError(err.message);if(review){setReview(null);setConfirmed(false);}}
    finally{saving.current=false;setBusy(false);}
  };
  return <ClinicDialog label="Link owner’s online account" onClose={close}><section className="modal" style={{width:'min(680px,100%)'}}>
    <h3>Link owner’s online account</h3><p>Connect {owner.name}’s clinic history to their verified account. Confirm their identity with them before linking.</p>
    {unsaved.card}
    <form {...validation.formProps} onSubmit={submit} aria-busy={busy}>
      <label className="fld">Online account email<input type="email" maxLength={255} {...validation.field('email')} value={email} disabled={busy || !!review} onChange={e=>setEmail(e.target.value)} /></label>{validation.feedback('email')}
      {review && <>
        <div className="account-link-comparison">{[['Clinic record',review.clinic],['Verified online account',review.account]].map(([title,item])=><section className="card" key={title}><h4>{title}</h4><dl className="op-dl">{[['Name',item.name],['Email',item.email],['Mobile',item.phone],['Address',item.address]].map(([label,value])=><div key={label}><dt>{label}</dt><dd>{value || 'Not recorded'}</dd></div>)}</dl></section>)}</div>
        <h4>Pets that will appear in this account</h4><ul>{review.pets.map(p=><li key={p.id}>{p.name} · {p.source}</li>)}</ul>{!review.pets.length&&<p>No pets registered yet.</p>}
        <p>The verified account’s name and contacts become the owner’s primary details. Existing patient records and their medical history stay together. Ask the owner to refresh their portal after linking.</p>
        <label className="admission-check"><input type="checkbox" {...validation.field('confirmed')} checked={confirmed} disabled={busy} onChange={e=>setConfirmed(e.target.checked)} />I confirmed both records belong to this owner and reviewed every listed pet.</label>{validation.feedback('confirmed')}
      </>}
      {error&&<p className="err" role="alert">{error}</p>}
      <div className="row end"><button type="button" className="btn ghost" disabled={busy} onClick={close}>Cancel</button>{review&&<button type="button" className="btn ghost" disabled={busy} onClick={()=>{setReview(null);setConfirmed(false);}}>Change account</button>}<button className="btn gold" disabled={busy}>{busy?'Saving…':review?'Link account':'Review account'}</button></div>
    </form>
  </section></ClinicDialog>;
}

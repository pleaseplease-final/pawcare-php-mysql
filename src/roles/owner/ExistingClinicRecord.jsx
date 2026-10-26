import ClinicDialog from '../../components/ClinicDialog.jsx';

export default function ExistingClinicRecord({me,onClose,onLogout,required=false}) {
  return <ClinicDialog label="Connect your clinic records" onClose={()=>{if(!required)onClose();}}><section className="modal owner-pet-setup">
    <h3>Already visited this clinic?</h3>
    <p>Reception can connect your existing pets and visit history to this verified account.</p>
    <ol><li>Give reception your account email: <strong>{me.email}</strong>.</li><li>Confirm your identity and the pets already registered under your name.</li><li>Reception reviews both records and links your account. Then refresh this page to see your pets and history.</li></ol>
    <p>Use this option for pets already registered at the clinic so their history stays in one record.</p>
    <div className="row end">{onLogout&&<button className="btn ghost" onClick={onLogout}>Log out</button>}<button className="btn ghost" onClick={onClose}>{required?'Back to pet registration':'Close'}</button><button className="btn gold" onClick={()=>window.location.reload()}>Refresh my records</button></div>
  </section></ClinicDialog>;
}

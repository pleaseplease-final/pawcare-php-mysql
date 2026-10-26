import TextSize from "../../components/TextSize.jsx";
import {useUnsavedChanges} from '../../components/useUnsavedChanges.jsx';
import { useState, useEffect, useRef } from "react";
import { accountProfile } from "../../accountProfile.js";
import { ROLES } from "../../lib.jsx";
import { Avatar, Modal } from "./ui.jsx";
import { ProfileBody, PasswordBody } from "./Profile.jsx";

/* Owner-only header: picture + name opens a menu (Profile, Change password, Log out). */
export default function OwnerHeader({ db, setDb, me, say, onLogout }) {
  const [open, setOpen] = useState(false), [dlg, setDlg] = useState(null), ref = useRef();
  const o = accountProfile(db, me);
  const [formState,setFormState]=useState({dirty:false,busy:false});
  const unsaved=useUnsavedChanges({value:formState.dirty,saving:formState.busy,active:!!dlg,onClose:()=>{setDlg(null);setFormState({dirty:false,busy:false});}});
  useEffect(() => {
    if (!open) return;
    const down = e => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); }, key = e => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", down); document.addEventListener("keydown", key);
    return () => { document.removeEventListener("mousedown", down); document.removeEventListener("keydown", key); };
  }, [open]);
  const to = t => { setFormState({dirty:false,busy:false}); setOpen(false); setDlg(t); };
  return (
    <div className="ow-hd" ref={ref}>
      <button className="ow-hdbtn" onClick={() => setOpen(!open)} aria-haspopup="menu" aria-expanded={open} aria-label="Account menu">
        <Avatar src={o.photo} fallback={me.name[0]} size={48} /><span className="t">{me.name}<small>{ROLES[me.role][0]}</small></span><span aria-hidden="true">▾</span>
      </button>
      {open && <div className="ow-menu" role="menu">
        <button role="menuitem" onClick={() => to("profile")}>My Profile</button>
        <button role="menuitem" onClick={() => to("password")}>Change Password</button>
        <hr /><TextSize /><hr /><button role="menuitem" onClick={() => { setOpen(false); onLogout(); }}>Log out</button>
      </div>}
      {unsaved.card}
      {dlg && <Modal title={dlg === "profile" ? "My Profile" : "Change Password"} onClose={unsaved.close} className={`ow-account-dialog ow-account-${dlg}`} portalTo={ref.current?.closest(".shell")} closeButton>
        {dlg === "profile" ? <ProfileBody onFormState={setFormState} db={db} setDb={setDb} me={me} say={say} /> : <PasswordBody onFormState={setFormState} db={db} setDb={setDb} me={me} say={say} />}
        <div className="row end"><button type="button" className="btn ghost sm" onClick={unsaved.close}>Close</button></div>
      </Modal>}
    </div>
  );
}

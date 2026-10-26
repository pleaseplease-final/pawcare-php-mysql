import {useUnsavedChanges} from '../components/useUnsavedChanges.jsx';
import { useState, useEffect, useRef } from "react";
import { User, KeyRound, LogOut, ChevronDown } from "lucide-react";
import { ROLES } from "../lib.jsx";
import TextSize from "../components/TextSize.jsx";
import { accountProfile } from "../accountProfile.js";
import { Avatar, Modal } from "./owner/ui.jsx";
import { ProfileBody, PasswordBody } from "./owner/Profile.jsx";

/* Account menu for the administrator, veterinarian and assistant portals.
   Styling lives in staff-modern.css (.sf-hd, .ow-hdbtn, .ow-menu). */
export default function StaffHeader({ db, setDb, me, say, onLogout }) {
  const [open, setOpen] = useState(false);
  const [dlg, setDlg] = useState(null); // "profile" | "password"
  const ref = useRef(null);

  const [formState,setFormState]=useState({dirty:false,busy:false});
  const unsaved=useUnsavedChanges({value:formState.dirty,saving:formState.busy,active:!!dlg,onClose:()=>{setDlg(null);setFormState({dirty:false,busy:false});}});
  useEffect(() => {
    if (!open) return;
    const down = e => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    const key = e => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", down);
    document.addEventListener("keydown", key);
    return () => {
      document.removeEventListener("mousedown", down);
      document.removeEventListener("keydown", key);
    };
  }, [open]);

  const to = t => { setFormState({dirty:false,busy:false}); setOpen(false); setDlg(t); };
  const account = accountProfile(db, me);
  const roleLabel = (ROLES[me.role] && ROLES[me.role][0]) || me.role;
  const initial = String(me.name || me.firstName || "U").replace(/^Dr\.?\s+/i, "").charAt(0).toUpperCase();

  return (
    <div className="sf-hd" ref={ref}>
      <button
        type="button"
        className="ow-hdbtn"
        onClick={() => setOpen(o => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Account menu"
      >
        <Avatar src={account.photo} fallback={initial} size={48} />
        <span className="t"><b>{me.name}</b><small>{roleLabel}</small></span>
        <ChevronDown className="sf-chev" size={16} aria-hidden="true" />
      </button>

      {open && (
        <div className="ow-menu" role="menu">
          <div className="sf-who"><b>{me.name}</b><small>{account.email || me.username}</small></div>
          <button type="button" role="menuitem" onClick={() => to("profile")}><User size={16} />My profile</button>
          <button type="button" role="menuitem" onClick={() => to("password")}><KeyRound size={16} />Change password</button>
          <hr />
          <TextSize />
          <hr />
          <button type="button" role="menuitem" className="sf-out" onClick={() => { setOpen(false); onLogout && onLogout(); }}><LogOut size={16} />Log out</button>
        </div>
      )}

      {unsaved.card}
      {dlg && (
        <Modal title={dlg === "profile" ? "My profile" : "Change password"} onClose={unsaved.close} className={`ow-account-dialog ow-account-${dlg}`} portalTo={ref.current?.closest(".shell")} closeButton>
          {dlg === "profile"
            ? <ProfileBody onFormState={setFormState} db={db} setDb={setDb} me={me} say={say} />
            : <PasswordBody onFormState={setFormState} db={db} setDb={setDb} me={me} say={say} />}
          <div className="row end" style={{ marginTop: 14 }}>
            <button type="button" className="btn ghost sm" onClick={unsaved.close}>Close</button>
          </div>
        </Modal>
      )}
    </div>
  );
}

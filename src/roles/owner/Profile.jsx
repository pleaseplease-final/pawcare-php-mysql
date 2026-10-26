import { UserRound, Mail, MapPin, ShieldCheck, AlertCircle, KeyRound, Check, Circle } from "lucide-react";
import { ROLES } from "../../lib.jsx";
import { useEffect, useRef, useState } from "react";
import "./account.css";
import { accountProfile, saveAccountProfile, formatAccountAddress, contactFieldErrors, contactCodeErrors } from "../../accountProfile.js";
import { PW_RULES, pwStrength, validatePasswordChange, clean, normEmail, normPhone, emOk } from "../../validate.js";
import { auth, OFFLINE_MSG } from "../../authApi.js";
import { useLive, Field, onlyDigitsPlus, noSpaces, PhotoUpload } from "./ui.jsx";

const LABEL = ["Too weak", "Too weak", "Okay", "Good", "Strong", "Very strong"], COLOR = ["#c0392b", "#c0392b", "#d98e04", "#2f8f5b", "#1b7a43", "#1b7a43"];

/* Turns a server answer into what the form needs: field messages, or one message for the top. */
const explain = x => x.offline ? { top: OFFLINE_MSG } : x.fields ? { fields: x.fields } : { top: x.message || "Something went wrong. Please try again." };

/* Popup bodies (shown inside a Modal from the header menu). */
export function ProfileBody({ db, setDb, me, say, onFormState }) {
  const o = accountProfile(db, me);
  const [photoBusy,setPhotoBusy]=useState(false);
  const [contactState,setContactState]=useState({dirty:false,busy:false});
  useEffect(()=>{onFormState?.({dirty:contactState.dirty,busy:contactState.busy || photoBusy});},[contactState.dirty,contactState.busy,photoBusy,onFormState]);
  const savePhoto = async photo => {
    const result = await auth.profilePhoto(photo);
    if (result?.photo !== photo) throw Error("The server did not confirm your profile picture. Refresh your profile before retrying.");
    setDb(d => saveAccountProfile(d, me.id, { photo: result.photo, role: me.role, ownerId: me.ownerId }));
    say(photo ? "Profile picture saved" : "Profile picture removed");
  };

  if (!db.accountProfiles?.[me.id]) {
    const error = db.accountProfileErrors?.[me.id];
    const retry = async () => {
      setDb(d => ({ ...d, accountProfileErrors: { ...d.accountProfileErrors, [me.id]: null } }));
      try {
        const { profile } = await auth.profile();
        setDb(d => saveAccountProfile(d, me.id, profile));
      } catch (x) {
        setDb(d => ({ ...d, accountProfileErrors: { ...d.accountProfileErrors, [me.id]: x.message } }));
      }
    };
    return <div className="ow-card"><p role={error ? "alert" : "status"}>{error || "Loading your profile…"}</p>{error && <button className="btn" onClick={retry}>Try again</button>}</div>;
  }

  return (<div className="ow-profile-layout">
    <div className="ow-card ow-profile-photo">
      <span className="account-eyebrow">Your account</span>
      <h3 className="account-name">{o.name || me.name}</h3>
      <span className="account-role">{ROLES[me.role]?.[0] || me.role}</span>
      <div className="account-photo-area"><h4>Profile picture</h4><p>Choose a clear photo for your account.</p></div>
      <PhotoUpload onBusyChange={setPhotoBusy} src={o.photo} fallback={(o.name || "U")[0]} size={112} label="Upload picture" onSave={savePhoto} onRemove={() => savePhoto("")} />
      <div className="account-verification" aria-label="Contact verification">
        {[['Email',o.emailVerified],['Mobile',o.mobileVerified]].map(([label,verified]) => <div key={label} className={verified ? "verified" : "unverified"}>{verified ? <ShieldCheck size={17} aria-hidden="true" /> : <AlertCircle size={17} aria-hidden="true" />}<span>{label}<b>{verified ? "Verified" : "Not verified"}</b></span></div>)}
      </div>
      <p className="account-photo-note">Your contact details are used for clinic updates and account verification.</p>
    </div>
    <Contact o={o} me={me} setDb={setDb} say={say} onFormState={setContactState} />
  </div>);
}
export function PasswordBody({ me, say, onFormState }) {
  const [n, setN] = useState(0);   // bumps after a successful change so the form starts empty
  return <Password key={n} me={me} say={say} onFormState={onFormState} onDone={() => setN(n + 1)} />;
}

function Contact({ o, me, setDb, say, onFormState }) {
  const [email, setEmail] = useState(o.email || "");
  const [phone, setPhone] = useState(o.phone || "");
  const [houseStreet, setHouseStreet] = useState(o.houseStreet || "");
  const [city, setCity] = useState(o.city || "");
  const [state, setState] = useState(o.state || "");
  const [country, setCountry] = useState(o.country ?? "Philippines");
  const [zipCode, setZipCode] = useState(o.zipCode || "");

  const [touched, setTouched] = useState({});
  const touch = k => setTouched(p => ({ ...p, [k]: true }));

  const submitting = useRef(false);
  const [pending, setPending] = useState(null);
  const [emailCode, setEmailCode] = useState("");
  const [phoneCode, setPhoneCode] = useState("");
  const [srv, setSrv] = useState({});
  const [busy, setBusy] = useState(false);
  const [top, setTop] = useState("");

  const contactErrors=contactFieldErrors({email,phone,houseStreet,city,state,country,zipCode});
  const codeErrors=contactCodeErrors(pending,{emailCode,phoneCode});
  const fieldError=key=>srv[key] || (touched[key] ? contactErrors[key] || codeErrors[key] || '' : '');
  const emailErr=contactErrors.email || '', phoneErr=contactErrors.phone || '';
  const editContact=(key,setter,value)=>{touch(key);setter(value);setSrv(previous=>({...previous,[key]:''}));};
  const dirty =
    normEmail(email) !== (o.email || "").toLowerCase() ||
    normPhone(phone) !== normPhone(o.phone || "") ||
    clean(houseStreet) !== (o.houseStreet || "") ||
    clean(city) !== (o.city || "") ||
    clean(state) !== (o.state || "") ||
    clean(country) !== (o.country ?? "Philippines") ||
    clean(zipCode) !== (o.zipCode || "");

  useEffect(()=>{onFormState?.({dirty:dirty || !!pending,busy});},[dirty,!!pending,busy,onFormState]);
  const save = async e => {
    e.preventDefault();
    if (submitting.current) return;
    setTop("");
    setSrv({});
    const errors=pending ? codeErrors : contactErrors;
    if(Object.keys(errors).length) {
      setTouched(previous=>({...previous,...Object.fromEntries(Object.keys(errors).map(key=>[key,true]))}));
      const form=e.currentTarget;
      requestAnimationFrame(()=>form.querySelector('[aria-invalid="true"]:not(:disabled)')?.focus());
      return;
    }
    submitting.current = true;
    setBusy(true);

    const fullAddr = formatAccountAddress({ houseStreet, city, state, zipCode, country });

    try {
      const r = pending ? await auth.verifyContact({id:pending.id,emailCode,phoneCode}) : await auth.updateContact({
        email: normEmail(email),
        phone: normPhone(phone),
        address: fullAddr,
        houseStreet,
        city,
        state,
        country,
        zipCode
      });
      if (r.pending) {
        setPending(r.pending);
        setEmailCode("");setPhoneCode("");setTouched(previous=>({...previous,emailCode:false,phoneCode:false}));
      } else {
        if (!r.profile || r.profile.id !== me.id) throw new Error("The server did not confirm your saved profile. Refresh your profile before continuing.");
        setDb(p => saveAccountProfile(p, me.id, r.profile));
        setPending(null);setEmailCode("");setPhoneCode("");setTouched(previous=>({...previous,emailCode:false,phoneCode:false}));
        say("Contact & address details saved successfully!");
      }
    } catch (x) {
      const m = explain(x);
      if (m.fields) setSrv(m.fields);
      else setTop(m.top);
      if (x.expired) say(x.message);
    }
    submitting.current = false;
    setBusy(false);
  };

  const formattedBirthday = o.birthday ? new Date(o.birthday + "T00:00:00").toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" }) : "Not recorded";

  return (
    <form className="ow-card account-contact-form" onSubmit={save} noValidate>
      <fieldset disabled={busy || !!pending} style={{border:0,padding:0,margin:0,minWidth:0}}>
      <div className="account-section-heading"><span><UserRound size={19} aria-hidden="true" /></span><div><h3>Personal details</h3><p>Your registered identity. Contact the clinic to correct these details.</p></div><small>Read only</small></div>

      <div className="ow-account-fields">
        <Field id="pfn" label="First name" value={o.firstName || o.name?.split(" ")[0] || ""} readOnly hint="Official name on record" />
        <Field id="pln" label="Last name" value={o.lastName || o.name?.split(" ").slice(1).join(" ") || ""} readOnly hint="Official surname on record" />
      </div>

      <div className="ow-account-fields">
        <Field id="pmi" label="Middle initial" value={o.middleInitial || "—"} readOnly hint="Optional initial" />
        <Field id="pbday" label="Date of birth" value={formattedBirthday} readOnly hint="Birthdate from registration" />
      </div>

      <div className="account-section-heading"><span><Mail size={19} aria-hidden="true" /></span><div><h3>Contact information</h3><p>Changes to your email or mobile require verification.</p></div></div>
      <div className="ow-account-fields">
        <Field id="pemail" label="Email address" req type="email" value={email} filter={noSpaces} filterMsg="Spaces aren’t allowed in an email" maxLen={100} onChange={v => { touch("email"); setEmail(v); setSrv(s => ({ ...s, email: "" })); }} onBlur={() => touch("email")} error={srv.email || (touched.email ? emailErr : "")} valid={touched.email && !emailErr && !srv.email} hint="Used for appointment confirmations & notifications" autoComplete="email" />
        <Field id="pphone" label="Mobile number" req type="tel" value={phone} onChange={v => { touch("phone"); setPhone(v); setSrv(s => ({ ...s, phone: "" })); }} onBlur={() => touch("phone")} filter={onlyDigitsPlus} filterMsg="Numbers only" inputMode="tel" maxLen={13} error={srv.phone || (touched.phone ? phoneErr : "")} valid={touched.phone && !phoneErr && !srv.phone} hint="SMS notifications and verification number" autoComplete="tel" />
      </div>

      <div className="account-section-heading"><span><MapPin size={19} aria-hidden="true" /></span><div><h3>Address</h3><p>Keep your clinic contact record up to date.</p></div></div>
      <Field id="phouse" label="House number & street" value={houseStreet} maxLen={120} onChange={value=>editContact('houseStreet',setHouseStreet,value)} onBlur={()=>touch('houseStreet')} error={fieldError('houseStreet')} hint="From registration form" />
      <div className="ow-account-fields">
        <Field id="pcity" label="City / Municipality" value={city} maxLen={60} onChange={value=>editContact('city',setCity,value)} onBlur={()=>touch('city')} error={fieldError('city')} hint="City / Municipality" />
        <Field id="pstate" label="State / Province" value={state} maxLen={60} onChange={value=>editContact('state',setState,value)} onBlur={()=>touch('state')} error={fieldError('state')} hint="Province or region" />
      </div>
      <div className="ow-account-fields">
        <Field id="pcountry" label="Country" value={country} maxLen={60} onChange={value=>editContact('country',setCountry,value)} onBlur={()=>touch('country')} error={fieldError('country')} hint="Country" />
        <Field id="pzip" label="ZIP / Postal code" value={zipCode} maxLen={20} onChange={value=>editContact('zipCode',setZipCode,value)} onBlur={()=>touch('zipCode')} error={fieldError('zipCode')} hint="ZIP code" />
      </div>

      <div className="account-address-preview">
        <b>Full Address: </b>
        {formatAccountAddress({ houseStreet, city, state, zipCode, country }) || "No address on file"}
      </div>

      </fieldset>
      {pending && <section className="account-verify-panel" aria-label="Verify new contact details">
        <h4>Verify your new contact details</h4>
        <p>Your current email and mobile stay active until you verify and save. Codes expire in 10 minutes.</p>
        <p><b>Email:</b> {pending.email}<br/><b>Mobile:</b> {pending.phone}</p>
        {(!pending.emailSent || !pending.phoneSent) && <p className="err" role="alert">We could not confirm delivery of all codes. Your details have not changed. Wait one minute, then go back and request new codes.</p>}
        <fieldset disabled={busy} style={{border:0,padding:0,margin:0,minWidth:0}}>
          {pending.requireEmail && <Field id="contact-email-code" label="Code sent to new email" req value={emailCode} onChange={v=>{touch('emailCode');setEmailCode(v.replace(/\D/g,""));}} onBlur={()=>touch('emailCode')} error={fieldError('emailCode')} inputMode="numeric" maxLen={6} autoComplete="one-time-code" />}
          {pending.requirePhone && <Field id="contact-phone-code" label="Code sent to new mobile" req value={phoneCode} onChange={v=>{touch('phoneCode');setPhoneCode(v.replace(/\D/g,""));}} onBlur={()=>touch('phoneCode')} error={fieldError('phoneCode')} inputMode="numeric" maxLen={6} autoComplete="one-time-code" />}
          <button type="button" className="btn ghost" onClick={()=>{setPending(null);setEmailCode("");setPhoneCode("");setTouched(previous=>({...previous,emailCode:false,phoneCode:false}));setTop("");}}>Back to edit / request new codes</button>
        </fieldset>
      </section>}
      {top && <p className="err" role="alert" style={{ marginTop: 12 }}>{top}</p>}
      <div className="row end account-save-bar">
        <button className="btn gold" disabled={busy || (pending ? !pending.emailSent || !pending.phoneSent || pending.requireEmail && emailCode.length!==6 || pending.requirePhone && phoneCode.length!==6 : !dirty)}>
          {busy ? "Saving…" : pending ? "Verify and save changes" : dirty ? "Save changes" : "No changes yet"}
        </button>
      </div>
    </form>
  );
}

/* The current password is checked by the server. The browser never sees or compares the real one. */
function Password({ me, say, onDone, onFormState }) {
  const [show, setShow] = useState(false), [srv, setSrv] = useState({}), [busy, setBusy] = useState(false), [top, setTop] = useState("");
  const f = useLive({ cur: "", next: "", conf: "" }, v => validatePasswordChange(v, me.username || "")), v = f.v;
  const set = (k, x) => { f.set(k, x); if (srv[k]) setSrv(s => ({ ...s, [k]: "" })); };
  useEffect(()=>{onFormState?.({dirty:!!(v.cur || v.next || v.conf),busy});},[v.cur,v.next,v.conf,busy,onFormState]);
  const t = show ? "text" : "password", s = pwStrength(v.next), rulesOk = PW_RULES.every(([r]) => r(v.next));
  const save = async e => {
    e.preventDefault(); setTop(""); f.submit(e);
    if (!f.valid || busy) return;
    setBusy(true);
    try { await auth.changePassword({ cur: v.cur, next: v.next, conf: v.conf }); say("Password changed. Use it next time you log in"); onDone(); return; }
    catch (x) { const m = explain(x); if (m.fields) setSrv(m.fields); else setTop(m.top); if (x.expired) say(x.message); }
    setBusy(false);
  };
  return (
    <form className="ow-card ow-pw" onSubmit={save} noValidate>
      <div className="account-security-intro"><span><KeyRound size={24} aria-hidden="true" /></span><div><span className="account-eyebrow">Account security</span><h3>Update your password</h3><p>Use a unique password that you don’t use for another account.</p></div></div>
      <div className="account-password-layout">
        <fieldset className="account-password-fields" disabled={busy}>
          <Field id="pcur" label="Current password" req type={t} value={v.cur} onChange={x => set("cur", x)} onBlur={() => f.blur("cur")} error={f.show("cur", false) || srv.cur || ""} valid={f.ok("cur") && !srv.cur} hint="The password you use to log in" autoComplete="current-password" />
          <Field id="pnext" label="New password" req type={t} value={v.next} filter={noSpaces} filterMsg="Spaces aren’t allowed in passwords" maxLen={72} onChange={x => set("next", x)} onBlur={() => f.blur("next")} error={rulesOk ? f.show("next") || srv.next || "" : srv.next || ""} valid={f.ok("next")} autoComplete="new-password" />
          <Field id="pconf" label="Confirm new password" req type={t} value={v.conf} filter={noSpaces} filterMsg="Spaces aren’t allowed in passwords" maxLen={72} onChange={x => set("conf", x)} onBlur={() => f.blur("conf")} error={f.show("conf", !v.next.startsWith(v.conf) || v.conf.length > v.next.length) || srv.conf || ""} valid={f.ok("conf")} hint="Enter your new password again" autoComplete="new-password" />
          <label className="chk"><input type="checkbox" checked={show} onChange={e => setShow(e.target.checked)} /> Show passwords</label>
        </fieldset>
        <aside className="account-password-guide">
          <h4>Password requirements</h4><p>Your new password needs all five.</p>
          <ul className="ow-req" aria-label="Password requirements">{PW_RULES.map(([r, l]) => <li key={l} className={r(v.next) ? "y" : "n"}>{r(v.next) ? <Check size={16} aria-hidden="true" /> : <Circle size={13} aria-hidden="true" />}<span>{l}</span></li>)}</ul>
          <div className="ow-meter" role="meter" aria-label="Password strength" aria-valuemin={0} aria-valuemax={5} aria-valuenow={s} aria-valuetext={v.next ? LABEL[s] : "Not entered"}><i style={{ width: `${s * 20}%`, background: COLOR[s] }} /></div><span className="ow-hint">{v.next ? `Strength: ${LABEL[s]}` : "Start typing to check strength"}</span>
        </aside>
      </div>
      <p className="account-security-note"><ShieldCheck size={18} aria-hidden="true" /><span>After saving, your other sessions are signed out. You stay signed in on this device.</span></p>
      {top && <p className="err" role="alert">{top}</p>}
      <div className="row end account-save-bar"><button className="btn" disabled={busy}>{busy ? "Saving…" : "Change password"}</button></div>
    </form>
  );
}

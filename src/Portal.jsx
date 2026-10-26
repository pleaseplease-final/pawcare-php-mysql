import { BookingCatalogProvider } from "./components/VaccineBooking.jsx";
import "./roles/admin-workspace.css";
import {ClinicHistory,HistoryControls} from "./ClinicHistory.jsx";
import {subscribeClinicDate,clinicDateSnapshot} from "./clinicDate.js";
import { useState, useEffect, useSyncExternalStore } from "react";
import { Menu, LogOut } from "lucide-react";
import { Logo, I, ROLES, E, scope, Table } from "./lib.jsx";
import EntityPage from "./EntityPage.jsx";
import ErrorBoundary from "./ErrorBoundary.jsx";
import { auth } from "./authApi.js";
import {useSubmissionReview} from "./components/SubmissionReview.jsx";
import { accountProfile, saveAccountProfile } from "./accountProfile.js";
import { Avatar } from "./roles/owner/ui.jsx";
import StaffHeader from "./roles/StaffHeader.jsx";
import ReportsPage from "./roles/ReportsPage.jsx";
import "./staff-modern.css";
import "./portal-polish.css";
import "./clinical-admin-workspace.css";

function Reports({ db, me }) {
  return <ReportsPage db={db} me={me} />;
}
export default function Portal(props) {
  return <BookingCatalogProvider key={`${props.me.id}:${props.me.role}`}><ClinicHistory key={`${props.me.id}:${props.me.role}`} db={props.db} me={props.me}>{db=><PortalBody {...props} db={db}/>}</ClinicHistory></BookingCatalogProvider>;
}
function PortalBody({ cfg, me, db, setDb, onLogout, dataLoading = false, dataError = "", refreshing = false, onRetry }) {
  useSyncExternalStore(subscribeClinicDate,clinicDateSnapshot,clinicDateSnapshot);
  const account = accountProfile(db, me);
  useEffect(() => {
    let active = true;
    auth.profile().then(({ profile }) => {
      if (active && profile) setDb(d => ({ ...saveAccountProfile(d, me.id, profile), accountProfileErrors: { ...d.accountProfileErrors, [me.id]: null } }));
    }).catch(error => {
      if (active) setDb(d => ({ ...d, accountProfileErrors: { ...d.accountProfileErrors, [me.id]: error.message } }));
    });
    return () => { active = false; };
  }, [me.id, setDb]);
  // Per-account last screen is preserved across reloads; a different user cannot inherit it.
  const pageKey = `pawcare_page_${me.id}`;
  const [navigation,setNavigation] = useState(null);
  const [page, setPage] = useState(() => {
    try {
      const previous = sessionStorage.getItem(pageKey);
      return cfg.menu.some(m => m.k === previous && !m.hide) ? previous : cfg.menu[0].k;
    } catch (_) { return cfg.menu[0].k; }
  }), [open, setOpen] = useState(false), [toast, setToast] = useState("");
  const say = m => { setToast(m); setTimeout(() => setToast(""), 2200); };
  const [pageState,setPageState]=useState({dirty:false,busy:false});
  const leaveReview=useSubmissionReview([page,pageState]);
  const leave=async action=>{
    if(pageState.busy){say('Please wait for the current save to finish.');return;}
    if(pageState.dirty && !await leaveReview.ask({title:'Leave with unsaved changes?',confirmLabel:'Discard and leave',description:'Your changes on this page have not been saved. Go back to keep editing or discard them to continue.',fields:[['Page',cfg.menu.find(m=>m.k===page)?.l || page],['Status','Unsaved changes']]}))return;
    action();
  };
  const cur=cfg.menu.find(m=>m.k===page) || cfg.menu[0];
  const go=(k,context=null)=>{
    if(k===page && context===null && (pageState.dirty || pageState.busy)){setOpen(false);return;}
    return leave(()=>{setPageState({dirty:false,busy:false});setNavigation(context);setPage(k);try{sessionStorage.setItem(pageKey,k);}catch(_){}setOpen(false);});
  };
  const logout=()=>leave(onLogout),Dash=cfg.Dash;

  return (
    <div className={`shell th-${me.role}`} data-page={page}>
      {leaveReview.card}
      <a className="portal-skip" href="#portal-main">Skip to page content</a>
      <aside id="workspace-navigation" className={open ? "side open" : "side"}>
        <div className="brand"><Logo /><div><b>PawCare</b><small>{cfg.portal}</small></div></div>
        <nav aria-label="Main">{cfg.menu.filter(m => !m.hide).map(m => <button key={m.k} className={m.k === page ? "on" : ""} aria-current={m.k === page ? "page" : undefined} onClick={() => go(m.k)}><I e={m.i} size={19} />{m.l}</button>)}</nav>
        <div className="sidefoot"><div className="me"><Avatar src={account.photo} fallback={String(account.name || "U").replace(/^Dr\.?\s+/i, "")[0]} size={46} /><div><b>{me.name}</b><small>{ROLES[me.role][0]}</small></div></div><button className="btn gold sm wide" onClick={logout}><LogOut size={15} aria-hidden="true" />Log out</button></div>
      </aside>
      {open && <button type="button" className="veil" aria-label="Close navigation" onClick={() => setOpen(false)} />}
      <div className="main">
        <header className="top"><button className="burger" onClick={() => setOpen(true)} aria-label="Open menu" aria-expanded={open} aria-controls="workspace-navigation"><Menu size={20} aria-hidden="true" /></button><div className="portal-heading"><span className="portal-context">{me.role === "owner" ? "Your pet care" : "Clinic workspace"}</span><h1>{cur.l}</h1><p>{cur.sub}</p></div>{cfg.Header ? <cfg.Header db={db} setDb={setDb} me={me} go={go} say={say} onLogout={logout} /> : <StaffHeader db={db} setDb={setDb} me={me} say={say} onLogout={logout} />}</header>
        <main id="portal-main" tabIndex={-1} className="content" aria-busy={dataLoading && refreshing}>
          {dataError && <section className="clinic-data-error" role="alert">
            <p>{dataLoading ? "Clinic records could not load." : "Records may be out of date. Changes still require a successful server save."} {dataError}</p>
            <button className="btn sm" disabled={refreshing} onClick={onRetry}>{refreshing ? "Retrying…" : "Retry loading records"}</button>
          </section>}
          <ErrorBoundary key={page} inline onReset={() => go(cfg.menu[0].k)}>
          {!dataLoading && page !== "audit" && page !== 'admissions' && <HistoryControls auto={!cur.dash && !["users","prices","audit","pet-requests"].includes(page)} />}
          {dataLoading ? (!dataError && <><section className="clinic-loading" role="status"><span className="clinic-spinner" aria-hidden="true" />Loading clinic records…</section><div className="skel-grid" aria-hidden="true"><i /><i /><i /><i /></div><div className="skel-card" aria-hidden="true"><i /><i /><i /><i /><i /></div></>) : cur.Page ? <cur.Page onPageState={setPageState} navigation={navigation} onNavigationHandled={()=>setNavigation(null)} db={db} setDb={setDb} me={me} go={go} say={say} /> : cur.dash ? <Dash navigation={navigation} onNavigationHandled={()=>setNavigation(null)} db={db} setDb={setDb} me={me} go={go} say={say} /> : cur.rep ? <Reports db={db} me={me} /> : <EntityPage key={cur.k} ent={cur.ent} db={db} setDb={setDb} me={me} say={say} />}
          </ErrorBoundary>
        </main>
      </div>
      {me.role === "owner" && (
        <nav className="ow-tabbar" aria-label="Main">
          {cfg.menu.filter(m => !m.hide).map(m => <button key={m.k} className={m.k === page ? "on" : ""} aria-current={m.k === page ? "page" : undefined} onClick={() => go(m.k)}><I e={m.i} size={21} /><span>{m.s || m.l}</span></button>)}
        </nav>
      )}
      {!dataLoading && cfg.Onboarding && <cfg.Onboarding db={db} setDb={setDb} me={me} say={say} go={go} onLogout={logout} />}
      {toast && <div className="toast" role="status">{toast}</div>}
    </div>
  );
}

import { approvalVisit } from "./appointmentStatus.js";
import CancellationDialog from './components/CancellationDialog.jsx';
import { useSubmissionReview } from './components/SubmissionReview.jsx';
import { api } from "./api.js";
import { useState } from "react";
import {
  Search,
  Plus,
  UserPlus,
  User,
  PawPrint,
  Mail,
  Phone,
  MapPin,
  ShieldAlert,
  X,
  CalendarPlus,
  Sparkles,
  CreditCard
} from "lucide-react";
import { E, can, scope, cellText, Table, FormModal, uid, TODAY, petName, moveAppt, addLog, LABEL } from "./lib.jsx";
import SoapConsultationModal from "./roles/SoapConsultationModal.jsx";
import InClinicRegistration from "./roles/InClinicRegistration.jsx";

function ViewOwnerModal({ owner, db, onClose }) {
  const pets = (db.pets || []).filter(p => p.ownerId === owner.id);
  return (
    <div className="scrim" onMouseDown={e => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ maxWidth: "560px", width: "100%", padding: "24px", borderRadius: "16px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "16px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
            <div style={{ width: "46px", height: "46px", borderRadius: "12px", background: "rgba(30, 58, 138, 0.1)", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--navy, #1e3a8a)" }}>
              <User size={24} />
            </div>
            <div>
              <h3 style={{ margin: 0, fontSize: "calc(18px * var(--fs, 1))", color: "var(--navy, #0f172a)", fontWeight: 700 }}>{owner.name}</h3>
              <span style={{ fontSize: "calc(12px * var(--fs, 1))", color: "#64748b" }}>Registered Client ID: {owner.id}</span>
            </div>
          </div>
          <button className="btn ghost sm" onClick={onClose} style={{ padding: "6px" }} aria-label="Close">
            <X size={18} />
          </button>
        </div>

        {/* Contact Details Card */}
        <div style={{ background: "#f8fafc", borderRadius: "12px", padding: "14px", border: "1px solid #e2e8f0", marginBottom: "16px" }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px", fontSize: "calc(13px * var(--fs, 1))" }}>
            <div>
              <span style={{ color: "#64748b", display: "block", fontSize: "calc(11px * var(--fs, 1))", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.5px" }}>Email Address</span>
              <div style={{ display: "flex", alignItems: "center", gap: "6px", marginTop: "3px", fontWeight: 500, color: "#1e293b" }}>
                <Mail size={14} color="#64748b" />
                <span>{owner.email}</span>
              </div>
            </div>
            <div>
              <span style={{ color: "#64748b", display: "block", fontSize: "calc(11px * var(--fs, 1))", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.5px" }}>Mobile Number</span>
              <div style={{ display: "flex", alignItems: "center", gap: "6px", marginTop: "3px", fontWeight: 500, color: "#1e293b" }}>
                <Phone size={14} color="#64748b" />
                <span>{owner.phone}</span>
              </div>
            </div>
          </div>
          <div style={{ marginTop: "10px", paddingTop: "10px", borderTop: "1px dashed #cbd5e1", fontSize: "calc(13px * var(--fs, 1))" }}>
            <span style={{ color: "#64748b", display: "block", fontSize: "calc(11px * var(--fs, 1))", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.5px" }}>Primary Address</span>
            <div style={{ display: "flex", alignItems: "center", gap: "6px", marginTop: "3px", fontWeight: 500, color: "#1e293b" }}>
              <MapPin size={14} color="#64748b" />
              <span>{owner.address || "No address provided"}</span>
            </div>
          </div>
        </div>

        {/* Registered Patients */}
        <div style={{ marginBottom: "16px" }}>
          <h4 style={{ margin: "0 0 10px", fontSize: "calc(14px * var(--fs, 1))", fontWeight: 600, color: "var(--navy, #0f172a)", display: "flex", alignItems: "center", gap: "6px" }}>
            <PawPrint size={16} color="#d97706" />
            <span>Registered Patients ({pets.length})</span>
          </h4>
          {pets.length === 0 ? (
            <div style={{ padding: "14px", textAlign: "center", background: "#f8fafc", borderRadius: "10px", fontSize: "calc(13px * var(--fs, 1))", color: "#64748b", border: "1px dashed #cbd5e1" }}>
              No pets registered under this owner yet.
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "8px", maxHeight: "180px", overflowY: "auto" }}>
              {pets.map(p => (
                <div key={p.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", background: "#ffffff", padding: "10px 14px", borderRadius: "10px", border: "1px solid #e2e8f0" }}>
                  <div>
                    <b style={{ color: "var(--navy, #0f172a)", fontSize: "calc(14px * var(--fs, 1))" }}>{p.name}</b>
                    <span style={{ fontSize: "calc(12px * var(--fs, 1))", color: "#64748b", marginLeft: "8px" }}>
                      {p.species} • {p.breed} • {p.weight} kg
                    </span>
                  </div>
                  {p.vaccinationCardId && (
                    <span style={{ fontSize: "calc(11px * var(--fs, 1))", background: "rgba(16, 185, 129, 0.1)", color: "#065f46", padding: "3px 8px", borderRadius: "99px", fontWeight: 600 }}>
                      <CreditCard size={11} aria-hidden="true" style={{ verticalAlign: "-1px", marginRight: 4 }} />{p.vaccinationCardId}
                    </span>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Security / RBAC Banner */}
        <div style={{ background: "#eff6ff", border: "1px solid #bfdbfe", borderRadius: "10px", padding: "10px 14px", fontSize: "calc(12px * var(--fs, 1))", color: "#1e40af", display: "flex", alignItems: "center", gap: "10px", marginBottom: "18px" }}>
          <ShieldAlert size={20} style={{ flexShrink: 0 }} />
          <span>
            <b>Account Security:</b> Pet owner personal credentials and contact settings are strictly managed by the client or Clinic Administrator. Front desk staff have read-only access to client account records.
          </span>
        </div>

        <div className="row end">
          <button className="btn" onClick={onClose} style={{ minWidth: "90px" }}>Close</button>
        </div>
      </div>
    </div>
  );
}

export default function EntityPage({ ent, db, setDb, me, say }) {
  const [cancelling,setCancelling] = useState(null), [actionError,setActionError] = useState('');
  const statusReview = useSubmissionReview(db.appts);
  const c = E[ent], [q, setQ] = useState(""), [modal, setModal] = useState(null);
  let list = [...scope(db, me, ent)];
  if (c.sort) list.sort(c.sort);
  if (q) list = list.filter(x => c.cols.some(k => String(cellText(db, x, k)).toLowerCase().includes(q.toLowerCase())));

  const deny = m => { say(m); setModal(null); };

  const save = async d => {
    if (!can(ent, me, modal.init ? "u" : "c")) return deny("You don’t have permission to do that");
    if (me.role === "owner" && ent === "appts" && !scope(db, me, "pets").some(p => p.id === d.petId)) return deny("You can only book for your own pets");
    const x = { ...d, id: modal.init?.id || uid() };
    try {
      if (ent === "appts" && modal.init) await api.put(`/api/appointments/${modal.init.id}`, x);
      else if (["appts", "owners", "pets"].includes(ent) && !modal.init) {
        const result = await api.post(`/api/${ent === "appts" ? "appointments" : ent}`, ent === "owners" ? { ...x, id: undefined } : x);
        const saved = result.appointment || result.owner || result.pet;
        if (!saved?.id) throw new Error("The server did not confirm the record.");
        x.id = saved.id;
        if (ent === "appts") x.status = "Pending Approval";
      } else return deny("Use the clinical or account workflow for this action.");
    } catch (error) { say(error.message); return; }
    setDb(p => {
      let l = p[ent];
      if (modal.init) l = l.map(r => r.id === modal.init.id ? { ...r, ...x } : r);
      else l = [...l, x];
      return { ...p, [ent]: l, log: addLog(p, me, `${modal.init ? "Updated" : "Added"} ${c.one}${x.petId ? " for " + petName(p, x.petId) : ""}`) };
    });
    say(`${modal.init ? "Updated" : "Added"} ${c.one}`); setModal(null);
  };

  const move = async (a, s) => {
    if (s === "WRITE") return setModal({ consult: a });
    if (s === 'Cancelled') {setActionError('');setCancelling(a);return;}
    if (s === 'No-show' && !await statusReview.ask({title:'Review missed visit',confirmLabel:'Mark no-show',description:'Confirm that this patient did not arrive for the saved visit.',fields:[['Patient',petName(db,a.petId)],['Visit',`${a.date} ${a.time}`]]}))return;
    if (!await moveAppt(setDb, a.id, s, me, say, approvalVisit(db,a))) return;
    say(s === "In consultation" ? "Consultation started" : `${LABEL[s]} done`);
    if (s === "In consultation") setModal({ consult: a });
  };

  const saveConsult = () => deny("Open an assigned visit in the Clinical Desk to finalize its consultation.");
  const del = () => deny("Deletion is unavailable. Use the authorized cancellation or correction workflow.");

  // Helper for action icon
  const getAddIcon = () => {
    if (ent === "owners") return <UserPlus size={16} />;
    if (ent === "pets") return <PawPrint size={16} />;
    if (ent === "appts") return <CalendarPlus size={16} />;
    return <Plus size={16} />;
  };

  return (
    <>
      {statusReview.card}
      {cancelling && <CancellationDialog visit={cancelling} currentVisit={db.appts.find(a=>a.id===cancelling.id)} error={actionError} onClose={()=>setCancelling(null)}
        onSubmit={async cancelReason=>{if(await moveAppt(setDb,cancelling.id,'Cancelled',me,setActionError,cancelling,{cancelReason})) {setCancelling(null);say('Appointment cancelled');}}} />}
      {/* Modernized Search & Action Toolbar */}
      <div style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: "16px",
        marginBottom: "18px",
        flexWrap: "wrap",
        background: "#ffffff",
        padding: "12px 18px",
        borderRadius: "14px",
        border: "1px solid #e2e8f0",
        boxShadow: "0 1px 3px rgba(0,0,0,0.03)"
      }}>
        <div style={{ position: "relative", flex: "1 1 300px", maxWidth: "420px" }}>
          <Search size={17} style={{ position: "absolute", left: "14px", top: "50%", transform: "translateY(-50%)", color: "#94a3b8", pointerEvents: "none" }} />
          <input
            type="search"
            placeholder={`Search ${c.title.toLowerCase()}...`}
            value={q}
            onChange={e => setQ(e.target.value)}
            aria-label="Search"
            style={{
              width: "100%",
              padding: "10px 14px 10px 42px",
              borderRadius: "10px",
              border: "1px solid #cbd5e1",
              fontSize: "calc(14px * var(--fs, 1))",
              background: "#f8fafc",
              outline: "none",
              color: "#1e293b",
              boxSizing: "border-box"
            }}
          />
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          {can(ent, me, "c") && (
            <button
              className="btn gold"
              onClick={() => {
                if (["owners", "pets"].includes(ent) && me.role === "assistant") {
                  setModal({ walkIn: true });
                } else {
                  setModal({});
                }
              }}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "8px",
                padding: "10px 20px",
                borderRadius: "10px",
                fontWeight: 600,
                fontSize: "calc(14px * var(--fs, 1))",
                boxShadow: "0 2px 4px rgba(245, 158, 11, 0.25)",
                whiteSpace: "nowrap",
                cursor: "pointer"
              }}
            >
              {getAddIcon()}
              <span>Add {c.one}</span>
            </button>
          )}
        </div>
      </div>

      <Table
        db={db}
        ent={ent}
        list={list}
        acts
        me={me}
        onEdit={x => setModal({ init: x })}
        onDel={x => setModal({ del: x })}
        onMove={ent === "appts" ? move : null}
        onView={x => setModal({ viewOwner: x })}
      />

      {/* In-Clinic Walk-in Registration (Assistant Mode) */}
      {modal && modal.walkIn && (
        <InClinicRegistration
          db={db}
          setDb={setDb}
          me={me}
          onClose={() => setModal(null)}
          onRegistered={(pet, owner) => {
            say(`Successfully registered ${owner.name} & patient ${pet.name}!`);
            setModal(null);
          }}
        />
      )}

      {/* View Owner Details Modal */}
      {modal && modal.viewOwner && (
        <ViewOwnerModal
          owner={modal.viewOwner}
          db={db}
          onClose={() => setModal(null)}
        />
      )}

      {/* Standard Form Modal (for other entities or Admin) */}
      {modal && !modal.del && !modal.consult && !modal.walkIn && !modal.viewOwner && (
        <FormModal
          ent={ent}
          init={modal.init}
          db={db}
          me={me}
          onSave={save}
          onClose={() => setModal(null)}
        />
      )}

      {/* Consultation Modal */}
      {modal && modal.consult && (
        me.role === "vet" ? (
          <SoapConsultationModal
            appt={modal.consult}
            pet={db.pets.find(p => p.id === modal.consult.petId) || { id: modal.consult.petId, name: petName(db, modal.consult.petId) }}
            db={db}
            setDb={setDb}
            me={me}
            onClose={() => setModal(null)}
            onSaved={() => { say("SOAP Consultation saved. Visit completed."); setModal(null); }}
          />
        ) : (
          <FormModal ent="records" init={{ petId: modal.consult.petId, date: TODAY }} db={db} me={me} onSave={saveConsult} onClose={() => setModal(null)} />
        )
      )}

      {/* Delete Confirmation Modal */}
      {modal && modal.del && (
        <div className="scrim">
          <div className="modal">
            <h3>Delete this {c.one}?</h3>
            <p>
              {ent === "owners"
                ? "This also removes their pets and all linked records."
                : ent === "pets"
                ? "This also removes its appointments, vaccines and consultations."
                : "This can’t be undone."}
            </p>
            <div className="row end">
              <button className="btn ghost" onClick={() => setModal(null)}>Keep it</button>
              <button className="btn danger" onClick={() => del(modal.del)}>Delete</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

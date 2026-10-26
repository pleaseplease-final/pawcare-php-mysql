import {ExternalHistorySummary} from '../components/ExternalHistory.jsx';
import DigitalVetCard from './DigitalVetCard.jsx';
import VitalsHistory from './VitalsHistory.jsx';
import { approvalVisit } from "../appointmentStatus.js";
import {currentAppointmentsByPet,money} from '../assistantWorkflow.js';
import {ownerBill} from '../ownerBilling.js';
import VisitNextStep from '../components/VisitNextStep.jsx';
import ClinicDialog from "../components/ClinicDialog.jsx";
import PetPortrait from "./PetPortrait.jsx";
import { today as bookingToday } from "../booking.js";
import ExistingPatientCheckInModal from "./ExistingPatientCheckInModal.jsx";
import { canBookAppointments } from "../appointmentPermissions.js";
import { useState } from "react";
import { PawPrint, Calendar, CheckCircle2, Clock, CreditCard, Receipt, X } from "lucide-react";
import { Badge, TODAY, ICON, I, moveAppt } from "../lib.jsx";
import {usePetPhoto} from "../components/usePetPhoto.jsx";



export default function PetCardModal({ petId, appt, db, setDb, me, onClose, onBook, onCheckIn, onBill }) {
  const [section,setSection]=useState('card');
  const [walkIn, setWalkIn] = useState(false);
  const [actionError, setActionError] = useState("");
  const p = (db.pets || []).find(x => x.id === petId) || {};
  const o = (db.owners || []).find(x => x.id === p.ownerId) || {};
  const {fileInputRef,photoFlight,photoBusy,photoError,photoStatus,savePhoto,handlePhotoFileChange}=usePetPhoto(petId,setDb);
  const close = () => { if (!photoFlight.current) onClose(); };

  if (!p.id) return null;
  if (walkIn) return <ExistingPatientCheckInModal db={db} setDb={setDb} me={me} initialPetId={p.id} onClose={() => setWalkIn(false)} onCheckIn={visit => { onClose(); onCheckIn?.(visit); }} />;

  const activeAppt = appt ? (db.appts || []).find(a => a.id === appt.id && a.petId === p.id) : currentAppointmentsByPet(db.appts || [],bookingToday())[p.id];
  const bill=activeAppt?ownerBill(activeAppt):null;

  return (
    <ClinicDialog label="Patient vaccination card" onClose={close} style={{padding:16}}>
      <div className="modal staff-pet-card" style={{ width: "min(880px, 100%)", maxHeight: "92vh", overflowY: "auto", padding: "20px 24px" }}>
        
        {photoError && <p className="err" role="alert">{photoError}</p>}
        <p role="status" aria-live="polite">{photoBusy ? "Saving pet photo…" : photoStatus}</p>
        <fieldset disabled={photoBusy} style={{border:0,padding:0,margin:0,minWidth:0}}>
        {actionError && <p className="err" role="alert">{actionError}</p>}
        {/* Top Control Bar */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "10px", marginBottom: "16px" }}>
          <div className="staff-pet-controls" style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <PawPrint size={22} color="var(--navy)" />
            <h3 style={{ margin: 0, color: "var(--navy)", fontSize: "1.25rem" }}>
              {p.name}&rsquo;s Vaccination Card
            </h3>
            <span style={{ background: "#dcfce7", color: "#166534", fontSize: "calc(11px * var(--fs, 1))", fontWeight: 700, padding: "2px 8px", borderRadius: "99px" }}>
              Patient record
            </span>
          </div>

          <div className="staff-pet-controls" style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <button
              type="button"
              className="btn sm ghost"
              onClick={close}
              aria-label="Close" style={{ padding: "6px 10px" }}
            >
              <X size={16} aria-hidden="true" />
            </button>
          </div>
        </div>

        {/* Appointment & Clinical Visit Actions Bar (shows when opened for an appointment) */}
        {section==='clinical' && activeAppt && (
          <div style={{
            background: "linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%)",
            border: "1.5px solid #cbd5e1",
            borderRadius: "14px",
            padding: "12px 18px",
            marginBottom: "16px",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            flexWrap: "wrap",
            gap: "12px"
          }}>
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
                <span style={{ fontSize: "calc(13.5px * var(--fs, 1))", fontWeight: 700, color: "var(--navy)", display: "flex", alignItems: "center", gap: "4px" }}>
                  <Calendar size={15} /> Visit: {activeAppt.date} at {activeAppt.time}
                </span>
                <Badge v={activeAppt.status} />
                {activeAppt.billingStatus === "Paid" ? (
                  <span style={{ background: "#dcfce7", color: "#166534", fontSize: "calc(11.5px * var(--fs, 1))", fontWeight: 700, padding: "2px 8px", borderRadius: "6px" }}>
                    Paid · {bill.amount===null?'Amount not recorded':money(bill.amount)}
                  </span>
                ) : activeAppt.status === "Completed" ? (
                  <span style={{ background: "#fef3c7", color: "#92400e", fontSize: "calc(11.5px * var(--fs, 1))", fontWeight: 700, padding: "2px 8px", borderRadius: "6px" }}>
                    {bill.status}{bill.amount!==null?` · Draft ${money(bill.amount)}`:''}
                  </span>
                ) : null}
              </div>
              <div style={{ fontSize: "calc(12.5px * var(--fs, 1))", color: "#475569", marginTop: "3px" }}>
                <b>Reason:</b> {activeAppt.reason || "General Consultation"} &bull; <b>Veterinarian:</b> {(db.vets || []).find(v => v.id === activeAppt.vetId)?.name || "Veterinarian not recorded"}
              </div>
              <VisitNextStep visit={activeAppt}/>
            </div>

            <div style={{ display: "flex", gap: "8px", alignItems: "center", flexWrap: "wrap" }}>
              {/* If booked for TODAY */}
              {activeAppt.date === bookingToday() && (
                <>
                  {activeAppt.status === "Pending Approval" && me?.role === "assistant" && (
                    <button
                      type="button"
                      className="btn sm"
                      onClick={() => {
                        moveAppt(setDb, activeAppt.id, "Scheduled", me, setActionError, approvalVisit(db,activeAppt));
                      }}
                      style={{ fontWeight: 600 }}
                    >
                      Approve appointment
                    </button>
                  )}

                  {activeAppt.status === "Scheduled" && onCheckIn && ["assistant","vet"].includes(me?.role) && (
                    <button
                      type="button"
                      className="btn sm gold"
                      onClick={() => {
                        onClose();
                        onCheckIn(activeAppt);
                      }}
                      style={{ fontWeight: 700 }}
                      title="Record patient intake vitals and triage"
                    >
                      Check in &amp; Record Vitals
                    </button>
                  )}

                  {["Checked-in","In consultation"].includes(activeAppt.status) && onCheckIn && ["assistant","vet"].includes(me?.role) && (
                    <button
                      type="button"
                      className="btn sm ghost"
                      onClick={() => {
                        onClose();
                        onCheckIn(activeAppt);
                      }}
                      title="Adjust recorded intake vitals"
                    >
                      Record another measurement
                    </button>
                  )}
                </>
              )}

              {/* A different clinic day requires rescheduling before initial arrival. */}
              {activeAppt.date !== bookingToday() && (
                <>
                  {activeAppt.status === "Pending Approval" && me?.role === "assistant" && (
                    <button
                      type="button"
                      className="btn sm"
                      onClick={() => {
                        moveAppt(setDb, activeAppt.id, "Scheduled", me, setActionError, approvalVisit(db,activeAppt));
                      }}
                      style={{ fontWeight: 600 }}
                    >
                      Approve request ({activeAppt.date})
                    </button>
                  )}

                  {activeAppt.status === "Scheduled" && ["assistant","vet"].includes(me?.role) && (
                    <span role="status" style={{fontSize:"calc(12px * var(--fs, 1))",color:"#92400e"}}>
                      Check-in is only available on {activeAppt.date}. Use Manage appointment in the calendar to reschedule first.
                    </span>
                  )}
                  {["Checked-in","In consultation"].includes(activeAppt.status) && onCheckIn && ["assistant","vet"].includes(me?.role) && (
                    <button type="button" className="btn sm ghost" onClick={() => { onClose(); onCheckIn?.(activeAppt); }}>Record another measurement</button>
                  )}
                </>
              )}

              {/* Bill / Pay: strictly ONLY when appointment is Completed, or if Paid show Invoice */}
              {onBill && activeAppt.status === "Completed" && (activeAppt.billingStatus === "Paid" || me?.role === "assistant" && activeAppt.admissionStatus!=='Admitted') && (
                <button
                  type="button"
                  className={`btn sm ${activeAppt.billingStatus === "Paid" ? "ghost" : "gold"}`}
                  onClick={() => {
                    onClose();
                    onBill && onBill(activeAppt);
                  }}
                  style={{ fontWeight: 700, display: "inline-flex", alignItems: "center", gap: "6px" }}
                  title={bill.paid?'View the paid invoice':'Review saved invoice items and record payment'}
                >
                  <Receipt size={15} />
                  <span>{activeAppt.billingStatus === "Paid" ? "View Paid Invoice" : "Settle Bill / Checkout"}</span>
                </button>
              )}
            </div>
          </div>
        )}

        {/* If no appointment exists for this pet */}
        {section==='clinical' && !activeAppt && me?.role === "assistant" && (
          <div style={{
            background: "#f8fafc",
            border: "1px dashed #cbd5e1",
            borderRadius: "14px",
            padding: "10px 16px",
            marginBottom: "16px",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            flexWrap: "wrap",
            gap: "10px"
          }}>
            <span style={{ fontSize: "calc(12.5px * var(--fs, 1))", color: "#64748b" }}>
              Patient has no active appointment on record today.
            </span>
            <div className="staff-pet-controls" style={{ display: "flex", gap: "8px" }}>
              <button
                type="button"
                className="btn sm ghost"
                onClick={() => {
                  onClose();
                  onBook && onBook();
                }}
              >
                + Schedule Future Visit
              </button>
              <button
                type="button"
                className="btn sm gold"
                onClick={() => setWalkIn(true)}
                disabled={!onCheckIn}
                style={{ fontWeight: 700 }}
              >
                Check in as Today&rsquo;s Walk-in
              </button>
            </div>
          </div>
        )}

        <div className="row" role="group" aria-label="Patient record sections">
          <button className={`btn sm ${section==='card'?'gold':'ghost'}`} aria-pressed={section==='card'} onClick={()=>setSection('card')}>Vaccination card</button>
          <button className={`btn sm ${section==='clinical'?'gold':'ghost'}`} aria-pressed={section==='clinical'} onClick={()=>setSection('clinical')}>Clinical history</button>
        </div>
        {section==='card'?<DigitalVetCard key={p.id} petId={p.id} portrait={<PetPortrait pet={p} inputRef={fileInputRef} onChange={handlePhotoFileChange} onRemove={() => savePhoto()} />} refreshKey={`${activeAppt?.billingStatus || ''}-${activeAppt?.status || ''}`} />:<>
          <ExternalHistorySummary patient={p}/><VitalsHistory petId={p.id} me={me} refreshKey={activeAppt?.intakeVitals}/>
        </>}

        {/* Action row */}
        <div className="staff-pet-controls" style={{ display: "flex", justifyContent: "flex-end", gap: "10px", marginTop: "16px" }}>
          {onBook && canBookAppointments(me?.role) && (
            <button className="btn gold sm" onClick={() => { onClose(); onBook(p.id); }}>
              + Book Visit for {p.name}
            </button>
          )}
          <button className="btn ghost sm" onClick={close}>
            Close
          </button>
        </div>

        </fieldset>
      </div>
    </ClinicDialog>
  );
}

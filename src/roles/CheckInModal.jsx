import ClinicDialog from '../components/ClinicDialog.jsx';
import AllergyEditor from '../components/AllergyEditor.jsx';
import {useUnsavedChanges} from '../components/useUnsavedChanges.jsx';
import {visitFormType} from '../visitForm.js';
import { useFormValidation } from '../components/useFormValidation.jsx';
import { intakeErrors } from '../formValidation.js';
import { vaccineIdFromReason, vaccineReason } from '../vaccineBooking.js';
import { VaccineEstimate, VaccinePicker } from "../components/VaccineBooking.jsx";
import { useSubmissionReview } from "../components/SubmissionReview.jsx";
import { useEffect, useRef, useState } from "react";
import {
  Thermometer,
  Scale,
  AlertTriangle,
  AlertCircle,
  CheckCircle2,
  Flame,
  Snowflake,
  Check,
  Dog,
  Cat,
  Rabbit,
  Bird,
  PawPrint,
  X,
  ShieldAlert,
  ShieldCheck,
} from "lucide-react";
import { addLog, ICON, petName, ownerName, I } from "../lib.jsx";
import { assessWeight, assessTemp, SPECIES_DEFAULTS } from "./vitals.js";
import { normalizeSpecies } from "../preventiveSchedule.js";
import { today, nowHM } from "../booking.js";
import { intakeFieldsError, checkInDateError, intakeVisitSnapshot, sameIntakeVisit, savedIntakeVisit } from "../intakeVisit.js";
import { api } from "../api.js";

export default function CheckInModal({ appt, db, setDb, me, onClose, onCheckedIn }) {
  const baseline = useRef(intakeVisitSnapshot(appt));
  const currentVisit = (db.appts || []).find(a => a.id === appt?.id);
  const [conflict, setConflict] = useState(false);
  const stale = conflict || !currentVisit || !sameIntakeVisit(baseline.current, currentVisit)
    || !sameIntakeVisit(baseline.current, appt) || !["Scheduled", "Checked-in","In consultation"].includes(currentVisit.status);
  const pet = (db.pets && appt ? db.pets.find(p => p.id === appt.petId) : null) || {};
  const owner = (db.owners && pet.ownerId ? db.owners.find(o => o.id === pet.ownerId) : null) || {};

  const species = normalizeSpecies(pet.species);
  const speciesConfig = SPECIES_DEFAULTS[species] || SPECIES_DEFAULTS.Other;
  const lastWeight=pet.weightOrigin==='clinic'?pet.weight:[...(pet.weights || [])].reverse().find(w=>w.origin==='clinic')?.kg;

  const [TODAY, setToday] = useState(today);
  useEffect(() => {
    const timer = setInterval(() => setToday(today()), 30000);
    return () => clearInterval(timer);
  }, []);
  const dateError = checkInDateError(appt, TODAY);
  const saved = ["Checked-in","In consultation"].includes(appt?.status) ? appt.intakeVitals : null;
  const inFlight = useRef(false);
  const [weight, setWeight] = useState(saved?.weight ?? "");
  const [temp, setTemp] = useState(saved?.temp ?? "");
  const [triageChoice, setTriageChoice] = useState(saved?.triageLevel || null);
  const [serviceReason, setServiceReason] = useState(appt?.reason || "Routine Consultation & Exam");
  const [notes, setNotes] = useState(saved?.notes || "");
  const [fasted, setFasted] = useState(saved?.fasted ?? false);
  const [saving, setSaving] = useState(false);
  const [valErr, setValErr] = useState("");

  const externalVaccs = (db.vacc || db.vaccs || []).filter(v => 
    v.petId === pet.id && (v.recorded_by?.includes("External") || v.brand?.includes("External") || v.protocol_type?.includes("External") || v.protocolType?.includes("External"))
  );

  const weightAnalysis = assessWeight(weight, species, pet.breed || "", lastWeight);
  const tempAnalysis = assessTemp(temp, species);
  // Triage follows the measured temperature and an emergency reason until staff choose otherwise.
  const suggestedTriage = /emergency|critical/i.test(serviceReason) || tempAnalysis?.status === "high_fever" ? "Emergency"
    : ["mild_fever", "hypothermia"].includes(tempAnalysis?.status) ? "Priority" : "Routine";
  const triage = triageChoice || suggestedTriage;
  const setTriage = setTriageChoice;
  const unsaved=useUnsavedChanges({value:{weight,temp,triage,serviceReason,notes,fasted},saving,onClose});

  const handleStepWeight = (delta) => {
    const cur = parseFloat(weight);
    if (!Number.isFinite(cur)) return;
    const next = Math.max(0.05, +(cur + delta).toFixed(1));
    validation.changed('weight');setWeight(String(next));
  };

  const handleStepTemp = (delta) => {
    const cur = parseFloat(temp);
    if (!Number.isFinite(cur)) return;
    const next = +(cur + delta).toFixed(1);
    validation.changed('temp');setTemp(String(next));
  };

  const formType=visitFormType(appt);
  const surgeryVisit=appt?.service==='surgery' || /surg|dental/i.test(serviceReason);
  const reasonPresets=appt?.service==='surgery'?['Surgical assessment','Dental assessment','Surgery – Follow-up']:formType==='consultation'?['Routine Consultation & Exam','Vomiting / Diarrhea','Skin / Allergy Concern','Emergency / Critical']:formType==='deworming'?['Routine Deworming','Deworming Follow-up']:['Grooming & Sanitary','Nail Trim / Ear Cleaning'];

  const review = useSubmissionReview([weight,temp,triage,serviceReason,notes,fasted,currentVisit,pet,owner,stale,TODAY]);

  const validation = useFormValidation(intakeErrors({weight,temp,reason:serviceReason,notes}));

  const submit = async (e) => {
    e.preventDefault();
    if (inFlight.current) return;
    if (!validation.validate(e)) return;
    if (stale || !pet.id || !owner.id) {
      setValErr("This visit or patient record has changed. Close this form, refresh clinic records and reopen intake.");
      return;
    }
    const currentDateError = checkInDateError(appt, today());
    if (currentDateError) { setValErr(currentDateError); return; }
    const w = parseFloat(weight);
    const t = parseFloat(temp);

    if (isNaN(w) || w < 0.05 || w > 120) {
      setValErr("Please enter a valid patient weight between 0.05 kg and 120 kg.");
      return;
    }
    if (isNaN(t) || t < 33 || t > 45) {
      setValErr("Please enter a valid body temperature between 33°C and 45°C.");
      return;
    }
    const fieldError = intakeFieldsError({weight:w,temp:t,triageLevel:triage,fasted:surgeryVisit && fasted,notes}, serviceReason.trim() || appt.reason);
    if (fieldError) { setValErr(fieldError); return; }
    setValErr("");

    if (!await review.ask({title:"Review measured intake",confirmLabel:"Save measured vitals",
      description:"Check the measured values and triage before saving. Earlier measurements stay in the history. An active consultation remains in consultation.",
      fields:[
        ["Patient / owner",`${pet.name} / ${owner.name}`],
        ["Veterinarian",db.vets?.find(v=>v.id===appt.vetId)?.name],
        ["Visit date",appt.date],
        ["Weight",`${w} kg`],
        ["Temperature",`${t}°C`],
        ["Triage",triage],
        ["Reason",serviceReason.trim() || appt.reason],
        ...(surgeryVisit ? [["Fasted",fasted ? "Yes" : "No"]] : []),
        ["Intake notes",notes.trim()]]
    })) return;
    const confirmedDateError = checkInDateError(appt, today());
    if (confirmedDateError) { setToday(today()); setValErr(confirmedDateError); return; }
    const arrivalTime = nowHM();
    const intakeVitals = {
      weight: !isNaN(w) ? w : null,
      temp: !isNaN(t) ? t : null,
      weightAnalysis,
      tempAnalysis,
      triageLevel: triage,
      notes: (notes || "").trim(),
      fasted: surgeryVisit && fasted,
      checkedInAt: arrivalTime,
      checkedInBy: me?.name || "Assistant",
    };

    const patchPayload = {
      status: appt.status==='In consultation'?'In consultation':'Checked-in',
      expectedVisit: baseline.current,
      reason: serviceReason.trim() || appt.reason,
      intakeVitals,
      actorName: me?.name || "Assistant",
      actorRole: me?.role || "assistant"
    };

    inFlight.current = true;
    setSaving(true);
    // Use only the acknowledged server record for the local handoff.
    let savedVisit;
    try {
      const response = await api.patch(`/api/appointments/${appt.id}/status`, patchPayload);
      try { savedVisit = savedIntakeVisit(response, baseline.current); }
      catch (error) { setConflict(true); throw error; }
    } catch (err) {
      setValErr(err.message);
      if (err.status === 409) setConflict(true);
      inFlight.current = false;
      setSaving(false);
      return;
    }

    setDb(p => {
      // 1. Update appointment status & intake data
      const nextAppts = p.appts.map(a =>
        a.id === appt.id
          ? {
              ...a,
              ...savedVisit,
            }
          : a
      );

      // 2. Automatically log pet weight for today
      let nextPets = p.pets;
      if (!isNaN(w) && w > 0) {
        nextPets = p.pets.map(x =>
          x.id === pet.id
            ? {
                ...x,
                weight: savedVisit.intakeVitals.weight,
                weightOrigin:"clinic",
                weights: [...(x.weights || []), {id:savedVisit.intakeVitals.measurementIds?.weight,date:today(),kg:savedVisit.intakeVitals.weight,by:savedVisit.intakeVitals.checkedInBy,origin:"clinic",visitId:savedVisit.id,measuredAt:savedVisit.intakeVitals.measuredAt,unit:"kg"}],
              }
            : x
        );
      }

      const alertNotes = [
        tempAnalysis?.alert ? `Temp: ${tempAnalysis.flag} (${t}°C)` : null,
        weightAnalysis?.status !== "ideal" ? `Weight: ${weightAnalysis?.label}` : null,
        triage !== "Routine" ? `Triage: ${triage}` : null,
      ]
        .filter(Boolean)
        .join("; ");

      return {
        ...p,
        appts: nextAppts,
        pets: nextPets,
        log: addLog(
          p,
          me,
          `Recorded clinic intake for ${pet.name} (${owner.name}). Vitals: ${w} kg (${weightAnalysis?.status || "recorded"}), ${t}°C (${tempAnalysis?.status || "recorded"}). ${alertNotes ? `[${alertNotes}]` : ""} ${savedVisit.status === "In consultation" ? "Consultation continues." : "Patient is in the doctor queue."}`
        ),
      };
    });

    setSaving(false);
    onCheckedIn && onCheckedIn(savedVisit.intakeVitals);
  };

  return (
    <ClinicDialog label="Patient check-in and measured vitals" onClose={unsaved.close}>
      {unsaved.card}
      <div className="modal" style={{ width: "min(640px, 100%)", maxHeight: "94vh" }}>
        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", borderBottom: "1px solid #e2e8f0", paddingBottom: "12px", marginBottom: "14px" }}>
          <div>
            <h3 style={{ margin: "0 0 4px", fontSize: "calc(19px * var(--fs, 1))", display: "flex", alignItems: "center", gap: "8px" }}>
              <span style={{ color: "var(--navy)" }}><I e={ICON[species] || "paw"} size={22} /></span>
              <span>Patient Check-In &amp; Measured Vitals</span>
            </h3>
            <p style={{ margin: 0, fontSize: "calc(13px * var(--fs, 1))", color: "#64748b" }}>
              <b>Patient:</b> {pet.name || "Patient"} ({pet.breed || species}) &bull; <b>Owner:</b> {owner.name || "—"} ({owner.phone || "—"})
            </p>
          </div>
          <button className="btn ghost sm" onClick={unsaved.close} disabled={saving}><X size={16} /></button>
        </div>

        <p>Earlier measurements are retained. Recording new vitals keeps an active consultation in progress.</p>
        {stale && <p className="err" role="alert">This visit or its saved intake has changed. Close this form, refresh clinic records and reopen intake.</p>}

        {/* Allergy Alert if any */}
        {pet.allergies && pet.allergies.length > 0 && (
          <div style={{ background: "#fef2f2", border: "1px solid #fecaca", padding: "8px 12px", borderRadius: "8px", marginBottom: "14px", display: "flex", alignItems: "center", gap: "8px" }}>
            <AlertTriangle size={18} color="#dc2626" />
            <b style={{ color: "#991b1b", fontSize: "calc(13px * var(--fs, 1))" }}>Known Allergies:</b>
            <span style={{ color: "#dc2626", fontSize: "calc(13px * var(--fs, 1))" }}>{pet.allergies.join(", ")}</span>
          </div>
        )}

        {pet.id && <AllergyEditor key={pet.id + (pet.allergies || []).join("|")} pet={pet} setDb={setDb} />}

        {dateError && <p className="err" role="alert">{dateError}</p>}

        <form {...validation.formProps} onSubmit={submit}>
          {review.card}
          <div style={{ display: "grid", gap: "14px" }}>
            {/* 1. Automated Kilogram / Weight Section */}
            <div style={{ background: "#f8fafc", padding: "14px", borderRadius: "12px", border: "1px solid #e2e8f0" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
                <b style={{ color: "var(--navy)", fontSize: "calc(14px * var(--fs, 1))" }}>1. Measured weight</b>
                {lastWeight && (
                  <span style={{ fontSize: "calc(12px * var(--fs, 1))", color: "#64748b" }}>
                    Last clinic measurement: <b>{lastWeight} kg</b>
                  </span>
                )}
              </div>

              <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
                <div style={{ flex: "1" }}>
                  <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "6px" }}>
                    <input
                      type="number"
                      step="0.01"
                      min="0.05"
                      max="120"
                      aria-label="Measured weight (kg)"
                      {...validation.field('weight')} value={weight}
                      className={validation.errors.weight ? 'bad' : ''}
                      onChange={e => { setWeight(e.target.value); setValErr(""); }}
                      style={{ fontSize: "calc(18px * var(--fs, 1))", fontWeight: "700", padding: "8px 12px", width: "120px" }}
                    />
                    <span style={{ fontWeight: "700", color: "#475569" }}>kg</span>
                    <button type="button" className="btn ghost sm" disabled={!Number.isFinite(parseFloat(weight))} onClick={() => handleStepWeight(-0.5)}>-0.5</button>
                    <button type="button" className="btn ghost sm" disabled={!Number.isFinite(parseFloat(weight))} onClick={() => handleStepWeight(-0.1)}>-0.1</button>
                    <button type="button" className="btn ghost sm" disabled={!Number.isFinite(parseFloat(weight))} onClick={() => handleStepWeight(+0.1)}>+0.1</button>
                    <button type="button" className="btn ghost sm" disabled={!Number.isFinite(parseFloat(weight))} onClick={() => handleStepWeight(+0.5)}>+0.5</button>
                  </div>
                  {validation.feedback('weight')}
                </div>

                {weightAnalysis && (
                  <div style={{ textAlign: "right" }}>
                    <span
                      style={{
                        display: "inline-block",
                        padding: "4px 10px",
                        borderRadius: "99px",
                        fontSize: "calc(12px * var(--fs, 1))",
                        fontWeight: "700",
                        background: weightAnalysis.color + "22",
                        color: weightAnalysis.color,
                        border: `1px solid ${weightAnalysis.color}`,
                      }}
                    >
                      {weightAnalysis.label}
                    </span>
                  </div>
                )}
              </div>

              {/* Automated Feedback */}
              {weightAnalysis && (
                <div style={{ marginTop: "10px", fontSize: "calc(12.5px * var(--fs, 1))", color: "#475569" }}>
                  <div style={{ display: "flex", justifyContent: "space-between" }}>
                    <span>Ideal Range for {pet.breed || pet.species}: <b>{weightAnalysis.idealRange}</b></span>
                    {weightAnalysis.trend && <b style={{ color: "#0369a1" }}>{weightAnalysis.trend}</b>}
                  </div>
                  {weightAnalysis.warning && (
                    <div style={{ marginTop: "4px", color: weightAnalysis.color, fontWeight: "600", display: "flex", alignItems: "center", gap: "5px" }}>
                      <AlertTriangle size={14} /> {weightAnalysis.warning}
                    </div>
                  )}
                </div>
              )}

            </div>

            {/* 2. Automated Body Temperature Section */}
            <div style={{ background: "#f8fafc", padding: "14px", borderRadius: "12px", border: "1px solid #e2e8f0" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
                <b style={{ color: "var(--navy)", fontSize: "calc(14px * var(--fs, 1))" }}>2. Measured temperature</b>
                <span style={{ fontSize: "calc(12px * var(--fs, 1))", color: "#64748b" }}>
                  Normal {pet.species}: <b>{speciesConfig.tempMin} – {speciesConfig.tempMax}°C</b>
                </span>
              </div>

              <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
                <div style={{ flex: "1" }}>
                  <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "6px" }}>
                    <input
                      type="number"
                      step="0.1"
                      min="33"
                      max="45"
                      aria-label="Measured temperature (°C)"
                      {...validation.field('temp')} value={temp}
                      className={validation.errors.temp ? 'bad' : ''}
                      onChange={e => { setTemp(e.target.value); setValErr(""); }}
                      style={{ fontSize: "calc(18px * var(--fs, 1))", fontWeight: "700", padding: "8px 12px", width: "120px" }}
                    />
                    <span style={{ fontWeight: "700", color: "#475569" }}>°C</span>
                    <button type="button" className="btn ghost sm" disabled={!Number.isFinite(parseFloat(temp))} onClick={() => handleStepTemp(-0.2)}>-0.2</button>
                    <button type="button" className="btn ghost sm" disabled={!Number.isFinite(parseFloat(temp))} onClick={() => handleStepTemp(+0.2)}>+0.2</button>
                  </div>
                  {validation.feedback('temp')}
                </div>

                {tempAnalysis && (
                  <div style={{ textAlign: "right" }}>
                    <span
                      style={{
                        display: "inline-block",
                        padding: "4px 10px",
                        borderRadius: "99px",
                        fontSize: "calc(12px * var(--fs, 1))",
                        fontWeight: "700",
                        background: tempAnalysis.color + "22",
                        color: tempAnalysis.color,
                        border: `1px solid ${tempAnalysis.color}`,
                      }}
                    >
                      {tempAnalysis.flag}
                    </span>
                  </div>
                )}
              </div>

              {/* Automated Temperature Warning Banners */}
              {tempAnalysis && (
                <div style={{ marginTop: "10px", fontSize: "calc(12.5px * var(--fs, 1))" }}>
                  {tempAnalysis.status === "high_fever" ? (
                    <div style={{ padding: "8px 12px", background: "#fef2f2", border: "1px solid #f87171", borderRadius: "8px", color: "#991b1b", fontWeight: "700", display: "flex", alignItems: "center", gap: "8px" }}>
                      <Flame size={16} color="#dc2626" />
                      <span>HIGH FEVER DETECTED ({temp}°C)! This patient will be flagged with critical priority in Dr. Queue.</span>
                    </div>
                  ) : tempAnalysis.status === "mild_fever" ? (
                    <div style={{ padding: "8px 12px", background: "#fffbeb", border: "1px solid #fde047", borderRadius: "8px", color: "#854d0e", fontWeight: "600", display: "flex", alignItems: "center", gap: "8px" }}>
                      <AlertTriangle size={16} color="#ea580c" />
                      <span>Mild Pyrexia / Elevated Temperature ({temp}°C). Normal range is {speciesConfig.tempMin}–{speciesConfig.tempMax}°C.</span>
                    </div>
                  ) : tempAnalysis.status === "hypothermia" ? (
                    <div style={{ padding: "8px 12px", background: "#eff6ff", border: "1px solid #93c5fd", borderRadius: "8px", color: "#1e40af", fontWeight: "700", display: "flex", alignItems: "center", gap: "8px" }}>
                      <Snowflake size={16} color="#2563eb" />
                      <span>Subnormal Temperature / Hypothermia Warning ({temp}°C). Provide thermal blanket.</span>
                    </div>
                  ) : (
                    <div style={{ color: "#16a34a", fontWeight: "600", display: "flex", flexWrap: "wrap", alignItems: "center", gap: "6px" }}>
                      <CheckCircle2 size={16} color="#16a34a" />
                      <span>{tempAnalysis.advice}</span>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Visit Purpose Confirmation & External Guide Indicator */}
            <div style={{ background: "#f8fafc", border: "1px solid #e2e8f0", padding: "12px 14px", borderRadius: "10px", marginBottom: "14px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "6px" }}>
                <label style={{ fontSize: "calc(12.5px * var(--fs, 1))", fontWeight: 700, color: "var(--navy)", margin: 0 }}>
                  Confirmed Reason / Purpose for Today&rsquo;s Visit
                </label>
                {externalVaccs.length > 0 && (
                  <span style={{ fontSize: "calc(11px * var(--fs, 1))", background: "#fef3c7", color: "#92400e", border: "1px solid #fde68a", padding: "2px 7px", borderRadius: "6px", fontWeight: 700 }} title="Has prior records from outside clinic">
                    {externalVaccs.length} External Dose(s) on File
                  </span>
                )}
              </div>

              {formType === 'vaccination' && <VaccinePicker id="intake-vaccine" species={pet.species} value={vaccineIdFromReason(serviceReason)} onChange={id=>{validation.changed('reason');setServiceReason(vaccineReason(id));}} />}
              {formType !== 'vaccination' && <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", marginBottom: "8px" }}>
                {reasonPresets.map(preset => (
                  <button
                    key={preset}
                    type="button"
                    onClick={() => {
                      validation.changed('reason');setServiceReason(preset);
                      if (preset.includes("Emergency")) setTriageChoice(null);
                    }}
                    style={{
                      fontSize: "calc(11.5px * var(--fs, 1))",
                      padding: "3px 8px",
                      borderRadius: "6px",
                      border: serviceReason === preset ? "1.5px solid #2563eb" : "1px solid #cbd5e1",
                      background: serviceReason === preset ? "#eff6ff" : "#fff",
                      color: serviceReason === preset ? "#1e40af" : "#475569",
                      fontWeight: serviceReason === preset ? 700 : 500,
                      cursor: "pointer"
                    }}
                  >
                    {preset}
                  </button>
                ))}
              </div>}

              <input
                type="text"
                readOnly={formType === 'vaccination'}
                {...validation.field('reason')} aria-label="Visit reason" value={serviceReason}
                onChange={e => setServiceReason(e.target.value)}
                placeholder="Confirm or clarify what patient needs today..."
                style={{ width: "100%", padding: "7px 10px", fontSize: "calc(13px * var(--fs, 1))", borderRadius: "6px", border: validation.errors.reason ? '1px solid #dc2626' : '1px solid #cbd5e1' }}
              />{validation.feedback('reason')}
            </div>

            <VaccineEstimate appointment={{...appt,reason:serviceReason}} />
            {/* 3. Triage Level & Quick Intake Notes */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
              <div className="fld">
                <label>Triage Priority Level{!triageChoice && suggestedTriage !== "Routine" ? " (suggested from the findings)" : ""}</label>
                <select value={triage} onChange={e => setTriage(e.target.value)}>
                  <option value="Routine">Routine / Standard (Normal Queue)</option>
                  <option value="Priority">Priority / Unwell (Visible Alert)</option>
                  <option value="Emergency">Emergency / Critical (Immediate Queue)</option>
                </select>
              </div>

              {surgeryVisit && <div className="fld">
                <label>Fasting status (surgery / dental assessment)</label>
                <select value={fasted ? "yes" : "no"} onChange={e => setFasted(e.target.value === "yes")}>
                  <option value="no">No / Fed normally today</option>
                  <option value="yes">Yes / Fasted (NPO &gt; 8 hours)</option>
                </select>
              </div>}

              <div className="fld" style={{ gridColumn: "1/-1" }}>
                <label>Front Desk Intake Observations / Owner Notes</label>
                <input
                  type="text"
                  {...validation.field('notes')} value={notes}
                  onChange={e => setNotes(e.target.value)}
                  placeholder="e.g. Owner reports vomiting since morning; active and drinking water..."
                />{validation.feedback('notes')}
              </div>
            </div>
          </div>

          {valErr && (
            <p className="err" role="alert" style={{ marginTop: "12px", marginBottom: "0" }}>
              {valErr}
            </p>
          )}

          <div className="row end" style={{ marginTop: "20px", gap: "10px", flexWrap: "wrap" }}>
            <button type="button" className="btn ghost" onClick={unsaved.close} disabled={saving}>Cancel</button>
            <button type="submit" className="btn gold" disabled={saving || stale || !!dateError || !pet.id || !owner.id}>
              Review measured vitals
            </button>
          </div>
        </form>
      </div>
    </ClinicDialog>
  );
}


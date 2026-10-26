import ClinicDialog from '../components/ClinicDialog.jsx';
import {useUnsavedChanges} from '../components/useUnsavedChanges.jsx';
import {matchingOwners} from '../ownerMatching.js';
import DocumentHeader from "../components/DocumentHeader.jsx";
import { VaccinePicker, useBookingCatalog } from '../components/VaccineBooking.jsx';
import { vaccineChoiceError, vaccineReason, vaccinePriceLabel, VACCINE_CHOICES } from '../vaccineBooking.js';
import { useSubmissionReview } from "../components/SubmissionReview.jsx";
import { useRef, useState } from "react";
import { addLog } from "../lib.jsx";
import { walkInBirthWindow, validateWalkInFields, savedWalkInRegistration } from "../walkInRegistration.js";
import { api } from "../api.js";
import { formatSpeciesLabel, computeAgeDetails, normalizeSpecies } from "../preventiveSchedule.js";
import {
  SPECIES,
  BREEDS_BY_SPECIES,
  PET_COLORS,
  RODENT_DENTAL_STATUS,
  NEUTERED,
  petText
} from "./owner/Pets.jsx";
import { useLive, Field, onlyDigitsPlus, onlyDecimal, petAge } from "./owner/ui.jsx";
import { CheckCircle2, ClipboardList, Printer, X } from "lucide-react";

export default function InClinicRegistration({ db, setDb, me, onClose, onRegistered, existingOwner: initialOwner }) {
  const {yesterday:YESTERDAY,oldest:OLDEST} = walkInBirthWindow();
  const inFlight = useRef(false);
  const [selectedOwnerId,setSelectedOwnerId]=useState(initialOwner?.id || '');
  const existingOwner=(db.owners || []).find(o=>o.id===selectedOwnerId);

  const f = useLive(
    {
      // Owner details
      ownerName: existingOwner?.name || "",
      phone: existingOwner?.phone || "",
      email: existingOwner?.email || "",
      address: existingOwner?.address || "",
      // Pet details
      petName: "",
      species: "",
      otherSpecies: "",
      breed: "",
      customBreed: "",
      sex: "",
      birth: "",
      weight: "",
      neutered: "Not sure",
      color: "",
      customColor: "",
      dentalOcclusion: "Not Evaluated Yet",
      notes: "",
      vetId: db.vets?.[0]?.id || '', serviceCategory:'consultation', vaccineId:'',
      hasExternalHistory:false, priorVaccines:[], externalClinicNotes:'',
      // Queue / appointment option
      addToQueue: true,
      reason: "Walk-in Consultation & Routine Exam",
    },
    value=>{
      const errors=validateWalkInFields(value,{vets:db.vets || []});
      if(existingOwner)for(const field of ['ownerName','phone','email','address'])delete errors[field];
      if(selectedOwnerId && !existingOwner)errors.ownerSelection='This owner record changed. Select the current owner.';
      if(!selectedOwnerId && matchingOwners(db.owners || [],value).length)errors.ownerSelection='Matching contacts are already on file. Choose the correct existing owner.';
      return errors;
    }
  );

  const { v } = f;
  const ownerMatches=matchingOwners(db.owners || [],v);
  const selectOwner=id=>{
    setSelectedOwnerId(id);setSaveError('');
    const owner=(db.owners || []).find(o=>o.id===id);
    f.patch({ownerSelection:id,ownerName:owner?.name || '',phone:owner?.phone || '',email:owner?.email || '',address:owner?.address || ''});
  };
  const {vetId,serviceCategory,vaccineId,hasExternalHistory,priorVaccines,externalClinicNotes}=v;
  const setVetId=value=>f.set('vetId',value), setServiceCategory=value=>f.set('serviceCategory',value), setVaccineId=value=>f.set('vaccineId',value);
  const setHasExternalHistory=value=>f.set('hasExternalHistory',value), setPriorVaccines=value=>f.set('priorVaccines',value), setExternalClinicNotes=value=>f.set('externalClinicNotes',value);
  const [loading, setLoading] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [successData, setSuccessData] = useState(null);

  // Clinical service needed today & prior history guide states
  const specificVaccine = vaccineId === 'canine-core' ? 'DHPP (5-in-1 Core Vaccine)' : vaccineId === 'feline-core' ? 'FVRCP (4-in-1 Feline Core)' : VACCINE_CHOICES.find(c=>c.id===vaccineId)?.name || '';
  const catalog=useBookingCatalog()?.data?.catalog || [];

  const availableBreeds = BREEDS_BY_SPECIES[v.species] || [];
  const canonicalSpecies = normalizeSpecies(v.species);
  const showCustomBreed = v.species.includes("Other") || (v.breed && v.breed.startsWith("Other"));
  const showCustomColor = v.color && v.color.startsWith("Other");

  // Only calculate age when birth date is filled and has no validation error
  const petCalculatedAge = v.birth && !f.errs.birth ? petAge(v.birth) : "";
  const ageDetails = v.birth && !f.errs.birth ? computeAgeDetails(v.birth) : null;

  const handleSpeciesChange = (newSpecies) => {
    f.patch({
      species: newSpecies,
      breed: "",
      customBreed: "",
      dentalOcclusion: newSpecies.includes("Rodent") ? "Not Evaluated Yet" : ""
    });
    setVaccineId('');
    if(serviceCategory === 'vaccination') f.set('reason','Vaccination consultation');
  };

  const handleServiceChange = (cat) => {
    setServiceCategory(cat);
    setVaccineId('');
    if (cat === "consultation") {
      f.set("reason", "Walk-in Consultation & Routine Exam");
    } else if (cat === "vaccination") {
      f.set("reason", "Vaccination consultation");
    } else if (cat === "deworming") {
      f.set("reason", "Routine Deworming (Parasiticide)");
    } else if (cat === "flea_tick") {
      f.set("reason", "Monthly Flea & Tick Prevention Chewable");
    } else if (cat === "grooming") {
      f.set("reason", "Grooming & Sanitary Care");
    } else if (cat === "emergency") {
      f.set("reason", "Urgent / Emergency Clinical Triage");
    }
  };

  const handleVaccineChange = (vac) => {
    setVaccineId(vac);
    if (serviceCategory === "vaccination") {
      f.set("reason", vaccineReason(vac));
    }
  };

  const togglePriorVaccine = (vacName) => {
    setPriorVaccines(priorVaccines.includes(vacName) ? priorVaccines.filter(x => x !== vacName) : [...priorVaccines,vacName]);
  };

  const review = useSubmissionReview([v,vetId,serviceCategory,specificVaccine,vaccineId,hasExternalHistory,priorVaccines,externalClinicNotes,existingOwner,db.vets]);

  const unsaved=useUnsavedChanges({value:{...f.v,selectedOwnerId},saving:loading,active:!successData,onClose});
  const handleSubmit = async (ev) => {
    ev.preventDefault();
    if (inFlight.current) return;
    setSaveError("");
    f.submit(ev);
    if (!f.valid) return;
    if (v.addToQueue && !vetId) { setSaveError("Choose a veterinarian before adding today’s arrival."); return; }
    if(v.addToQueue && serviceCategory === 'vaccination') {
      const error=vaccineChoiceError(vaccineId,canonicalSpecies);
      if(error){setSaveError(error);return;}
    }
    const finalBreed = showCustomBreed && v.customBreed.trim() ? v.customBreed.trim() : v.breed;
    const finalColor = showCustomColor && v.customColor.trim() ? v.customColor.trim() : v.color;

    const payload = {
      ownerName: existingOwner?.name ?? v.ownerName.trim(),
      phone: existingOwner?.phone ?? v.phone.trim(),
      email: existingOwner?.email ?? v.email.trim(),
      address: existingOwner?.address ?? v.address.trim(),
      petName: v.petName.trim(),
      species: canonicalSpecies,
      speciesOther: v.species.includes("Other") ? v.otherSpecies.trim() : "",
      breed: finalBreed,
      sex: v.sex,
      birth: v.birth,
      weight: Number(v.weight),
      color: finalColor,
      neutered: v.neutered,
      dentalOcclusion: canonicalSpecies === "Rodent" ? v.dentalOcclusion : "",
      notes: v.notes.trim(),
      addToQueue: v.addToQueue,
      vetId,
      reason: v.addToQueue && serviceCategory === "vaccination" ? vaccineReason(vaccineId) : v.reason.trim(),
      actorName: me?.name || "Vet Assistant",
      actorRole: me?.role || "assistant",
      ownerId: existingOwner?.id || "",
      serviceCategory,
      specificVaccine,
      ...(v.addToQueue && serviceCategory === "vaccination" ? {vaccineId} : {}),
      priorVaccines: hasExternalHistory ? priorVaccines : [],
      externalClinicNotes: hasExternalHistory ? externalClinicNotes.trim() : ""
    };

    if (!await review.ask({title:"Review patient registration",confirmLabel:"Register patient",
      description:payload.addToQueue ? "Confirm owner and patient details. This assigns an internal treatment reference and saves an arrival; measured intake is still required before the doctor queue." : "Confirm owner and patient details before assigning the internal treatment reference.",
      fields:[
        ["Owner",payload.ownerName],
        ["Mobile",payload.phone],
        ["Email",payload.email],
        ["Address",payload.address],
        ["Patient",payload.petName],
        ["Species",`${payload.species}${payload.speciesOther ? ` (${payload.speciesOther})` : ""}`],
        ["Breed",payload.breed],
        ["Sex / birth date",`${payload.sex} / ${payload.birth}`],
        ["Weight",`${payload.weight} kg`],
        ["Color / neutered",`${payload.color || "Not provided"} / ${payload.neutered}`],
        ["Dental status",payload.dentalOcclusion],
        ["Patient notes",payload.notes],
        ["Today’s arrival",payload.addToQueue ? `${db.vets?.find(v=>v.id===vetId)?.name || "Veterinarian unavailable"}: ${payload.reason}` : "No arrival requested"],
        ...(v.addToQueue && serviceCategory === "vaccination" ? [["Estimated vaccine price",vaccinePriceLabel(vaccineId,catalog)]] : []),
        ["Reported external vaccine history",payload.priorVaccines.join("\n") || "None reported"],
        ["External clinic notes",payload.externalClinicNotes]]
    })) return;
    inFlight.current = true;
    setLoading(true);
    let backendResult = null;
    try {
      backendResult = savedWalkInRegistration(await api.post("/api/walk-in", payload), payload);
    } catch (err) {
      setSaveError(err.message);
      inFlight.current = false;
      setLoading(false);
      return;
    }

    const {owner,pet,vacc:newVaccs,appointment:newAppt} = backendResult;

    setDb(p => ({
      ...p,
      owners: [...(p.owners || []).filter(o => o.id !== owner.id), owner],
      pets: [...(p.pets || []).filter(pt => pt.id !== pet.id), pet],
      vacc: [...newVaccs, ...(p.vacc || [])],
      vaccs: [...newVaccs, ...(p.vaccs || [])],
      appts: newAppt ? [...(p.appts || []).filter(a => a.id !== newAppt.id), newAppt] : (p.appts || []),
      log: addLog(p, me, `Registered walk-in customer ${owner.name} and pet ${pet.name} (${pet.species}). Assigned internal treatment reference #${pet.vaccinationCardId}.${newAppt ? " Arrival created; intake vitals required." : ""}`)
    }));

    inFlight.current = false;
    setLoading(false);
    setSuccessData({ owner, pet, appt: newAppt });
    onRegistered && onRegistered(pet, owner, newAppt);
  };

  return (
    <ClinicDialog label="Register walk-in owner and patient" onClose={unsaved.close}>
      {unsaved.card}
      <div className={`modal ${successData?"print-document":""}`} style={{ width: "min(680px, 100%)", maxHeight: "94vh", overflowY: "auto", padding: "24px 28px" }}>
        
        {successData&&<DocumentHeader title="Client and patient registration slip"/>}
        {/* Modal Title */}
        <div className="no-print" style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap:8, marginBottom: "16px", borderBottom: "1px solid #f1f5f9", paddingBottom: "10px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "10px", minWidth:0 }}>
            <ClipboardList size={24} color="var(--navy)" style={{flexShrink:0}} />
            <div style={{minWidth:0}}>
              <h3 style={{ margin: 0, color: "var(--navy)", fontSize: "1.3rem" }}>
                {existingOwner ? `Add New Pet for ${existingOwner.name}` : "Walk-In Registration (Client & Patient)"}
              </h3>
              <span style={{ fontSize: "calc(12px * var(--fs, 1))", color: "#64748b" }}>
                {existingOwner ? "Register a new pet under this saved owner record" : "Front desk intake with live validation and a stable internal patient reference"}
              </span>
            </div>
          </div>
          <button type="button" className="btn sm ghost" onClick={unsaved.close} disabled={loading} aria-label="Close" style={{ padding: "6px 10px", flexShrink:0 }}><X size={16} aria-hidden="true" /></button>
        </div>

        {successData ? (
          <div style={{ textAlign: "center", padding: "12px 0" }}>
            <div style={{ width: 56, height: 56, borderRadius: "50%", background: "#dcfce7", color: "#166534", display: "grid", placeItems: "center", margin: "0 auto 12px" }}>
              <CheckCircle2 size={34} />
            </div>
            <h4 style={{ margin: "0 0 4px", fontSize: "calc(19px * var(--fs, 1))", color: "var(--navy)" }}>
              {successData.pet.name} &amp; {successData.owner.name} Successfully Registered!
            </h4>
            <p style={{ margin: "0 0 16px", fontSize: "calc(13.5px * var(--fs, 1))", color: "#475569" }}>
              Internal treatment reference <b style={{ color: "var(--navy)" }}>#{successData.pet.vaccinationCardId}</b> has been assigned. The vaccination card shows vaccinations and deworming actually recorded by the veterinarian.
              {successData.appt && " Arrival created. Record current vitals to complete check-in."}
            </p>

            <section className="ow-note" style={{textAlign:"left",marginBottom:20}}>
              <h4>Owner registration summary</h4>
              <p>{successData.owner.name} · Phone: {successData.owner.phone || "Not recorded"} · Email: {successData.owner.email || "Not recorded"}</p>
              <p>For online access, create and verify an owner account, then ask reception to link it through Clients & Patients Masterlist → Clients & Households → Link online account. Refresh the owner portal after linking. Existing linked owners can sign in normally.</p>
            </section>

            <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "center", gap: "12px" }}>
              <button className="btn sm ghost" onClick={() => window.print()} style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                <Printer size={15} /> Print registration slip
              </button>
              <button className="btn sm gold" onClick={unsaved.close}>{successData.appt ? "Done · Continue to intake" : "Done"}</button>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit} noValidate>
            {review.card}<fieldset disabled={loading} style={{border:0,padding:0,margin:0}}><legend className="sr-only">Walk-in registration</legend>
            <ol className="sf-steps" aria-label="Walk-in steps"><li className="on">1. Register patient and save arrival</li><li>2. Record measured intake</li><li>3. Assigned veterinarian</li></ol><p>For a patient already on file, use Existing patient check-in to keep their history together. Registration weight does not complete today’s intake.</p>
            <div className="fld"><label htmlFor="ownerSelection">Owner record</label><select id="ownerSelection" name="ownerSelection" value={selectedOwnerId} onChange={e=>selectOwner(e.target.value)} aria-invalid={!!f.show('ownerSelection')} aria-describedby="ownerSelection-feedback"><option value="">New owner — enter details below</option>{(db.owners || []).map(o=><option key={o.id} value={o.id}>{o.name} · {o.phone || o.email || o.id}</option>)}</select><span id="ownerSelection-feedback" className="err" role={f.show('ownerSelection')?'alert':undefined}>{f.show('ownerSelection')}</span></div>
            {!existingOwner && ownerMatches.length>0 && <section className="ow-note info"><b>Matching owner contacts</b><p>Review the owner before saving this pet.</p>{ownerMatches.map(o=><div key={o.id}><span>{o.name} · {o.phone} · {o.email || 'No email'}</span> <button type="button" className="btn sm" onClick={()=>selectOwner(o.id)}>Use this owner</button></div>)}</section>}
            {/* Section 1: Pet Owner Information */}
            {existingOwner ? (
              <div style={{ background: "#eff6ff", border: "1px solid #bfdbfe", padding: "14px 16px", borderRadius: "12px", marginBottom: "16px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div>
                  <div style={{ fontSize: "calc(11px * var(--fs, 1))", fontWeight: 700, color: "#1d4ed8", textTransform: "uppercase", letterSpacing: "0.5px" }}>
                    Saved owner record
                  </div>
                  <b style={{ fontSize: "calc(16px * var(--fs, 1))", color: "var(--navy)" }}>{existingOwner.name}</b>
                  <div style={{ fontSize: "calc(12.5px * var(--fs, 1))", color: "#475569", marginTop: "3px" }}>
                    <span>Phone: {existingOwner.phone || "No phone"}</span> &bull; <span>Email: {existingOwner.email || "No email"}</span>
                    {existingOwner.address && <span> &bull; Address: {existingOwner.address}</span>}
                  </div>
                </div>
                <span style={{ background: "#dbeafe", color: "#1e40af", padding: "5px 12px", borderRadius: "8px", fontSize: "calc(12px * var(--fs, 1))", fontWeight: 700 }}>
                  Existing owner
                </span>
              </div>
            ) : (
              <div style={{ background: "#f8fafc", padding: "14px 16px", borderRadius: "12px", marginBottom: "16px", border: "1px solid #e2e8f0" }}>
                <b style={{ display: "block", color: "var(--navy)", fontSize: "calc(13.5px * var(--fs, 1))", marginBottom: "10px" }}>
                  1. Owner contact details
                </b>
                <div className="walkin-field-grid" style={{ display: "grid", gridTemplateColumns: "repeat(2,minmax(0,1fr))", gap: "10px" }}>
                  <Field
                    id="ownerName"
                    label="Owner Full Name"
                    req
                    value={v.ownerName}
                    filter={petText}
                    filterMsg="Letters, spaces, . ' - only"
                    maxLen={60}
                    onChange={x => f.set("ownerName", x)}
                    onBlur={() => f.blur("ownerName")}
                    error={f.show("ownerName")}
                    valid={f.ok("ownerName")}
                    hint="e.g. Maria Santos"
                  />

                  <Field
                    id="phone"
                    label="Mobile Number"
                    req
                    type="tel"
                    value={v.phone}
                    filter={onlyDigitsPlus}
                    filterMsg="Numbers and + only"
                    maxLen={13}
                    onChange={x => f.set("phone", x)}
                    onBlur={() => f.blur("phone")}
                    error={f.show("phone")}
                    valid={f.ok("phone")}
                    hint="09XXXXXXXXX or +639XXXXXXXXX"
                  />

                  <Field
                    id="email"
                    label="Email (Optional)"
                    type="email"
                    value={v.email}
                    onChange={x => f.set("email", x)}
                    onBlur={() => f.blur("email")}
                    error={f.show("email")}
                    valid={f.ok("email")}
                    hint="Optional contact email"
                  />

                  <Field
                    id="address"
                    label="City / Address"
                    value={v.address}
                    filter={petText}
                    maxLen={150}
                    onChange={x => f.set("address", x)}
                    onBlur={() => f.blur("address")}
                    error={f.show("address")}
                    valid={f.ok("address")}
                    hint="e.g. Caloocan City"
                  />
                </div>
              </div>
            )}

            {/* Section 2: Pet Clinical Registration */}
            <div style={{ background: "#f8fafc", padding: "14px 16px", borderRadius: "12px", marginBottom: "16px", border: "1px solid #e2e8f0" }}>
              <b style={{ display: "block", color: "var(--navy)", fontSize: "calc(13.5px * var(--fs, 1))", marginBottom: "10px" }}>
                2. Patient Clinical Details (Species &amp; Life Stage)
              </b>

              <div className="walkin-field-grid" style={{ display: "grid", gridTemplateColumns: "repeat(2,minmax(0,1fr))", gap: "10px" }}>
                <Field
                  id="petName"
                  label="Pet Name"
                  req
                  value={v.petName}
                  filter={petText}
                  filterMsg="Letters, numbers and . ' - only"
                  maxLen={30}
                  onChange={x => f.set("petName", x)}
                  onBlur={() => f.blur("petName")}
                  error={f.show("petName")}
                  valid={f.ok("petName")}
                  hint="e.g. Toby, Bella, Mochi"
                />

                <Field
                  id="species"
                  label="Species Classification"
                  req
                  type="select"
                  value={v.species}
                  onChange={handleSpeciesChange}
                  onBlur={() => f.blur("species")}
                  options={SPECIES.map(s => [s, s])}
                  error={f.show("species")}
                  valid={f.ok("species")}
                  hint="Choose the patient’s species"
                />

                {v.species.includes("Other") && (
                  <div style={{ gridColumn: "span 2" }}>
                    <Field
                      id="otherSpecies"
                      label="What kind of animal?"
                      req
                      value={v.otherSpecies}
                      filter={petText}
                      maxLen={30}
                      onChange={x => f.set("otherSpecies", x)}
                      onBlur={() => f.blur("otherSpecies")}
                      error={f.show("otherSpecies")}
                      valid={f.ok("otherSpecies")}
                      hint="e.g. Hedgehog, Sugar Glider, Bearded Dragon"
                    />
                  </div>
                )}

                {availableBreeds.length > 0 ? (
                  <Field
                    id="breed"
                    label={`${formatSpeciesLabel(v.species)} Breed`}
                    type="select"
                    value={v.breed}
                    onChange={x => f.set("breed", x)}
                    onBlur={() => f.blur("breed")}
                    options={availableBreeds.map(b => [b, b])}
                    error={f.show("breed")}
                    valid={f.ok("breed")}
                    hint="Select breed or Other/Mixed"
                  />
                ) : (
                  <Field
                    id="breed-text"
                    label="Breed"
                    value={v.breed}
                    filter={petText}
                    maxLen={50}
                    onChange={x => f.set("breed", x)}
                    onBlur={() => f.blur("breed")}
                    error={f.show("breed")}
                    valid={f.ok("breed")}
                    hint="e.g. Mixed / Domestic"
                  />
                )}

                {showCustomBreed && (
                  <Field
                    id="customBreed"
                    label="Specific Breed / Mix Details"
                    value={v.customBreed}
                    filter={petText}
                    maxLen={50}
                    onChange={x => f.set("customBreed", x)}
                    onBlur={() => f.blur("customBreed")}
                    error={f.show("customBreed")}
                    valid={f.ok("customBreed")}
                    hint="Type custom breed name"
                  />
                )}

                <Field
                  id="sex"
                  label="Sex"
                  req
                  type="select"
                  value={v.sex}
                  onChange={x => f.set("sex", x)}
                  onBlur={() => f.blur("sex")}
                  options={[["Male", "Male"], ["Female", "Female"]]}
                  error={f.show("sex")}
                  valid={f.ok("sex")}
                />

                <div>
                  <Field
                    id="birth"
                    label="Birth Date"
                    req
                    type="date"
                    maxDate={YESTERDAY}
                    min={OLDEST}
                    value={v.birth}
                    onChange={x => f.set("birth", x)}
                    onBlur={() => f.blur("birth")}
                    error={f.show("birth")}
                    valid={f.ok("birth")}
                    hint="Yesterday or earlier"
                  />
                  {ageDetails && (
                    <div style={{ fontSize: "calc(11px * var(--fs, 1))", color: "#1e3a8a", background: "#eff6ff", border: "1px solid #bfdbfe", padding: "4px 8px", borderRadius: "6px", marginTop: "4px", fontWeight: 700 }}>
                      Calculated Age: {petCalculatedAge} ({ageDetails.lifeStageLabel})
                    </div>
                  )}
                </div>

                <Field
                  id="weight"
                  label="Weight (kg)"
                  req
                  value={v.weight}
                  filter={onlyDecimal}
                  filterMsg="Numbers only, with one decimal point"
                  inputMode="decimal"
                  onChange={x => f.set("weight", x)}
                  onBlur={() => f.blur("weight")}
                  error={f.show("weight")}
                  valid={f.ok("weight")}
                  hint="e.g. 5.5"
                />

                <Field
                  id="neutered"
                  label="Spayed or Neutered?"
                  req
                  type="select"
                  value={v.neutered}
                  onChange={x => f.set("neutered", x)}
                  onBlur={() => f.blur("neutered")}
                  options={NEUTERED.map(s => [s, s])}
                  error={f.show("neutered")}
                  valid={f.ok("neutered")}
                />

                <Field
                  id="color"
                  label="Color / Coat Pattern"
                  type="select"
                  value={v.color}
                  onChange={x => f.set("color", x)}
                  onBlur={() => f.blur("color")}
                  options={PET_COLORS.map(c => [c, c])}
                  error={f.show("color")}
                  valid={f.ok("color")}
                />

                {showCustomColor && (
                  <Field
                    id="customColor"
                    label="Specific Color / Markings"
                    value={v.customColor}
                    filter={petText}
                    maxLen={40}
                    onChange={x => f.set("customColor", x)}
                    onBlur={() => f.blur("customColor")}
                    error={f.show("customColor")}
                    valid={f.ok("customColor")}
                    hint="Describe unique markings"
                  />
                )}

                {canonicalSpecies === "Rodent" && (
                  <div style={{ gridColumn: "span 2" }}>
                    <Field
                      id="dentalOcclusion"
                      label="Dental / Occlusion Status (Rodent Protocol)"
                      req
                      type="select"
                      value={v.dentalOcclusion}
                      onChange={x => f.set("dentalOcclusion", x)}
                      onBlur={() => f.blur("dentalOcclusion")}
                      options={RODENT_DENTAL_STATUS.map(s => [s, s])}
                      error={f.show("dentalOcclusion")}
                      valid={f.ok("dentalOcclusion")}
                    />
                  </div>
                )}

                <div style={{ gridColumn: "span 2" }}>
                  <Field
                    id="notes"
                    label="Clinical Notes (Optional)"
                    type="textarea"
                    rows={2}
                    max={200}
                    value={v.notes}
                    filter={petText}
                    onChange={x => f.set("notes", x)}
                    onBlur={() => f.blur("notes")}
                    error={f.show("notes")}
                    valid={f.ok("notes")}
                    hint="Allergies, temperament, or previous treatments"
                  />
                </div>
              </div>
            </div>

            {/* Section 3: Today's Clinical Purpose & Arrival Queue */}
            <div style={{ background: "#eff6ff", border: "1.5px solid #bfdbfe", padding: "14px 16px", borderRadius: "12px", marginBottom: "16px" }}>
              <b style={{ display: "block", color: "var(--navy)", fontSize: "calc(13.5px * var(--fs, 1))", marginBottom: "8px" }}>
                3. Today&rsquo;s visit and arrival
              </b>

              <label style={{ display: "flex", alignItems: "center", gap: "8px", cursor: "pointer", fontWeight: 700, color: "var(--navy)", fontSize: "calc(13px * var(--fs, 1))", marginBottom: "12px" }}>
                <input
                  type="checkbox"
                  checked={v.addToQueue}
                  onChange={e => f.set("addToQueue", e.target.checked)}
                />
                Create today’s arrival and continue to vitals
              </label>

              {v.addToQueue && (
                <div style={{ display: "grid", gap: "10px" }}>
                  <Field id="vetId" label="Attending veterinarian" req type="select" value={vetId} onChange={setVetId} onBlur={()=>f.blur('vetId')} error={f.show('vetId')} options={(db.vets || []).map(vet=>[vet.id,vet.name])} />
                  <div>
                    <label style={{ display: "block", fontSize: "calc(12px * var(--fs, 1))", fontWeight: 700, color: "#1e3a8a", marginBottom: "4px" }}>
                      What does the patient need today? *
                    </label>
                    <select id="serviceCategory" aria-label="Purpose of visit" aria-invalid={!!f.show('serviceCategory')} aria-describedby="walkin-service-error"
                      value={serviceCategory}
                      onChange={e => handleServiceChange(e.target.value)}
                      style={{ width: "100%", padding: "8px 10px", fontSize: "calc(13px * var(--fs, 1))", borderRadius: "8px", border: "1.5px solid #93c5fd", fontWeight: 600, background: "#fff" }}
                    >
                      <option value="consultation">General Consultation &amp; Routine Check-up</option>
                      <option value="vaccination">Vaccination / Immunization Booster</option>
                      <option value="deworming">Routine Deworming (Parasiticide)</option>
                      <option value="flea_tick">Flea, Tick &amp; Heartworm Prevention</option>
                      <option value="grooming">Grooming &amp; Sanitary Care</option>
                      <option value="emergency">Urgent / Emergency Clinical Triage</option>
                    </select><span id="walkin-service-error" className="err" aria-live="polite">{f.show('serviceCategory')}</span>
                  </div>

                  {serviceCategory === "vaccination" && <VaccinePicker id="vaccineId" error={f.show("vaccineId")} value={vaccineId} onChange={handleVaccineChange} species={canonicalSpecies} />}

                  {serviceCategory !== "vaccination" && <Field
                    id="reason"
                    label="Visit reason and notes for the veterinarian"
                    req
                    value={v.reason}
                    filter={petText}
                    maxLen={100}
                    onChange={x => f.set("reason", x)}
                    onBlur={() => f.blur("reason")}
                    error={f.show("reason")}
                    valid={f.ok("reason")}
                    hint="Describe the care requested today"
                  />}
                </div>
              )}
            </div>

            {/* Section 4: Prior Vaccines from Other Vets (Clinical Guide & Schedule Calibrator) */}
            <div style={{ background: "#fefce8", border: "1.5px solid #fde047", padding: "14px 16px", borderRadius: "12px", marginBottom: "16px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "6px" }}>
                <div>
                  <b style={{ color: "#854d0e", fontSize: "calc(13.5px * var(--fs, 1))", display: "flex", alignItems: "center", gap: "6px" }}>
                    4. Prior Vaccinations from Previous Vet Clinics (Reference Guide)
                  </b>
                  <p style={{ margin: "2px 0 0", fontSize: "calc(12px * var(--fs, 1))", color: "#713f12" }}>
                    Since records from external clinics are not automatically transferred, record past shots here as a clinical guide to calibrate the upcoming schedule.
                  </p>
                </div>
              </div>

              <label style={{ display: "flex", alignItems: "center", gap: "8px", cursor: "pointer", fontWeight: 700, color: "#854d0e", fontSize: "calc(13px * var(--fs, 1))", marginTop: "8px" }}>
                <input
                  type="checkbox"
                  checked={hasExternalHistory}
                  onChange={e => {
                    setHasExternalHistory(e.target.checked);
                    if (!e.target.checked) setPriorVaccines([]);
                  }}
                />
                This pet received prior vaccinations or deworming at another clinic
              </label>

              {hasExternalHistory && (
                <div style={{ marginTop: "12px", background: "#fff", padding: "12px", borderRadius: "10px", border: "1px solid #fef08a" }}>
                  <div style={{ fontSize: "calc(12px * var(--fs, 1))", fontWeight: 700, color: "#854d0e", marginBottom: "8px" }}>
                    Select vaccines already given by previous veterinarians:
                  </div>

                  <div style={{ display: "flex", flexWrap: "wrap", gap: "6px", marginBottom: "12px" }}>
                    {(canonicalSpecies === "Canine" ? [
                      "Puppy Dose 1 (5-in-1)",
                      "Puppy Dose 2 (5-in-1)",
                      "Puppy Dose 3 (5-in-1)",
                      "Completed Puppyhood Series (Adult)",
                      "Anti-Rabies Vaccine",
                      "Kennel Cough (Bordetella)",
                      "Prior Deworming",
                      "Prior Flea & Tick Preventative"
                    ] : canonicalSpecies === "Feline" ? [
                      "FVRCP 4-in-1 Dose 1",
                      "FVRCP 4-in-1 Dose 2",
                      "Anti-Rabies Vaccine",
                      "Prior Deworming",
                      "Prior Flea & Tick Preventative"
                    ] : [
                      "Prior Parasite Clearance",
                      "Prior Prophylactic Injection"
                    ]).map(item => {
                      const isChecked = priorVaccines.includes(item);
                      return (
                        <button
                          key={item}
                          type="button"
                          onClick={() => togglePriorVaccine(item)}
                          style={{
                            padding: "5px 10px",
                            fontSize: "calc(12px * var(--fs, 1))",
                            borderRadius: "6px",
                            border: isChecked ? "1.5px solid #d97706" : "1px solid #cbd5e1",
                            background: isChecked ? "#fef3c7" : "#f8fafc",
                            color: isChecked ? "#92400e" : "#334155",
                            fontWeight: isChecked ? 700 : 500,
                            cursor: "pointer",
                            display: "inline-flex",
                            alignItems: "center",
                            gap: "5px",
                            transition: "all 0.15s ease"
                          }}
                        >
                          <span>{isChecked ? "Selected" : "+"}</span>
                          <span>{item}</span>
                        </button>
                      );
                    })}
                  </div>

                  <div style={{ marginTop: "8px" }}>
                    <label style={{ display: "block", fontSize: "calc(12px * var(--fs, 1))", fontWeight: 600, color: "#475569", marginBottom: "4px" }}>
                      Previous Clinic Name &amp; External Notes (Optional):
                    </label>
                    <input id="externalClinicNotes" aria-label="Previous clinic and external notes" aria-invalid={!!f.show('externalClinicNotes')} aria-describedby="walkin-history-error" maxLength={1000}
                      type="text"
                      value={externalClinicNotes}
                      onChange={e => setExternalClinicNotes(e.target.value)}
                      placeholder="e.g. Previous vet clinic name, date of last rabies, booklet presented..."
                      style={{ width: "100%", padding: "7px 10px", fontSize: "calc(12.5px * var(--fs, 1))", borderRadius: "6px", border: "1px solid #cbd5e1" }}
                    />
                  </div>

                  <span id="walkin-history-error" className="err" aria-live="polite">{f.show('externalClinicNotes')}</span>
                  <div style={{ marginTop: "10px", padding: "8px 10px", background: "#f0fdf4", border: "1px solid #bbf7d0", borderRadius: "6px", fontSize: "calc(11.5px * var(--fs, 1))", color: "#166534" }}>
                    <b>Reported vaccine history:</b> Selected previous shots will be saved as unverified references in the patient’s clinical history. Suggested protocols still require veterinarian review; these entries do not certify doses or approve booster dates.
                  </div>
                </div>
              )}
            </div>

            {f.submitted && !f.valid && (
              <p className="err" role="alert" style={{ marginBottom: "12px" }}>
                Please check the form. There {f.count === 1 ? "is 1 required field or correction" : `are ${f.count} required fields or corrections`} above.
              </p>
            )}

            {/* Actions */}
            <div className="row end" style={{ gap: "10px" }}>
              <button type="button" className="btn ghost sm" onClick={unsaved.close} disabled={loading}>Cancel</button>
              {saveError && <p className="err" role="alert">{saveError}</p>}
              <button type="submit" className="btn gold" disabled={loading} style={{ fontWeight: 700 }}>
                {loading ? "Saving registration…" : "Review registration"}
              </button>
            </div>
            </fieldset>
          </form>
        )}

      </div>
    </ClinicDialog>
  );
}

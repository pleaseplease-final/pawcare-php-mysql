import {currentAppointmentsByPet} from '../assistantWorkflow.js';
import OwnerAccountLinkModal from './OwnerAccountLinkModal.jsx';
import { ownerForPet, petsForOwner } from "../ownerRelationships.js";
import { Modal } from "./owner/ui.jsx";
import "./households.css";
import { PaginatedList, PaginatedTable } from "../components/Pagination.jsx";
import { currentVaccinationDue, vaccinationStatus } from "../ownerVaccination.js";
import { today as bookingToday } from "../booking.js";
import { canBookAppointments } from "../appointmentPermissions.js";
import { useState } from "react";
import {
  Search,
  User,
  PawPrint,
  Phone,
  Mail,
  MapPin,
  Calendar,
  Syringe,
  CheckCircle2,
  AlertTriangle,
  AlertCircle,
  Sparkles,
  Plus,
  ArrowUpRight,
  Filter,
  Check
} from "lucide-react";
import { uid, addLog, petName, ICON, I } from "../lib.jsx";
import { api } from "../api.js";
import { petAge } from "./owner/ui.jsx";
import { formatSpeciesLabel, computeAgeDetails, normalizeSpecies } from "../preventiveSchedule.js";
import PetCardModal from "./PetCardModal.jsx";
import InClinicRegistration from "./InClinicRegistration.jsx";
import CheckInModal from "./CheckInModal.jsx";

function getPetVaccState(petId, vaccList) {
  const mine = (vaccList || []).filter(v => v.petId === petId);
  if (!mine.length) {
    return { label: "No records yet", status: "none", color: "#64748b", bg: "#f1f5f9", border: "#e2e8f0" };
  }

  const current = currentVaccinationDue(mine);
  const date = bookingToday();
  const overdueCount = current.filter(v => vaccinationStatus(v, current, date) === "Overdue").length;
  const dueSoonCount = current.filter(v => vaccinationStatus(v, current, date) === "Due soon").length;
  const nextUpcoming = [...current].sort((a,b) => a.nextDue.localeCompare(b.nextDue))[0] || null;
  if (!current.length) return { label: "No active recall", status: "none", color: "#64748b", bg: "#f1f5f9", border: "#e2e8f0" };

  if (overdueCount > 0) {
    return {
      label: `${overdueCount} Overdue`,
      status: "overdue",
      color: "#b91c1c",
      bg: "#fef2f2",
      border: "#fecaca",
      next: nextUpcoming
    };
  }
  if (dueSoonCount > 0) {
    return {
      label: `${dueSoonCount} Due soon`,
      status: "dueSoon",
      color: "#b45309",
      bg: "#fffbeb",
      border: "#fde68a",
      next: nextUpcoming
    };
  }
  return {
    label: "On track",
    status: "ok",
    color: "#15803d",
    bg: "#f0fdf4",
    border: "#bbf7d0",
    next: nextUpcoming
  };
}

export default function ClientsAndPatientsPage({ db, setDb, me, go, say }) {
  const [linkOwner,setLinkOwner]=useState(null);
  const [ownerFilter, setOwnerFilter] = useState("");
  const [householdId, setHouseholdId] = useState(null);
  const [tab, setTab] = useState("patients"); // 'patients' | 'owners'
  const [search, setSearch] = useState("");
  const [speciesFilter, setSpeciesFilter] = useState("all");
  const [vaccFilter, setVaccFilter] = useState("all");
  const [cardPetId, setCardPetId] = useState(null);
  const [showWalkIn, setShowWalkIn] = useState(false);
  const [addPetForOwner, setAddPetForOwner] = useState(null);
  const [checkInAppt, setCheckInAppt] = useState(null);

  const pets = db.pets || [];
  const owners = db.owners || [];
  const vaccs = db.vacc || db.vaccs || [];

  // Front desk priority: patients who already hold an appointment today. Walk-ins are registered from the Front Desk dashboard instead.
  const canBook = canBookAppointments(me?.role);
  const canCheckIn = me?.role === "assistant";
  const todayApptByPet = currentAppointmentsByPet(db.appts || [], bookingToday());
  const isArrivable = a => !!a && a.status === "Scheduled";

  const household = owners.find(o => o.id === householdId);
  const householdPets = petsForOwner(pets, household);

  // Filtered Pets (patients with an appointment today first, in time order)
  const filteredPets = pets.filter(p => {
    const o = ownerForPet(owners, p) || {};
    const norm = normalizeSpecies(p.species);

    if (ownerFilter && o.id !== ownerFilter) return false;
    if (speciesFilter !== "all" && norm !== speciesFilter) return false;

    const vs = getPetVaccState(p.id, vaccs);
    if (vaccFilter !== "all" && vs.status !== vaccFilter) return false;

    if (!search.trim()) return true;
    const q = search.trim().toLowerCase();
    return (
      (p.name && p.name.toLowerCase().includes(q)) ||
      (p.breed && p.breed.toLowerCase().includes(q)) ||
      (p.species && p.species.toLowerCase().includes(q)) ||
      (p.vaccinationCardId && p.vaccinationCardId.toLowerCase().includes(q)) ||
      (o.name && o.name.toLowerCase().includes(q)) ||
      (o.phone && o.phone.includes(q)) ||
      (o.email && o.email.toLowerCase().includes(q))
    );
  });
  filteredPets.sort((x, y) => {
    const ax = todayApptByPet[x.id], ay = todayApptByPet[y.id];
    if (!!ax !== !!ay) return ax ? -1 : 1;
    if (ax && ay) return (ax.time || "").localeCompare(ay.time || "");
    return (x.name || "").localeCompare(y.name || "");
  });

  // Filtered Owners
  const filteredOwners = owners.filter(o => {
    if (!search.trim()) return true;
    const q = search.trim().toLowerCase();
    const ownerPets = petsForOwner(pets, o);
    return (
      (o.name && o.name.toLowerCase().includes(q)) ||
      (o.phone && o.phone.includes(q)) ||
      (o.email && o.email.toLowerCase().includes(q)) ||
      (o.address && o.address.toLowerCase().includes(q)) ||
      ownerPets.some(p => p.name.toLowerCase().includes(q))
    );
  });

  return (
    <div className="staff-clients">
      {/* Top Banner Toolbar */}
      <div style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: "14px",
        marginBottom: "16px",
        flexWrap: "wrap",
        background: "#ffffff",
        padding: "14px 18px",
        borderRadius: "14px",
        border: "1px solid #e2e8f0",
        boxShadow: "0 1px 3px rgba(0,0,0,0.03)"
      }}>
        {/* Tabs: Patients vs Clients */}
        <div style={{ display: "inline-flex", background: "#f1f5f9", padding: "3px", borderRadius: "10px", border: "1px solid #e2e8f0" }}>
          <button
            type="button"
            aria-pressed={tab === "patients"} onClick={() => setTab("patients")}
            style={{
              padding: "7px 16px",
              fontSize: "calc(13px * var(--fs, 1))",
              fontWeight: 700,
              borderRadius: "8px",
              border: "none",
              cursor: "pointer",
              background: tab === "patients" ? "var(--navy, #1e3a8a)" : "transparent",
              color: tab === "patients" ? "#fff" : "#475569",
              display: "flex",
              alignItems: "center",
              gap: "6px",
              transition: "all 0.15s ease",
            }}
          >
            <PawPrint size={15} />
            <span>All Patients ({pets.length})</span>
          </button>
          <button
            type="button"
            aria-pressed={tab === "owners"} onClick={() => setTab("owners")}
            style={{
              padding: "7px 16px",
              fontSize: "calc(13px * var(--fs, 1))",
              fontWeight: 700,
              borderRadius: "8px",
              border: "none",
              cursor: "pointer",
              background: tab === "owners" ? "var(--navy, #1e3a8a)" : "transparent",
              color: tab === "owners" ? "#fff" : "#475569",
              display: "flex",
              alignItems: "center",
              gap: "6px",
              transition: "all 0.15s ease",
            }}
          >
            <User size={15} />
            <span>Clients &amp; Households ({owners.length})</span>
          </button>
        </div>

        {/* Action Button */}
        <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
          {canCheckIn && <button
            className="btn gold"
            onClick={() => setShowWalkIn(true)}
            style={{ display: "flex", alignItems: "center", gap: "6px", fontWeight: 700, padding: "8px 16px", fontSize: "calc(13.5px * var(--fs, 1))" }}
          >
            <Plus size={16} /> Register walk-in
          </button>}
        </div>
      </div>

      {/* Search & Filters */}
      <div style={{
        background: "#ffffff",
        padding: "12px 18px",
        borderRadius: "12px",
        border: "1px solid #e2e8f0",
        marginBottom: "16px",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: "12px",
        flexWrap: "wrap"
      }}>
        <div style={{ position: "relative", flex: "1 1 260px", maxWidth: "420px" }}>
          <Search size={16} style={{ position: "absolute", left: "12px", top: "50%", transform: "translateY(-50%)", color: "#94a3b8" }} />
          <input
            type="search" aria-label="Search patients and owners"
            placeholder={tab === "patients" ? "Search patient, owner name, phone, card #..." : "Search client name, phone, address, pet name..."}
            value={search}
            onChange={e => setSearch(e.target.value)}
            style={{ width: "100%", padding: "8px 12px 8px 36px", fontSize: "calc(13px * var(--fs, 1))", borderRadius: "8px", border: "1px solid #cbd5e1" }}
          />
        </div>

        {tab === "patients" && (
          <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
            <label style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "calc(12.5px * var(--fs, 1))", margin: 0, fontWeight: 600, color: "#475569" }}>
              <Filter size={14} />
              <select
                aria-label="Species" value={speciesFilter}
                onChange={e => setSpeciesFilter(e.target.value)}
                style={{ padding: "6px 10px", fontSize: "calc(12.5px * var(--fs, 1))", borderRadius: "6px", border: "1px solid #cbd5e1" }}
              >
                <option value="all">All Species</option>
                <option value="Canine">Dogs (Canine)</option>
                <option value="Feline">Cats (Feline)</option>
                <option value="Lagomorph">Rabbits (Lagomorph)</option>
                <option value="Rodent">Rodents</option>
                <option value="Avian">Birds (Avian)</option>
                <option value="Other">Others</option>
              </select>
            </label>

            <select aria-label="Filter patients by owner" value={ownerFilter} onChange={e => setOwnerFilter(e.target.value)}><option value="">All owners</option>{owners.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}</select>
            <select
              aria-label="Vaccination status" value={vaccFilter}
              onChange={e => setVaccFilter(e.target.value)}
              style={{ padding: "6px 10px", fontSize: "calc(12.5px * var(--fs, 1))", borderRadius: "6px", border: "1px solid #cbd5e1" }}
            >
              <option value="all">All Vaccine Statuses</option>
              <option value="ok">On track</option>
              <option value="dueSoon">Due soon (within 14 days)</option>
              <option value="overdue">Overdue</option>
            </select>
          </div>
        )}
      </div>

      {/* Main Content Area */}
      {tab === "patients" ? (
        <section className="card" style={{ padding: "0", overflow: "hidden" }}>
          <div style={{ padding: "12px 18px", background: "#f8fafc", borderBottom: "1px solid #e2e8f0", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ fontSize: "calc(12.5px * var(--fs, 1))", color: "#475569" }}>
              <b>Tip:</b> Click any row to open the pet&rsquo;s official <b>Digital Vaccination Card</b>, review shots, or print access slips.
            </span>
            <span style={{ fontSize: "calc(12.5px * var(--fs, 1))", fontWeight: 700, color: "var(--navy)" }}>
              {filteredPets.length} patient(s) found
            </span>
          </div>

          {filteredPets.length ? (
            <div style={{ overflowX: "auto" }}>
              <PaginatedTable label="Patients" resetKey={[tab,search,speciesFilter,vaccFilter,ownerFilter]} style={{ width: "100%", fontSize: "calc(13px * var(--fs, 1))", borderCollapse: "collapse" }}>
                <thead>
                  <tr style={{ textAlign: "left", background: "#f8fafc", color: "#475569", borderBottom: "2px solid #e2e8f0" }}>
                    <th style={{ padding: "12px 14px" }}>Patient Profile</th>
                    <th style={{ padding: "12px 14px" }}>Registered Owner &amp; Contact</th>
                    <th style={{ padding: "12px 14px" }}>Vaccination Card</th>
                    <th style={{ padding: "12px 14px" }}>Immunization Status</th>
                    <th style={{ padding: "12px 14px", textAlign: "right" }}>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredPets.map(p => {
                    const o = ownerForPet(owners, p) || {};
                    const age = p.birth ? petAge(p.birth) : "";
                    const vs = getPetVaccState(p.id, vaccs);
                    const rowBg = isArrivable(todayApptByPet[p.id]) ? "#fffbea" : "transparent";

                    return (
                      <tr
                        key={p.id}
                        onClick={() => setCardPetId(p.id)}
                        style={{
                          background: rowBg,
                          borderBottom: "1px solid #f1f5f9",
                          cursor: "pointer",
                          transition: "background 0.15s ease",
                        }}
                        onMouseEnter={e => (e.currentTarget.style.background = "#f0f9ff")}
                        onMouseLeave={e => (e.currentTarget.style.background = rowBg)}
                        title="Click row to open Digital Vaccination Card"
                      >
                        {/* Patient info */}
                        <td data-label="Patient Profile" style={{ padding: "12px 14px" }}>
                          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                            <div style={{ width: "36px", height: "36px", borderRadius: "50%", background: "#e0f2fe", color: "#0369a1", display: "grid", placeItems: "center", fontSize: "calc(18px * var(--fs, 1))" }}>
                              <I e={ICON[p.species] || "paw"} size={18} />
                            </div>
                            <div>
                              <b style={{ color: "var(--navy)", fontSize: "calc(14px * var(--fs, 1))", textDecoration: "underline" }}>
                                {p.name}
                              </b>
                              {todayApptByPet[p.id] && (
                                <span className={`sf-pill ${isArrivable(todayApptByPet[p.id]) ? "wa" : "ok"}`} style={{ marginLeft: 8 }}>
                                  {isArrivable(todayApptByPet[p.id]) ? `Appointment ${todayApptByPet[p.id].time}` : todayApptByPet[p.id].status}
                                </span>
                              )}
                              <div style={{ fontSize: "calc(12px * var(--fs, 1))", color: "#64748b" }}>
                                {formatSpeciesLabel(p.species)} &bull; {p.breed || "Mixed"} {age ? `\u2022 ${age}` : ""}
                              </div>
                            </div>
                          </div>
                        </td>

                        {/* Owner info */}
                        <td data-label="Registered Owner & Contact" style={{ padding: "12px 14px" }}>
                          <button type="button" className="household-owner-trigger" disabled={!o.id} onClick={e => { e.stopPropagation(); setHouseholdId(o.id); }} aria-label={`View owner ${o.name || "not recorded"} and pets`}>{o.name || "Owner not recorded"}</button>
                          <div style={{ fontSize: "calc(12px * var(--fs, 1))", color: "#64748b", display: "flex", alignItems: "center", gap: "6px" }}>
                            <span className="nowrap" style={{ display: "inline-flex", alignItems: "center", gap: "4px" }}><Phone size={12} /> {o.phone || "No phone"}</span>
                            {o.address && <span>&bull; {o.address}</span>}
                          </div>
                        </td>

                        {/* Card ID */}
                        <td data-label="Vaccination Card" style={{ padding: "12px 14px" }}>
                          <span style={{
                            display: "inline-flex",
                            alignItems: "center",
                            gap: "4px",
                            background: "#ecfdf5",
                            color: "#065f46",
                            border: "1px solid #a7f3d0",
                            padding: "3px 8px",
                            borderRadius: "6px",
                            fontSize: "calc(11.5px * var(--fs, 1))",
                            fontFamily: "monospace",
                            fontWeight: 700
                          }}>
                            {p.vaccinationCardId || "VACC-UNISSUED"}
                          </span>
                        </td>

                        {/* Vaccine status */}
                        <td data-label="Immunization Status" style={{ padding: "12px 14px" }}>
                          <span style={{
                            display: "inline-block",
                            padding: "3px 8px",
                            borderRadius: "6px",
                            fontSize: "calc(11.5px * var(--fs, 1))",
                            fontWeight: 700,
                            background: vs.bg,
                            color: vs.color,
                            border: `1px solid ${vs.border}`
                          }}>
                            {vs.label}
                          </span>
                          {vs.next && (
                            <small style={{ display: "block", color: "#64748b", marginTop: "2px", fontSize: "calc(11px * var(--fs, 1))" }}>
                              Next: {vs.next.vaccine} ({vs.next.nextDue})
                            </small>
                          )}
                        </td>

                        {/* Action link */}
                        <td data-label="Action" style={{ padding: "12px 14px", textAlign: "right" }}>
                          <div style={{ display: "inline-flex", flexWrap: "wrap", justifyContent: "flex-end", gap: "6px", alignItems: "center", minWidth: "140px" }} onClick={e => e.stopPropagation()}>
                            {canCheckIn && isArrivable(todayApptByPet[p.id]) && (
                              <button
                                type="button"
                                className="btn sm gold"
                                onClick={() => setCheckInAppt(todayApptByPet[p.id])}
                                title="Arrival check-in and vitals for today's appointment"
                              >
                                Check in
                              </button>
                            )}
                            {canBook && <button
                              type="button"
                              className="btn sm ghost"
                              onClick={() => {
                                go ? go("cal") : null;
                                say && say(`Opening calendar to book visit for ${p.name}...`);
                              }}
                              style={{
                                padding: "4px 8px",
                                fontSize: "calc(11.5px * var(--fs, 1))",
                                color: "#1e3a8a",
                                border: "1px solid #cbd5e1",
                                fontWeight: 600,
                                borderRadius: "6px"
                              }}
                              title="Schedule appointment in calendar"
                            >
                              Book
                            </button>}
                            <button
                              type="button"
                              className="btn sm ghost"
                              onClick={() => setCardPetId(p.id)}
                              style={{
                                padding: "4px 8px",
                                fontSize: "calc(11.5px * var(--fs, 1))",
                                color: "var(--navy)",
                                border: "1px solid #bfdbfe",
                                background: "#eff6ff",
                                fontWeight: 600,
                                borderRadius: "6px"
                              }}
                              title="Open Official Digital Vaccination Card"
                            >
                              Card
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </PaginatedTable>
            </div>
          ) : (
            <div className="empty sm" style={{ padding: "32px 16px", textAlign: "center" }}>
              No animal patients found matching your search criteria.
            </div>
          )}
        </section>
      ) : (
        /* Household / Client-First View */
        <section className="card" style={{ padding: "0", overflow: "hidden" }}>
          <div style={{ padding: "12px 18px", background: "#f8fafc", borderBottom: "1px solid #e2e8f0", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ fontSize: "calc(12.5px * var(--fs, 1))", color: "#475569" }}>
              Registered pet owners, client accounts, contact details, and their registered animals.
            </span>
            <span style={{ fontSize: "calc(12.5px * var(--fs, 1))", fontWeight: 700, color: "var(--navy)" }}>
              {filteredOwners.length} client(s) found
            </span>
          </div>

          {filteredOwners.length ? (
            <div style={{ overflowX: "auto" }}>
              <PaginatedTable label="Households" resetKey={[tab,search]} style={{ width: "100%", fontSize: "calc(13px * var(--fs, 1))", borderCollapse: "collapse" }}>
                <thead>
                  <tr style={{ textAlign: "left", background: "#f8fafc", color: "#475569", borderBottom: "2px solid #e2e8f0" }}>
                    <th style={{ padding: "12px 14px" }}>Client Name &amp; Contact</th>
                    <th style={{ padding: "12px 14px" }}>Address / Location</th>
                    <th style={{ padding: "12px 14px" }}>Registered Pets</th>
                    <th style={{ padding: "12px 14px", textAlign: "right" }}>Quick Access</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredOwners.map(o => {
                    const ownerPets = petsForOwner(pets, o);

                    return (
                      <tr key={o.id} style={{ borderBottom: "1px solid #f1f5f9" }}>
                        <td data-label="Client Name & Contact" style={{ padding: "12px 14px" }}>
                          <button type="button" className="household-owner-trigger" onClick={() => setHouseholdId(o.id)} aria-label={`View household for ${o.name}`}>{o.name}</button><small className="household-pet-count">{ownerPets.length} registered {ownerPets.length === 1 ? "pet" : "pets"}</small>
                          <div style={{ fontSize: "calc(12px * var(--fs, 1))", color: "#64748b", marginTop: "2px", display: "flex", alignItems: "center", gap: "8px" }}>
                            <span className="nowrap" style={{ display: "inline-flex", alignItems: "center", gap: "4px" }}><Phone size={12} /> {o.phone || "No phone"}</span> &bull; <span style={{ display: "inline-flex", alignItems: "center", gap: "4px" }}><Mail size={12} /> {o.email || "No email"}</span>
                          </div>
                        </td>

                        <td data-label="Address / Location" style={{ padding: "12px 14px", color: "#475569" }}>
                          {o.address || "Address not recorded"}
                        </td>

                        <td data-label="Registered Pets" style={{ padding: "12px 14px" }}>
                          {ownerPets.length ? (
                            <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
                              {ownerPets.slice(0,3).map(p => (
                                <button
                                  key={p.id}
                                  type="button"
                                  onClick={() => setCardPetId(p.id)}
                                  style={{
                                    padding: "3px 8px",
                                    fontSize: "calc(12px * var(--fs, 1))",
                                    borderRadius: "6px",
                                    border: "1px solid #bfdbfe",
                                    background: "#eff6ff",
                                    color: "#1e40af",
                                    fontWeight: 700,
                                    cursor: "pointer",
                                    display: "inline-flex",
                                    alignItems: "center",
                                    gap: "4px"
                                  }}
                                  title="Click to open pet's Digital Card"
                                >
                                  <span>{p.name}</span>
                                  <small style={{ fontWeight: 400, color: "#64748b" }}>({p.species})</small>
                                </button>
                              ))}
                              {ownerPets.length > 3 && <button type="button" className="household-owner-trigger" onClick={() => setHouseholdId(o.id)}>View all {ownerPets.length} pets</button>}
                            </div>
                          ) : (
                            <span style={{ color: "#94a3b8", fontSize: "calc(12px * var(--fs, 1))" }}>No registered pets</span>
                          )}
                        </td>

                        <td data-label="Quick Access" style={{ padding: "12px 14px", textAlign: "right" }}>
                          <div style={{ display: "inline-flex", flexWrap:"wrap", gap: "8px", alignItems: "center" }}>
                            <button type="button" className="btn sm ghost" onClick={() => setHouseholdId(o.id)}>View household</button>
                            {canCheckIn && !o.userId && <button type="button" className="btn sm" onClick={()=>setLinkOwner(o)}>Link online account</button>}
                            {o.userId && <span className="sf-pill">Online account linked</span>}
                            {canCheckIn && <button
                              type="button"
                              className="btn sm gold"
                              onClick={() => setAddPetForOwner(o)}
                              style={{
                                padding: "4px 10px",
                                fontSize: "calc(11.5px * var(--fs, 1))",
                                fontWeight: 700,
                                borderRadius: "6px",
                                display: "inline-flex",
                                alignItems: "center",
                                gap: "4px"
                              }}
                              title="Register a new pet linked to this client"
                            >
                              <Plus size={13} /> Add Pet
                            </button>}
                            {canBook && <button
                              type="button"
                              className="btn sm ghost"
                              onClick={() => {
                                go ? go("cal") : null;
                                say && say(`Opening calendar to book visit for ${o.name}...`);
                              }}
                              style={{
                                padding: "4px 10px",
                                fontSize: "calc(11.5px * var(--fs, 1))",
                                fontWeight: 600,
                                color: "#1e3a8a",
                                border: "1px solid #cbd5e1",
                                borderRadius: "6px"
                              }}
                              title="Schedule appointment in calendar"
                            >
                              Book Visit
                            </button>}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </PaginatedTable>
            </div>
          ) : (
            <div className="empty sm" style={{ padding: "32px 16px", textAlign: "center" }}>
              No client accounts found matching your search criteria.
            </div>
          )}
        </section>
      )}

      {linkOwner && <OwnerAccountLinkModal owner={linkOwner} onClose={()=>setLinkOwner(null)} onLinked={()=>{setHouseholdId(null);say?.('Owner account linked. The owner can refresh their portal to see their records.');window.dispatchEvent(new Event('pawcare:refresh'));}} />}
      {household && <Modal title="Owner & pets" onClose={() => setHouseholdId(null)} className="household-dialog" closeButton>
        <section className="household-summary">
          <span className="household-avatar"><User size={28} aria-hidden="true" /></span>
          <div><span className="household-eyebrow">Registered owner</span><h3>{household.name}</h3><p>{householdPets.length} linked {householdPets.length === 1 ? "patient" : "patients"}</p></div>
        </section>
        <dl className="household-contact">
          <div><dt><Phone size={15} aria-hidden="true" />Mobile</dt><dd>{household.phone || "Not recorded"}</dd></div>
          <div><dt><Mail size={15} aria-hidden="true" />Email</dt><dd>{household.email || "Not recorded"}</dd></div>
          <div><dt><MapPin size={15} aria-hidden="true" />Address</dt><dd>{household.address || "Not recorded"}</dd></div>
        </dl>
        <div className="household-pets-heading"><h4>Pets in this household</h4><span>Open a pet to view its digital card and care records.</span></div>
        {householdPets.length ? <PaginatedList className="household-pets" label="Household pets" resetKey={household.id}>{householdPets.map(p => <article key={p.id}>
          <span className="household-species"><I e={ICON[p.species] || "paw"} size={24} /></span>
          <div><h4>{p.name}</h4><p>{p.species}{p.breed ? ` · ${p.breed}` : ""}</p><small>{p.sex || "Sex not recorded"}{p.birth ? ` · ${petAge(p.birth)}` : ""}</small></div>
          <button type="button" className="btn sm" onClick={() => { setHouseholdId(null); setCardPetId(p.id); }} aria-label={`Open pet record for ${p.name}`}>View pet<ArrowUpRight size={15} aria-hidden="true" /></button>
        </article>)}</PaginatedList> : <div className="empty sm">No registered pets are linked to this owner yet.</div>}
      </Modal>}

      {/* Pet Card Modal Popup */}
      {cardPetId && (
        <PetCardModal
          petId={cardPetId}
          db={db}
          setDb={setDb}
          me={me}
          onClose={() => setCardPetId(null)}
          onCheckIn={a => { setCardPetId(null); if (a) setCheckInAppt(a); }}
          onBill={() => setCardPetId(null)}
        />
      )}

      {/* In-Clinic Walk-in Registration Modal (New Client & Pet) */}
      {showWalkIn && (
        <InClinicRegistration
          db={db}
          setDb={setDb}
          me={me}
          onClose={() => setShowWalkIn(false)}
          onRegistered={(pet, owner, appointment) => {
            say && say(`Successfully registered ${owner?.name || "Client"} and issued card for ${pet?.name || "Patient"}!`);
            setShowWalkIn(false);
            if (appointment) setCheckInAppt(appointment);
          }}
        />
      )}

      {/* Add Pet For Existing Client Modal */}
      {addPetForOwner && (
        <InClinicRegistration
          existingOwner={addPetForOwner}
          db={db}
          setDb={setDb}
          me={me}
          onClose={() => setAddPetForOwner(null)}
          onRegistered={(pet, owner, appointment) => {
            say && say(`Successfully added ${pet?.name || "Patient"} to ${owner?.name || addPetForOwner.name}'s account!`);
            setAddPetForOwner(null);
            if (appointment) setCheckInAppt(appointment);
          }}
        />
      )}

      {/* Direct Check-In with Vitals Modal */}
      {checkInAppt && (
        <CheckInModal
          appt={checkInAppt}
          db={db}
          setDb={setDb}
          me={me}
          onClose={() => setCheckInAppt(null)}
          onCheckedIn={(vitals) => {
            setCheckInAppt(null);
            say && say(`Patient ${petName(db, checkInAppt.petId)} checked in with vitals! Added to Doctor Queue.`);
          }}
        />
      )}
    </div>
  );
}
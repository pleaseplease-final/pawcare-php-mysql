import { useState } from "react";
import { ArrowUpRight, Search, Syringe } from "lucide-react";
import { PaginatedList } from "../components/Pagination.jsx";
import { I, ICON } from "../lib.jsx";
import PetCardModal from "./PetCardModal.jsx";

export default function VaccinationCards(props) {
  const [selected, select] = useState(null);
  const [search, setSearch] = useState("");
  const pets = props.db.pets || [];
  const owners = props.db.owners || [];
  const ownerOf = pet => owners.find(owner => owner.id === pet.ownerId);
  const query = search.trim().toLowerCase();
  const matches = pets.filter(p =>
    [p.name, p.species, p.breed, p.vaccinationCardId, ownerOf(p)?.name]
      .filter(Boolean).join(" ").toLowerCase().includes(query)
  );

  return <section className="card vaccine-directory" aria-labelledby="vaccine-directory-title">
    <header className="workspace-section-heading">
      <div>
        <span className="workspace-eyebrow">Preventive care</span>
        <h2 id="vaccine-directory-title">Patient vaccination cards</h2>
        <p>Review immunization history and booster dates. Record administered doses when finalizing the patient’s vaccination visit.</p>
      </div>
      <span className="workspace-count"><Syringe size={15} aria-hidden="true" />{pets.length} patients</span>
    </header>
    <div className="vaccine-directory-tools">
      <label htmlFor="patient-card-search">Find a patient
        <span><Search size={17} aria-hidden="true" /><input id="patient-card-search" type="search" placeholder="Patient, owner, species or card number" value={search} onChange={e => setSearch(e.target.value)} /></span>
      </label>
      <p role="status">{matches.length} matching {matches.length === 1 ? "patient" : "patients"}</p>
    </div>
    {matches.length ? <PaginatedList label="Patient vaccination cards" resetKey={search} className="vaccine-directory-grid">
      {matches.map(p => <button type="button" className="vaccine-patient-card" key={p.id} onClick={() => select(p.id)} aria-label={`Open vaccination card for ${p.name}`}>
        <span className="vaccine-patient-icon"><I e={ICON[p.species] || "paw"} size={24} /></span>
        <span className="vaccine-patient-copy">
          <strong>{p.name}</strong>
          <span>{p.species || "Species not recorded"}{p.breed ? ` · ${p.breed}` : ""}</span>
          <small>Owner: {ownerOf(p)?.name || "Not recorded"}</small>
          <span className="vaccine-card-reference">{p.vaccinationCardId || "Card pending"}</span>
        </span>
        <ArrowUpRight size={18} aria-hidden="true" />
      </button>)}
    </PaginatedList> : <div className="empty sm">
      <Syringe size={28} aria-hidden="true" />
      <h3>{pets.length ? "No matching patients" : "No assigned patients yet"}</h3>
      <p>{pets.length ? "Try another patient name, owner or card number." : "Patient cards appear here when their clinic records are available."}</p>
      {search && <button type="button" className="btn ghost" onClick={() => setSearch("")}>Clear search</button>}
    </div>}
    {selected && <PetCardModal {...props} petId={selected} onClose={() => select(null)} />}
  </section>;
}

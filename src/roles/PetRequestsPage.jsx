import {registrationsWithoutVisit} from '../assistantWorkflow.js';
import { PaginatedList } from "../components/Pagination.jsx";
import { useState } from "react";
import { CheckCircle2 } from "lucide-react";
import { ICON, I } from "../lib.jsx";
import PetApprovalModal from "./PetApprovalModal.jsx";

export default function PetRequestsPage({ db, setDb, me, say, go }) {
  const [filter, setFilter] = useState("Pending"); // 'All' | 'Pending' | 'Approved' | 'Declined'
  const [search, setSearch] = useState("");
  const [activeReq, setActiveReq] = useState(null);

  const standalone=new Set(registrationsWithoutVisit(db).map(r=>r.id));
  const reqs = (db.petRequests || []).filter(r=>r.status!=='Pending' || standalone.has(r.id));
  const pendingCount = reqs.filter(r => r.status === "Pending").length;

  const filtered = reqs.filter(r => {
    if (filter !== "All" && r.status !== filter) return false;
    if (search.trim()) {
      const q = search.toLowerCase();
      const owner = db.owners.find(o => o.id === r.ownerId) || {};
      const str = `${r.name} ${r.species} ${r.breed} ${owner.name} ${owner.phone}`.toLowerCase();
      if (!str.includes(q)) return false;
    }
    return true;
  });

  return (
    <div className="staff-requests" style={{ padding: "0 0 24px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px", flexWrap: "wrap", gap: "10px" }}>
        <div>
          <h2 style={{ margin: "0 0 4px", fontSize: "calc(22px * var(--fs, 1))", color: "var(--navy)" }}>
            Pets without a visit and registration history
          </h2>
          <p style={{ margin: 0, color: "#64748b", fontSize: "calc(13.5px * var(--fs, 1))" }}>
            Booked pets use one combined appointment and registration review at Front Desk. This page retains registration details and previous decisions. Approval keeps the patient’s treatment reference. Administered vaccinations are recorded by the attending veterinarian.
          </p>
        </div>
      </div>

      {go && <button type="button" className="btn ghost" style={{marginBottom:16}} onClick={()=>go("home")}>Open Front Desk for booked requests</button>}

      {/* Filter and search bar */}
      <div className="card" style={{ padding: "14px", marginBottom: "16px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "10px" }}>
          <div style={{ display: "flex", flexWrap:"wrap", gap: "8px" }}>
            {["Pending", "Approved", "Declined", "All"].map(status => {
              const count = status === "All" ? reqs.length : reqs.filter(x => x.status === status).length;
              return (
                <button
                  key={status}
                  type="button"
                  className={`btn sm ${filter === status ? "gold" : "ghost"}`}
                  aria-pressed={filter === status}
                  onClick={() => setFilter(status)}
                >
                  {status} ({count})
                </button>
              );
            })}
          </div>

          <div style={{ minWidth: "220px" }}>
            <input
              type="search" aria-label="Search pet registrations"
              placeholder="Search pet, breed, owner..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              style={{ padding: "6px 12px", width: "100%", fontSize: "calc(13px * var(--fs, 1))" }}
            />
          </div>
        </div>
      </div>

      {/* List */}
      <div className="card">
        {filtered.length ? (
          <PaginatedList label="Pet registrations" resetKey={[filter,search]} style={{ display: "grid", gap: "12px" }}>
            {filtered.map(r => {
              const owner = db.owners.find(o => o.id === r.ownerId) || {};
              const isPending = r.status === "Pending";
              const isApproved = r.status === "Approved";
              const isDeclined = r.status === "Declined";

              return (
                <div
                  key={r.id}
                  onClick={() => setActiveReq(r)}
                  style={{
                    padding: "14px 16px",
                    borderRadius: "10px",
                    border: "1px solid " + (isPending ? "#86efac" : "#e2e8f0"),
                    background: isPending ? "#f0fdf4" : "#fff",
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    flexWrap: "wrap",
                    gap: "12px",
                    cursor: "pointer",
                    transition: "all 0.15s ease"
                  }}
                  title={isPending ? "Review registration" : "View the recorded decision"}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: "14px" }}>
                    <span style={{ fontSize: "calc(28px * var(--fs, 1))", color: "var(--navy)" }}><I e={r.species || "paw"} size={28} /></span>
                    <div>
                      <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
                        <b style={{ fontSize: "calc(16px * var(--fs, 1))", color: "var(--navy)" }}>{r.name}</b>
                        <span style={{ fontSize: "calc(12px * var(--fs, 1))", background: "#f1f5f9", padding: "2px 8px", borderRadius: "6px", color: "#334155" }}>
                          {r.species} &bull; {r.breed || "Mixed"} &bull; {r.sex}
                        </span>
                        <span
                          style={{
                            fontSize: "calc(11.5px * var(--fs, 1))",
                            padding: "2px 8px",
                            borderRadius: "99px",
                            fontWeight: 700,
                            background: isPending ? "#fef3c7" : isApproved ? "#dcfce7" : "#fee2e2",
                            color: isPending ? "#92400e" : isApproved ? "#15803d" : "#991b1b",
                            border: `1px solid ${isPending ? "#fde047" : isApproved ? "#86efac" : "#fca5a5"}`
                          }}
                        >
                          {r.status}
                        </span>
                        {r.cardId && (
                          <span style={{ fontSize: "calc(11.5px * var(--fs, 1))", background: "#e0f2fe", color: "#0369a1", padding: "2px 6px", borderRadius: "4px", fontWeight: 600 }}>
                            Card #{r.cardId}
                          </span>
                        )}
                      </div>

                      <div style={{ fontSize: "calc(13px * var(--fs, 1))", color: "#475569", marginTop: "4px" }}>
                        <b>Owner:</b> {owner.name} ({owner.phone || "No phone"}) &bull; <b>Birth:</b> {r.birth} &bull; <b>Weight:</b> {r.weight} kg
                      </div>

                      {r.notes && (
                        <div style={{ fontSize: "calc(12px * var(--fs, 1))", color: "#64748b", marginTop: "2px", fontStyle: "italic" }}>
                          Notes: &ldquo;{r.notes}&rdquo;
                        </div>
                      )}

                      {isDeclined && r.declineReason && (
                        <div style={{ fontSize: "calc(12px * var(--fs, 1))", color: "#dc2626", marginTop: "4px", fontWeight: 600 }}>
                          Declined reason: {r.declineReason}
                        </div>
                      )}
                    </div>
                  </div>

                  <div>
                    {isPending ? (
                      <button
                        className="btn gold sm"
                        onClick={() => setActiveReq(r)}
                        style={{ display: "flex", alignItems: "center", gap: "6px" }}
                      >
                        <CheckCircle2 size={16} aria-hidden="true" />
                        <b>View registration / booking details</b>
                      </button>
                    ) : isApproved ? (
                      <span style={{ fontSize: "calc(12px * var(--fs, 1))", color: "#16a34a", fontWeight: 600 }}>
                        Approved ({r.approvedAt || "date not recorded"})
                      </span>
                    ) : (
                      <button
                        className="btn ghost sm"
                        onClick={() => setActiveReq(r)}
                        title="View the recorded decision and correction instructions"
                      >
                        View decline details
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </PaginatedList>
        ) : (
          <div className="empty sm">
            No pet registration requests found matching current filter.
          </div>
        )}
      </div>

      {activeReq && (
        <PetApprovalModal
          request={activeReq}
          db={db}
          setDb={setDb}
          me={me}
          onClose={() => setActiveReq(null)}
          onProcessed={(action, newPet, cardId) => {
            setActiveReq(null);
            if (action === "appointment-approved") {
              say("Appointment approved, registration verified and slot confirmed.");
            } else if (action === "approved") {
              say("Registration verified. The internal patient reference is ready for treatment.");
            } else {
              say("Pet registration request declined.");
            }
          }}
        />
      )}
    </div>
  );
}


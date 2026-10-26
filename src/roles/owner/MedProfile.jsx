import VitalsHistory from '../VitalsHistory.jsx';
import { ShieldCheck, AlertTriangle, ClipboardList, Info } from "lucide-react";


/* Owners can read recorded clinical data; corrections are handled by clinic staff. */
export default function MedProfile({ p,me }) {
  const allergies=p.allergies || [];

  return (
    <div className="ow-mp" style={{ maxWidth: "100%", padding: "4px 0" }}>
      {/* 1. Verified Allergies Section */}
      <section aria-labelledby="mp-al" style={{ marginBottom: "24px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "6px" }}>
          <h4 id="mp-al" style={{ margin: 0, fontSize: "1.1rem", color: "var(--navy)", fontWeight: 800, display: "flex", alignItems: "center", gap: "8px" }}>
            <ShieldCheck size={20} aria-hidden="true" /> <span>Recorded Allergies &amp; Sensitivities</span>
          </h4>
          <span style={{ fontSize: "0.78rem", color: "#64748b", background: "#f1f5f9", padding: "2px 8px", borderRadius: "6px", fontWeight: 600 }}>
            Official Clinical Record
          </span>
        </div>
        <p style={{ margin: "0 0 12px", color: "var(--mu)", fontSize: "0.88rem" }}>
          Known adverse clinical reactions on file for {p.name} (food, medications, topical treatments, or environmental triggers).
        </p>

        {allergies.length ? (
          <ul className="ow-tags" style={{ margin: 0 }}>
            {allergies.map(a => (
              <li
                className="ow-tag"
                key={a}
                style={{
                  padding: "6px 14px",
                  fontSize: "0.85rem",
                  fontWeight: 700,
                  background: "#fee2e2",
                  color: "#991b1b",
                  border: "1px solid #fca5a5",
                  borderRadius: "8px"
                }}
              >
                <AlertTriangle size={14} aria-hidden="true" /> {a}
              </li>
            ))}
          </ul>
        ) : (
          <div style={{ background: "#f8fafc", border: "1px dashed var(--ln)", borderRadius: "10px", padding: "14px 18px", color: "#64748b", fontSize: "0.88rem" }}>
            <span>No allergies recorded for {p.name}. Tell the front desk about any known reactions at your next visit. The clinic records them on your pet’s profile.</span>
          </div>
        )}
      </section>

      <VitalsHistory petId={p.id} me={me} />

      {/* 3. Clinical Care Notes Section */}
      <section aria-labelledby="mp-nt">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "6px" }}>
          <h4 id="mp-nt" style={{ margin: 0, fontSize: "1.1rem", color: "var(--navy)", fontWeight: 800, display: "flex", alignItems: "center", gap: "8px" }}>
            <ClipboardList size={20} aria-hidden="true" /> <span>Clinical Care &amp; Handling Notes</span>
          </h4>
          <span style={{ fontSize: "0.78rem", color: "#64748b", background: "#f1f5f9", padding: "2px 8px", borderRadius: "6px", fontWeight: 600 }}>
            Read Only
          </span>
        </div>
        <p style={{ margin: "0 0 10px", color: "var(--mu)", fontSize: "0.88rem" }}>
          Special behavior, fears, temperament, or dietary guidance recorded on {p.name}’s patient file.
        </p>

        <div style={{ background: "#f8fafc", border: "1px solid var(--ln)", borderRadius: "10px", padding: "14px 16px" }}>
          {p.notes ? (
            <p style={{ margin: 0, fontSize: "0.92rem", color: "#1e293b", lineHeight: 1.5 }}>
              “{p.notes}”
            </p>
          ) : (
            <span style={{ color: "#64748b", fontSize: "0.88rem", fontStyle: "italic" }}>
              No special temperament or handling notes recorded on file.
            </span>
          )}
          <div style={{ marginTop: "10px", fontSize: "0.75rem", color: "#64748b", borderTop: "1px solid #e2e8f0", paddingTop: "8px" }}>
            <Info size={16} aria-hidden="true" /> To update care instructions or reported sensitivities, notify the Vet Assistant during your next clinic visit.
          </div>
        </div>
      </section>
    </div>
  );
}

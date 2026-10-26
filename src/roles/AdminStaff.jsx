import LiveControl from '../components/LiveControl.jsx';
import AuditActivity from "../components/AuditActivity.jsx";
import { AUDIT_TYPES, auditActivity } from "../auditActivity.js";
import { PaginatedList, PaginatedTable } from "../components/Pagination.jsx";
import { useEffect, useRef, useState } from 'react';
import { useClinicRead } from '../useClinicRead.js';
import { api } from '../api.js';
import { STAFF_ROLES, staffRoleLabel } from '../staffRoles.js';
import {
  Shield,
  UserCheck,
  UserX,
  Lock,
  Unlock,
  Mail,
  Phone,
  Search,
  RefreshCw,
  Plus,
  Stethoscope,
  ConciergeBell,
  ShieldCheck,
  Clock,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  FileText,
  User
} from 'lucide-react';

export function useAdminStaff() {
  return useClinicRead('/api/admin/staff', 15000);
}

export default function AdminStaff({ onInvite }) {
  const { data, error, loading, load } = useAdminStaff();
  const [filter, setFilter] = useState('');
  const [roleFilter, setRoleFilter] = useState('all');
  const [target, setTarget] = useState(null);
  const [selected,setSelected]=useState(null);
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [notice, setNotice] = useState('');
  const busy = useRef(false);

  const choose = (person, action) => {
    setTarget({ ...person, action });
    setReason('');
    setSaveError('');
    setNotice('');
  };

  const save = async (e) => {
    e.preventDefault();
    if (busy.current) return;
    busy.current = true;
    setSaving(true);
    setSaveError('');
    try {
      const path = target.action === 'revoke'
        ? `/api/admin/invitations/${encodeURIComponent(target.id)}/revoke`
        : `/api/admin/staff/${encodeURIComponent(target.id)}/access`;
      const result = await api.post(path, { action: target.action, revision: target.revision, reason: reason.trim() });
      if (result?.success !== true) {
        throw Error("The server did not confirm this access change. Refresh staff to check its current status.");
      }
      setNotice(target.action === 'revoke' ? 'Invitation successfully revoked.' : `${target.name}: ${target.action} saved. Existing sessions were terminated; staff member must re-authenticate.`);
      setTarget(null);
      await load();
    } catch (e) {
      setSaveError(e.message);
    } finally {
      busy.current = false;
      setSaving(false);
    }
  };

  const staff = (data?.staff || []).filter(u => {
    const matchesQuery = `${u.name} ${u.email} ${u.role} ${u.vetId || ''}`.toLowerCase().includes(filter.toLowerCase());
    const matchesRole = roleFilter === 'all' || u.role === roleFilter;
    return matchesQuery && matchesRole;
  });

  const invitations = data?.invitations || [];
  const detail=selected && (selected.kind==='staff'?data?.staff:invitations)?.find(p=>p.id===selected.id);
  const openDetails=(person,kind)=>setSelected({id:person.id,kind});
  const rowClick=(event,person,kind)=>{if(!event.target.closest('button,a,input,select'))openDetails(person,kind);};

  return (
    <>
      {/* Top Banner & Management Actions */}
      <section className="card" style={{ padding: "26px", marginBottom: "20px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: "16px", marginBottom: "20px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
            <div style={{
              width: "44px",
              height: "44px",
              borderRadius: "12px",
              background: "linear-gradient(135deg, #eff6ff 0%, #dbeafe 100%)",
              color: "#2563eb",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0
            }}>
              <Shield size={24} />
            </div>
            <div>
              <h2 style={{ margin: 0, fontSize: "calc(20px * var(--fs, 1))", color: "var(--navy, #0f172a)", fontWeight: 800 }}>
                Staff Access &amp; Role Management
              </h2>
              <p style={{ margin: "3px 0 0", fontSize: "calc(13px * var(--fs, 1))", color: "#64748b" }}>
                Authorize staff and administrators, monitor 2-factor SMS status, and govern session security.
              </p>
            </div>
          </div>

          <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
            <button
              type="button"
              className="btn gold"
              onClick={onInvite}
              style={{ display: "inline-flex", alignItems: "center", gap: "6px", fontWeight: 700 }}
            >
              <Plus size={16} />
              <span>Invite Staff Member</span>
            </button>
            <button
              type="button"
              className="btn ghost"
              disabled={loading}
              onClick={() => load()}
              style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}
            >
              <RefreshCw size={14} className={loading ? "spin" : ""} />
              <span>{loading ? "Refreshing..." : "Refresh Staff"}</span>
            </button>
          </div>
        </div>

        {/* Filter Controls Bar */}
        <div style={{ display: "flex", gap: "12px", alignItems: "center", flexWrap: "wrap", background: "#f8fafc", padding: "12px 16px", borderRadius: "14px", border: "1px solid #e2e8f0" }}>
          <div style={{ position: "relative", flex: "1 1 240px" }}>
            <Search size={15} color="#94a3b8" style={{ position: "absolute", left: "12px", top: "50%", transform: "translateY(-50%)" }} />
            <input
              type="search"
              aria-label="Search staff"
              placeholder="Search by name, email, or doctor ID..."
              value={filter}
              onChange={e => setFilter(e.target.value)}
              style={{ width: "100%", paddingLeft: "34px", fontSize: "calc(13px * var(--fs, 1))" }}
            />
          </div>

          <div style={{ display: "flex", flexWrap: "wrap", gap: "6px", alignItems: "center" }}>
            <span style={{ fontSize: "calc(12px * var(--fs, 1))", color: "#64748b", fontWeight: 600 }}>Role:</span>
            {['all', 'vet', 'assistant', 'admin'].map(r => (
              <button
                key={r}
                type="button"
                className={`btn sm ${roleFilter === r ? 'gold' : 'ghost'}`}
                onClick={() => setRoleFilter(r)}
                style={{ fontSize: "calc(11.5px * var(--fs, 1))", padding: "4px 10px", borderRadius: "99px" }}
              >
                {r === 'all' ? 'All Staff' : STAFF_ROLES[r].plural}
              </button>
            ))}
          </div>
        </div>

        {notice && (
          <div role="status" style={{ background: "#f0fdf4", border: "1px solid #86efac", color: "#15803d", borderRadius: "10px", padding: "10px 14px", fontSize: "calc(13px * var(--fs, 1))", marginTop: "14px", display: "flex", alignItems: "center", gap: "8px" }}>
            <CheckCircle2 size={16} />
            <span>{notice}</span>
          </div>
        )}

        {error && (
          <div role="alert" style={{ background: "#fef2f2", border: "1px solid #fecaca", color: "#991b1b", borderRadius: "10px", padding: "10px 14px", fontSize: "calc(13px * var(--fs, 1))", marginTop: "14px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <span>{error} {data && '(Showing cached staff records)'}</span>
            <button className="btn ghost sm" onClick={() => load()}>Retry</button>
          </div>
        )}

        {/* Staff Directory Cards Grid */}
        <div style={{ marginTop: "20px" }}>
          {!data && loading ? (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(min(100%,320px), 1fr))", gap: "14px" }}>
              {[1, 2].map(k => (
                <div key={k} className="card" style={{ padding: "20px", minHeight: "160px", background: "#f8fafc", border: "1.5px dashed #e2e8f0", display: "flex", alignItems: "center", justifyContent: "center", color: "#94a3b8" }}>
                  <span style={{ fontSize: "calc(13px * var(--fs, 1))" }}>Loading staff accounts…</span>
                </div>
              ))}
            </div>
          ) : data && !staff.length ? (
            <div className="empty sm" style={{ padding: "32px 16px" }}>
              <p style={{ margin: 0, fontWeight: 600, color: "#64748b" }}>
                {filter.trim() ? "No staff accounts match your search filter." : "No staff accounts found. Click '+ Invite Staff Member' to get started."}
              </p>
            </div>
          ) : (
            <PaginatedList label="Staff accounts" resetKey={[filter,roleFilter]} style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(min(100%,320px), 1fr))", gap: "14px" }}>
              {staff.map(u => {
                const isVet = u.role === 'vet';
                const initials = (u.name || "U").split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase();
                return (
                  <article
                    className="staff-account-card staff-clickable"
                    onClick={event=>rowClick(event,u,'staff')}
                    key={u.id}
                    style={{
                      background: "#ffffff",
                      border: `1.5px solid ${!u.active ? "#cbd5e1" : u.locked ? "#fca5a5" : "#e2e8f0"}`,
                      borderRadius: "16px",
                      padding: "18px",
                      boxShadow: "0 2px 6px rgba(0,0,0,0.02)",
                      display: "flex",
                      flexDirection: "column",
                      justifyContent: "space-between",
                      transition: "all 0.15s ease"
                    }}
                  >
                    <div>
                      {/* Top Row: Avatar & Status */}
                      <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "nowrap", gap: "10px", alignItems: "flex-start", marginBottom: "12px" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: "10px", minWidth: 0, flex: 1 }}>
                          <div style={{
                            width: "42px",
                            height: "42px",
                            borderRadius: "12px",
                            background: isVet ? "#eff6ff" : "#fffbeb",
                            color: isVet ? "#2563eb" : "#d97706",
                            border: `1px solid ${isVet ? "#bfdbfe" : "#fde68a"}`,
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            fontWeight: 800,
                            fontSize: "calc(15px * var(--fs, 1))"
                          }}>
                            {initials}
                          </div>
                          <div>
                            <h3 style={{ margin: 0, fontSize: "calc(15.5px * var(--fs, 1))", color: "var(--navy, #0f172a)", fontWeight: 700 }}>
                              <button type="button" className="staff-detail-link" aria-label={`View staff details for ${u.name}`} onClick={()=>openDetails(u,'staff')}>{u.name}</button>
                            </h3>
                            <div style={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: "6px", marginTop: "2px" }}>
                              <span style={{
                                display: "inline-flex",
                                alignItems: "center",
                                gap: "3px",
                                fontSize: "calc(11px * var(--fs, 1))",
                                fontWeight: 700,
                                color: u.role === 'admin' ? "#6d28d9" : isVet ? "#1d4ed8" : "#b45309"
                              }}>
                                {u.role === 'admin' ? <ShieldCheck size={11} /> : isVet ? <Stethoscope size={11} /> : <ConciergeBell size={11} />}
                                <span>{staffRoleLabel(u.role)}</span>{u.self && <span style={{ marginLeft: 6, background: "#ede9fe", color: "#5b21b6", borderRadius: 99, padding: "0 7px" }}>You</span>}
                              </span>
                              {u.vetId && (
                                <span style={{ fontSize: "calc(10.5px * var(--fs, 1))", background: "#f1f5f9", color: "#475569", padding: "1px 5px", borderRadius: "4px", fontFamily: "monospace" }}>
                                  {u.vetId}
                                </span>
                              )}
                            </div>
                          </div>
                        </div>

                        {/* Status Pills */}
                        <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: "4px", flex: "none" }}>
                          <span style={{ whiteSpace: "nowrap",
                            fontSize: "calc(11px * var(--fs, 1))",
                            fontWeight: 700,
                            padding: "2px 8px",
                            borderRadius: "99px",
                            background: !u.active ? "#f1f5f9" : u.locked ? "#fef2f2" : "#ecfdf5",
                            color: !u.active ? "#64748b" : u.locked ? "#dc2626" : "#059669",
                            border: `1px solid ${!u.active ? "#cbd5e1" : u.locked ? "#fecaca" : "#a7f3d0"}`
                          }}>
                            {!u.active ? "○ Inactive" : u.locked ? "Locked" : "● Active"}
                          </span>
                        </div>
                      </div>

                      {/* Contact Info */}
                      <div style={{ fontSize: "calc(12px * var(--fs, 1))", color: "#64748b", margin: "10px 0 12px", display: "grid", gap: "4px" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                          <Mail size={13} color="#94a3b8" />
                          <span style={{ color: "#334155" }}>{u.email}</span>
                        </div>
                        <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                          <Phone size={13} color={u.mobileVerified ? "#16a34a" : "#d97706"} />
                          <span style={{ color: u.mobileVerified ? "#15803d" : "#b45309", fontWeight: 600 }}>
                            {u.mobileVerified ? "Mobile OTP verified" : "Pending SMS verification"}
                          </span>
                        </div>
                      </div>

                      {u.reason && (
                        <div style={{ background: "#f8fafc", padding: "6px 10px", borderRadius: "8px", border: "1px solid #e2e8f0", fontSize: "calc(11px * var(--fs, 1))", color: "#475569", marginBottom: "12px" }}>
                          <b>Last access note:</b> {u.reason}
                        </div>
                      )}
                    </div>

                    {/* Actions Row */}
                    {u.self ? <div style={{ paddingTop: "12px", borderTop: "1px solid #f1f5f9", fontSize: "calc(12px * var(--fs, 1))", color: "#64748b" }}>This is your account. Another administrator manages your access.</div> : <div style={{ display: "flex", gap: "8px", paddingTop: "12px", borderTop: "1px solid #f1f5f9", flexWrap: "wrap" }}>
                      <button
                        type="button"
                        className={`btn sm ${u.active ? 'ghost' : 'gold'}`}
                        style={{ fontSize: "calc(12px * var(--fs, 1))", padding: "4px 10px", flex: 1 }}
                        onClick={() => choose(u, u.active ? 'deactivate' : 'reactivate')}
                      >
                        {u.active ? <UserX size={13} style={{ marginRight: 4 }} /> : <UserCheck size={13} style={{ marginRight: 4 }} />}
                        <span>{u.active ? 'Deactivate' : 'Reactivate'}</span>
                      </button>

                      {u.active && u.locked && (
                        <button
                          type="button"
                          className="btn sm"
                          style={{ fontSize: "calc(12px * var(--fs, 1))", padding: "4px 10px", background: "#fef2f2", color: "#dc2626", borderColor: "#fecaca" }}
                          onClick={() => choose(u, 'unlock')}
                        >
                          <Unlock size={13} style={{ marginRight: 4 }} />
                          <span>Unlock Account</span>
                        </button>
                      )}
                    </div>}
                  </article>
                );
              })}
            </PaginatedList>
          )}
        </div>
      </section>

      {/* Recent Staff Invitations Section */}
      <section className="card" style={{ padding: "26px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px", flexWrap: "wrap", gap: "10px" }}>
          <div>
            <h3 style={{ margin: "0 0 4px", fontSize: "calc(17px * var(--fs, 1))", color: "var(--navy, #0f172a)", fontWeight: 700 }}>
              Staff Invitation Dispatches
            </h3>
            <p style={{ margin: 0, fontSize: "calc(12.5px * var(--fs, 1))", color: "#64748b" }}>
              Secure invitation links expire after 7 days. Revoking immediately voids the token.
            </p>
          </div>
          <span style={{ fontSize: "calc(12px * var(--fs, 1))", color: "#64748b", fontWeight: 600 }}>
            {invitations.length} Total Dispatched
          </span>
        </div>

        {!data && loading ? (
          <div className="empty sm" style={{ padding: "24px 16px", color: "#94a3b8" }}>
            <p style={{ margin: 0 }}>Loading invitation records…</p>
          </div>
        ) : data && !invitations.length ? (
          <div className="empty sm" style={{ padding: "24px 16px" }}>
            <p style={{ margin: 0, color: "#64748b" }}>No staff invitations created yet.</p>
          </div>
        ) : (
          <div style={{ overflowX: "auto", border: "1px solid #e2e8f0", borderRadius: "14px" }}>
            <PaginatedTable label="Staff invitations" className="tbl staff-invitation-table" style={{ margin: 0, fontSize: "calc(12.5px * var(--fs, 1))" }}>
              <thead>
                <tr style={{ background: "#f8fafc" }}>
                  <th style={{ padding: "10px 14px" }}>Staff Member</th>
                  <th style={{ padding: "10px 14px" }}>Role</th>
                  <th style={{ padding: "10px 14px" }}>Status</th>
                  <th style={{ padding: "10px 14px" }}>Link Expiration</th>
                  <th style={{ padding: "10px 14px", textAlign: "right" }}>Action</th>
                </tr>
              </thead>
              <tbody>
                {invitations.map(i => {
                  const isPending = i.status === 'Pending';
                  const isAccepted = i.status === 'Accepted';
                  return (
                    <tr key={i.id} className="staff-clickable" onClick={event=>rowClick(event,i,'invitation')}>
                      <td data-label="Staff member" style={{ padding: "10px 14px" }}>
                        <button type="button" className="staff-detail-link" aria-label={`View invitation for ${i.name || i.email}`} onClick={()=>openDetails(i,'invitation')}>{i.name || i.email}</button>
                        <div style={{ fontSize: "calc(11.5px * var(--fs, 1))", color: "#64748b" }}>{i.email}</div>
                      </td>
                      <td data-label="Role" style={{ padding: "10px 14px" }}>
                        <span style={{
                          display: "inline-flex",
                          alignItems: "center",
                          gap: "4px",
                          background: i.role === 'admin' ? "#f5f3ff" : i.role === 'vet' ? "#eff6ff" : "#fffbeb",
                          color: i.role === 'admin' ? "#6d28d9" : i.role === 'vet' ? "#1d4ed8" : "#b45309",
                          border: `1px solid ${i.role === 'admin' ? "#ddd6fe" : i.role === 'vet' ? "#bfdbfe" : "#fde68a"}`,
                          padding: "2px 8px",
                          borderRadius: "6px",
                          fontSize: "calc(11px * var(--fs, 1))",
                          fontWeight: 700
                        }}>
                          {staffRoleLabel(i.role)}
                        </span>
                      </td>
                      <td data-label="Status" style={{ padding: "10px 14px" }}>
                        <span style={{
                          fontSize: "calc(11px * var(--fs, 1))",
                          fontWeight: 700,
                          padding: "2px 8px",
                          borderRadius: "99px",
                          background: isPending ? "#fef3c7" : isAccepted ? "#dcfce7" : "#f1f5f9",
                          color: isPending ? "#b45309" : isAccepted ? "#15803d" : "#64748b",
                          border: `1px solid ${isPending ? "#fde68a" : isAccepted ? "#86efac" : "#cbd5e1"}`
                        }}>
                          {i.status}
                        </span>
                      </td>
                      <td data-label="Link expiration" style={{ padding: "10px 14px", color: "#64748b", whiteSpace: "nowrap" }}>
                        {new Date(i.expiresAt).toLocaleDateString("en-PH", { month: "short", day: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit" })}
                      </td>
                      <td data-label="Action" style={{ padding: "10px 14px", textAlign: "right" }}>
                        {isPending ? (
                          <button
                            type="button"
                            className="btn ghost sm"
                            style={{ color: "#dc2626", borderColor: "#fecaca" }}
                            onClick={() => choose(i, 'revoke')}
                          >
                            Revoke Link
                          </button>
                        ) : (
                          <span style={{ fontSize: "calc(11.5px * var(--fs, 1))", color: "#94a3b8" }}>—</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </PaginatedTable>
          </div>
        )}
      </section>

      {detail && <StaffDetails person={detail} kind={selected.kind} onClose={()=>setSelected(null)} onAction={action=>{setSelected(null);choose(detail,action);}} />}
      {/* Access Action Modal Dialog */}
      {target && (
        <div className="scrim" onMouseDown={e => e.target === e.currentTarget && !saving && setTarget(null)}>
          <div className="modal" role="dialog" aria-modal="true" aria-labelledby="access-title" style={{ width: "min(540px, 100%)", borderRadius: "18px", padding: "26px" }}>
            <h3 id="access-title" style={{ margin: "0 0 6px", fontSize: "calc(18px * var(--fs, 1))", color: "var(--navy, #0f172a)", fontWeight: 700 }}>
              {target.action[0].toUpperCase() + target.action.slice(1)}: {target.name}
            </h3>
            
            <p style={{ margin: "0 0 16px", fontSize: "calc(13px * var(--fs, 1))", color: "#475569", lineHeight: 1.5 }}>
              {target.action === 'deactivate'
                ? 'This staff member will immediately lose clinic portal access. A veterinarian must hand off active consultation queues first. Reception must reassign upcoming visits.'
                : target.action === 'reactivate'
                ? 'Portal access will be restored; existing password and 2FA credentials remain intact. The staff member can sign in again.'
                : target.action === 'unlock'
                ? 'Clears security lock counters and requires a fresh login. Verification requirements still apply.'
                : 'This invitation activation link will immediately expire and cannot be redeemed.'}
            </p>

            <form onSubmit={save}>
              <div className="fld" style={{ marginBottom: "16px" }}>
                <label htmlFor="access-reason" style={{ fontWeight: 600, fontSize: "calc(12.5px * var(--fs, 1))" }}>
                  Administrative Reason<i> *</i>
                </label>
                <LiveControl as="textarea"
                  id="access-reason"
                  aria-label="Access change reason"
                  required
                  maxLength={300}
                  rows={3}
                  placeholder="Enter the official reason for this access change (e.g. Leave of absence, staff departure, identity re-verified)..."
                  value={reason}
                  onChange={e => setReason(e.target.value)}
                  disabled={saving}
                  style={{ width: "100%", fontSize: "calc(13px * var(--fs, 1))" }}
                />
                <span style={{ fontSize: "calc(11px * var(--fs, 1))", color: "#64748b", marginTop: "3px", display: "block" }}>
                  Recorded in the immutable system audit trail for compliance.
                </span>
              </div>

              {saveError && (
                <div role="alert" style={{ background: "#fef2f2", border: "1px solid #fecaca", color: "#991b1b", borderRadius: "8px", padding: "8px 12px", fontSize: "calc(12.5px * var(--fs, 1))", marginBottom: "14px" }}>
                  {saveError}
                </div>
              )}

              <div className="row end" style={{ gap: "8px", flexWrap: "wrap" }}>
                <button
                  type="button"
                  className="btn ghost"
                  disabled={saving}
                  onClick={() => setTarget(null)}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className={target.action === 'deactivate' || target.action === 'revoke' ? 'btn danger' : 'btn gold'}
                  disabled={saving || !reason.trim()}
                >
                  {saving ? 'Saving...' : `Confirm ${target.action[0].toUpperCase() + target.action.slice(1)}`}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}

function StaffDetails({person,kind,onClose,onAction}) {
  const dialog=useRef(null);
  useEffect(()=>{
    const element=dialog.current,previous=document.activeElement;
    element.showModal();
    return ()=>{element.close();if(previous?.isConnected)previous.focus({preventScroll:true});};
  },[]);
  const invitation=kind==='invitation';
  const status=invitation?person.status:!person.active?'Inactive':person.locked?'Locked':'Active';
  return <dialog ref={dialog} className="staff-details-dialog" aria-labelledby="staff-details-title" onCancel={onClose} onClick={e=>{if(e.target===e.currentTarget){const b=e.currentTarget.getBoundingClientRect();if(e.clientX<b.left||e.clientX>b.right||e.clientY<b.top||e.clientY>b.bottom)onClose();}}}>
    <header><span className="admin-eyebrow">{invitation?'Staff invitation':'Staff account'}</span><h2 id="staff-details-title">{person.name || person.email}</h2><p>Review {invitation?'invitation status and activation expiry':'account access and verification'}.</p></header>
    <dl className="staff-detail-fields">
      <div><dt>Email address</dt><dd>{person.email}</dd></div>
      <div><dt>Role</dt><dd>{staffRoleLabel(person.role)}</dd></div>
      <div><dt>Status</dt><dd><span className={`staff-status-chip ${status==='Active'||status==='Accepted'?'is-active':status==='Locked'?'is-locked':'is-pending'}`}>{status}</span></dd></div>
      {invitation?<div><dt>Activation link expires</dt><dd>{new Date(person.expiresAt).toLocaleString('en-PH',{timeZone:'Asia/Manila',dateStyle:'medium',timeStyle:'short'})} · Manila</dd></div>:<>
        {person.vetId&&<div><dt>Doctor ID</dt><dd>{person.vetId}</dd></div>}
        <div><dt>Mobile verification</dt><dd>{person.mobileVerified?'Verified':'Pending SMS verification'}</dd></div>
        {person.lockedUntil&&<div><dt>Lock expires</dt><dd>{new Date(person.lockedUntil).toLocaleString('en-PH',{timeZone:'Asia/Manila'})} · Manila</dd></div>}
        <div><dt>Last access note</dt><dd>{person.reason || 'No access note recorded.'}</dd></div>
      </>}
    </dl>
    {invitation&&<p className="staff-detail-note">{status==='Pending'?'The recipient must open their emailed activation link to set a password and verify their mobile number.':status==='Accepted'?'This invitation has already been accepted.':'This link cannot be used. Create a new invitation if access is still needed.'}</p>}
    <footer className="row end">
      <button type="button" className="btn ghost" autoFocus onClick={onClose}>Close details</button>
      {invitation?status==='Pending'&&<button type="button" className="btn danger" onClick={()=>onAction('revoke')}>Revoke link</button>:<>
        {person.active&&person.locked&&<button type="button" className="btn ghost" onClick={()=>onAction('unlock')}>Unlock account</button>}
        <button type="button" className={`btn ${person.active?'danger':'gold'}`} onClick={()=>onAction(person.active?'deactivate':'reactivate')}>{person.active?'Deactivate':'Reactivate'}</button>
      </>}
    </footer>
  </dialog>;
}

export function AdminAudit() {
  const [search,setSearch]=useState(''),[query,setQuery]=useState(''),[roleFilter,setRoleFilter]=useState('all'),[typeFilter,setTypeFilter]=useState('all');
  const {data,error,loading,load}=useClinicRead('/api/admin/audit?search=');
  const loadHistory=(cursor=null,term=query)=>load(`/api/admin/audit?search=${encodeURIComponent(term)}${cursor?'&cursor='+encodeURIComponent(cursor):''}`,(old,result)=>({...result,entries:cursor?[...(old?.entries||[]),...result.entries]:result.entries,searchTerm:term}));
  const entries=data?.entries||[];
  const filtered=entries.filter(entry=>{const a=auditActivity(entry);return (roleFilter==='all'||a.role===roleFilter)&&(typeFilter==='all'||a.type===typeFilter);});
  const types=new Set(entries.map(e=>auditActivity(e).type));
  return <section className="card admin-audit" aria-labelledby="audit-title">
    <header className="admin-page-intro"><div><span className="admin-eyebrow">Activity & accountability</span><h2 id="audit-title">System audit trail</h2><p>See who performed an action, what they did and when it was saved.</p></div><button type="button" className="btn ghost" disabled={loading} onClick={()=>loadHistory()}><RefreshCw size={16} aria-hidden="true" />{loading?'Refreshing…':'Refresh activity'}</button></header>
    <div className="admin-audit-metrics"><div><b>{entries.length}</b><span>Loaded entries</span></div><div><b>{types.size}</b><span>Activity types loaded</span></div><div><b>{filtered.length}</b><span>Matching loaded entries</span></div></div>
    <form className="admin-audit-search" onSubmit={e=>{e.preventDefault();if(loading)return;setQuery(search);loadHistory(null,search);}}><label htmlFor="audit-search">Search saved history<span className="admin-search-input"><Search size={17} aria-hidden="true" /><LiveControl as="input" id="audit-search" type="search" maxLength={100} value={search} onChange={e=>setSearch(e.target.value)} placeholder="Person, action, patient or record reference" /></span></label><button className="btn" disabled={loading}>Search history</button>{query&&<button type="button" className="btn ghost" onClick={()=>{setSearch('');setQuery('');loadHistory(null,'');}}>Clear search</button>}</form>
    <div className="admin-audit-filters"><label>Performed by<select value={roleFilter} onChange={e=>setRoleFilter(e.target.value)}><option value="all">All roles</option><option value="admin">Administrators</option><option value="vet">Veterinarians</option><option value="assistant">Vet assistants</option><option value="owner">Pet owners</option></select></label><label>Activity type<select value={typeFilter} onChange={e=>setTypeFilter(e.target.value)}><option value="all">All activity types</option>{AUDIT_TYPES.map(t=><option key={t}>{t}</option>)}</select></label><p>Role and type filters apply to loaded entries. Search checks saved history; load older entries to see more.</p></div>
    {error&&<p role="alert" className="admin-audit-error">{error}{data?' Your previously loaded entries are still shown.':''}<button type="button" className="btn sm ghost" onClick={()=>loadHistory()}>Retry</button></p>}
    {filtered.length?<PaginatedList label="Audit trail" resetKey={[data?.searchTerm,roleFilter,typeFilter]} className="audit-entry-list">{filtered.map((entry,index)=><AuditActivity key={entry.id||index} entry={entry}/>)}</PaginatedList>:<div className="empty sm">{loading?'Loading saved activity…':data?'No loaded activity matches these filters.':'No activity is available yet.'}</div>}
    <footer className="admin-audit-footer"><span>Saved actions are read only. Times use Asia/Manila.</span>{loading&&<span role="status">Loading activity…</span>}{data?.nextCursor&&query===(data.searchTerm||'')&&<button type="button" className="btn ghost" disabled={loading} onClick={()=>loadHistory(data.nextCursor)}>Load older activity</button>}</footer>
  </section>;
}

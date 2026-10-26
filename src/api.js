import { clinicRequest } from "./clinicApi.js";

// Network-only client. Keep the legacy store bindings for existing callers;
// unreachable in-memory route handlers previously pulled registration datasets
// into every page, including the landing page.
let store = { get: () => ({ users: [], owners: [] }), set: () => {} };
export const bindStore = (get, set) => {
  store = { get, set };
};

let session = null;

export const setSessionUser = (u) => {
  session = u?.id || null;
};
const ownerOf = (db, u) =>
  (db.owners || []).find(
    (o) =>
      o.id === u.ownerId ||
      o.userId === u.id ||
      (u.email && o.email?.toLowerCase() === u.email.toLowerCase())
  );
export const findUser = (db, ident) => {
  const k = String(ident || "").trim().toLowerCase();
  return (
    k &&
    db.users.find(
      (u) =>
        u.email?.toLowerCase() === k ||
        u.username?.toLowerCase() === k ||
        (ownerOf(db, u) || {}).email?.toLowerCase() === k
    )
  );
};

async function call(method, path, body) {
  return clinicRequest(method, path, body);
}

// Function callable as api(path, body) -> { ok, d }
// OR as api.get(path), api.post(path, body)
function apiCall(p, b) {
  const method = b !== undefined ? "POST" : "GET";
  const cleanPath = p.startsWith("/") ? p : "/api/" + p;
  return call(method, cleanPath, b)
    .then((d) => ({ ok: true, d }))
    .catch((err) => ({
      ok: false,
      d: {
        error: err.message,
        errors: err.fields || err.errors || {},
        limit: !!err.limit,
      },
    }));
}

export const api = Object.assign(apiCall, {
  get: (p) => call("GET", p.startsWith("/") ? p : "/api/" + p),
  post: (p, b) => call("POST", p.startsWith("/") ? p : "/api/" + p, b),
  put: (p, b) => call("PUT", p.startsWith("/") ? p : "/api/" + p, b),
  patch: (p, b) => call("PATCH", p.startsWith("/") ? p : "/api/" + p, b),
  delete: (p) => call("DELETE", p.startsWith("/") ? p : "/api/" + p),
});


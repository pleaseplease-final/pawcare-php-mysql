/* Stand-in for an email / SMS provider while there is no real server.
   The mock server (api.js) pushes every message it would send here, and <DevInbox /> shows them on screen
   so you can click the verification and unlock links and read the SMS code.
   When api.js is replaced by real fetch() calls nothing pushes here any more, the inbox stays empty and hides itself. */
let items = [];
const subs = new Set();
export const outbox = {
  push: m => { items = [...items, { id: Math.random().toString(36).slice(2, 9), at: Date.now(), ...m }]; subs.forEach(f => f()); },
  clear: () => { items = []; subs.forEach(f => f()); },
  subscribe: f => { subs.add(f); return () => subs.delete(f); },
  get: () => items,
};

// Keeps the last clinic records for this browser tab so a refresh, or coming back to the tab, shows the
// workspace at once and updates it quietly in the background. Like the saved sign-in, it lives in
// sessionStorage: it is gone when the tab closes and is wiped on log out. The server stays the authority.
const PREFIX = 'pawcare_state_';
const MAX_AGE = 8 * 60 * 60 * 1000, MAX_SIZE = 3_000_000;
const keyFor = identity => PREFIX + identity;

export function readStateCache(identity, now = Date.now()) {
  try {
    const saved = JSON.parse(sessionStorage.getItem(keyFor(identity)) || 'null');
    return saved && now - saved.t < MAX_AGE && saved.data && typeof saved.data === 'object' ? saved.data : null;
  } catch { return null; }
}
export function writeStateCache(identity, data, now = Date.now()) {
  try {
    const text = JSON.stringify({t: now, data});
    if (text.length > MAX_SIZE) return sessionStorage.removeItem(keyFor(identity));
    sessionStorage.setItem(keyFor(identity), text);
  } catch { /* storage full or blocked: the next load simply fetches */ }
}
export function clearStateCache() {
  try { const keys = Array.from({length: sessionStorage.length}, (_, i) => sessionStorage.key(i)); keys.filter(k => k && k.startsWith(PREFIX)).forEach(k => sessionStorage.removeItem(k)); } catch { /* nothing to clear */ }
}

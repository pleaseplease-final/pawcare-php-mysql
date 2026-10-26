// Plain rules with no browser-only imports, so the staff setup form and the server can share them.
export const pn = (v) => /^(?=.*\p{L})[\p{L}\p{M}'’ -]{2,50}$/u.test(v) ? '' : '2-50 letters, spaces, hyphens or apostrophes only.';
export const pwOk = (v) => v.length >= 12 && v.length <= 128 && /[A-Z]/.test(v) && /[a-z]/.test(v) && /\d/.test(v) && /[^A-Za-z0-9]/.test(v);

import {diagnosisSuggestions,originalDiagnosisSuggestions} from '../src/diagnosisSuggestions.js';
import { readFileSync } from 'node:fs';
import { query } from './db.js';
let ready;
export function ensureNoteOptionsSchema() {
  return ready ||= (async () => {
    const exists = (await query("SELECT to_regclass(format('%I.clinical_note_options', current_schema())) AS options")).rows[0]?.options;
    if (!exists) await query(readFileSync(new URL('./database/note-options.sql', import.meta.url), 'utf8'));
    // Expand only the untouched original seed. Revision changes from any admin
    // save, including retirement, prevent reintroducing removed suggestions.
    await query(`UPDATE clinical_note_options SET options=jsonb_set(options,'{diagnosis}',$1::jsonb),revision=revision+1
      WHERE id=TRUE AND revision=0 AND options->'diagnosis'=$2::jsonb`,[JSON.stringify(diagnosisSuggestions),JSON.stringify(originalDiagnosisSuggestions)]);
  })().catch(error => { ready = undefined; throw error; });
}
export function validateNoteOptions(options) {
  if (!options || typeof options !== 'object' || Array.isArray(options)) throw Object.assign(new Error('Provide diagnosis and treatment choices.'), {status:400});
  const result = {};
  for (const field of ['diagnosis','treatment']) {
    const list = options[field];
    if (!Array.isArray(list) || list.length > 100 || list.some(value => typeof value !== 'string' || !value.trim() || value.trim().length > 1000 || /[\r\n]/.test(value)))
      throw Object.assign(new Error('Use at most 100 entries per list, each on one line with 1–1,000 characters.'), {status:400});
    result[field] = list.map(value => value.trim());
    if (new Set(result[field].map(value => value.toLowerCase())).size !== list.length)
      throw Object.assign(new Error('Remove duplicate choices before saving.'), {status:400});
  }
  return result;
}

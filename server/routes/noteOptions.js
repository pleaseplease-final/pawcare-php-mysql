import express from 'express';
import { query, withTransaction } from '../db.js';
import { ensureNoteOptionsSchema, validateNoteOptions } from '../noteOptions.js';
export const noteOptionsRouter = express.Router();
noteOptionsRouter.use(async (req, res, next) => {
  try { await ensureNoteOptionsSchema(); next(); }
  catch { res.status(500).json({error:'Unable to load clinic note choices. Please retry.'}); }
});
noteOptionsRouter.get('/', async (req, res) => {
  try {
    const {rows} = await query('SELECT revision, options FROM clinical_note_options WHERE id=TRUE');
    res.set('Cache-Control','no-store').json(rows[0]);
  } catch { res.status(500).json({error:'Unable to load clinic note choices. Please retry.'}); }
});
noteOptionsRouter.put('/', async (req, res) => {
  try {
    const options = validateNoteOptions(req.body.options);
    if (!Number.isInteger(req.body.revision) || req.body.revision < 0) throw Object.assign(new Error('Reload the current choices before saving.'), {status:409});
    const saved = await withTransaction(async client => {
      const {rows} = await client.query('UPDATE clinical_note_options SET options=$1, revision=revision+1 WHERE id=TRUE AND revision=$2 RETURNING options, revision', [options,req.body.revision]);
      if (!rows.length) throw Object.assign(new Error('Another administrator changed the choices. Reload and review them before saving.'), {status:409});
      await client.query('INSERT INTO audit_logs (user_name,user_role,action) VALUES ($1,$2,$3)', [req.user.name,req.user.role,`Updated diagnosis and treatment choices (revision ${rows[0].revision})`]);
      return rows[0];
    });
    res.json(saved);
  } catch (error) { res.status(error.status || 500).json({error:error.status ? error.message : 'Unable to save clinic note choices. Please retry.'}); }
});

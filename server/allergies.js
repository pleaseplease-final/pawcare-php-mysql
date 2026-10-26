import { withTransaction } from './db.js';
import { allergyListError, allergyName } from '../src/allergyRules.js';

const problem = (message, status = 400) => Object.assign(new Error(message), {status});

// Front desk staff, and a veterinarian during an active visit with the patient, keep the allergy list.
// The list shown on screen must still match what is saved, so two people cannot overwrite each other.
export async function saveAllergies(req, res) {
  try {
    const {allergies, expected} = req.body;
    const error = allergyListError(allergies);
    if (error) throw problem(error);
    if (!Array.isArray(expected) || expected.some(item => typeof item !== 'string')) throw problem('Reload the pet before changing allergies.', 409);
    const cleaned = allergies.map(allergyName);
    const saved = await withTransaction(async client => {
      const pet = (await client.query('SELECT id, name, allergies FROM pets WHERE id = $1 FOR UPDATE', [req.params.id])).rows[0];
      if (!pet) throw problem('Pet not found.', 404);
      if (req.user.role === 'vet') {
        const active = await client.query("SELECT 1 FROM appointments WHERE pet_id = $1 AND vet_id = ANY($2::varchar[]) AND status IN ('Checked-in','In consultation') LIMIT 1", [pet.id, [req.user.id, req.user.vetId].filter(Boolean)]);
        if (!active.rows.length) throw problem('Allergies can be changed during your active visit with this patient.', 403);
      }
      const current = (pet.allergies || []).map(allergyName);
      if (JSON.stringify(current) !== JSON.stringify(expected.map(allergyName))) throw problem('The allergy list was changed by someone else. Reload the pet and review it.', 409);
      await client.query('UPDATE pets SET allergies = $2 WHERE id = $1', [pet.id, cleaned]);
      await client.query('INSERT INTO audit_logs (user_name,user_role,action) VALUES ($1,$2,$3)', [req.user.name, req.user.role, `Updated allergies for ${pet.name} (${pet.id}): ${cleaned.join(', ') || 'none'}; before: ${current.join(', ') || 'none'}`]);
      return cleaned;
    });
    res.json({success: true, petId: req.params.id, allergies: saved});
  } catch (e) {
    res.status(e.status || 500).json({error: e.status ? e.message : 'Unable to save allergies. Please retry.'});
  }
}

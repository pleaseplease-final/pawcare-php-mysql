import { createHash } from 'node:crypto';
import { registrationError } from './petRegistration.js';

const nameOf = u => [u.first_name, u.middle_initial ? `${u.middle_initial}.` : '', u.last_name].filter(Boolean).join(' ');
const digest = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');

// The authenticated assistant reviews both identities. Contact similarity alone
// never authorizes exposing a clinic record to an online account.
export async function reviewOwnerAccountLink(client, ownerId, email) {
  if (typeof email !== 'string' || email.length > 255 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()))
    throw registrationError('Enter the owner’s verified account email.');
  const account = (await client.query("SELECT * FROM users WHERE LOWER(email)=$1 AND role='owner' FOR UPDATE", [email.trim().toLowerCase()])).rows[0];
  if (!account || !account.email_verified_at || !account.mobile_verified || account.is_active === false)
    throw registrationError('No active, fully verified owner account was found. Ask the owner to finish email and mobile verification.',409);
  const owners = (await client.query('SELECT * FROM owners WHERE id=ANY($1::varchar[]) ORDER BY id FOR UPDATE', [[ownerId,account.owner_id]])).rows;
  const clinic = owners.find(o=>o.id===ownerId), online = owners.find(o=>o.id===account.owner_id);
  if (!clinic || !online || online.user_id !== account.id) throw registrationError('The owner record changed. Refresh and review again.',409);
  if (clinic.id===online.id) throw registrationError('This clinic record is already linked to that account.',409);
  if (clinic.user_id || (await client.query('SELECT id FROM users WHERE owner_id=$1',[clinic.id])).rows.length)
    throw registrationError('This clinic record already belongs to an online account. Open that owner’s existing account.',409);
  const pets = (await client.query('SELECT id,owner_id,name,registration_status FROM pets WHERE owner_id=ANY($1::varchar[]) ORDER BY id',[[clinic.id,online.id]])).rows;
  const requests = (await client.query('SELECT id,owner_id,pet_id,name,status,revision FROM pet_requests WHERE owner_id=ANY($1::varchar[]) ORDER BY id',[[clinic.id,online.id]])).rows;
  const allNames = [...pets, ...requests.filter(r=>!pets.some(p=>p.id===r.pet_id))].map(p=>p.name.trim().toLowerCase());
  if (new Set(allNames).size!==allNames.length) throw registrationError('Both records contain a pet with the same name. Review and correct duplicate pet registrations before linking.',409);
  if (allNames.length>10) throw registrationError('These records exceed the ten-pet account limit. Review the patient records before linking.',409);
  const accountView = {id:account.id,ownerId:online.id,name:nameOf(account),email:account.email,phone:account.mobile_number,address:online.address};
  const clinicView = {id:clinic.id,name:clinic.name,email:clinic.email,phone:clinic.phone,address:clinic.address};
  const review = {clinic:clinicView,account:accountView,pets:pets.map(p=>({id:p.id,name:p.name,source:p.owner_id===clinic.id?'Clinic record':'Online account'}))};
  return {clinic,online,account,review:{...review,revision:digest({clinic,online,account:accountView,pets,requests})}};
}

export async function linkOwnerAccount(client, ownerId, body, actor) {
  if (actor.role!=='assistant') throw registrationError('Only reception can link owner records.',403);
  if (body.identityConfirmed!==true) throw registrationError('Confirm the owner’s identity and all listed pets before linking.');
  const {clinic,online,account,review}=await reviewOwnerAccountLink(client,ownerId,body.email);
  if (body.revision!==review.revision) throw registrationError('The account or clinic record changed. Review the latest details before linking.',409);
  // Keep the established clinic owner and every patient ID. Moving only the
  // owner foreign keys preserves visits, cards, vitals, admissions and invoices.
  await client.query('UPDATE pets SET owner_id=$1 WHERE owner_id=$2',[clinic.id,online.id]);
  await client.query('UPDATE pet_requests SET owner_id=$1,revision=revision+1 WHERE owner_id=$2',[clinic.id,online.id]);
  if ((await client.query("SELECT to_regclass(format('%I.reminder_call_logs',current_schema())) AS present")).rows[0]?.present)
    await client.query('UPDATE reminder_call_logs SET owner_id=$1 WHERE owner_id=$2',[clinic.id,online.id]);
  await client.query('UPDATE users SET owner_id=$1,updated_at=NOW() WHERE id=$2',[clinic.id,account.id]);
  await client.query(`UPDATE owners SET user_id=$2,name=$3,email=$4,phone=$5,address=$6,
    first_pet_registered_at=COALESCE(first_pet_registered_at,$7) WHERE id=$1`,
    [clinic.id,account.id,review.account.name,account.email,account.mobile_number,online.address || clinic.address,online.first_pet_registered_at]);
  await client.query('DELETE FROM owners WHERE id=$1',[online.id]);
  await client.query('INSERT INTO audit_logs(user_name,user_role,action) VALUES($1,$2,$3)',[actor.name,actor.role,`Linked clinic owner ${clinic.id} to verified account ${account.id}; consolidated owner ${online.id}; retained ${review.pets.length} patient IDs.`]);
  return {ownerId:clinic.id,userId:account.id};
}

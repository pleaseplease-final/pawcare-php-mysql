import {registrationError} from './petRegistration.js';

export async function resolveWalkInOwner(client,ownerId,registration,newOwnerId) {
  // Serialize matching plus insertion so concurrent registrations cannot both
  // create a household before the other's normalized contacts become visible.
  await client.query("SELECT pg_advisory_xact_lock(hashtext('pawcare-walk-in-owner'))");
  if(ownerId) {
    if(typeof ownerId!=='string')throw registrationError('Choose an existing owner record.');
    const row=(await client.query('SELECT * FROM owners WHERE id=$1 FOR UPDATE',[ownerId])).rows[0];
    if(!row)throw registrationError('The selected owner no longer exists. Search and select the current record.',409);
    if(row.name.trim()!==registration.ownerName || row.phone.trim().replace(/[\s-]/g,'')!==registration.phone || row.email.trim()!==registration.email || row.address.trim()!==registration.address)
      throw registrationError('The selected owner’s details changed. Reselect the owner and review the saved contact details.',409);
    return row;
  }
  const matches=(await client.query(`SELECT id FROM owners WHERE
    ($1<>'' AND LOWER(TRIM(email))=LOWER($1)) OR
    regexp_replace(regexp_replace(phone,'[^0-9]','','g'),'^09','639')=regexp_replace(regexp_replace($2,'[^0-9]','','g'),'^09','639')`,[registration.email,registration.phone])).rows;
  if(matches.length)throw registrationError('Matching owner contacts are already on file. Select the correct existing owner before registering this pet.',409);
  return (await client.query('INSERT INTO owners(id,name,email,phone,address) VALUES($1,$2,$3,$4,$5) RETURNING *',[newOwnerId,registration.ownerName,registration.email,registration.phone,registration.address])).rows[0];
}

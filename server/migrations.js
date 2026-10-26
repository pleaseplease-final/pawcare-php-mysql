import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';

// Same prerequisite order as local initialization, without any demo seeding.
export const migrationFiles=Object.freeze([
 'schema','scheduling','appointment-status','checkout-inbox','pet-registration',
 'owner-pet-onboarding','appointment-approval','staff-access','care-workflow',
 'prescriptions','reminder-calls','contact-changes','password-recovery',
 'verification-delivery','state-read-indexes','note-options','admissions',
 'admission-workflow','admission-care','vitals-history','digital-vet-card','patient-reference-history','vaccination-card-fields','clinic-catalog','staff-admin-role'
]);
export function migrationSource(name){
 const source=readFileSync(new URL(`./database/${name}.sql`,import.meta.url),'utf8');
 // This legacy file owns a transaction when applied standalone. The rollout
 // runner provides one transaction for the entire batch, including its ledger.
 if(name==='appointment-status'){
  if(!/^--[^\n]*\nBEGIN;[\s\S]*\nCOMMIT;\s*$/.test(source))throw Error('Unexpected appointment-status transaction wrapper.');
  return source.replace(/\nBEGIN;/,'').replace(/\nCOMMIT;\s*$/,'');
 }
 return source;
}
export async function migrateDatabase(client,{check=false}={}){
 const applied=[],reused=[],adopted=[];
 await client.query('BEGIN');
 try{
  await client.query("SET LOCAL lock_timeout='10s'");
  await client.query("SET LOCAL statement_timeout='120s'");
  await client.query('SELECT pg_advisory_xact_lock(726341902)');
  const base=await client.query("SELECT to_regclass(format('%I.users',current_schema())) AS users, to_regclass(format('%I.appointments',current_schema())) AS appointments");
  if(!base.rows[0]?.users || !base.rows[0]?.appointments)throw Error('Existing clinic database required. Use db:init only for a new disposable local database.');
  await client.query('CREATE TABLE IF NOT EXISTS pawcare_deployment_migrations (name TEXT PRIMARY KEY,sha256 TEXT NOT NULL,applied_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp())');
  for(const name of migrationFiles){
   const source=migrationSource(name),hash=createHash('sha256').update(source).digest('hex');
   const previous=(await client.query('SELECT sha256 FROM pawcare_deployment_migrations WHERE name=$1',[name])).rows[0];
   if(previous){
    if(previous.sha256!==hash)throw Error(`Previously applied migration ${name} has changed. Add a new migration instead.`);
    reused.push(name);continue;
   }
   const marker=source.match(/INSERT INTO pawcare_schema_migrations\(version\) VALUES ?\('([^']+)'\)/)?.[1];
   const markerTable=(await client.query("SELECT to_regclass(format('%I.pawcare_schema_migrations',current_schema())) value")).rows[0].value;
   const alreadyApplied=marker && markerTable && (await client.query('SELECT 1 FROM pawcare_schema_migrations WHERE version=$1',[marker])).rows.length;
   if(alreadyApplied)adopted.push(name);
   else{await client.query(source);applied.push(name);}
   await client.query('INSERT INTO pawcare_deployment_migrations(name,sha256) VALUES($1,$2)',[name,hash]);
  }
  await client.query(check?'ROLLBACK':'COMMIT');
  return {check,applied,reused,adopted};
 }catch(error){await client.query('ROLLBACK');throw error;}
}

import {test,after} from 'node:test';
import assert from 'node:assert/strict';
import pg from 'pg';
import {migrationSource,migrateDatabase,migrationFiles} from '../migrations.js';
const url=new URL(process.env.TEST_DATABASE_URL||'');
if(!['localhost','127.0.0.1'].includes(url.hostname))throw Error('Set TEST_DATABASE_URL to a disposable local database.');
const pool=new pg.Pool({connectionString:url.href}),schema=`test_rollout_${crypto.randomUUID().replaceAll('-','')}`;
const client=await pool.connect();
await client.query(`CREATE SCHEMA ${schema}`);await client.query(`SET search_path TO ${schema},public`);
after(async()=>{await client.query(`DROP SCHEMA ${schema} CASCADE`);client.release();await pool.end();});
await client.query(migrationSource('schema'));
await client.query("INSERT INTO owners(id,name,email,phone,address) VALUES('owner','Synthetic owner','owner@example.invalid','0000000','Synthetic address')");
await client.query("INSERT INTO pets(id,owner_id,name,birth,weight,vaccination_card_id) VALUES('patient','owner','Synthetic patient','2020-01-01',10,'EXISTING-CARD')");
await client.query("INSERT INTO appointments(id,pet_id,vet_id,date,time,reason,status,intake_vitals) VALUES('visit','patient','vet','2026-10-25','09:00','Synthetic visit','Confirmed','{\"weight\":10,\"temp\":38.5}')");
await client.query("INSERT INTO consultations(id,pet_id,vet_id,appt_id,date,symptoms,objective,diagnosis,treatment) VALUES('note','patient','vet','visit','2026-10-25','Concern','Exam','Assessment','Care')");
await client.query("INSERT INTO vaccinations(id,pet_id,card_id,vaccine,date,done) VALUES('dose','patient','EXISTING-CARD','Rabies','2026-10-25',true)");
const history=async()=>(await client.query('SELECT row_to_json(c) record FROM consultations c UNION ALL SELECT row_to_json(v) FROM vaccinations v')).rows;

test('rollout dry run changes nothing; apply and repeated apply preserve patient, visit and medical identities',async()=>{
 const before=await history();
 const check=await migrateDatabase(client,{check:true});assert.equal(check.applied.length,migrationFiles.length);
 assert.equal((await client.query("SELECT to_regclass(format('%I.digital_vet_cards',current_schema())) value")).rows[0].value,null);
 assert.equal((await client.query("SELECT status FROM appointments WHERE id='visit'")).rows[0].status,'Confirmed');
 assert.deepEqual(await history(),before);
 const applied=await migrateDatabase(client);assert.equal(applied.applied.length,migrationFiles.length);
 assert.equal((await client.query("SELECT status FROM appointments WHERE id='visit'")).rows[0].status,'Scheduled');
 assert.equal((await client.query("SELECT vaccination_card_id FROM pets WHERE id='patient'")).rows[0].vaccination_card_id,'EXISTING-CARD');
 const current=await history();for(let i=0;i<before.length;i++)for(const [key,value] of Object.entries(before[i].record))assert.deepEqual(current[i].record[key],value,`Preserved medical field ${key}`);
 assert.equal((await client.query('SELECT count(*) FROM users')).rows[0].count,'0');
 assert.equal((await client.query('SELECT count(*) FROM vital_measurements')).rows[0].count,'2');
 assert.equal((await client.query('SELECT count(*) FROM digital_vet_cards')).rows[0].count,'0');
 const repeat=await migrateDatabase(client);assert.equal(repeat.applied.length,0);assert.equal(repeat.reused.length,migrationFiles.length);
 assert.deepEqual(await history(),current);
});
test('adopts existing migration markers after an upgrade without replaying legacy views or duplicating history',async()=>{
 const before=await history();await client.query('DROP TABLE pawcare_deployment_migrations');
 const result=await migrateDatabase(client);
 assert.ok(result.adopted.includes('scheduling'));
 assert.ok(result.adopted.includes('digital-vet-card'));
 assert.deepEqual(await history(),before);
 assert.equal((await client.query('SELECT count(*) FROM vital_measurements')).rows[0].count,'2');
});
test('simultaneous rollout retries serialize and reuse one ledger',async()=>{
 const second=await pool.connect();
 try{
  await second.query(`SET search_path TO ${schema},public`);
  const results=await Promise.all([migrateDatabase(client),migrateDatabase(second)]);
  for(const result of results){assert.equal(result.applied.length,0);assert.equal(result.reused.length,migrationFiles.length);}
  assert.equal((await client.query('SELECT count(*) FROM pawcare_deployment_migrations')).rows[0].count,String(migrationFiles.length));
 }finally{second.release();}
});
test('checksum mismatch aborts rollout and preserves prior records',async()=>{
 await client.query("UPDATE pawcare_deployment_migrations SET sha256='changed' WHERE name='digital-vet-card'");
 const before=await history();await assert.rejects(migrateDatabase(client),/has changed/);assert.deepEqual(await history(),before);
 await client.query("UPDATE pawcare_deployment_migrations SET sha256=encode(sha256($1::bytea),'hex') WHERE name='digital-vet-card'",[Buffer.from(migrationSource('digital-vet-card'))]);
});
test('late migration failure rolls back the entire batch and ledger',async()=>{
 await client.query('DROP TABLE pawcare_deployment_migrations');
 await client.query("DELETE FROM pawcare_schema_migrations WHERE version='digital-vet-card-v1'");
 await client.query("CREATE FUNCTION reject_reference() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Synthetic rollout failure'; END $$");
 await client.query('CREATE TRIGGER reject_reference BEFORE UPDATE OF vaccination_card_id ON pets FOR EACH ROW EXECUTE FUNCTION reject_reference()');
 await client.query("INSERT INTO pets(id,owner_id,name,birth,weight,vaccination_card_id) VALUES('missing','owner','Synthetic missing reference','2020-01-01',10,NULL)");
 await assert.rejects(migrateDatabase(client),/Synthetic rollout failure/);
 assert.equal((await client.query("SELECT to_regclass(format('%I.pawcare_deployment_migrations',current_schema())) value")).rows[0].value,null);
 assert.equal((await client.query("SELECT vaccination_card_id FROM pets WHERE id='missing'")).rows[0].vaccination_card_id,null);
});

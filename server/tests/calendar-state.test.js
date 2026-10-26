import { after, mock, test } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';

let vets = [], vaccinations = [];
mock.module('../db.js', { namedExports: {
  query: async sql => {
    if (sql.includes("FROM users WHERE role = 'vet'")) {
      assert.match(sql, /SELECT id, vet_id, first_name, last_name/);
      return { rows: vets };
    }
    if (sql.includes('FROM vaccinations')) return { rows: vaccinations };
    return { rows: [] };
  },
  withTransaction: async () => { throw new Error('Unexpected write'); },
} });
mock.module('../services.js', { namedExports: { sendMail: async () => {}, sendSms: async () => {} } });
mock.module('../routes/auth.js', { namedExports: { getAppUrl: () => 'http://localhost', requireAuth: (req, res, next) => { req.user = { id: 'synthetic-assistant', name: 'Synthetic assistant', role: 'assistant' }; next(); } } });
const { clinicRouter } = await import('../routes/clinic.js');
const app = express();
app.use('/api', clinicRouter);
const server = app.listen(0, '127.0.0.1');
await new Promise(resolve => server.once('listening', resolve));
after(() => new Promise(resolve => server.close(resolve)));

test('state exposes appointment vet IDs, names and legacy account ID fallback', async () => {
  vets = [
    { id: 'u_new', vet_id: 'v_invited', first_name: 'Jane', last_name: 'Doe' },
    { id: 'u_legacy', vet_id: null, first_name: 'Legacy', last_name: 'Vet' },
  ];
  const response = await fetch(`http://127.0.0.1:${server.address().port}/api/state`);
  assert.equal(response.status, 200);
  const { data } = await response.json();
  assert.deepEqual(data.vets, [{ id: 'v_invited', userId:'u_new', name: 'Dr. Jane Doe' }, { id: 'u_legacy', userId:'u_legacy', name: 'Dr. Legacy Vet' }]);
  assert.deepEqual(data.appts, []);
});
test('state returns an empty roster without losing other state collections', async () => {
  vets = [];
  const response = await fetch(`http://127.0.0.1:${server.address().port}/api/state`);
  const { data } = await response.json();
  assert.deepEqual(data.vets, []);
  assert.deepEqual(data.pets, []);
});

test('state preserves vaccination visit provenance without guessing legacy links', async()=>{
 vaccinations=[{id:'dose',pet_id:'p',vaccine:'Rabies',date:'2026-10-26',done:true,vet_id:'v',appt_id:'a',consultation_id:'c'}, {id:'legacy',pet_id:'p',vaccine:'DHPP',date:'2026-10-25',done:true,vet_id:'v'}];
 const response=await fetch(`http://127.0.0.1:${server.address().port}/api/state`);
 const {data}=await response.json();
 assert.equal(data.vaccs.find(v=>v.id==='dose').apptId,'a');
 assert.equal(data.vaccs.find(v=>v.id==='dose').consultationId,'c');
 assert.equal(data.vaccs.find(v=>v.id==='legacy').apptId,'');
 vaccinations=[];
});

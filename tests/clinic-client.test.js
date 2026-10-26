import { afterEach, mock, test } from 'node:test';
import assert from 'node:assert/strict';
import { clinicRequest } from '../src/clinicApi.js';
import { emptyClinicState, applyClinicState } from '../src/clinicState.js';
import { getIdealWeight, SPECIES_DEFAULTS } from '../src/roles/vitals.js';
afterEach(() => mock.restoreAll());
for (const status of [401, 403, 404, 409, 500, 502]) test(`clinic transport rejects ${status}; never returns local success`, async () => {
  mock.method(globalThis, 'fetch', async () => new Response(JSON.stringify({ error: 'Not saved' }), { status }));
  await assert.rejects(clinicRequest('PATCH', '/api/appointments/a/status', { status: 'Checked-in' }), e => e.status === status && e.message === 'Not saved');
});
test('network failure and invalid response stay failures', async () => {
  const fetch = mock.method(globalThis, 'fetch', async () => { throw Error('offline'); });
  await assert.rejects(clinicRequest('POST', '/api/consultations', {}), /not been confirmed/);
  fetch.mock.mockImplementation(async () => new Response('<html>Bad gateway</html>'));
  await assert.rejects(clinicRequest('POST', '/api/consultations', {}), /invalid response/);
});
test('successful requests include cookies, send JSON and use server data', async () => {
  mock.method(globalThis, 'fetch', async (path, options) => {
    assert.equal(path, '/api/state'); assert.equal(options.credentials, 'include'); assert.equal(options.method, 'GET'); assert.equal(options.body, undefined);
    return new Response(JSON.stringify({ success: true, data: { pets: [] } }));
  });
  assert.deepEqual(await clinicRequest('GET', '/api/state'), { pets: [] });
});
test('empty server state removes stale/demo/previous-account clinical records', () => {
  const previous = Object.fromEntries(Object.keys(emptyClinicState()).map(k => [k, [{ id: 'other-owner' }]]));
  const current = applyClinicState(previous, emptyClinicState());
  for (const key of ['pets', 'owners', 'appts', 'vacc', 'vaccs', 'records', 'consults', 'petRequests', 'log', 'vets']) assert.deepEqual(current[key], []);
});
test('blank breed uses species fallback, never the first dog breed', () => {
  for (const species of ['Cat', 'Dog', 'Rabbit', 'Bird']) {
    const result = getIdealWeight(species, ' ');
    assert.equal(result.min, SPECIES_DEFAULTS[species].min); assert.equal(result.max, SPECIES_DEFAULTS[species].max);
    assert.match(result.source, /General/);
  }
});

test('successful sign-in keeps the returned session token for later authenticated requests', async () => {
  const stored = new Map();
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: { getItem: k => stored.get(k), setItem: (k,v) => stored.set(k,v) } });
  try {
    mock.method(globalThis, 'fetch', async () => new Response(JSON.stringify({ status: 'ok', token: 'synthetic-session-token' })));
    await clinicRequest('POST', '/api/auth/login', { email: 'test@example.test' });
    assert.equal(stored.get('pawcare_token'), 'synthetic-session-token');
  } finally { if (descriptor) Object.defineProperty(globalThis, 'localStorage', descriptor); else delete globalThis.localStorage; }
});

test('conditional state GETs forward cancellation, retain tags and accept body-free confirmations', async () => {
  const controller = new AbortController();
  const fetch = mock.method(globalThis, 'fetch', async (path, options) => {
    assert.equal(options.signal, controller.signal);
    assert.equal(options.cache, 'no-store');
    assert.equal(options.headers['If-None-Match'], '"saved"');
    return new Response(null, {status:304});
  });
  assert.deepEqual(await clinicRequest('GET', '/api/state', undefined, {signal:controller.signal, ifNoneMatch:'"saved"', responseMetadata:true}), {notModified:true,etag:'"saved"'});
  fetch.mock.mockImplementation(async()=>new Response(JSON.stringify({success:true,data:{pets:[]}}),{headers:{ETag:'"new"'}}));
  assert.deepEqual(await clinicRequest('GET', '/api/state', undefined, {responseMetadata:true}), {data:{pets:[]},etag:'"new"',notModified:false});
});


test('verification errors retain unverified state and durable resend timing for login recovery',async()=>{
 mock.method(globalThis,'fetch',async()=>new Response(JSON.stringify({error:'Verify your email.',unverified:true,retryAfter:42}),{status:403,headers:{'Content-Type':'application/json'}}));
 await assert.rejects(clinicRequest('POST','/api/auth/login',{email:'synthetic@example.invalid'}),error=>error.status===403 && error.unverified===true && error.retryAfter===42);
});

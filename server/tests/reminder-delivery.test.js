import { afterEach, mock, test } from 'node:test';
import assert from 'node:assert/strict';
import { deliverReminder, UncertainDelivery } from '../reminderDelivery.js';
const keys=['BREVO_API_KEY','BREVO_SENDER_EMAIL','SMTP_USER','SMTP_PASS','TEXTBEE_API_KEY','TEXTBEE_KEY','TEXTBEE_DEVICE_ID'];
const original=Object.fromEntries(keys.map(k=>[k,process.env[k]]));
const reset=()=>{for(const k of keys)delete process.env[k];};
reset();
afterEach(()=>{mock.restoreAll();reset();for(const[k,v]of Object.entries(original))if(v!==undefined)process.env[k]=v;});
const configure=()=>{reset();process.env.BREVO_API_KEY='synthetic';process.env.BREVO_SENDER_EMAIL='test@example.invalid';process.env.TEXTBEE_API_KEY='synthetic';process.env.TEXTBEE_DEVICE_ID='synthetic-device';};
test('missing providers fail instead of counting the development outbox as delivery',async()=>{
 reset();mock.method(globalThis,'fetch',async()=>{throw Error('must not call')});
 await assert.rejects(deliverReminder('email','owner@example.invalid','test'),/not configured/);
 await assert.rejects(deliverReminder('sms','+639000000000','test'),/not configured/);
});
test('provider acceptance carries provider/message ID and uses the correct channel',async()=>{
 configure();const calls=[];mock.method(globalThis,'fetch',async(url,options)=>{calls.push({url,body:JSON.parse(options.body)});return{ok:true,status:201,json:async()=>({messageId:'synthetic-id'})}});
 assert.deepEqual(await deliverReminder('email','owner@example.invalid','reminder'),{provider:'brevo',id:'synthetic-id'});
 assert.equal((await deliverReminder('sms','+639000000000','reminder')).provider,'textbee');
 assert.match(calls[1].url,/gateway\/devices\/synthetic-device\/send-sms$/);assert.deepEqual(calls[1].body.recipients,['+639000000000']);
});
test('explicit rejection can retry, ambiguous errors and network timeouts require inspection',async()=>{
 configure();mock.method(globalThis,'fetch',async()=>({ok:false,status:429}));
 await assert.rejects(deliverReminder('sms','synthetic','test'),e=>!(e instanceof UncertainDelivery));
 globalThis.fetch.mock.mockImplementation(async()=>({ok:false,status:503}));
 await assert.rejects(deliverReminder('sms','synthetic','test'),UncertainDelivery);
 globalThis.fetch.mock.mockImplementation(async()=>{throw Error('synthetic timeout')});
 await assert.rejects(deliverReminder('email','synthetic','test'),UncertainDelivery);
});

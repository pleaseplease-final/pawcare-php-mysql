import {test,after,mock} from 'node:test';
import assert from 'node:assert/strict';
import {appUrl,sessionCookie} from '../appOrigin.js';
mock.module('../db.js',{namedExports: {query:async()=>({rows:[]}),withTransaction:async fn=>fn({query:async()=>({rows:[]})})}});
mock.module('../services.js',{namedExports: {sendMail:async()=>({ok:true,via:'synthetic'}),sendSms:async()=>({ok:true,via:'synthetic'}),serverOutbox:[]}});
const {getAppUrl}=await import('../routes/auth.js');
const {default:app}=await import('../../api/index.js');
const original=Object.fromEntries(['APP_URL','SITE_URL','VERCEL_PROJECT_PRODUCTION_URL','VERCEL_URL','NODE_ENV'].map(k=>[k,process.env[k]]));
const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));
after(async()=>{await new Promise(r=>server.close(r));for(const [k,v] of Object.entries(original)){if(v===undefined)delete process.env[k];else process.env[k]=v;}});
const base=`http://127.0.0.1:${server.address().port}`;
test('configured clinic URL wins over Origin, Referer, Host and forwarded headers',()=>{
 process.env.APP_URL='https://clinic.example';
 assert.equal(getAppUrl({headers:{origin:'https://evil.example',referer:'https://evil.example',host:'evil.example','x-forwarded-host':'evil.example','x-forwarded-proto':'http'}}),'https://clinic.example');
});
test('production requires a trusted HTTPS URL and secure session cookies',()=>{
 process.env.NODE_ENV='production';
 for(const value of ['http://clinic.example','https://user:pass@clinic.example','javascript:alert(1)','https://clinic.example/?evil=1']){process.env.APP_URL=value;assert.throws(()=>appUrl());}
 process.env.APP_URL='https://clinic.example';assert.equal(appUrl(),'https://clinic.example');assert.equal(sessionCookie(123).secure,true);assert.equal(sessionCookie(123).httpOnly,true);assert.equal(sessionCookie(123).sameSite,'lax');
 delete process.env.APP_URL;delete process.env.SITE_URL;delete process.env.VERCEL_PROJECT_PRODUCTION_URL;delete process.env.VERCEL_URL;assert.throws(()=>appUrl());
 process.env.NODE_ENV='test';assert.equal(appUrl(),'http://localhost:5173');assert.equal(sessionCookie(123).secure,false);
});
test('deployed entry rejects untrusted browser requests and preflight; configured origin works',async()=>{
 process.env.APP_URL='https://clinic.example';
 for(const method of ['POST','OPTIONS']){const r=await fetch(base+'/api/auth/forgot',{method,headers:{Origin:'https://evil.example','Content-Type':'application/json',...(method==='OPTIONS'?{'Access-Control-Request-Method':'POST'}:{})},...(method==='POST'?{body:JSON.stringify({identifier:'synthetic@example.invalid'})}:{})});assert.equal(r.status,403);assert.equal(r.headers.get('access-control-allow-origin'),null);}
 const allowed=await fetch(base+'/api/auth/forgot',{method:'OPTIONS',headers:{Origin:'https://clinic.example','Access-Control-Request-Method':'POST'}});assert.equal(allowed.status,204);assert.equal(allowed.headers.get('access-control-allow-origin'),'https://clinic.example');assert.equal(allowed.headers.get('access-control-allow-credentials'),'true');
 const noOrigin=await fetch(base+'/api/auth/forgot',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({identifier:'invalid'})});assert.equal(noOrigin.status,400);
});
test('misconfigured production URL blocks requests before any account mutation',async()=>{
 process.env.NODE_ENV='production';process.env.APP_URL='http://clinic.example';
 try{const res=await fetch(base+'/api/auth/register',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({})});assert.equal(res.status,503);}finally{process.env.NODE_ENV='test';process.env.APP_URL='https://clinic.example';}
});

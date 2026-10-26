import { randomInt, randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { parsePhoneNumberFromString } from 'libphonenumber-js/max';
import { query, withTransaction } from './db.js';
import { sha256 } from './security.js';
import { sendMail, sendSms } from './services.js';
import { addressErrors } from '../src/addressRules.js';

let ready;
const ensureSchema = () => ready ||= query(readFileSync(new URL('./database/contact-changes.sql',import.meta.url),'utf8')).catch(error=>{ready=undefined;throw error;});
const problem = (message,status=400,errors) => Object.assign(new Error(message),{status,errors});
const normalizePhone = value => parsePhoneNumberFromString(value,'PH')?.number || value.replace(/[\s-]/g,'');
const digest = (id,channel,code) => sha256(`${id}:${channel}:${code}`);
const responseError = (res,error) => res.status(error.status || (error.code==='23505'?409:500)).json({error:error.status ? error.message : error.code==='23505' ? 'This email is already registered.' : 'Your contact details were not saved. Please retry.',...(error.errors?{errors:error.errors}:{})});

function contactInput(input) {
  const errors={};
  const email=typeof input.email==='string'?input.email.trim().toLowerCase():'';
  const rawPhone=typeof input.phone==='string'?input.phone.trim():'';
  const parsed=parsePhoneNumberFromString(rawPhone,'PH');
  if(email.length>255 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))errors.email='Enter a valid email address.';
  if(!parsed?.isValid())errors.phone='Enter a valid mobile number including its country code.';
  const address={};
  for(const [key,limit] of Object.entries({houseStreet:255,city:100,state:100,country:100,zipCode:20})){
    const value=input[key] ?? '';
    if(typeof value!=='string' || value.length>limit || /[\u0000-\u001f\u007f]/.test(value))errors[key]=`Check this field (up to ${limit} characters).`;
    address[key]=typeof value==='string'?value.trim():'';
  }
  for(const [key,message] of Object.entries(addressErrors(address)))errors[key] ||= message;
  if(Object.keys(errors).length)throw problem('Check your contact details.',400,errors);
  return {email,phone:parsed.number,address};
}

async function applyContact(client,user,data,sid,verifiedChange=false) {
  await client.query(`UPDATE users SET email=$1,mobile_number=$2,
    email_verified_at=CASE WHEN $4 THEN NOW() ELSE email_verified_at END,
    mobile_verified=true,mobile_verified_at=CASE WHEN $5 THEN NOW() ELSE mobile_verified_at END,updated_at=NOW() WHERE id=$3`,
    [data.email,data.phone,user.id,verifiedChange && data.email!==user.email.toLowerCase(),verifiedChange && data.phone!==normalizePhone(user.mobile_number)]);
  const a=data.address;
  const values=[a.houseStreet,a.country,a.city,a.state,a.zipCode,user.id];
  const existing=await client.query('SELECT id FROM addresses WHERE user_id=$1',[user.id]);
  if(existing.rows.length)await client.query('UPDATE addresses SET house_street=$1,country=$2,city=$3,state=$4,zip_code=$5 WHERE user_id=$6',values);
  else await client.query('INSERT INTO addresses (house_street,country,city,state,zip_code,user_id) VALUES ($1,$2,$3,$4,$5,$6)',values);
  if(user.role==='owner')await client.query('UPDATE owners SET email=$1,phone=$2,address=$3 WHERE user_id=$4',
    [data.email,data.phone,[a.houseStreet,a.city,a.state,a.zipCode,a.country].filter(Boolean).join(', '),user.id]);
  await client.query('DELETE FROM account_contact_changes WHERE user_id=$1',[user.id]);
  if(verifiedChange)await client.query('DELETE FROM sessions WHERE user_id=$1 AND token_hash<>$2',[user.id,sha256(sid)]);
  await client.query('INSERT INTO audit_logs (user_name,user_role,action) VALUES ($1,$2,$3)',
    [[user.first_name,user.last_name].filter(Boolean).join(' '),user.role,verifiedChange?'Verified and updated own contact details; other sessions revoked.':'Updated own address details.']);
}

export async function requestContactChange(req,res) {
  try {
    const data=contactInput(req.body || {});
    await ensureSchema();
    // Each challenge is scoped to this user, the exact proposal and existing trusted contacts.
    const id=randomUUID(),emailCode=String(randomInt(100000,1000000)),phoneCode=String(randomInt(100000,1000000));
    const result=await withTransaction(async client=>{
      const user=(await client.query('SELECT * FROM users WHERE id=$1 FOR UPDATE',[req.user.id])).rows[0];
      if(!user)throw problem('Account not found.',404);
      const needEmail=data.email!==user.email.toLowerCase(),needPhone=data.phone!==normalizePhone(user.mobile_number);
      if(!needEmail && !needPhone){await applyContact(client,user,data,null);return {saved:true};}
      const existing=(await client.query('SELECT id FROM users WHERE LOWER(email)=$1 AND id<>$2',[data.email,user.id])).rows[0];
      if(existing)throw problem('This email is already registered.',409,{email:'This email is already registered.'});
      if(user.contact_code_requested_at && Date.now()-new Date(user.contact_code_requested_at).getTime()<60000)throw problem('Wait one minute before requesting new contact codes.',429);
      await client.query('UPDATE users SET contact_code_requested_at=NOW() WHERE id=$1',[user.id]);
      const expiresAt=new Date(Date.now()+10*60000).toISOString();
      await client.query(`INSERT INTO account_contact_changes (user_id,id,base_email,base_phone,proposed,email_hash,phone_hash,expires_at)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT (user_id) DO UPDATE SET id=EXCLUDED.id,base_email=EXCLUDED.base_email,base_phone=EXCLUDED.base_phone,
        proposed=EXCLUDED.proposed,email_hash=EXCLUDED.email_hash,phone_hash=EXCLUDED.phone_hash,email_sent=false,phone_sent=false,attempts=0,expires_at=EXCLUDED.expires_at,created_at=NOW()`,
        [user.id,id,user.email,user.mobile_number,JSON.stringify(data),needEmail?digest(id,'email',emailCode):null,needPhone?digest(id,'phone',phoneCode):null,expiresAt]);
      return {needEmail,needPhone,expiresAt};
    });
    if(result.saved)return res.json({profile:{...req.user,...data}});
    const accepted=async fn=>{try{const r=await fn();return r?.ok===true && !!r.via && r.via!=='dev_outbox';}catch{return false;}};
    const [emailSent,phoneSent]=await Promise.all([
      result.needEmail?accepted(()=>sendMail(data.email,'PawCare contact verification',`Your email change code is ${emailCode}. It expires in 10 minutes. Your current contact details stay active until verified.`)):true,
      result.needPhone?accepted(()=>sendSms(data.phone,`PawCare mobile change code: ${phoneCode}. Expires in 10 minutes. Your current contact stays active until verified.`)):true
    ]);
    await query('UPDATE account_contact_changes SET email_sent=$1,phone_sent=$2 WHERE user_id=$3 AND id=$4',[emailSent,phoneSent,req.user.id,id]);
    return res.json({pending:{id,email:data.email,phone:data.phone,requireEmail:result.needEmail,requirePhone:result.needPhone,emailSent,phoneSent,expiresAt:result.expiresAt}});
  } catch(error){responseError(res,error);}
}

export async function verifyContactChange(req,res) {
  try {
    const {id,emailCode,phoneCode}=req.body || {};
    if(typeof id!=='string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id))throw problem('Request new contact verification codes.');
    await ensureSchema();
    const result=await withTransaction(async client=>{
      const user=(await client.query('SELECT * FROM users WHERE id=$1 FOR UPDATE',[req.user.id])).rows[0];
      const pending=(await client.query('SELECT * FROM account_contact_changes WHERE user_id=$1 AND id=$2 FOR UPDATE',[req.user.id,id])).rows[0];
      if(!user || !pending || pending.base_email!==user.email || pending.base_phone!==user.mobile_number)throw problem('This contact request changed. Request new codes.',409);
      if(new Date(pending.expires_at).getTime()<=Date.now() || pending.attempts>=5)throw problem('These codes have expired or reached the attempt limit. Request new codes.',409);
      if(!pending.email_sent || !pending.phone_sent)throw problem('Code delivery was not confirmed. Request new codes after one minute.',409);
      const matches=(channel,code)=>!pending[`${channel}_hash`] || typeof code==='string' && /^\d{6}$/.test(code) && digest(id,channel,code)===pending[`${channel}_hash`];
      if(!matches('email',emailCode) || !matches('phone',phoneCode)){
        await client.query('UPDATE account_contact_changes SET attempts=attempts+1 WHERE user_id=$1',[user.id]);
        return {invalid:true}; // Commit the failed attempt rather than rolling it back.
      }
      const data=pending.proposed;
      const sid=req.cookies?.sid || req.headers.authorization?.replace('Bearer ','');
      await applyContact(client,user,data,sid,true);
      return {data,emailVerified:!!pending.email_hash || !!user.email_verified_at};
    });
    if(result.invalid)throw problem('One or more codes are incorrect. Check the codes sent to your new contacts.');
    res.json({profile:{...req.user,...result.data,emailVerified:result.emailVerified,mobileVerified:true}});
  } catch(error){responseError(res,error);}
}

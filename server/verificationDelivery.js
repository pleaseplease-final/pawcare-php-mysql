import {readFileSync} from 'node:fs';
import {randomInt} from 'node:crypto';
import {query,withTransaction} from './db.js';
import {randomHex,sha256} from './security.js';
import {sendMail,sendSms} from './services.js';
let ready;
export const ensureVerificationDelivery = () => ready ||= query(readFileSync(new URL('./database/verification-delivery.sql',import.meta.url),'utf8')).catch(e=>{ready=undefined;throw e;});
export const deliveryAccepted = result => result?.ok === true && result.via !== 'dev_outbox';
export async function confirmDelivery(token,userId,send) {
  let sent=false;
  try {sent=deliveryAccepted(await send());} catch { /* Account and verification state remain available for retry. */ }
  if(!sent)return false;
  try {return (await query('UPDATE verification_tokens SET delivery_confirmed=true WHERE token_hash=$1 AND user_id=$2 RETURNING id',[sha256(token),userId])).rows.length>0;}
  catch {return false;}
}
// The account lock serializes replacements and keeps a durable, per-channel cooldown.
export async function issueVerification(userId,type) {
  await ensureVerificationDelivery();
  const column=type==='email_verify'?'email_verification_requested_at':'mobile_otp_requested_at';
  const token=type==='email_verify'?randomHex(24):String(randomInt(100000,1000000));
  const destination=await withTransaction(async client=>{
    const user=(await client.query(`SELECT *, GREATEST(0,CEIL(EXTRACT(EPOCH FROM (${column}+INTERVAL '60 seconds'-clock_timestamp()))))::int AS retry_after FROM users WHERE id=$1 FOR UPDATE`,[userId])).rows[0];
    if(!user || user.is_active===false)throw Object.assign(Error('Account is unavailable.'),{status:403});
    if(user.retry_after>0)throw Object.assign(Error('Wait before requesting another verification message.'),{status:429,retryAfter:user.retry_after});
    if(type==='mobile_otp' && user.mobile_verified || type==='email_verify' && user.email_verified_at)throw Object.assign(Error('This contact is already verified. Please log in.'),{status:409});
    await client.query(`UPDATE users SET ${column}=clock_timestamp() WHERE id=$1`,[userId]);
    await client.query('DELETE FROM verification_tokens WHERE user_id=$1 AND type=$2',[userId,type]);
    await client.query(`INSERT INTO verification_tokens(user_id,token_hash,type,expired_at,delivery_confirmed,destination) VALUES($1,$2,$3,clock_timestamp()+$4::interval,false,$5)`,[userId,sha256(token),type,type==='email_verify'?'24 hours':'10 minutes',type==='email_verify'?user.email:user.mobile_number]);
    return type==='email_verify'?user.email:user.mobile_number;
  });
  return {token,destination};
}
export async function sendMobileVerification(user) {
  const {token:code,destination}=await issueVerification(user.id,'mobile_otp');
  return confirmDelivery(code,user.id,()=>sendSms(destination?.trim(),'PawCare Security: Your verification code is '+code+'. Valid for 10 minutes.'));
}
export function verificationFailure(res,error) {
  const retryAfter=error.retryAfter || 60;
  if(error.status===429)res.set('Retry-After',String(retryAfter));
  return res.status(error.status || 500).json({error:error.status?error.message:'Verification is unavailable. Please try again.',retryAfter});
}

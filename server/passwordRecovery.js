import {randomInt,randomUUID} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {query,withTransaction} from './db.js';
import {hashPassword,sha256,validatePasswordComplexity,verifyPassword} from './security.js';
import {sendMail,sendSms} from './services.js';
let ready;
const ensureSchema = () => ready ||= query(readFileSync(new URL('./database/password-recovery.sql',import.meta.url),'utf8')).catch(e=>{ready=undefined;throw e;});
const emailInput = body => typeof body?.identifier === 'string' ? body.identifier.trim().toLowerCase() : '';
const validEmail = email => email.length <= 255 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
const digest = (id,code) => sha256(`${id}:${code}`);
const lock = (client,key) => client.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))',[key]);
const error = (message,status=400) => Object.assign(new Error(message),{status});
const UNREGISTERED = 'No account is registered with this email. Please create an account.';
const CHANNELS = {email:'email', sms:'text message'};
const channelOf = body => body?.channel === 'sms' ? 'sms' : 'email';
const maskEmail = value => { const [name='',domain=''] = String(value).split('@'); return `${name.slice(0,1)}${'*'.repeat(Math.max(2,Math.min(6,name.length-1)))}@${domain}`; };
const maskPhone = value => { const digits = String(value).replace(/\D/g,''); return digits.length > 4 ? `${'*'.repeat(digits.length-4)}${digits.slice(-4)}` : '****'; };
const unregistered = () => Object.assign(error(UNREGISTERED,404),{unregistered:true});
const eligible = (client,email) => client.query("SELECT id,email,password_hash,mobile_number,mobile_verified FROM users WHERE LOWER(email)=$1 AND email_verified_at IS NOT NULL AND COALESCE(to_jsonb(users)->>'is_active','true') <> 'false'",[email]).then(result=>result.rows[0]);
const smsReady = user => !!user?.mobile_verified && !!user.mobile_number;
const failure = (res,e,fallback) => { if(e.status===429)res.set('Retry-After','60'); return res.status(e.status || 500).json({error:e.status ? e.message : fallback,...(e.unregistered?{unregistered:true}:{})}); };

// Step 1: the user types their email. A registered account is offered the ways a code can reach them.
export async function recoveryOptions(req,res) {
  const email=emailInput(req.body);
  if (!validEmail(email)) return res.status(400).json({error:'Enter your registered email address.',errors:{identifier:'Enter a valid email address.'}});
  try {
    await ensureSchema();
    const user=await withTransaction(client=>eligible(client,email));
    if(!user) throw unregistered();
    const channels=[{id:'email',label:'Email',destination:maskEmail(user.email)}];
    if(smsReady(user)) channels.push({id:'sms',label:'Text message',destination:maskPhone(user.mobile_number)});
    return res.json({status:'ok',channels});
  } catch(e) { return failure(res,e,'Recovery is unavailable. Please try again.'); }
}

// Step 2: the user picks email or text message and the 6-digit code is sent there.
export async function requestPasswordReset(req,res) {
  const email=emailInput(req.body), channel=channelOf(req.body);
  if (!validEmail(email)) return res.status(400).json({error:'Enter your registered email address.',errors:{identifier:'Enter a valid email address.'}});
  try {
    await ensureSchema();
    const key=sha256(email),id=randomUUID(),code=String(randomInt(100000,1000000));
    const user=await withTransaction(async client=>{
      await lock(client,key);
      const candidate=await eligible(client,email);
      if(!candidate) throw unregistered();
      if(channel==='sms' && !smsReady(candidate)) throw error('This account has no verified mobile number. Choose email instead.',400);
      const previous=(await client.query("SELECT created_at > NOW() - INTERVAL '60 seconds' AS cooling FROM password_recovery WHERE identifier_hash=$1",[key])).rows[0];
      if(previous?.cooling) throw error('Wait one minute before requesting another recovery code.',429);
      await client.query(`INSERT INTO password_recovery(identifier_hash,id,user_id,base_email,base_password_hash,code_hash,expires_at,channel)
        VALUES($1,$2,$3,$4,$5,$6,NOW()+INTERVAL '10 minutes',$7) ON CONFLICT(identifier_hash) DO UPDATE SET
        id=EXCLUDED.id,user_id=EXCLUDED.user_id,base_email=EXCLUDED.base_email,base_password_hash=EXCLUDED.base_password_hash,code_hash=EXCLUDED.code_hash,
        sent=false,attempts=0,created_at=NOW(),expires_at=EXCLUDED.expires_at,consumed_at=NULL,channel=EXCLUDED.channel`,
        [key,id,candidate.id,candidate.email,candidate.password_hash,digest(id,code),channel]);
      return candidate;
    });
    // Unconfirmed/dev-outbox delivery never authorizes a password reset.
    const text=`Your PawCare password recovery code is ${code}. It expires in 10 minutes. If you did not request it, ignore this message.`;
    let accepted=false;
    try {
      const delivery=channel==='sms' ? await sendSms(user.mobile_number,text) : await sendMail(user.email,'PawCare password recovery code',text);
      accepted=delivery?.ok === true && delivery.via !== 'dev_outbox';
    } catch { /* Reported below. */ }
    if(!accepted) throw error(`We could not send the code by ${CHANNELS[channel]}. ${channel==='sms'?'Try email instead, or':'Please'} try again in a minute.`,503);
    await query('UPDATE password_recovery SET sent=true WHERE identifier_hash=$1 AND id=$2',[key,id]);
    const destination=channel==='sms' ? maskPhone(user.mobile_number) : maskEmail(user.email);
    return res.status(202).json({status:'ok',channel,destination,message:`A 6-digit code was sent by ${CHANNELS[channel]} to ${destination}. It expires in 10 minutes.`,retryAfter:60});
  } catch(e) { return failure(res,e,'Recovery is unavailable. Please try again.'); }
}

export async function resetPassword(req,res) {
  const email=emailInput(req.body),code=req.body?.code,password=req.body?.password;
  const fields={};
  if(!validEmail(email))fields.identifier='Enter your registered email address.';
  if(typeof code!=='string' || !/^\d{6}$/.test(code))fields.code='Enter the 6-digit recovery code.';
  const passwordError=validatePasswordComplexity(typeof password==='string'?password:'');
  if(passwordError)fields.password=passwordError;
  if(req.body?.confirm_password !== password)fields.confirm='Passwords do not match.';
  if(Object.keys(fields).length)return res.status(400).json({error:'Check the recovery fields.',errors:fields});
  try {
    await ensureSchema();
    const changed=await withTransaction(async client=>{
      const key=sha256(email);await lock(client,key);
      const challenge=(await client.query('SELECT *, expires_at > clock_timestamp() AS valid FROM password_recovery WHERE identifier_hash=$1 FOR UPDATE',[key])).rows[0];
      if(!challenge || !challenge.valid || challenge.consumed_at || challenge.attempts>=5 || !challenge.sent || !challenge.user_id)return false;
      if(challenge.code_hash !== digest(challenge.id,code)) {
        await client.query('UPDATE password_recovery SET attempts=attempts+1 WHERE identifier_hash=$1',[key]);
        return false;
      }
      const user=(await client.query('SELECT * FROM users WHERE id=$1 FOR UPDATE',[challenge.user_id])).rows[0];
      if(!user || user.is_active===false || !user.email_verified_at || user.email!==challenge.base_email || user.password_hash!==challenge.base_password_hash)return false;
      // Recheck real time after waiting for the account lock; transaction NOW() is frozen.
      const stillValid=(await client.query('SELECT expires_at > clock_timestamp() AS valid FROM password_recovery WHERE identifier_hash=$1',[key])).rows[0]?.valid;
      if(!stillValid)return false;
      if(await verifyPassword(password,user.password_hash))throw error('Choose a password different from your current password.');
      await client.query('UPDATE users SET password_hash=$1,failed_login_attempts=0,is_locked=false,lockout_until=NULL,updated_at=NOW() WHERE id=$2',[await hashPassword(password),user.id]);
      await client.query('DELETE FROM sessions WHERE user_id=$1',[user.id]);
      await client.query("DELETE FROM verification_tokens WHERE user_id=$1 AND type IN ('password_reset','account_unlock')",[user.id]);
      await client.query('UPDATE password_recovery SET consumed_at=NOW(),code_hash=NULL,base_password_hash=NULL WHERE identifier_hash=$1',[key]);
      await client.query('INSERT INTO audit_logs(user_name,user_role,action) VALUES($1,$2,$3)',[[user.first_name,user.last_name].filter(Boolean).join(' '),user.role,'Reset own password using verified email; all sessions revoked.']);
      return true;
    });
    if(!changed)return res.status(400).json({error:'The recovery code is invalid, expired or unavailable. Request a new code when the resend timer ends.'});
    res.clearCookie('sid',{path:'/'});
    return res.json({status:'ok',requiresLogin:true,message:'Password changed. Please log in.'});
  } catch(e) {return res.status(e.status || 500).json({error:e.status ? e.message : 'Your password was not changed. Please try again.'});}
}

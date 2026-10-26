import {randomInt,randomUUID} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {query,withTransaction} from './db.js';
import {hashPassword,sha256,validatePasswordComplexity,verifyPassword} from './security.js';
import {sendMail} from './services.js';
let ready;
const ensureSchema = () => ready ||= query(readFileSync(new URL('./database/password-recovery.sql',import.meta.url),'utf8')).catch(e=>{ready=undefined;throw e;});
const emailInput = body => typeof body?.identifier === 'string' ? body.identifier.trim().toLowerCase() : '';
const validEmail = email => email.length <= 255 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
const digest = (id,code) => sha256(`${id}:${code}`);
const lock = (client,key) => client.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))',[key]);
const error = (message,status=400) => Object.assign(new Error(message),{status});
const generic = {status:'ok',message:'If an eligible account matches, a recovery code will arrive by email. Check your inbox and spam folder.',retryAfter:60};

export async function requestPasswordReset(req,res) {
  const email=emailInput(req.body);
  if (!validEmail(email)) return res.status(400).json({error:'Enter your registered email address.',errors:{identifier:'Enter a valid email address.'}});
  try {
    await ensureSchema();
    const key=sha256(email),id=randomUUID(),code=String(randomInt(100000,1000000));
    const user=await withTransaction(async client=>{
      await lock(client,key);
      const previous=(await client.query("SELECT created_at > NOW() - INTERVAL '60 seconds' AS cooling FROM password_recovery WHERE identifier_hash=$1",[key])).rows[0];
      if(previous?.cooling) throw error('Wait one minute before requesting another recovery code.',429);
      const candidate=(await client.query("SELECT id,email,password_hash FROM users WHERE LOWER(email)=$1 AND email_verified_at IS NOT NULL AND COALESCE(to_jsonb(users)->>'is_active','true') <> 'false'",[email])).rows[0];
      await client.query(`INSERT INTO password_recovery(identifier_hash,id,user_id,base_email,base_password_hash,code_hash,expires_at)
        VALUES($1,$2,$3,$4,$5,$6,NOW()+INTERVAL '10 minutes') ON CONFLICT(identifier_hash) DO UPDATE SET
        id=EXCLUDED.id,user_id=EXCLUDED.user_id,base_email=EXCLUDED.base_email,base_password_hash=EXCLUDED.base_password_hash,code_hash=EXCLUDED.code_hash,
        sent=false,attempts=0,created_at=NOW(),expires_at=EXCLUDED.expires_at,consumed_at=NULL`,
        [key,id,candidate?.id || null,candidate?.email || null,candidate?.password_hash || null,digest(id,code)]);
      return candidate;
    });
    if(user) {
      // Unconfirmed/dev-outbox delivery never authorizes a password reset.
      let accepted=false;
      try {const delivery=await sendMail(user.email,'PawCare password recovery code',`Your PawCare password recovery code is ${code}. It expires in 10 minutes. If you did not request it, ignore this message.`);accepted=delivery?.ok === true && delivery.via !== 'dev_outbox';} catch { /* Return the same privacy-preserving receipt. */ }
      if(accepted) await query('UPDATE password_recovery SET sent=true WHERE identifier_hash=$1 AND id=$2',[key,id]);
    }
    return res.status(202).json(generic);
  } catch(e) {
    if(e.status===429)res.set('Retry-After','60');
    return res.status(e.status || 500).json({error:e.status ? e.message : 'Recovery is unavailable. Please try again.'});
  }
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

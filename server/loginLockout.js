import {query,withTransaction} from './db.js';
import {verifyPassword,randomHex,sha256} from './security.js';
import {ensureVerificationDelivery,confirmDelivery} from './verificationDelivery.js';
import {sendMail} from './services.js';
import {appUrl} from './appOrigin.js';

const invalid = 'Invalid email or password.';
const locked = {locked:true,unlockRequired:true};

// Lock the account row while counting failures, including concurrent requests.
export async function passwordLogin(email,password) {
  await ensureVerificationDelivery();
  const result=await withTransaction(async client=>{
    const u=(await client.query('SELECT * FROM users WHERE LOWER(email) = $1 FOR UPDATE',[email])).rows[0];
    if(!u)return {status:401,error:`${invalid} Your account will lock after 2 incorrect attempts.`};
    if(u.is_active===false)return {status:403,error:'Your account is inactive. Contact the clinic administrator.'};
    if(u.is_locked && u.lockout_until && new Date(u.lockout_until)>new Date()) {
      return {status:423,error:'Unlock link confirmed. Wait for the cooldown to finish before logging in.',locked:true,cooldownUntil:new Date(u.lockout_until).toISOString(),retryAfter:Math.ceil((new Date(u.lockout_until)-Date.now())/1000)};
    }
    const needsLink=u.is_locked && !u.lockout_until;
    if(!needsLink) {
      if(await verifyPassword(password,u.password_hash)) {
        await client.query('UPDATE users SET failed_login_attempts = 0, is_locked = false, lockout_until = NULL WHERE id = $1',[u.id]);
        return {user:u};
      }
      const attempts=(u.is_locked ? 0 : u.failed_login_attempts || 0)+1;
      await client.query('UPDATE users SET failed_login_attempts=$1,is_locked=$2,lockout_until=NULL WHERE id=$3',[attempts,attempts>=2,u.id]);
      if(attempts<2)return {status:401,error:`${invalid} Invalid attempt 1 of 2. Your account will lock after one more incorrect attempt.`,attemptsRemaining:1};
    }
    const previous=(await client.query("SELECT *, created_at > clock_timestamp()-INTERVAL '60 seconds' AS cooling FROM verification_tokens WHERE user_id=$1 AND type='account_unlock' AND expired_at>clock_timestamp() ORDER BY created_at DESC LIMIT 1",[u.id])).rows[0];
    if(previous?.cooling)return {status:423,...locked,unlockEmailSent:!!previous.delivery_confirmed,retryAfter:60,error:previous.delivery_confirmed?'Account locked after 2 incorrect attempts. Check your email for the unlock link.':'Account locked. Wait one minute, then retry login to send the unlock email again.'};
    const token=randomHex(32);
    await client.query("DELETE FROM verification_tokens WHERE user_id=$1 AND type='account_unlock'",[u.id]);
    await client.query("INSERT INTO verification_tokens(user_id,token_hash,type,expired_at,delivery_confirmed,destination) VALUES($1,$2,'account_unlock',clock_timestamp()+INTERVAL '30 minutes',false,$3)",[u.id,sha256(token),u.email]);
    return {userId:u.id,email:u.email,token};
  });
  if(!result.token)return result;
  const link=`${appUrl()}/?unlock=${encodeURIComponent(result.token)}`;
  const sent=await confirmDelivery(result.token,result.userId,()=>sendMail(result.email,'Unlock your PawCare account',`Your account was locked after 2 incorrect login attempts. Open this link to start the 2-minute cooldown, then log in again: ${link}\nThis single-use link expires in 30 minutes.`));
  return {status:423,...locked,unlockEmailSent:sent,retryAfter:60,error:sent?'Account locked after 2 incorrect attempts. An unlock link has been sent to your email. Open it to start the 2-minute cooldown.':'Account locked after 2 incorrect attempts. The unlock email could not be sent. Wait one minute, then retry login to send it again.'};
}

export async function consumeUnlock(token) {
  await ensureVerificationDelivery();
  return withTransaction(async client=>{
    const tok=(await client.query("SELECT * FROM verification_tokens WHERE token_hash=$1 AND type='account_unlock' AND expired_at>clock_timestamp() AND delivery_confirmed=true",[sha256(token)])).rows[0];
    if(!tok)return null;
    const user=(await client.query('SELECT * FROM users WHERE id=$1 FOR UPDATE',[tok.user_id])).rows[0];
    if(!user || user.is_active===false || !user.is_locked || user.lockout_until || user.email!==tok.destination)return null;
    // The delete checks expiry again after waiting for the user lock and allows exactly one consumer.
    const used=await client.query("DELETE FROM verification_tokens WHERE id=$1 AND expired_at>clock_timestamp() AND delivery_confirmed=true RETURNING id",[tok.id]);
    if(!used.rows.length)return null;
    const updated=await client.query("UPDATE users SET is_locked=true,failed_login_attempts=0,lockout_until=clock_timestamp()+INTERVAL '2 minutes' WHERE id=$1 RETURNING lockout_until",[user.id]);
    await client.query("DELETE FROM verification_tokens WHERE user_id=$1 AND type='account_unlock'",[user.id]);
    return {status:'ok',cooldownUntil:new Date(updated.rows[0].lockout_until).toISOString(),retryAfter:120,message:'Unlock link confirmed. You can log in after the 2-minute cooldown.'};
  });
}

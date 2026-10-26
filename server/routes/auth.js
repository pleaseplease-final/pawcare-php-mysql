import {passwordLogin,consumeUnlock} from '../loginLockout.js';
import {ensureVerificationDelivery,confirmDelivery,issueVerification,sendMobileVerification,verificationFailure} from '../verificationDelivery.js';
import {appUrl,sessionCookie} from '../appOrigin.js';
import {requestPasswordReset,resetPassword} from '../passwordRecovery.js';
import { randomInt } from 'node:crypto';
import { parsePhoneNumberFromString } from 'libphonenumber-js/max';
import express from 'express';
import { query, withTransaction } from '../db.js';
import {
  hashPassword,
  sha256,
  randomHex,
  validatePasswordComplexity,
} from '../security.js';
import { sendMail, sendSms } from '../services.js';
import { validateOwnerRegistration } from '../registrationValidation.js';
import { validateStaffSetupField } from '../../src/staffSetupValidation.js';
import { ensureStaffAccessSchema } from '../staffAccess.js';

export const getAppUrl = () => appUrl();

const router = express.Router();
router.post('/forgot',requestPasswordReset);
router.post('/reset',resetPassword);

function renderVerifyEmailHtml(name, verifyLink) {
  return `
  <!DOCTYPE html>
  <html>
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Verify your PawCare Account</title>
  </head>
  <body style="margin:0;padding:0;background-color:#f8fafc;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#0f172a;">
    <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f8fafc;padding:32px 16px;">
      <tr>
        <td align="center">
          <table width="100%" cellpadding="0" cellspacing="0" style="max-width:540px;background:#ffffff;border-radius:20px;overflow:hidden;box-shadow:0 10px 30px rgba(15,23,42,0.08);border:1px solid #e2e8f0;">
            <tr>
              <td style="background:linear-gradient(135deg,#1e3a8a 0%,#2563eb 100%);padding:32px 28px;text-align:center;">
                <div style="font-size:38px;margin-bottom:8px;">🐾</div>
                <h1 style="margin:0;color:#ffffff;font-size:24px;font-weight:800;letter-spacing:-0.02em;">PawCare Daily Hub</h1>
                <p style="margin:6px 0 0;color:#dbeafe;font-size:14px;">Veterinary Clinic & Pet Health Portal</p>
              </td>
            </tr>
            <tr>
              <td style="padding:36px 32px;">
                <h2 style="margin:0 0 12px;color:#002B49;font-size:20px;font-weight:700;">Welcome, ${name || 'Pet Parent'}! 🐶🐱</h2>
                <p style="margin:0 0 20px;color:#475569;font-size:15px;line-height:1.6;">
                  Thank you for creating an account with PawCare. To complete your registration and secure your pet's vaccination cards and appointment bookings, please verify your email address.
                </p>
                <div style="text-align:center;margin:32px 0;">
                  <a href="${verifyLink}" target="_blank" style="display:inline-block;background:linear-gradient(135deg,#ffe28a,#ffd24d);color:#002B49;font-size:16px;font-weight:800;padding:15px 36px;border-radius:99px;text-decoration:none;box-shadow:0 8px 20px rgba(255,200,60,0.4);border:1px solid #facc15;">
                    Verify My Email Address →
                  </a>
                </div>
                <p style="margin:24px 0 0;color:#64748b;font-size:13px;line-height:1.5;background:#f8fafc;padding:12px 16px;border-radius:12px;border:1px dashed #cbd5e1;">
                  ⏱️ <b>Notice:</b> This link will expire in <b>24 hours</b>. If you didn't create a PawCare account, you can safely ignore this email.
                </p>
                <div style="margin-top:24px;padding-top:20px;border-top:1px solid #f1f5f9;font-size:12px;color:#94a3b8;word-break:break-all;">
                  Button not working? Copy and paste this URL into your browser:<br>
                  <a href="${verifyLink}" style="color:#2563eb;text-decoration:underline;">${verifyLink}</a>
                </div>
              </td>
            </tr>
            <tr>
              <td style="background:#f8fafc;padding:20px 32px;text-align:center;border-top:1px solid #e2e8f0;font-size:12px;color:#94a3b8;">
                PawCare Veterinary Clinic • Caloocan City • Philippine Standard Animal Healthcare
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
  </html>
  `;
}

// Middleware to authenticate user via session cookie or Bearer token
export async function requireAuth(req, res, next) {
  const sid = req.cookies?.sid || (req.headers.authorization && req.headers.authorization.replace('Bearer ', ''));
  if (!sid) return res.status(401).json({ error: 'Not signed in.' });

  try {
    const r = await query(
      `SELECT u.*, a.house_street, a.country, a.city, a.state, a.zip_code
       FROM sessions s
       JOIN users u ON u.id = s.user_id
       LEFT JOIN addresses a ON a.user_id = u.id
       WHERE s.token_hash = $1 AND s.expires_at > NOW()`,
      [sha256(sid)]
    );

    if (!r.rows.length) return res.status(401).json({ error: 'Session expired. Please log in again.' });

    const user = r.rows[0];
    if (user.is_active === false) return res.status(403).json({ error: 'Your account is inactive. Contact the clinic administrator.' });
    if (!user.mobile_verified || (user.role === 'owner' && !user.email_verified_at)) {
      return res.status(403).json({ error: 'Complete email and mobile verification, then log in.', needsOtp: true });
    }
    req.user = {
      id: user.id,
      firstName: user.first_name,
      lastName: user.last_name,
      middleInitial: user.middle_initial,
      name: `${user.first_name}${user.middle_initial ? ' ' + user.middle_initial + '.' : ''} ${user.last_name}`.trim(),
      email: user.email,
      role: user.role,
      vetId: user.vet_id,
      ownerId: user.owner_id || user.id,
      phone: user.mobile_number,
      birthday: user.birthday,
      emailVerified: !!user.email_verified_at,
      mobileVerified: user.mobile_verified,
      address: {
        houseStreet: user.house_street,
        country: user.country,
        city: user.city,
        state: user.state,
        zipCode: user.zip_code,
      },
    };
    next();
  } catch (err) {
    console.error('Auth error:', err);
    res.status(500).json({ error: 'Authentication check failed.' });
  }
}

// Restrict routes by RBAC roles
export function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: 'Unauthorized.' });
    if (!roles.includes(req.user.role) && req.user.role !== 'admin') {
      return res.status(403).json({ error: `Access forbidden for role ${req.user.role}.` });
    }
    next();
  };
}

// 1. REGISTER
router.post('/register', async (req, res) => {
  try {
    if (!req.body || typeof req.body !== 'object' || Array.isArray(req.body)) return res.status(400).json({ error: 'Enter the registration fields.' });
    if (req.body.role && req.body.role !== 'owner') return res.status(403).json({ error: 'Public registration is only available for Pet Owners. Staff accounts must be invited by the Clinic Administrator.' });
    const validated = await validateOwnerRegistration(req.body);
    if (Object.keys(validated.errors).length) return res.status(400).json({ error: 'Please fix the highlighted fields.', errors: validated.errors });
    const {firstName:fn,lastName:ln,middleInitial:mi,birthday:bd,mobile:mob,houseStreet,country,state,city,zipCode,email:em} = validated;
    const fullAddress = `${houseStreet}, ${city}, ${state} ${zipCode}, ${country}`;

    // Check existing
    const existing = await query('SELECT id FROM users WHERE LOWER(email) = $1', [em]);
    if (existing.rows.length > 0) {
      return res.status(400).json({ error: 'An account with this email already exists.' });
    }

    await ensureVerificationDelivery();
    const pwHash = await hashPassword(req.body.password);
    const userId = 'u_' + randomHex(8);
    const ownerId = 'o_' + randomHex(8);

    const rawToken = randomHex(24);
    await withTransaction(async client => {
      // Insert user
      await client.query(
        `INSERT INTO users (
          id, first_name, last_name, middle_initial, birthday,
          password_hash, email, role, vet_id, owner_id, mobile_number,
          email_verified_at, mobile_verified
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
        [
          userId,
          fn,
          ln,
          mi,
          bd,
          pwHash,
          em,
          'owner',
          null,
          ownerId,
          mob,
          null,
          false,
        ]
      );

      // Insert address
      await client.query(
        `INSERT INTO addresses (user_id, house_street, country, state, city, zip_code)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [userId, houseStreet, country, state, city, zipCode]
      );

      // Insert into owners table
      const fullName = `${fn}${mi ? ' ' + mi + '.' : ''} ${ln}`.trim();
      await client.query(
        `INSERT INTO owners (id, user_id, name, email, phone, address)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (id) DO NOTHING`,
        [ownerId, userId, fullName, em, mob, fullAddress]
      );

      await client.query('UPDATE users SET email_verification_requested_at=clock_timestamp() WHERE id=$1',[userId]);
      // Generate email verification token
      await client.query(
        `INSERT INTO verification_tokens (user_id, token_hash, type, expired_at, delivery_confirmed, destination)
         VALUES ($1, $2, 'email_verify', NOW() + INTERVAL '24 hours', false, $3)`,
        [userId, sha256(rawToken), em]
      );

    });

    // Send verification email
    const siteUrl = getAppUrl(req);
    const verifyLink = `${siteUrl}/?verify=${rawToken}`;
    const sent = await confirmDelivery(rawToken,userId, () => sendMail(
      em,
      'Welcome to PawCare - Verify your email address',
      `Hello ${fn}!\n\nPlease verify your email for your PawCare account:\n${verifyLink}\n\nWarm regards,\nPawCare Team`,
      renderVerifyEmailHtml(fn, verifyLink)
    ));

    res.json({
      status: 'ok',
      email: em,
      delivery: sent ? 'accepted' : 'failed',
      retryAfter: 60,
      message: sent ? 'Account created. The email provider accepted your verification email. Check your inbox and spam folder.' : 'Account created, but the verification email could not be sent. Retry sending it in one minute.',
    });
  } catch (err) {
    console.error('Registration failed:', err);
    res.status(err.code === '23505' ? 409 : 500).json({ error: err.code === '23505' ? 'An account with these details already exists.' : 'Unable to complete registration. Please try again.' });
  }
});

// A password reset must revoke sessions even when a password login was already in flight.
async function checkLoginSnapshot(client,user) {
  const current=(await client.query('SELECT * FROM users WHERE id=$1 FOR SHARE',[user.id])).rows[0];
  if(!current || current.is_active===false || current.is_locked || current.password_hash!==user.password_hash || current.email!==user.email
    || current.mobile_verified!==user.mobile_verified || current.role!==user.role || (current.role==='owner' && !current.email_verified_at)) {
    throw Object.assign(new Error('Account access changed. Please sign in again.'),{status:401});
  }
}

// 2. LOGIN
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    const em = String(email || '').trim().toLowerCase();

    if (!em || !password) {
      return res.status(400).json({ error: 'Email and password are required.' });
    }

    if(typeof password !== 'string' || password.length>1000 || em.length>255) return res.status(400).json({error:'Enter a valid email and password.'});
    const result=await passwordLogin(em,password);
    if(!result.user) {
      const {status,...body}=result;
      res.set('Cache-Control','no-store');
      if(body.retryAfter)res.set('Retry-After',String(body.retryAfter));
      return res.status(status).json(body);
    }
    const u=result.user;

    if (u.role === 'owner' && !u.email_verified_at) {
      return res.status(403).json({ error: 'Please verify your email address first (check your inbox).', unverified: true });
    }

    // Check mobile verification
    if (!u.mobile_verified) {
      const sid = randomHex(32);
      await withTransaction(async client=>{
        await checkLoginSnapshot(client,u);
        await client.query(
          'INSERT INTO sessions (token_hash, user_id, expires_at) VALUES ($1, $2, NOW() + INTERVAL \'7 days\')',
          [sha256(sid), u.id]
        );
      });
      res.cookie('sid', sid, sessionCookie(7 * 86400 * 1000));
      return res.json({
        status: 'ok',
        needsOtp: true,
        token: sid,
        message: 'Please complete mobile number SMS verification.',
      });
    }

    // Create session
    const sid = randomHex(32);
    await withTransaction(async client => {
      await checkLoginSnapshot(client,u);
      await client.query(
        'INSERT INTO sessions (token_hash, user_id, expires_at) VALUES ($1, $2, NOW() + INTERVAL \'14 days\')',
        [sha256(sid), u.id]
      );
      await client.query('INSERT INTO audit_logs (user_name,user_role,action) VALUES ($1,$2,$3)',
        [`${u.first_name} ${u.last_name}`.trim(),u.role,`Signed in (${u.id}).`]);
    });

    res.cookie('sid', sid, sessionCookie(14 * 86400 * 1000));

    const userObj = {
      id: u.id,
      name: `${u.first_name}${u.middle_initial ? ' ' + u.middle_initial + '.' : ''} ${u.last_name}`.trim(),
      email: u.email,
      role: u.role,
      vetId: u.vet_id,
      ownerId: u.owner_id,
      phone: u.mobile_number,
    };

    res.json({
      status: 'ok',
      user: userObj,
      token: sid,
    });
  } catch (err) {
    console.error('Login failed:', err);
    res.status(err.status || 500).json({ error: err.status ? err.message : 'Sign-in failed.' });
  }
});

// 3. CURRENT USER (GET /api/auth/me)
router.get('/me', requireAuth, (req, res) => {
  res.json({
    status: 'ok',
    user: req.user,
  });
});

// 4. LOGOUT
router.post('/logout', async (req, res) => {
  const sid = req.cookies?.sid || req.headers.authorization?.replace('Bearer ', '');
  if (sid) {
    await query('DELETE FROM sessions WHERE token_hash = $1', [sha256(sid)]).catch(() => {});
  }
  res.clearCookie('sid');
  res.json({ status: 'ok', message: 'Logged out successfully.' });
});

// 5. RESEND VERIFICATION EMAIL
router.post('/resend-verification', async (req, res) => {
  const em = typeof req.body?.email==='string'?req.body.email.trim().toLowerCase():'';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(em) || em.length>255) return res.status(400).json({ error: 'Enter a valid email address.' });

  try {
    const r = await query('SELECT * FROM users WHERE email = $1', [em]);
    if (!r.rows.length) {
      return res.json({ status: 'ok', message: 'If an eligible account matches, check your email or contact the clinic for verification help.',retryAfter:60 });
    }
    const u = r.rows[0];
    if (u.email_verified_at) {
      return res.json({ status: 'ok', message: 'Email address is already verified.' });
    }

    const {token:rawToken,destination} = await issueVerification(u.id,'email_verify');
    const verifyLink = `${getAppUrl()}/?verify=${rawToken}`;
    const sent = await confirmDelivery(rawToken,u.id,()=>sendMail(destination,'PawCare - Verify your email address',`Please verify your email address:\n${verifyLink}`,renderVerifyEmailHtml(u.first_name || 'Pet Parent',verifyLink)));
    if(!sent)return res.status(503).json({error:'The verification email could not be sent. Retry in one minute.',retryAfter:60});
    res.json({status:'ok',delivery:'accepted',retryAfter:60,message:'The email provider accepted your verification email. Check your inbox and spam folder.'});
  } catch (err) {return verificationFailure(res,err);}
});

// 6. VERIFY EMAIL LINK (Supports GET and POST)
async function handleEmailVerification(req, res) {
  const token = req.query.token || req.body?.token;
  if (!token) {
    if (req.headers.accept?.includes('text/html')) {
      return res.redirect('/?verified=invalid');
    }
    return res.status(400).json({ status: 'invalid', error: 'Token is required.' });
  }

  try {
    await ensureVerificationDelivery();
    const r = await query(
      `SELECT t.*, u.id as user_id, u.email, u.first_name, u.mobile_number, u.mobile_verified
       FROM verification_tokens t
       JOIN users u ON u.id = t.user_id
       WHERE t.token_hash = $1 AND t.type = 'email_verify' AND t.expired_at > NOW() AND t.delivery_confirmed=true AND t.destination=u.email`,
      [sha256(token)]
    );
    if (!r.rows.length) {
      if (req.headers.accept?.includes('text/html')) {
        return res.redirect('/?verified=invalid');
      }
      return res.status(400).json({ status: 'invalid', error: 'Verification link is invalid or has expired.' });
    }

    const tok = r.rows[0];
    await query('UPDATE users SET email_verified_at = NOW() WHERE id = $1', [tok.user_id]);
    await query('DELETE FROM verification_tokens WHERE id = $1', [tok.id]);

    if (tok.mobile_verified) {
      if (req.headers.accept?.includes('text/html') && !req.xhr) return res.redirect('/?verified=ok');
      return res.json({ status: 'ok', mobileVerified: true });
    }

    // Create session cookie so subsequent OTP requests are authenticated
    const sid = randomHex(32);
    await query(
      `INSERT INTO sessions (token_hash, user_id, expires_at)
       VALUES ($1, $2, NOW() + INTERVAL '7 days')`,
      [sha256(sid), tok.user_id]
    );
    res.cookie('sid', sid, sessionCookie(7 * 86400 * 1000));

    let sent=false,retryAfter=60;
    try {sent=await sendMobileVerification({...tok,id:tok.user_id});}
    catch(error){if(error.status!==429)throw error;retryAfter=error.retryAfter;}

    if (req.headers.accept?.includes('text/html') && !req.xhr) {
      return res.redirect('/?verified=ok');
    }

    return res.json({
      status: 'ok',
      message: 'Email address successfully verified!',
      token: sid,
      phone: tok.mobile_number,
      delivery: sent ? 'accepted' : 'unavailable',retryAfter
    });
  } catch (err) {
    console.error('Email verify error:', err);
    if (req.headers.accept?.includes('text/html')) {
      return res.redirect('/?verified=invalid');
    }
    res.status(500).json({ status: 'error', error: 'Verification failed.' });
  }
}

router.get('/verify-email', handleEmailVerification);
router.post('/verify-email', handleEmailVerification);

// OTP endpoints only operate on the account identified by the verification session.
async function verificationUser(req) {
  const sid = req.cookies?.sid || req.headers.authorization?.replace('Bearer ', '');
  if (!sid) return null;
  const r = await query(
    `SELECT u.* FROM sessions s JOIN users u ON u.id = s.user_id
     WHERE s.token_hash = $1 AND s.expires_at > NOW()`,
    [sha256(sid)]
  );
  const user = r.rows[0];
  return user?.email_verified_at && user.is_active!==false ? user : null;
}

router.get(['/otp/info', '/otp-info'], async (req, res) => {
  try {
    const user = await verificationUser(req);
    if (!user) return res.status(401).json({ error: 'Open your email verification link or log in to continue.' });
    await ensureVerificationDelivery();
    const tok = await query(
      `SELECT id FROM verification_tokens WHERE user_id = $1 AND type = 'mobile_otp' AND expired_at > NOW() AND delivery_confirmed=true AND attempts<3 AND destination=$2`,
      [user.id,user.mobile_number]
    );
    const retryAfter=Math.max(0,Math.ceil((new Date(user.mobile_otp_requested_at).getTime()+60000-Date.now())/1000)) || 0;
    return res.json({ retryAfter, mobileVerified: !!user.mobile_verified, phone: user.mobile_number || '', hasActiveOtp: tok.rows.length > 0 });
  } catch (err) {
    res.status(500).json({ error: 'Could not check mobile verification. Please try again.' });
  }
});

router.post(['/otp/resend', '/send-otp'], async (req, res) => {
  try {
    const user = await verificationUser(req);
    if (!user) return res.status(401).json({ error: 'Open your email verification link or log in to continue.' });
    if (user.mobile_verified) return res.status(409).json({ error: 'Mobile number already verified. Please log in.' });
    const sent=await sendMobileVerification(user);
    if(!sent)return res.status(503).json({error:'The SMS code could not be sent. Retry in one minute.',retryAfter:60});
    res.json({status:'ok',ok:true,delivery:'accepted',retryAfter:60,message:'The SMS provider accepted your verification code.'});
  } catch (err) {return verificationFailure(res,err);}
});

router.post(['/otp/verify', '/verify-otp'], async (req, res) => {
  const code = String(req.body?.code ?? '').trim();
  if (!/^\d{6}$/.test(code)) return res.status(400).json({ error: 'Enter the 6-digit code.' });
  try {
    const user = await verificationUser(req);
    if (!user) return res.status(401).json({ error: 'Open your email verification link or log in to continue.' });
    if (user.mobile_verified) return res.status(409).json({ error: 'Mobile number already verified. Please log in.' });
    await ensureVerificationDelivery();
    const completed = await withTransaction(async client => {
      // Same lock order as code replacement; attempts and consumption are atomic.
      const current=(await client.query('SELECT * FROM users WHERE id=$1 FOR UPDATE',[user.id])).rows[0];
      if(!current || current.mobile_verified || current.is_active===false || current.mobile_number!==user.mobile_number)return false;
      const tok=(await client.query("SELECT * FROM verification_tokens WHERE user_id=$1 AND type='mobile_otp' AND expired_at>clock_timestamp() AND delivery_confirmed=true AND attempts<3 AND destination=$2 ORDER BY created_at DESC LIMIT 1 FOR UPDATE",[user.id,current.mobile_number])).rows[0];
      if(!tok)return false;
      if(tok.token_hash!==sha256(code)) {
        await client.query('UPDATE verification_tokens SET attempts=attempts+1 WHERE id=$1',[tok.id]);
        return false;
      }
      await client.query('DELETE FROM verification_tokens WHERE id=$1',[tok.id]);
      await client.query('UPDATE users SET mobile_verified = true, mobile_verified_at = NOW() WHERE id = $1', [user.id]);
      await client.query("DELETE FROM verification_tokens WHERE user_id=$1 AND type='mobile_otp'",[user.id]);
      await client.query('DELETE FROM sessions WHERE user_id = $1',[user.id]);
      return true;
    });
    if(!completed)return res.status(400).json({error:'Code is incorrect, expired, used or has reached three attempts. Request a new code when the resend timer ends.'});
    res.clearCookie('sid', { path: '/' });
    return res.json({ status: 'ok', ok: true, requiresLogin: true, message: 'Account verified. Please log in.' });
  } catch (err) {
    res.status(500).json({ error: 'Code verification failed.' });
  }
});

// 8. UNLOCK STATUS & EXECUTE
router.post('/unlock', async (req, res) => {
  const token=req.body?.token;
  if(typeof token!=='string' || !/^[a-f0-9]{64}$/.test(token))return res.status(400).json({error:'Unlock link is invalid or expired.'});
  res.set('Cache-Control','no-store');
  try {
    const result=await consumeUnlock(token);
    if(!result)return res.status(400).json({error:'Unlock link is invalid, expired or already used. Retry login to request another link.'});
    return res.json(result);
  } catch {
    return res.status(500).json({error:'Account unlock is unavailable. Please try again.'});
  }
});

// 9. DEV OUTBOX
router.get('/outbox', (req, res) => {
  res.status(404).json({ error: 'Not found.' });
});

// 10. INVITE STAFF (Clinic Administrator Only)
router.post('/staff/invite', requireAuth, async (req, res) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Only the Clinic Administrator can invite staff members.' });
  }

  const { email, name, role } = req.body;
  const em = String(email || '').trim().toLowerCase();
  if (!['assistant','vet','admin'].includes(role)) return res.status(400).json({error:'Choose Veterinarian, Vet Assistant or Clinic Administrator.'});
  // Administrator access is the highest level, so it needs an explicit confirmation on top of the form.
  if (role === 'admin' && req.body.confirmAdmin !== true) return res.status(400).json({error:'Confirm that this person should receive full administrator access.'});
  const staffRole = role;
  const roleName = staffRole === 'vet' ? 'Veterinarian' : staffRole === 'admin' ? 'Clinic Administrator' : 'Vet Assistant';

  if (em.length>255 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(em)) return res.status(400).json({ error: 'Enter a valid staff email address.' });
  if (typeof name !== 'string' || !name.trim() || /\d/.test(name) || !/^(?=.*\p{L})[\p{L}\p{M}'’ -]{2,50}$/u.test(name.trim())) return res.status(400).json({ error: 'Staff full name must be 2 to 50 characters and contain letters only (no numbers).' });

  try {
    if (staffRole === 'admin') await ensureStaffAccessSchema();
    const existingUser = await query('SELECT id FROM users WHERE LOWER(email) = $1', [em]);
    if (existingUser.rows.length) {
      return res.status(400).json({ error: 'A user account with this email already exists.' });
    }

    const rawToken = randomHex(32);
    await withTransaction(async client => {
    await client.query(
      `INSERT INTO staff_invitations (email, name, role, token_hash, invited_by, expired_at)
       VALUES ($1, $2, $3, $4, $5, NOW() + INTERVAL '7 days')
       ON CONFLICT (email) DO UPDATE SET
         name = EXCLUDED.name,
         role = EXCLUDED.role,
         token_hash = EXCLUDED.token_hash,
         invited_by = EXCLUDED.invited_by,
         accepted_at = NULL,
         expired_at = NOW() + INTERVAL '7 days'`,
      [em, name.trim(), staffRole, sha256(rawToken), req.user.id]
    );

    await client.query('INSERT INTO audit_logs (user_name,user_role,action) VALUES ($1,$2,$3)',[req.user.name,req.user.role,`Created staff invitation for ${em} (${staffRole})${staffRole === 'admin' ? ' with FULL ADMINISTRATOR access, confirmed by the inviting administrator' : ''}`]);
    });

    const siteUrl = getAppUrl(req);
    const inviteLink = `${siteUrl}/?invite=${rawToken}`;

    const delivery = await sendMail(
      em,
      `PawCare Staff Invitation: Set up your ${roleName} Account`,
      `Hello ${name},\n\nYou have been invited by the Clinic Administrator to join PawCare Clinic as a ${roleName}.\n\nClick the link below to set your password and complete your mobile phone verification via OTP:\n${inviteLink}\n\nThis invitation link expires in 7 days.\n\nWarm regards,\nPawCare Administration`,
      `<div style="font-family: Arial, sans-serif; padding: 24px; background: #f8fafc; border-radius: 12px; border: 1px solid #e2e8f0; max-width: 520px;">
        <h2 style="color: #1e3a8a; margin-top: 0;">🐾 Welcome to the PawCare Clinic Staff</h2>
        <p style="color: #334155; font-size: 15px; line-height: 1.6;">
          Hello <b>${name}</b>,<br>
          You have been invited by the Clinic Administrator to join the PawCare team as a <b>${roleName}</b>.
        </p>
        <p style="color: #334155; font-size: 14px;">
          Please click below to set your password and complete your mobile phone OTP verification:
        </p>
        <div style="margin: 24px 0;">
          <a href="${inviteLink}" style="background: #2563eb; color: #ffffff; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: bold; display: inline-block;">
            Activate ${roleName} Account
          </a>
        </div>
        <p style="color: #64748b; font-size: 12px;">
          Direct Link: <a href="${inviteLink}" style="color: #2563eb;">${inviteLink}</a><br>
          This invitation expires in 7 days.
        </p>
      </div>`
    );

    res.json({
      status: 'ok',
      message: 'Staff invitation created.',
      delivery: delivery?.via === 'dev_outbox' ? 'not_sent' : delivery?.ok ? 'accepted' : 'unknown',
      inviteLink
    });
  } catch (err) {
    console.error('Staff invite error:', err);
    res.status(500).json({ error: 'Failed to send staff invitation: ' + err.message });
  }
});

// 11. GET STAFF INVITATION INFO
router.get('/staff/invite-info', async (req, res) => {
  const { token } = req.query;
  if (!token) return res.status(400).json({ error: 'Invitation token is required.' });

  try {
    const r = await query(
      `SELECT * FROM staff_invitations WHERE token_hash = $1 AND expired_at > NOW()`,
      [sha256(token)]
    );
    if (!r.rows.length) {
      return res.status(404).json({ error: 'Invitation link is invalid or has expired.' });
    }
    const inv = r.rows[0];
    if (inv.accepted_at) {
      return res.status(400).json({ error: 'This invitation has already been accepted.' });
    }

    res.json({
      status: 'ok',
      email: inv.email,
      name: inv.name,
      role: inv.role
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 12. ACCEPT STAFF INVITATION (Sets password + sends TextBee OTP)
router.post('/staff/accept-invite', async (req,res) => {
  const {token,firstName,lastName,middleInitial,birthday,mobileNumber,password,houseStreet,city,state,country,zipCode}=req.body;
  const validName=v=>typeof v==='string'&&v.trim().length>0&&v.trim().length<=50&&/^[\p{L} .'-]+$/u.test(v.trim());
  const phone=typeof mobileNumber==='string'?parsePhoneNumberFromString(mobileNumber,'PH'):null;
  if(typeof token!=='string'||token.length>256||!token||!validName(firstName)||!validName(lastName)||typeof birthday!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(birthday)||!Number.isFinite(Date.parse(birthday))||new Date(birthday).toISOString().slice(0,10)!==birthday||birthday<'1900-01-01'||birthday>=new Date().toISOString().slice(0,10)||!phone?.isValid()||!['MOBILE','FIXED_LINE_OR_MOBILE'].includes(phone.getType())) return res.status(400).json({error:'Enter your full name, real birth date and a valid mobile number.'});
  // The setup form's own rules apply on the server too: age 18+, a real address, field lengths.
  const setupErrors=Object.fromEntries(['firstName','lastName','middleInitial','birthday','houseStreet','city','state','zipCode','mobileNumber'].map(field=>[field,validateStaffSetupField(field,req.body[field],req.body)]).filter(([,message])=>message));
  if(typeof country!=='undefined' && (typeof country!=='string' || country.length>100))setupErrors.country='Check the country.';
  if(Object.keys(setupErrors).length)return res.status(400).json({error:Object.values(setupErrors)[0],errors:setupErrors});
  const pwErr=validatePasswordComplexity(password);
  if(pwErr)return res.status(400).json({error:pwErr});
  try {
    await ensureVerificationDelivery();
    const pwHash=await hashPassword(password),userId='u_'+randomHex(8),sid=randomHex(32),otpCode=String(randomInt(100000,1000000));
    await withTransaction(async client=>{
      const inv=(await client.query('SELECT * FROM staff_invitations WHERE token_hash=$1 FOR UPDATE',[sha256(token)])).rows[0];
      // Check the database clock after acquiring the lock: revocation may have committed while we waited.
      const usable=inv&&!inv.accepted_at&&(await client.query('SELECT expired_at > clock_timestamp() AS valid FROM staff_invitations WHERE id=$1',[inv.id])).rows[0]?.valid;
      if(!usable)throw Object.assign(new Error('This invitation is expired, revoked or already used. Contact the administrator.'),{status:409});
      if(!['vet','assistant','admin'].includes(inv.role))throw Object.assign(new Error('Invalid staff invitation role.'),{status:400});
      const vetId=inv.role==='vet'?'v_'+randomHex(8):null;
      await client.query(`INSERT INTO users(id,first_name,last_name,middle_initial,birthday,password_hash,email,role,vet_id,mobile_number,email_verified_at,mobile_verified)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,NOW(),false)`,[userId,firstName.trim(),lastName.trim(),(middleInitial||'').trim()||null,birthday,pwHash,inv.email,inv.role,vetId,phone.number]);
      if(houseStreet && city) {
        await client.query(
          `INSERT INTO addresses(user_id,house_street,country,city,state,zip_code) VALUES($1,$2,$3,$4,$5,$6)`,
          [userId, houseStreet.trim(), (country||'Philippines').trim(), city.trim(), (state||'').trim(), (zipCode||'').trim()]
        );
      }
      await client.query('UPDATE staff_invitations SET accepted_at=NOW() WHERE id=$1',[inv.id]);
      await client.query('UPDATE users SET mobile_otp_requested_at=clock_timestamp() WHERE id=$1',[userId]);
      await client.query("INSERT INTO verification_tokens(user_id,token_hash,type,expired_at,delivery_confirmed,destination) VALUES($1,$2,'mobile_otp',NOW()+INTERVAL '10 minutes',false,$3)",[userId,sha256(otpCode),phone.number]);
      await client.query("INSERT INTO sessions(token_hash,user_id,expires_at) VALUES($1,$2,NOW()+INTERVAL '7 days')",[sha256(sid),userId]);
      await client.query('INSERT INTO audit_logs (user_name,user_role,action) VALUES ($1,$2,$3)',[`${firstName.trim()} ${lastName.trim()}`,inv.role,`Accepted staff invitation ${inv.id}; mobile verification pending (${userId}).`]);
    });
    const sent=await confirmDelivery(otpCode,userId,()=>sendSms(phone.number,`PawCare Staff Security: Your verification OTP code is ${otpCode}. Valid for 10 minutes.`));
    res.cookie('sid',sid,sessionCookie(7 * 86400 * 1000));
    res.json({status:'ok',needsOtp:true,delivery:sent?'accepted':'failed',retryAfter:60,message:sent?'Account created. Verify your mobile number to continue.':'Account created, but the SMS could not be sent. Retry in one minute.',token:sid});
  }catch(error){res.status(error.status||(error.code==='23505'?409:500)).json({error:error.status?error.message:error.code==='23505'?'This account already exists. Log in or contact the administrator.':'Unable to complete staff setup. Try logging in if your account was already created.'});}
});

export const authRouter = router;
export default router;

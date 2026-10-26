import {readLoginCooldown,saveLoginCooldown} from '../loginCooldown.js';
import {useResendTimer} from "../useResendTimer.js";
﻿import { useState, useRef } from "react";
import { Logo, ROLES } from "../lib.jsx";
import { validateLogin } from "../validate.js";
import { useLive } from "../roles/owner/ui.jsx";
import { auth, OFFLINE_MSG } from "../authApi.js";
import "./auth.css";
import "./brand.css";
import "./public-pages.css";

const Eye = ({ off }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {off ? (
      <>
        <path d="M17.94 17.94A10.9 10.9 0 0 1 12 19C5 19 1 12 1 12a18.5 18.5 0 0 1 5.06-5.94M9.9 4.24A9.1 9.1 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19M14.12 14.12a3 3 0 1 1-4.24-4.24" />
        <path d="M1 1l22 22" />
      </>
    ) : (
      <>
        <path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7S1 12 1 12z" />
        <circle cx="12" cy="12" r="3" />
      </>
    )}
  </svg>
);

const DEMO = {
  admin: ["admin@pawcare.com", "Admin123"],
  vet: ["vet@pawcare.com", "Vet12345"],
  assistant: ["assistant@pawcare.com", "Assist123"],
  owner: ["maria@example.com", "Owner123"],
};

export default function Login({ role, notice, bad, onLogin, onBack, go }) {
  const f = useLive({ email: "", password: "" }, validateLogin);
  const [loginWait,setLoginWait]=useResendTimer(Math.max(0,Math.ceil((readLoginCooldown()-Date.now())/1000)));
  const [unlockRetry,setUnlockRetry]=useResendTimer();
  const [needsUnlock,setNeedsUnlock]=useState(false);
  const [hadCooldown,setHadCooldown]=useState(()=>readLoginCooldown()>0);
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [top, setTop] = useState("");
  const [rv, setRv] = useState("");
  const [cool,setCool]=useResendTimer();
  const [resending,setResending]=useState(false);
  const sending=useRef(false);
  const [unver, setUnver] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setTop("");
    setRv("");
    setUnver(false);
    f.submit(e);
    if (!f.valid || busy || loginWait>0 || unlockRetry>0) return;
    setBusy(true);
    try {
      const r = await auth.login(f.v.email.trim(), f.v.password);
      onLogin(r);
      return;
    } catch (x) {
      setUnver(!!x.unverified);
      setNeedsUnlock(!!x.unlockRequired);
      if(x.unlockRequired)setUnlockRetry(x.retryAfter || 60);
      if(x.cooldownUntil){setLoginWait(saveLoginCooldown(x.cooldownUntil));setHadCooldown(true);}
      setTop(x.offline ? OFFLINE_MSG : x.message || "Invalid email or password.");
    }
    setBusy(false);
  };

  const resend = async () => {
    if(sending.current || busy || cool>0)return;
    sending.current=true;setResending(true);
    setRv("");
    try {
      const result=await auth.resendVerification(f.v.email.trim());
      setTop("");
      setRv(result.message);
      setCool(result.retryAfter ?? 60);
    } catch (x) {
      setTop(x.offline ? OFFLINE_MSG : x.message || "Please try again.");
      setCool(x.retryAfter || (x.status===429 || x.status===503?60:0));
    } finally {sending.current=false;setResending(false);}
  };

  const title = role ? `Log in · ${ROLES[role][0]}` : "Log in";

  return (
    <main className="login-page">
      <div className="login-layout">
      <aside className="login-story" aria-label="Welcome to PawCare">
        <span className="public-eyebrow">A little care. A healthier tomorrow.</span>
        <h2>Good care starts with <em>staying connected.</em></h2>
        <p>Your pets, their health records, and the people who care for them. All in one friendly place.</p>
        <div className="login-photo">
          <img src="/images/login-pets.jpg" alt="A dog and cat ready for their next visit" />
          <span><Logo size={34} /> Here for every wag &amp; purr.</span>
        </div>
        <div className="login-benefits"><span>Appointments</span><span>Vaccine records</span><span>Connected care</span></div>
      </aside>
      <form className="login-card" onSubmit={submit} noValidate aria-labelledby="login-title">
        <div className="login-card-top">
          <div className="public-brand"><Logo size={42} /><span><b>PawCare</b><small>CLINIC &amp; PET CARE HUB</small></span></div>
          <button type="button" className="lnk login-back" onClick={onBack}>← Home</button>
        </div>
        <div className="login-heading">
          <span className="public-eyebrow">YOUR CARE SPACE</span>
          <h1 id="login-title">{role ? title : "Welcome back"}</h1>
          <p>Enter your details to open your portal.</p>
        </div>
        {notice && <p className={`auth-note${bad ? " bad" : ""}`} role="status">{notice}</p>}

        <div className="fld">
          <label htmlFor="login-email">
            Email<i> *</i>
          </label>
            <input
              id="login-email"
              disabled={resending || busy}
              type="email"
              required
              spellCheck={false}
              autoCapitalize="none"
              placeholder="you@example.com"
              aria-invalid={!!f.show("email", false)}
              aria-describedby="login-email-error"
              autoComplete="username"
              value={f.v.email}
              className={f.show("email", false) ? "bad" : f.v.email && !f.errs.email ? "ok" : ""}
              onChange={(e) => f.set("email", e.target.value)}
              onBlur={() => f.blur("email")}
            />
          <span className="err" id="login-email-error" aria-live="polite">{f.show("email", false)}</span>
        </div>

        <div className="fld">
          <label htmlFor="login-password">
            Password<i> *</i>
          </label>
            <div className="pw">
              <input
                id="login-password"
                required
                disabled={busy}
                placeholder="Enter your password"
                aria-invalid={!!f.show("password", false)}
                aria-describedby="login-password-error"
                type={show ? "text" : "password"}
                autoComplete="current-password"
                value={f.v.password}
                className={f.show("password", false) ? "bad" : f.v.password && !f.errs.password ? "ok" : ""}
                onChange={(e) => f.set("password", e.target.value)}
                onBlur={() => f.blur("password")}
              />
              <button
                type="button"
                className="eye"
                aria-label={show ? "Hide password" : "Show password"}
                aria-pressed={show}
                onClick={() => setShow(!show)}
              >
                <Eye off={show} />
              </button>
            </div>
          <span className="err" id="login-password-error" aria-live="polite">{f.show("password", false)}</span>
        </div>

        <div className="auth-row" style={{ justifyContent: "flex-end" }}>
          <button type="button" className="lnk" onClick={() => go("forgot")}>
            Forgot password?
          </button>
        </div>

        {top && (
          <p className="err" role="alert">
            {top}
          </p>
        )}
        {unver && <button type="button" className="lnk" disabled={resending || busy || cool>0} onClick={resend}>{resending?"Sending…":cool>0?`Resend email in ${cool}s`:"Resend verification email"}</button>}
        {rv && <p className="okm" role="status" style={{ color: "var(--ok, #16a34a)" }}>{rv}</p>}

        {loginWait>0 && <p role="status">Login available in {Math.floor(loginWait/60)}:{String(loginWait%60).padStart(2,'0')}. The cooldown continues if you refresh.</p>}
        {hadCooldown && loginWait===0 && <p role="status">Cooldown complete. You can log in now.</p>}
        <button className="btn gold wide login-submit" disabled={busy || loginWait>0 || unlockRetry>0}>
          {busy ? "Please wait…" : loginWait>0 ? "Login cooling down" : unlockRetry>0 ? `Retry unlock email in ${unlockRetry}s` : needsUnlock ? "Send unlock email again" : "Log in"}
        </button>
        <p className="auth-alt">
          New pet owner? <button type="button" className="lnk" onClick={() => go("register")}>Create an account</button>
        </p>
        <p className="auth-fine">Clinic staff accounts are created by the clinic administrator.</p>

        {import.meta.env.DEV && (
          <div className="demo">
            <p>Demo accounts (dev only, click to fill):</p>
            <div className="chips">
              {Object.entries(DEMO).map(([r, [em, pw]]) => (
                <button
                  type="button"
                  key={r}
                  className="btn ghost sm"
                  onClick={() => {
                    f.patch({ email: em, password: pw });
                  }}
                >
                  {ROLES[r][0]}
                </button>
              ))}
            </div>
          </div>
        )}
      </form>
      </div>
    </main>
  );
}



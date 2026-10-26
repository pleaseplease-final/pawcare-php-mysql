import { useState, useEffect, useRef, useId } from "react";
import AuthShell, { AuthBrand } from "./AuthShell.jsx";
import { tc, TCF, pn, pwOk, emOk } from "../validate.js";
import { api } from "../api.js";
import { birthdayError, clinicToday, latestBirthdayFor, EARLIEST_BIRTHDAY } from "../ageRules.js";
import "./auth.css";
import "./brand.css";

const fold = (x) => String(x).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();

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

function Pw({ id, value, onChange, onBlur, auto }) {
  const [s, setS] = useState(false);
  return (
    <div className="pw">
      <input id={id} type={s ? "text" : "password"} value={value} onChange={onChange} onBlur={onBlur} autoComplete={auto} />
      <button type="button" className="eye" aria-label={s ? "Hide password" : "Show password"} aria-pressed={s} onClick={() => setS(!s)}>
        <Eye off={s} />
      </button>
    </div>
  );
}

function Combo({ label, text, setText, load, pick, disabled, ph, err, ok, bad, onTouch }) {
  const id = useId();
  const [it, setIt] = useState([]), [open, setOpen] = useState(false), [k, setK] = useState(-1), seq = useRef(0), tm = useRef(), chosen = useRef(null);
  const run = async (q) => {
    if (disabled) return;
    const m = ++seq.current, r = await load(q);
    if (m === seq.current) { setIt(Array.isArray(r) ? r : []); setK(-1); setOpen(true); }
  };
  const choose = (o) => { chosen.current = o.v ?? o.n ?? o.t; setText(o.n || o.t); setOpen(false); pick(o); };
  return (
    <div className="fld">
      <label htmlFor={id}>{label}<i> *</i></label>
        <div className="combo">
          <input
            id={id}
            value={text}
            placeholder={ph}
            disabled={disabled}
            autoComplete="off"
            role="combobox"
            aria-expanded={open}
            aria-controls={`${id}-options`}
            aria-autocomplete="list"
            aria-activedescendant={open && k >= 0 ? `${id}-option-${k}` : undefined}
            aria-invalid={!!bad}
            aria-describedby={`${id}-error`}
            className={bad ? "bad" : ok ? "ok" : ""}
            onFocus={() => run(text)}
            onClick={() => { if (!open) run(text); }}
            onChange={(ev) => {
              chosen.current = null;
              setText(ev.target.value);
              pick(null, ev.target.value);
              clearTimeout(tm.current);
              tm.current = setTimeout(() => run(ev.target.value), 150);
            }}
            onKeyDown={(ev) => {
              if (ev.key === "ArrowDown" || ev.key === "ArrowUp") {
                ev.preventDefault();
                if (!open) return run(text);
                setK(Math.max(0, Math.min(it.length - 1, k + (ev.key === "ArrowDown" ? 1 : -1))));
              } else if (ev.key === "Enter" && open && k >= 0) {
                ev.preventDefault();
                choose(it[k]);
              } else if (ev.key === "Escape") setOpen(false);
            }}
            onBlur={() => setTimeout(() => {
              setOpen(false);
              const m = it.find((o) => fold(o.n || o.t) === fold(text));
              if (m && text && chosen.current !== (m.v ?? m.n ?? m.t)) choose(m);
              onTouch && onTouch();
            }, 140)}
          />
          {open && (
            <ul className="cbl" id={`${id}-options`} role="listbox">
              {it.length ? (
                it.map((o, i) => (
                  <li
                    key={i}
                    id={`${id}-option-${i}`}
                    role="option"
                    aria-selected={i === k}
                    className={i === k ? "on" : ""}
                    onMouseDown={(ev) => {
                      ev.preventDefault();
                      choose(o);
                    }}
                  >
                    {o.t}
                  </li>
                ))
              ) : (
                <li className="no">No matches</li>
              )}
            </ul>
          )}
        </div>
      <span className="err" id={`${id}-error`} aria-live="polite">{err}</span>
    </div>
  );
}

const FIELDS = [
  ["first_name", "First name"],
  ["last_name", "Last name"],
  ["middle_initial", "Middle initial (optional)"],
  ["birthday", "Date of birth (18 or older)"],
  ["house_street", "House & street"],
  ["country", "Country"],
  ["state", "Province / State"],
  ["city", "City / Municipality"],
  ["zip_code", "ZIP code"],
  ["email", "Email"],
  ["mobile", "Mobile number"],
  ["password", "Password"],
  ["confirm_password", "Retype password"],
];

export default function Register({ onDone, onBack, go, limited }) {
  const [f, setF] = useState({
    first_name: "",
    last_name: "",
    middle_initial: "",
    birthday: "",
    house_street: "",
    country: "",
    state: "",
    city: "",
    zip_code: "",
    email: "",
    mobile: "",
    password: "",
    confirm_password: "",
  });
  const [tx, setTx] = useState({ country: "", state: "", city: "" });
  const [touched, setT] = useState({});
  const [ax, setAx] = useState({});
  const [srv, setSrv] = useState({});
  const [CUR, setCUR] = useState(null);
  const [cp, setCp] = useState(false);
  const [ST, setST] = useState([]);
  const [sug, setSug] = useState("");
  const [rerr, setRerr] = useState("");
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState("Copy");
  const [zw, setZw] = useState("");
  const [zl, setZl] = useState({ zips: [], exact: true, busy: false });

  const isPH = CUR?.code === "PH";

  const val = (n, v) => {
    if (!v && n !== "middle_initial") return "This field is required.";
    switch (n) {
      case "first_name":
      case "last_name":
        return pn(v);
      case "middle_initial":
        return !v || /^[\p{L}]\.?$/u.test(v) ? "" : "Use one letter, optionally followed by a period (A or A.).";
      case "birthday":
        return birthdayError(v, clinicToday());
      case "house_street":
        return /^[\p{L}0-9 .,#'’/\-]{3,255}$/u.test(v) ? "" : "Enter a valid house number and street.";
      case "country":
      case "state":
        return "";
      case "city":
        if (!/^[\p{L}0-9 .'()\-]{2,100}$/u.test(v)) return "Enter a valid name (2-100 characters).";
        return isPH && !cp ? "Choose a city or municipality from the list." : "";
      case "zip_code":
        return !CUR ? "Select a country first." : new RegExp(CUR.zipFormat, CUR.zipFlags).test(v) ? "" : `Invalid ZIP for ${CUR.name}.`;
      case "email":
        return emOk(v) ? "" : "Enter a valid email (user@domain.com).";
      case "mobile":
        return !CUR ? "Select a country first." : /^\+?[\d\s().-]{5,20}$/.test(v) ? "" : "Enter a valid mobile number.";
      case "password":
        return pwOk(v) ? "" : "12+ characters with upper, lower, number and special character.";
      case "confirm_password":
        return v === f.password ? "" : "Passwords do not match.";
      default:
        return "";
    }
  };

  const err = (n) => (touched[n] ? val(n, f[n]) || ax[n] || srv[n] || "" : "");
  const cls = (n) => (touched[n] ? (err(n) ? "bad" : f[n] ? "ok" : "") : "");
  const touch = (n) => setT((t) => ({ ...t, [n]: true }));
  const upd = (n, v) => {
    if (n === "zip_code") setZw("");
    setF((p) => ({ ...p, [n]: v }));
    touch(n);
    setAx((a) => ({ ...a, [n]: "" }));
    setSrv((s) => ({ ...s, [n]: "" }));
  };

  const blurCheck = async (n) => {
    touch(n);
    const v = (TCF.includes(n) ? tc(f[n]) : f[n]).trim();
    if (TCF.includes(n) && v !== f[n]) setF((p) => ({ ...p, [n]: v }));
    if (!v || val(n, v)) return;
    let m = "";
    if (n === "email") {
      const r = await api("check/email", { email: v });
      m = r.ok && r.d.ok ? "" : r.d?.error || "Could not check this email.";
    } else if (CUR && n === "mobile") {
      const r = await api("check/mobile", { country: CUR.code, mobile: v });
      m = r.d?.ok ? "" : r.d?.error || "Could not check this number.";
    } else if (CUR && n === "zip_code") {
      const r = await api("geo/validate", { country: CUR.code, state: f.state, city: f.city, zip: v });
      m = r.d?.errors?.zip_code || "";
      setZw(r.d?.zipWarning || "");
    }
    setAx((a) => ({ ...a, [n]: m }));
  };

  // Live debounced check as you type for Email
  useEffect(() => {
    const v = f.email.trim();
    if (!v) {
      setAx((a) => ({ ...a, email: "" }));
      return;
    }
    if (!emOk(v)) return;
    let on = true;
    const t = setTimeout(async () => {
      const r = await api("check/email", { email: v });
      if (!on) return;
      setAx((a) => ({ ...a, email: r.ok && r.d.ok ? "" : (r.d?.error || "Could not check this email.") }));
    }, 450);
    return () => {
      on = false;
      clearTimeout(t);
    };
  }, [f.email]);

  // Live debounced check as you type for Mobile
  useEffect(() => {
    const v = f.mobile.trim();
    if (!CUR || !v) {
      setAx((a) => ({ ...a, mobile: "" }));
      return;
    }
    if (v.length < 6) return;
    let on = true;
    const t = setTimeout(async () => {
      const r = await api("check/mobile", { country: CUR.code, mobile: v });
      if (!on) return;
      setAx((a) => ({ ...a, mobile: r.d?.ok ? "" : (r.d?.error || "Could not check this number.") }));
    }, 400);
    return () => {
      on = false;
      clearTimeout(t);
    };
  }, [f.mobile, CUR?.code]);

  useEffect(() => {
    const z = f.zip_code.trim();
    if (!CUR || !z || !f.state || !f.city.trim() || val("zip_code", z)) return;
    let on = true;
    const t = setTimeout(async () => {
      const r = await api("geo/validate", { country: CUR.code, state: f.state, city: f.city, zip: z });
      if (!on) return;
      setAx((a) => ({ ...a, zip_code: r.d?.errors?.zip_code || "" }));
      setZw(r.d?.zipWarning || "");
    }, 600);
    return () => {
      on = false;
      clearTimeout(t);
    };
  }, [f.city, f.state, CUR?.code]); // eslint-disable-line

  useEffect(() => {
    if (!isPH || !cp || !f.state || !f.city) {
      setZl({ zips: [], exact: true, busy: false });
      if (isPH) setF((p) => (p.zip_code ? { ...p, zip_code: "" } : p));
      return;
    }
    let on = true;
    setZl((z) => ({ ...z, busy: true }));
    api(`geo/zips?country=PH&state=${encodeURIComponent(f.state)}&city=${encodeURIComponent(f.city)}`).then((r) => {
      if (!on) return;
      const zips = Array.isArray(r.d?.zips) ? r.d.zips : Array.isArray(r.d?.data?.zips) ? r.d.data.zips : [];
      setZl({ zips, exact: r.d?.exact !== false, busy: false });
      setF((p) => (zips.some((z) => z.zip === p.zip_code) ? p : { ...p, zip_code: zips.length === 1 ? zips[0].zip : "" }));
      setAx((a) => ({ ...a, zip_code: "" }));
      setZw("");
    });
    return () => {
      on = false;
    };
  }, [isPH, cp, f.state, f.city]); // eslint-disable-line

  const mark = (n, v) => {
    setT((t) => ({ ...t, [n]: true }));
    setF((p) => ({ ...p, [n]: v }));
  };

  const pickCountry = async (o) => {
    if (!o) {
      setCUR(null);
      setST([]);
      setCp(false);
      setF((p) => ({ ...p, country: "", state: "", city: "" }));
      setTx((t) => ({ ...t, state: "", city: "" }));
      return;
    }
    mark("country", o.v);
    setCp(false);
    setTx((t) => ({ ...t, state: "", city: "" }));
    setF((p) => ({ ...p, state: "", city: "" }));
    const cRes = await api("geo/countries/" + o.v);
    const c = cRes.d && cRes.d.code ? cRes.d : cRes.d?.data?.code ? cRes.d.data : null;
    if (!c) return;
    setCUR(c);
    const sRes = await api("geo/states?country=" + o.v);
    const s = Array.isArray(sRes.d) ? sRes.d : Array.isArray(sRes.d?.data) ? sRes.d.data : [];
    setST(s);
    if (!s.length) {
      setF((p) => ({ ...p, state: c.name }));
      setTx((t) => ({ ...t, state: "Not applicable" }));
    }
  };

  const gen = () => {
    const R = (n) => {
      const a = new Uint32Array(1);
      let x;
      do {
        crypto.getRandomValues(a);
        x = a[0];
      } while (x >= 4294967296 - (4294967296 % n));
      return x % n;
    };
    const U = "ABCDEFGHJKLMNPQRSTUVWXYZ", L = "abcdefghijkmnopqrstuvwxyz", N = "23456789", S = "!@#$%^&*-_?", A = U + L + N + S, pickChar = (c) => c[R(c.length)];
    const c = [pickChar(U), pickChar(L), pickChar(N), pickChar(S)];
    while (c.length < 16) c.push(pickChar(A));
    for (let i = c.length - 1; i > 0; i--) {
      const j = R(i + 1);
      [c[i], c[j]] = [c[j], c[i]];
    }
    const p = c.join("");
    setSug(p);
    setCopied("Copy");
    setF((x) => ({ ...x, password: p, confirm_password: p }));
    setT((t) => ({ ...t, password: true, confirm_password: true }));
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(sug);
      setCopied("Copied");
    } catch {
      setCopied("Select & copy");
    }
  };

  const submit = async (ev) => {
    ev.preventDefault();
    const all = {};
    FIELDS.forEach(([n]) => (all[n] = true));
    setT(all);
    if (FIELDS.some(([n]) => val(n, f[n]) || ax[n])) {
      setRerr("Please fix the highlighted fields.");
      return;
    }
    setRerr("");
    setBusy(true);
    const g = { ...f };
    TCF.forEach((k) => (g[k] = tc(g[k])));
    setF(g);
    const r = await api("register", g);
    if (r.d?.limit) {
      setBusy(false);
      return limited ? limited() : setRerr(r.d?.error || "Registration limit reached.");
    }
    if (r.d?.errors) {
      setSrv(r.d.errors);
      setRerr("Please fix the highlighted fields.");
    } else if (!r.ok) {
      setRerr(r.d?.error || "Registration failed.");
    } else {
      onDone(r.d?.email || f.email, r.d);
    }
    setBusy(false);
  };

  const sec = {
    first_name: "Personal details",
    house_street: "Address",
    email: "Contact",
    password: "Security",
  };

  const renderField = ([n, l]) => {
    let body;
    if (n === "country") {
      body = (
        <Combo
          label="Country"
          ph="Type a country…"
          text={tx.country}
          setText={(v) => setTx((t) => ({ ...t, country: v }))}
          err={err("country") || (touched.country && !f.country ? "Choose a country from the list." : "")}
          ok={!!f.country}
          bad={touched.country && !f.country}
          onTouch={() => touch("country")}
          load={async (q) => {
            const res = await api("geo/countries?q=" + encodeURIComponent(q));
            const list = Array.isArray(res.d) ? res.d : Array.isArray(res.d?.data) ? res.d.data : [];
            return list.map((c) => ({
              v: c.code,
              t: `${c.name} (${c.dial})`,
              n: c.name,
            }));
          }}
          pick={(o) => pickCountry(o)}
        />
      );
    } else if (n === "state") {
      body = (
        <Combo
          label={isPH ? "Province" : "State / Province"}
          ph={isPH ? "Choose province" : "Choose state"}
          disabled={!!CUR && !ST.length}
          text={tx.state}
          setText={(v) => setTx((t) => ({ ...t, state: v }))}
          err={touched.state && !f.state ? (isPH ? "Choose a province from the list." : "Choose a state from the list.") : ""}
          ok={!!f.state}
          bad={touched.state && !f.state}
          onTouch={() => touch("state")}
          load={async (q) => {
            const x = fold(q),
              rk = (s) => {
                const fld = fold(s);
                return fld.startsWith(x) ? 0 : fld.includes(x) ? 1 : 9;
              };
            const list = Array.isArray(ST) ? ST : [];
            return list.filter((s) => !x || rk(s.name) < 9)
              .sort((a, b) => rk(a.name) - rk(b.name) || a.name.localeCompare(b.name))
              .map((s) => ({ v: s.name, t: s.name, n: s.name }));
          }}
          pick={(o) => {
            setF((p) => ({ ...p, state: o ? o.v : "", city: "" }));
            setTx((t) => ({ ...t, city: "" }));
            setCp(false);
            if (o) touch("state");
          }}
        />
      );
    } else if (n === "city") {
      body = (
        <Combo
          label={isPH ? "City / Municipality" : "City"}
          ph={isPH ? "Choose city or municipality" : "Type or choose a city"}
          disabled={isPH && !f.state}
          text={tx.city}
          setText={(v) => setTx((t) => ({ ...t, city: v }))}
          err={err("city")}
          ok={cls("city") === "ok"}
          bad={cls("city") === "bad"}
          onTouch={() => touch("city")}
          load={async (q) => {
            if (!CUR) return [];
            const res = await api(
              `geo/cities?country=${CUR.code}&state=${encodeURIComponent(ST.length ? f.state : "")}&q=${encodeURIComponent(q)}`
            );
            const list = Array.isArray(res.d) ? res.d : Array.isArray(res.d?.data) ? res.d.data : [];
            return list.map((c) => ({ v: c, t: c, n: c }));
          }}
          pick={(o, typed) => {
            setCp(!!o);
            setF((p) => ({ ...p, city: o ? o.v : (typed || "").trim() }));
            touch("city");
          }}
        />
      );
    } else if (n === "zip_code" && isPH) {
      body = (
        <div className="fld">
          <label>
            ZIP code<i> *</i>
            <select
              value={f.zip_code}
              className={cls("zip_code")}
              disabled={!cp || !zl.zips.length}
              onChange={(ev) => upd("zip_code", ev.target.value)}
              onBlur={() => blurCheck("zip_code")}
            >
              <option value="">
                {!cp || !f.city
                  ? "Choose a city or municipality first"
                  : zl.busy
                  ? "Loading ZIP codes…"
                  : zl.zips.length
                  ? "Choose ZIP code"
                  : "No ZIP codes found"}
              </option>
              {zl.zips.map((z) => (
                <option key={z.zip + z.area} value={z.zip}>
                  {z.zip} – {z.area}
                </option>
              ))}
            </select>
          </label>
          <span className="err">{err("zip_code")}</span>
          {cp && !zl.exact && !zl.busy && (
            <small className="hint warn">
              We have no postal area named exactly after this place, so these are the ZIP codes of its province. Pick the one on your mail.
            </small>
          )}
        </div>
      );
    } else if (n === "password" || n === "confirm_password") {
      const isPw = n === "password";
      body = (
        <div className="full fld pw-block">
          <label className="blk" htmlFor={"f_" + n}>
            {l}<i> *</i>
          </label>
          <Pw
            id={"f_" + n}
            value={f[n]}
            onChange={(ev) => upd(n, ev.target.value)}
            onBlur={() => touch(n)}
            auto={isPw ? "new-password" : "new-password"}
          />
          {isPw && (
            <>
              <div className="meter">
                <i
                  style={{
                    width:
                      [
                        f.password.length >= 12,
                        /[A-Z]/.test(f.password),
                        /[a-z]/.test(f.password),
                        /\d/.test(f.password),
                        /[^A-Za-z0-9]/.test(f.password),
                      ].filter(Boolean).length * 20 + "%",
                  }}
                />
              </div>
              <ul className="rules">
                {[
                  ["12+ characters", f.password.length >= 12],
                  ["Uppercase", /[A-Z]/.test(f.password)],
                  ["Lowercase", /[a-z]/.test(f.password)],
                  ["Number", /\d/.test(f.password)],
                  ["Special", /[^A-Za-z0-9]/.test(f.password)],
                ].map(([t, m]) => (
                  <li key={t} className={m ? "met" : ""}>
                    {t}
                  </li>
                ))}
              </ul>
            </>
          )}
          <span className="err">{err(n)}</span>
        </div>
      );
    } else if (n === "mobile") {
      body = (
        <div className="fld">
          <label>
            {l}<i> *</i>
            <div className="row mobile-input">
              <span className="pre">{CUR ? CUR.dial : "+63"}</span>
              <input
                inputMode="tel"
                placeholder="9171234567"
                value={f.mobile}
                className={cls("mobile")}
                onChange={(ev) => upd("mobile", ev.target.value)}
                onBlur={() => blurCheck("mobile")}
              />
            </div>
          </label>
          <span className="err">{err("mobile")}</span>
        </div>
      );
    } else {
      const isWide = n === "house_street";
      body = (
        <div className={`fld${isWide ? " full" : ""}`}>
          <label>
            {l}{n !== "middle_initial" && <i> *</i>}
            <input
              type={n === "email" ? "email" : n === "birthday" ? "date" : "text"}
              min={n === "birthday" ? EARLIEST_BIRTHDAY : undefined}
              max={n === "birthday" ? latestBirthdayFor(clinicToday()) : undefined}
              autoComplete={({ first_name: "given-name", last_name: "family-name", middle_initial: "additional-name", house_street: "street-address", email: "email", zip_code: "postal-code" })[n] || "off"}
              value={f[n]}
              className={cls(n) + (TCF.includes(n) ? " tc" : "")}
              onChange={(ev) => upd(n, ev.target.value)}
              onBlur={() => blurCheck(n)}
            />
          </label>
          <span className="err">{err(n)}</span>
          {n === "zip_code" && zw && !err(n) && <small className="hint warn">{zw}</small>}
        </div>
      );
    }

    return (
      <div key={n} style={{ display: "contents" }}>
        {sec[n] && <div className="sec">{sec[n]}</div>}
        {body}
      </div>
    );
  };

  return (
    <AuthShell signup title={<>A happier, healthier life. <em>Together.</em></>} description="Create your account to keep your pet’s visits, vaccination records and care updates in one place.">
      <form className="login-card signup-card" onSubmit={submit} noValidate aria-labelledby="register-title">
        <div className="login-card-top"><AuthBrand />
        <button type="button" className="lnk" onClick={onBack}>
          ← Home
        </button></div>
        <div className="login-heading"><span className="public-eyebrow">START YOUR PET’S CARE JOURNEY</span><h1 id="register-title">Create your account</h1><p>All fields marked * are required. You can add your pets after verification.</p></div>
        <p className="auth-note">
          Use your own email and mobile number. We’ll help you verify both to keep your account secure.
        </p>

        <div className="auth-grid">{FIELDS.map(renderField)}</div>

        <div style={{ marginTop: "1rem" }}>
          <button type="button" className="btn ghost sm" onClick={gen}>
            {sug ? "Suggest another strong password" : "Suggest strong password"}
          </button>
        </div>

        {sug && (
          <div className="sug" role="status">
            <small>
              Suggested password. It was filled into both password fields. Copy it into your password manager now: we store only a secure hash.
            </small>
            <div className="row">
              <code>{sug}</code>
              <button type="button" className="btn ghost sm" onClick={copy}>
                {copied}
              </button>
            </div>
          </div>
        )}

        {rerr && (
          <p className="err" role="alert" style={{ marginTop: "1rem" }}>
            {rerr}
          </p>
        )}

        <button className="btn gold wide" disabled={busy} style={{ marginTop: "1.2rem" }}>
          {busy ? "Creating account…" : "Create account"}
        </button>

        <div className="auth-links">
          <span>Already registered?</span>
          <button type="button" className="lnk" onClick={() => go("login")}>
            Log in
          </button>
        </div>
      </form>
    </AuthShell>
  );
}


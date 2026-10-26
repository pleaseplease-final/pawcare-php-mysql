import { Logo } from "../lib.jsx";
import { CalendarDays, ShieldCheck, Syringe } from "lucide-react";
import "./auth.css";
import "./brand.css";
import "./public-pages.css";
import "./auth-flow.css";

export function AuthBrand() {
  return <div className="public-brand auth-card-brand"><Logo size={42} /><span><b>PawCare</b><small>CLINIC &amp; PET CARE HUB</small></span></div>;
}

export default function AuthShell({ title, description, signup = false, children }) {
  return <main className={`login-page auth-flow${signup ? " auth-signup" : ""}`}>
    <div className="login-layout">
      <aside className="login-story" aria-label="Your PawCare account">
        <span className="public-eyebrow">CARE THAT STAYS WITH YOU</span>
        <h2>{title}</h2>
        <p>{description}</p>
        <div className="login-photo"><img src="/images/login-pets.jpg" alt="A dog and cat together" /><span><ShieldCheck size={22} /> A secure space for your pet’s care.</span></div>
        <ul className="auth-story-features">
          <li><CalendarDays size={20} /><span><b>Plan their next visit</b><small>Book appointments and follow clinic updates.</small></span></li>
          <li><Syringe size={20} /><span><b>Keep care in view</b><small>Find vaccine records and approved booster dates.</small></span></li>
        </ul>
      </aside>
      {children}
    </div>
  </main>;
}

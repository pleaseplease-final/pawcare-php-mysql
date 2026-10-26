import { useState } from "react";
import { Logo, I } from "../lib.jsx";
import { Check, Syringe, CalendarCheck, PawPrint, HeartPulse, Menu, X } from "lucide-react";
import "./landing.css";
import "./brand.css";
import "./public-pages.css";

const BENEFITS = [
  ["calendar", "Plan visits around your day", "Check available appointment times and request a visit for your pet. See its confirmation and upcoming schedule in your account."],
  ["syringe", "Keep vaccine dates in sight", "View your pet’s recorded vaccinations and the next booster date approved by the clinic, so you can plan ahead."],
  ["file", "Know what happened at each visit", "Find saved consultation notes, prescriptions, and follow-up instructions together when you need to look back."],
  ["receipt", "See your bills clearly", "Review saved charges, payment status, and paid invoices for your pet’s visits without keeping track of loose papers."],
];
const WHY = [
  ["paw", "All your pets, together", "Keep a separate profile for each pet and switch between their records in one account."],
  ["clock", "Less searching, more time", "Find upcoming visits and health information without sorting through messages and paper cards."],
  ["shield", "Your pets’ own space", "Your account shows the pets and records linked to you."],
  ["heart", "Care beyond the visit", "Return to saved home-care notes and follow-up details after you leave the clinic."],
];
const STEPS = [
  ["Create your account", "Verify your email and mobile number to get started."],
  ["Introduce your pet", "Send your pet’s details for the clinic to review."],
  ["Keep care connected", "After approval, book visits and follow their health records."],
];
const FAQ = [
  ["How do I get started?", "Create a pet owner account, verify your email and mobile number, then submit your pet’s details. Your pet appears in your account once the clinic approves the registration."],
  ["Can I add more than one pet?", "Yes. You can keep profiles for multiple pets in your account. Each pet has its own appointments, vaccination card, and visit history."],
  ["How do appointments work?", "Choose your registered pet, a service, and an available date and time. Send your booking and check its status in My Appointments for the clinic’s confirmation."],
  ["Where do vaccination dates come from?", "Your vaccination card shows records saved by the clinic. Booster dates are based on the latest veterinarian-certified dose. Ask the clinic if a date or record needs clarification."],
  ["Do I need to install an app?", "No. Open PawCare in your browser on a phone, tablet, or computer. You need an internet connection to load records and save changes."],
  ["Can PawCare tell me if my pet is sick?", "PawCare helps you organize your pet’s care and read saved advice. It does not diagnose illness. Contact your veterinary clinic if your pet is unwell."],
];

export default function Landing({ onLogin, onRegister }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [open, setOpen] = useState(0);
  const login = () => onLogin("owner");
  return (
    <div className="w public-landing">
      <a className="public-skip" href="#landing-main">Skip to content</a>
      <div className="wc">
        <header className="wnav">
          <div className="public-brand"><Logo size={42} /><span><b>PawCare</b><small>YOUR PET’S CARE COMPANION</small></span></div>
          <nav id="landing-nav" className={menuOpen ? "is-open" : ""} aria-label="Page" onClick={() => setMenuOpen(false)}>
            <a href="#benefits">Benefits</a><a href="#how">How it works</a><a href="#why">Why PawCare</a><a href="#faq">FAQs</a>
          </nav>
          <div className="wnavr">
            <button className="public-menu" type="button" aria-label={menuOpen ? "Close navigation" : "Open navigation"} aria-controls="landing-nav" aria-expanded={menuOpen} onClick={() => setMenuOpen(v => !v)}>{menuOpen ? "Close" : "Menu"}{menuOpen ? <X size={18} /> : <Menu size={18} />}</button>
            <button className="btn ghost" onClick={login}>Log in</button><button className="btn gold" onClick={onRegister}>Sign up</button>
          </div>
        </header>
        <main id="landing-main">
          <section className="whero"><div className="hpanel">
            <div className="hl">
              <span className="wbadge"><PawPrint size={14} /> Made for you and your pet</span>
              <h1>Their whole world is you. <em>Keep their care close.</em></h1>
              <p>From the next check-up to the next little milestone, PawCare keeps your pets’ appointments, vaccine records, and care notes in one easy place.</p>
              <div className="row"><button className="btn gold" onClick={onRegister}>Start caring with PawCare</button><a className="btn ghost" href="#benefits">See how it helps</a></div>
              <div className="hchips"><span><Syringe size={14} /> Vaccine records</span><span><CalendarCheck size={14} /> Simple booking</span><span><HeartPulse size={14} /> Visit history</span></div>
            </div>
            <div className="hero-photo"><img className="hpic" src="/images/hero-pets.jpg" alt="A happy dog and cat together" loading="eager" fetchpriority="high" /><span className="hero-photo-caption"><HeartPulse size={20} /><span><b>Big love. Little paws.</b><small>Be ready for their next chapter.</small></span></span></div>
            <aside className="hcard owner-start" aria-label="Get started with your pet">
              <div className="portal-intro"><span className="portal-paw"><PawPrint size={24} /></span><span className="public-eyebrow">A LITTLE LESS WORRY</span></div>
              <h2>More peace of mind. One simple account.</h2>
              <p>Start with your pet’s story. Keep their care within reach.</p>
              <button className="btn gold" onClick={onRegister}>Create my account</button>
              <div className="owner-start-steps">{STEPS.map(([title, detail], i) => <div key={title}><span>{i + 1}</span><div><h3>{title}</h3><p>{detail}</p></div></div>)}</div>
            </aside>
          </div></section>
          <section className="wpart"><p>A companion for every kind of pet</p><div>{[["dog", "Dogs"], ["cat", "Cats"], ["rabbit", "Rabbits"], ["bird", "Birds"], ["paw", "And more"]].map(([e, label]) => <span key={label}><I e={e} size={16} />{label}</span>)}</div></section>
          <section id="benefits" className="wsec">
            <span className="public-eyebrow section-eyebrow">MORE TIME FOR THE MOMENTS THAT MATTER</span>
            <h2>Less to remember. More to enjoy together.</h2>
            <div className="wfeat">{BENEFITS.map(([icon, title, detail], i) => <article key={title} className={`fc ${i % 2 ? "butter" : "sky"}`}><span className="si"><I e={icon} size={26} /></span><div><h3>{title}</h3><p>{detail}</p></div></article>)}</div>
          </section>
          <section id="how" className="wsplit">
            <div className="ph"><img src="/images/vet-care.jpg" alt="A dog receiving gentle care during a clinic visit" loading="lazy" /></div>
            <div><span className="public-eyebrow">FROM THE FIRST HELLO TO THE NEXT VISIT</span><h2>Feel more prepared for every visit.</h2><p>No need to remember every date or carry every note. Your pet’s saved information is there when you need it.</p>
              <ul>{[["Before the visit", "Choose an available time and check your appointment status."], ["After the visit", "Read saved findings, prescriptions, and follow-up instructions."], ["Between visits", "Check vaccine dates and keep your pet’s care history close."]].map(([title, detail]) => <li key={title}><span className="ck"><Check size={16} /></span><div><b>{title}</b><small>{detail}</small></div></li>)}</ul>
            </div>
          </section>
          <section id="why" className="wsec"><h2>Why make PawCare part of their care?</h2><div className="wwhy">{WHY.map(([icon, title, detail]) => <div key={title}><span className="ib"><I e={icon} size={22} /></span><h3>{title}</h3><p>{detail}</p></div>)}</div></section>
          <section id="faq" className="wsec wfaq"><div><h2>A few things you might be wondering.</h2><p>Getting started should feel simple.</p></div><div>{FAQ.map(([question, answer], i) => <div className="qi" key={question}><button aria-expanded={open === i} aria-controls={`answer-${i}`} onClick={() => setOpen(open === i ? -1 : i)}>{question}<span aria-hidden="true">{open === i ? "−" : "+"}</span></button>{open === i && <p id={`answer-${i}`}>{answer}</p>}</div>)}</div></section>
          <section className="wcta"><div><h2>Be there for every wag, purr, and milestone.</h2><p>Give their health records a home. Create your account, or pick up where you left off.</p><div className="row"><button className="btn gold" onClick={onRegister}>Create my account</button><button className="btn ghost" onClick={login}>Log in</button></div></div><div className="deco" aria-hidden="true"><i><I e="paw" size={48} /></i><i><I e="dog" size={48} /></i></div></section>
        </main>
        <footer className="wfoot owner-footer">
          <div className="fl1"><div className="wlogo"><Logo size={38} /><b>PawCare</b></div><p>A little organization. A lot of love.<br />Your pet’s care, connected.</p></div>
          <div><h4>Discover PawCare</h4><a href="#benefits">Benefits for you</a><a href="#how">How it works</a><a href="#why">Why PawCare</a><a href="#faq">Your questions</a></div>
          <div><h4>Your pet’s space</h4><button className="lk" onClick={onRegister}>Create an account</button><button className="lk" onClick={login}>Log in to PawCare</button><p>Need help with a pet’s record or an appointment? Contact your clinic.</p></div>
        </footer>
      </div>
    </div>
  );
}

import {today} from "./booking.js";
export {TODAY} from "./clinicDate.js";

/* Date math helpers */
function addDays(dateStr, days) {
  if (!dateStr) return "";
  const d = new Date(dateStr + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function addMonths(dateStr, months) {
  if (!dateStr) return "";
  const d = new Date(dateStr + "T00:00:00Z");
  d.setUTCMonth(d.getUTCMonth() + months);
  return d.toISOString().slice(0, 10);
}

/**
 * Normalizes user-facing species strings into canonical clinical species names:
 * "Canine", "Feline", "Lagomorph", "Rodent", "Avian", "Other"
 */
export function normalizeSpecies(species) {
  if (!species) return "Canine";
  const s = String(species).trim().toLowerCase();
  if (s.includes("canine") || s.includes("dog")) return "Canine";
  if (s.includes("feline") || s.includes("cat")) return "Feline";
  if (s.includes("lagomorph") || s.includes("rabbit")) return "Lagomorph";
  if (s.includes("rodent") || s.includes("hamster") || s.includes("guinea") || s.includes("chinchilla") || s.includes("rat") || s.includes("mouse") || s.includes("gerbil")) return "Rodent";
  if (s.includes("avian") || s.includes("bird") || s.includes("parrot")) return "Avian";
  return "Other";
}

/**
 * Human-friendly species badge label
 */
export function formatSpeciesLabel(species) {
  const norm = normalizeSpecies(species);
  switch (norm) {
    case "Canine": return "Canine (Dog)";
    case "Feline": return "Feline (Cat)";
    case "Lagomorph": return "Lagomorph (Rabbit)";
    case "Rodent": return "Rodent (Hamster / Guinea Pig / etc.)";
    case "Avian": return "Avian (Bird)";
    default: return "Other";
  }
}

export function getNextBirthdayAnniversary(birthDate) {
  if (!birthDate) return addDays(today(), 365);
  const b = new Date(birthDate + "T00:00:00Z");
  const now = new Date(today() + "T00:00:00Z");
  let nextAnniv = new Date(Date.UTC(now.getUTCFullYear(), b.getUTCMonth(), b.getUTCDate()));
  if (nextAnniv < now) {
    nextAnniv = new Date(Date.UTC(now.getUTCFullYear() + 1, b.getUTCMonth(), b.getUTCDate()));
  }
  return nextAnniv.toISOString().slice(0, 10);
}

export function computeAgeDetails(birthDate) {
  if (!birthDate) {
    return {
      days: 0,
      weeks: 0,
      months: 0,
      years: 0,
      formatted: "",
      isPuppy: false,
      isAdult: false,
      isSenior: false,
      lifeStage: "Juvenile",
      lifeStageLabel: "Unknown"
    };
  }
  const b = new Date(birthDate + "T00:00:00Z");
  const now = new Date(today() + "T00:00:00Z");
  const diffTime = Math.max(0, now - b);
  const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
  const diffWeeks = Math.floor(diffDays / 7);
  
  let months = (now.getUTCFullYear() - b.getUTCFullYear()) * 12 + now.getUTCMonth() - b.getUTCMonth();
  if (now.getUTCDate() < b.getUTCDate()) months--;
  months = Math.max(0, months);
  const years = Math.floor(months / 12);

  const isPuppy = months < 12; // < 1 year
  const isSenior = years >= 7; // >= 7 years
  const isAdult = months >= 12; // >= 1 year (Adult Dog Maintenance)

  let lifeStage = "Puppy";
  let lifeStageLabel = "Puppy (Birth to 12 Months)";
  if (isSenior) {
    lifeStage = "Senior";
    lifeStageLabel = "Senior Canine (7+ Years)";
  } else if (isAdult) {
    lifeStage = "Adult";
    lifeStageLabel = "Adult Maintenance (1 to 6 Years)";
  }

  let formatted = "";
  if (diffWeeks < 1) formatted = `${diffDays} day${diffDays === 1 ? "" : "s"} old`;
  else if (diffWeeks < 8) formatted = `${diffWeeks} week${diffWeeks === 1 ? "" : "s"} old`;
  else if (months < 12) formatted = `${months} month${months === 1 ? "" : "s"} old (${diffWeeks} wks)`;
  else formatted = `${years} yr${years > 1 ? "s" : ""}${months % 12 ? ` ${months % 12} mo` : ""}`;

  return {
    days: diffDays,
    weeks: diffWeeks,
    months,
    years,
    formatted,
    isPuppy,
    isAdult,
    isSenior,
    lifeStage,
    lifeStageLabel
  };
}

/**
 * Vet Clinic Management System (VCMS) Protocols Version 2.0
 * Refined Immunization & Parasiticide Separation Logic
 *
 * Distinct architectural workflows with independent age-start triggers:
 * 1. Canine:
 *    - Deworming: Day 14 (q14d until Day 90 -> q30d until Day 180 -> q90d adult)
 *    - Core DHPP 5-in-1: Day 42 (q21-28d, max 3-4 puppy doses, then annual)
 *    - Core Rabies: Day 84 (Annual, hard block if < 12 wks)
 *    - Parasiticide (Flea/Tick/Heart): Day 56 (q30d; If Age >= 210d and gap > 45d -> lock & Heartworm Antigen Test)
 * 2. Feline:
 *    - Core FVRCP 4-in-1: Day 42 (q28d, max 3 kitten doses, then 1-3 yr adult)
 *    - Core Rabies: Day 84 (Annual)
 *    - Deworming: Day 14 (q14d, transition to q90d at 6 months)
 *    - Flea/Tick/Mite: Day 56 (q30d; Permethrin STRICT TOXICOLOGY BLOCK)
 * 3. Lagomorph (Rabbit):
 *    - Core Vaccine: RHDV1 / RHDV2 at Day 35 (Annual)
 *    - Parasiticide: Fipronil STRICT TOXICOLOGY BAN (fatal rabbit neurotoxicity)
 *    - Physical Exam: Semi-annual GI/Dental check (q180d)
 * 4. Rodent:
 *    - Physical Exam: Dental / Occlusion check at Day 180 (q180d, Molar/Incisor overgrowth check)
 * 5. Avian:
 *    - Diagnostic: Fecal Float screening at Day 180 (Annual, Teflon/PTFE home hazard warning)
 */
export function getPreventiveSchedule(birthDate, rawSpecies = "Canine", completedVaccs = []) {
  if (!birthDate) return [];

  const species = normalizeSpecies(rawSpecies);
  const age = computeAgeDetails(birthDate);

  let rawItems = [];

  if (species === "Canine") {
    if (age.isAdult) {
      // =========================================================================
      // LIFELONG ADULT CANINE MAINTENANCE SCHEDULE (1 YEAR AND BEYOND)
      // Transition out of juvenile series into lifelong adult maintenance routine:
      // • Core Vaccines (DHPP & Rabies): Annual / 1-3 years
      // • Adult Deworming: Every 3 Months (Quarterly / 90 Days)
      // • Tick & Flea & Heartworm: Every Month (30 Days)
      // • Comprehensive Wellness: Annual
      // • Senior Care: Semi-Annual (if Age >= 7 Years)
      // =========================================================================
      const nextAnniv = getNextBirthdayAnniversary(birthDate);

      // Inspect completed records to calculate accurate dynamic next-due dates
      const lastDeworm = completedVaccs.find(v => v.done && v.vaccine?.toLowerCase().includes("deworm"));
      const lastParasite = completedVaccs.find(v => v.done && (v.vaccine?.toLowerCase().includes("flea") || v.vaccine?.toLowerCase().includes("parasite") || v.vaccine?.toLowerCase().includes("nexgard") || v.vaccine?.toLowerCase().includes("simparica")));
      const lastDHPP = completedVaccs.find(v => v.done && v.vaccine?.toLowerCase().includes("dhpp"));
      const lastRabies = completedVaccs.find(v => v.done && v.vaccine?.toLowerCase().includes("rabies"));

      const dewormTarget = lastDeworm?.date ? addDays(lastDeworm.date, 90) : addDays(today(), 14);
      const parasiteTarget = lastParasite?.date ? addDays(lastParasite.date, 30) : addDays(today(), 7);
      const dhppTarget = lastDHPP?.date ? addDays(lastDHPP.date, 365) : nextAnniv;
      const rabiesTarget = lastRabies?.date ? addDays(lastRabies.date, 365) : nextAnniv;

      rawItems = [
        {
          id: "dog-adult-dhpp-annual",
          workflow: "Immunization",
          ageLabel: "Adult Annual Booster (Every 1 - 3 Yrs)",
          category: "vaccine",
          className: "DHPP / 5-in-1",
          care: "Annual Core Booster: DHPP 5-in-1",
          target: "Distemper, Adenovirus, Parvovirus, Parainfluenza",
          protocol: "Administer on birth anniversary; repeat every 1 to 3 years per VCMS v2.0 & WSAVA guidelines",
          vaccineName: "DHPP 5-in-1 Core Booster",
          constraints: "Adult Maintenance Protocol: Mandatory 1-year puppy booster, then 1-3 year adult cycle.",
          isCore: true,
          isRecurring: true,
          targetDateOverride: dhppTarget,
          lifeStage: "Adult"
        },
        {
          id: "dog-adult-rabies-annual",
          workflow: "Immunization",
          ageLabel: "Adult Annual Booster (Mandatory)",
          category: "vaccine",
          className: "Rabies",
          care: "Annual Core Vaccine: Rabies (RA 9482 Compliance)",
          target: "Rabies Virus Prophylaxis",
          protocol: "Annual subcutaneous immunization required by Philippine law (Anti-Rabies Act RA 9482)",
          vaccineName: "Rabies Annual Booster",
          constraints: "Mandatory annual legal layout tracking. Multi-year option after Year 1.",
          isCore: true,
          isRecurring: true,
          targetDateOverride: rabiesTarget,
          lifeStage: "Adult"
        },
        {
          id: "dog-adult-deworm-quarterly",
          workflow: "Parasiticide",
          ageLabel: "Every 3 Months (Quarterly)",
          category: "deworm",
          className: "Adult Deworming",
          care: "Adult Deworming (Quarterly / Every 3 Months)",
          target: "Roundworms, Hookworms, Whipworms, Tapeworms",
          protocol: "Give a broad-spectrum deworming tablet (Canex / Drontal) 4 times a year for soil and grass parasite clearance",
          constraints: "Lifelong adult parasiticide protocol: Administer strictly every 90 days.",
          isCore: false,
          isRecurring: true,
          targetDateOverride: dewormTarget,
          lifeStage: "Adult"
        },
        {
          id: "dog-adult-parasite-monthly",
          workflow: "Parasiticide",
          ageLabel: "Every Month (30 Days)",
          category: "parasite",
          className: "Flea/Tick/Heart",
          care: "Monthly Flea, Tick & Heartworm Prevention",
          target: "Ticks, Fleas, Heartworm & Intestinal Worms",
          protocol: "Administer chewable (NexGard Spectra / Simparica Trio) every 30 days based on digital weight-in",
          constraints: "Safety Rule: If Age >= 210 Days and gap > 45 days, lock & enforce Heartworm Antigen Test.",
          isCore: false,
          isRecurring: true,
          targetDateOverride: parasiteTarget,
          lifeStage: "Adult"
        },
        {
          id: "dog-adult-wellness-annual",
          workflow: "Physical Exam",
          ageLabel: "Annual Comprehensive",
          category: "exam",
          className: "Wellness Exam",
          care: "Annual Adult Canine Wellness & Dental Check",
          target: "Cardiopulmonary auscultation, Body Condition Score (BCS) & Dental Calculus Grade",
          protocol: "Comprehensive physical veterinary inspection and dental assessment",
          constraints: "Annual wellness check.",
          isCore: true,
          isRecurring: true,
          targetDateOverride: nextAnniv,
          lifeStage: "Adult"
        }
      ];

      if (age.isSenior) {
        rawItems.push({
          id: "dog-senior-panel",
          workflow: "Diagnostic",
          ageLabel: "Senior Care (Every 6 Months)",
          category: "diagnostic",
          className: "Geriatric Panel",
          care: "Senior Canine Chemistry & Mobility Evaluation",
          target: "Renal & Hepatic function, blood glucose, osteoarthritis mobility screening",
          protocol: "Bi-annual geriatric blood profile and orthopedic joint mobility check",
          constraints: "Senior protocol for patients 7 years and older.",
          isCore: true,
          isRecurring: true,
          targetDateOverride: addDays(today(), 30),
          lifeStage: "Senior"
        });
      }

      // Juvenile puppy foundation records (Kept for medical history without false overdue alarms)
      const juvenilePuppyItems = [
        { id: "dog-deworm-14d", workflow: "Parasiticide", ageLabel: "2 Weeks Old", category: "deworm", className: "Deworming", care: "Puppy Deworming Dose 1", daysOffset: 14 },
        { id: "dog-deworm-28d", workflow: "Parasiticide", ageLabel: "4 Weeks Old", category: "deworm", className: "Deworming", care: "Puppy Deworming Dose 2", daysOffset: 28 },
        { id: "dog-dhpp-1", workflow: "Immunization", ageLabel: "6 Weeks Old", category: "vaccine", className: "DHPP / 5-in-1", care: "Puppy DHPP Dose 1", daysOffset: 42 },
        { id: "dog-dhpp-2", workflow: "Immunization", ageLabel: "10 Weeks Old", category: "vaccine", className: "DHPP / 5-in-1", care: "Puppy DHPP Dose 2", daysOffset: 70 },
        { id: "dog-dhpp-3", workflow: "Immunization", ageLabel: "14-16 Weeks Old", category: "vaccine", className: "DHPP / 5-in-1", care: "Puppy DHPP Dose 3", daysOffset: 105 },
        { id: "dog-rabies-1", workflow: "Immunization", ageLabel: "12-16 Weeks Old", category: "vaccine", className: "Rabies", care: "First Rabies Shot", daysOffset: 84 }
      ];

      juvenilePuppyItems.forEach(item => {
        rawItems.push({
          ...item,
          protocol: "Completed during puppyhood (Juvenile Foundation Series)",
          target: "Juvenile core immunization & deworming",
          constraints: "Puppy series completed. Patient is currently on Adult Maintenance.",
          isCore: false,
          targetDateOverride: addDays(birthDate, item.daysOffset),
          isJuvenileCompleted: true
        });
      });
    } else {
      // Puppy schedule (< 12 months)
      rawItems = [
        // --- PARASITICIDE LOOP (Deworming & Ectoparasites) ---
        {
          id: "dog-deworm-14d",
          workflow: "Parasiticide",
          ageLabel: "2 Weeks Old (Day 14)",
          daysOffset: 14,
          category: "deworm",
          className: "Deworming",
          care: "Puppy Deworming Dose 1",
          target: "Intestinal Parasites (Roundworms / Toxocara canis)",
          protocol: "Single oral suspension dose (Every 14 Days spacing)",
          constraints: "Independent Parasiticide loop trigger at Patient_Age == 14 Days.",
          isCore: false
        },
        {
          id: "dog-deworm-28d",
          workflow: "Parasiticide",
          ageLabel: "4 Weeks Old (Day 28)",
          daysOffset: 28,
          category: "deworm",
          className: "Deworming",
          care: "Puppy Deworming Dose 2",
          target: "Intestinal Parasites",
          protocol: "Single oral suspension dose",
          constraints: "Every 14 days interval.",
          isCore: false
        },
        {
          id: "dog-deworm-42d",
          workflow: "Parasiticide",
          ageLabel: "6 Weeks Old (Day 42)",
          daysOffset: 42,
          category: "deworm",
          className: "Deworming",
          care: "Puppy Deworming Dose 3",
          target: "Intestinal Parasites",
          protocol: "Oral preventative dose concurrent with first DHPP consult",
          constraints: "Every 14 days interval.",
          isCore: false
        },
        {
          id: "dog-deworm-56d",
          workflow: "Parasiticide",
          ageLabel: "8 Weeks Old (Day 56)",
          daysOffset: 56,
          category: "deworm",
          className: "Deworming",
          care: "Puppy Deworming Dose 4",
          target: "Intestinal Parasites",
          protocol: "Oral preventative dose concurrent with Flea/Tick initiation",
          constraints: "Every 14 days interval.",
          isCore: false
        },
        {
          id: "dog-deworm-70d",
          workflow: "Parasiticide",
          ageLabel: "10 Weeks Old (Day 70)",
          daysOffset: 70,
          category: "deworm",
          className: "Deworming",
          care: "Puppy Deworming Dose 5",
          target: "Intestinal Parasites",
          protocol: "Oral dose following 14-day cycle",
          constraints: "Every 14 days interval.",
          isCore: false
        },
        {
          id: "dog-deworm-84d",
          workflow: "Parasiticide",
          ageLabel: "12 Weeks Old (Day 84)",
          daysOffset: 84,
          category: "deworm",
          className: "Deworming",
          care: "Puppy Deworming Dose 6 (Pre-Switch)",
          target: "Intestinal Parasites",
          protocol: "Final 14-day cycle dose before switching frequency",
          constraints: "Final bi-weekly dose before automatic Day 90 monthly switch.",
          isCore: false
        },
        {
          id: "dog-deworm-90d",
          workflow: "Parasiticide",
          ageLabel: "3 Months Old (Day 90)",
          daysOffset: 90,
          category: "deworm",
          className: "Deworming",
          care: "Deworming (Frequency Switch to Every 30 Days)",
          target: "Broad-spectrum internal parasites",
          protocol: "Monthly preventative deworming tablet/chew",
          constraints: "VCMS Rule: Switch frequency to every 30 days automatically at Day 90.",
          isCore: false
        },
        {
          id: "dog-parasite-56d",
          workflow: "Parasiticide",
          ageLabel: "8 Weeks Old (Day 56)",
          daysOffset: 56,
          category: "parasite",
          className: "Flea/Tick/Heart",
          care: "Flea, Tick & Heartworm Prevention Initiation",
          target: "Ectoparasites + Dirofilaria immitis microfilariae",
          protocol: "Oral chewable (NexGard Spectra / Simparica Trio) or topical",
          constraints: "Start condition: Patient_Age >= 56 Days. Must verify minimum weight bracket (>= 1.25 - 2.0 kg).",
          isCore: false
        },
        {
          id: "dog-parasite-monthly",
          workflow: "Parasiticide",
          ageLabel: "Monthly Routine (Age >= 56 Days)",
          daysOffset: 120,
          category: "parasite",
          className: "Flea/Tick/Heart",
          care: "Monthly Flea/Tick & Heartworm Maintenance",
          target: "Ticks, Fleas, Heartworm & Intestinal Worms",
          protocol: "Administer strictly every 30 days based on digital weight-in",
          constraints: "If Age >= 210 Days and gap > 45 days, lock & enforce Heartworm Antigen Test.",
          isCore: false,
          isRecurring: true
        },

        // --- IMMUNIZATION LOOP (Core Vaccines) ---
        {
          id: "dog-dhpp-1",
          workflow: "Immunization",
          ageLabel: "6 Weeks Old (Day 42)",
          daysOffset: 42,
          category: "vaccine",
          className: "DHPP / 5-in-1",
          care: "Core Vaccine DHPP (Dose 1)",
          target: "Distemper, Adenovirus, Parvovirus, Parainfluenza",
          protocol: "Initial puppy core vaccination",
          vaccineName: "DHPP 5-in-1 Dose 1",
          constraints: "Start Condition: Patient_Age >= 42 Days. Spacing: Every 21-28 Days.",
          isCore: true
        },
        {
          id: "dog-dhpp-2",
          workflow: "Immunization",
          ageLabel: "10 Weeks Old (Day 70)",
          daysOffset: 70,
          category: "vaccine",
          className: "DHPP / 5-in-1",
          care: "Core Vaccine DHPP (Dose 2)",
          target: "Distemper, Adenovirus, Parvovirus, Parainfluenza",
          protocol: "Regular booster spacing (21–28 days after Dose 1)",
          vaccineName: "DHPP 5-in-1 Dose 2",
          constraints: "Spacing: Every 21-28 Days. Maximum 3-4 puppy doses total.",
          isCore: true
        },
        {
          id: "dog-dhpp-3",
          workflow: "Immunization",
          ageLabel: "14 - 16 Weeks Old (Day 105)",
          daysOffset: 105,
          category: "vaccine",
          className: "DHPP / 5-in-1",
          care: "Core Vaccine DHPP (Dose 3 - Final Puppy Dose)",
          target: "Distemper, Adenovirus, Parvovirus, Parainfluenza",
          protocol: "Final puppy immunization shot; completes juvenile core series",
          vaccineName: "DHPP 5-in-1 Dose 3",
          constraints: "Completes puppy cycle. Transition to annual booster loop.",
          isCore: true
        },
        {
          id: "dog-rabies-1",
          workflow: "Immunization",
          ageLabel: "12 - 16 Weeks Old (Day 84+)",
          daysOffset: 84,
          category: "vaccine",
          className: "Rabies",
          care: "Core Vaccine: Rabies (Mandatory by Law - RA 9482)",
          target: "Rabies Virus Prophylaxis",
          protocol: "Single subcutaneous injection; annual compliance tracking",
          vaccineName: "Rabies Dose 1",
          constraints: "Start Condition: Patient_Age >= 84 Days (12 weeks). Hard block if Age < 12 weeks. Multi-year option after Year 1.",
          isCore: true
        },
        {
          id: "dog-booster-1y",
          workflow: "Immunization",
          ageLabel: "1 Year Old (Day 365)",
          daysOffset: 365,
          category: "vaccine",
          className: "DHPP / Rabies Booster",
          care: "First Adult Core Boosters (DHPP + Rabies)",
          target: "Adult immunization renewal",
          protocol: "Exactly 1 year after final puppy shots",
          vaccineName: "Annual DHPP & Rabies Booster",
          constraints: "Mandatory 1-year booster. Transition to 1-3 year adult cycle thereafter.",
          isCore: true
        }
      ];
    }
  } else if (species === "Feline") {
    if (age.isAdult) {
      // Adult Cat Maintenance
      const nextAnniv = getNextBirthdayAnniversary(birthDate);
      const lastDeworm = completedVaccs.find(v => v.done && v.vaccine?.toLowerCase().includes("deworm"));
      const lastParasite = completedVaccs.find(v => v.done && (v.vaccine?.toLowerCase().includes("flea") || v.vaccine?.toLowerCase().includes("parasite") || v.vaccine?.toLowerCase().includes("revolution")));
      const lastFVRCP = completedVaccs.find(v => v.done && v.vaccine?.toLowerCase().includes("fvrcp"));
      const lastRabies = completedVaccs.find(v => v.done && v.vaccine?.toLowerCase().includes("rabies"));

      const dewormTarget = lastDeworm?.date ? addDays(lastDeworm.date, 90) : addDays(today(), 14);
      const parasiteTarget = lastParasite?.date ? addDays(lastParasite.date, 30) : addDays(today(), 7);
      const fvrcpTarget = lastFVRCP?.date ? addDays(lastFVRCP.date, 365) : nextAnniv;
      const rabiesTarget = lastRabies?.date ? addDays(lastRabies.date, 365) : nextAnniv;

      rawItems = [
        {
          id: "cat-adult-fvrcp-annual",
          workflow: "Immunization",
          ageLabel: "Adult Booster (Every 1 - 3 Yrs)",
          category: "vaccine",
          className: "FVRCP / 4-in-1",
          care: "Annual Core Booster: FVRCP (4-in-1)",
          target: "Rhinotracheitis, Calicivirus, Panleukopenia, Chlamydia",
          protocol: "Administer on anniversary; 1-3 year adult cycle per WSAVA feline protocol",
          vaccineName: "FVRCP 4-in-1 Booster",
          constraints: "Switch to 1-3 year adult cycles.",
          isCore: true,
          isRecurring: true,
          targetDateOverride: fvrcpTarget,
          lifeStage: "Adult"
        },
        {
          id: "cat-adult-rabies-annual",
          workflow: "Immunization",
          ageLabel: "Adult Annual Booster (Mandatory)",
          category: "vaccine",
          className: "Rabies",
          care: "Annual Core Vaccine: Rabies (Feline Formulation)",
          target: "Rabies Virus Prophylaxis",
          protocol: "Annual compliance vaccination",
          vaccineName: "Feline Rabies Booster",
          constraints: "Mandatory legal layout tracking.",
          isCore: true,
          isRecurring: true,
          targetDateOverride: rabiesTarget,
          lifeStage: "Adult"
        },
        {
          id: "cat-adult-deworm-quarterly",
          workflow: "Parasiticide",
          ageLabel: "Every 3 Months (Quarterly)",
          category: "deworm",
          className: "Deworming",
          care: "Adult Deworming (Quarterly / Every 90 Days)",
          target: "Internal Parasite Maintenance",
          protocol: "Oral broad-spectrum deworming tablet every 90 days",
          constraints: "VCMS Rule: Transition to every 90 days for indoor-only profiles at 6 months.",
          isCore: false,
          isRecurring: true,
          targetDateOverride: dewormTarget,
          lifeStage: "Adult"
        },
        {
          id: "cat-adult-parasite-monthly",
          workflow: "Parasiticide",
          ageLabel: "Every Month (30 Days)",
          category: "parasite",
          className: "Flea/Tick/Mite",
          care: "Monthly Topical Flea, Tick & Ear Mite Prevention",
          target: "Ectoparasites, Otodectes cynotis & Heartworm",
          protocol: "Feline-approved spot-on (Revolution Plus / Bravecto Plus) strictly every 30 days",
          constraints: "TOXICOLOGY BLOCK: Completely restrict formulas containing Permethrin.",
          isCore: false,
          isRecurring: true,
          targetDateOverride: parasiteTarget,
          lifeStage: "Adult"
        },
        {
          id: "cat-adult-wellness-annual",
          workflow: "Physical Exam",
          ageLabel: "Annual Comprehensive",
          category: "exam",
          className: "Wellness Exam",
          care: "Annual Adult Feline Wellness & Dental Inspection",
          target: "Thoracic auscultation, feline resorptive dental lesions check & BCS",
          protocol: "Comprehensive adult feline health examination",
          constraints: "Annual wellness check.",
          isCore: true,
          isRecurring: true,
          targetDateOverride: nextAnniv,
          lifeStage: "Adult"
        }
      ];

      if (age.isSenior) {
        rawItems.push({
          id: "cat-senior-panel",
          workflow: "Diagnostic",
          ageLabel: "Senior Feline Care (Every 6 Months)",
          category: "diagnostic",
          className: "Geriatric Panel",
          care: "Senior Feline Renal & Thyroid Evaluation",
          target: "Serum Creatinine/SDMA, BUN, total T4 (Hyperthyroidism) & Blood Pressure",
          protocol: "Bi-annual senior feline diagnostic panel",
          constraints: "Senior protocol for feline patients 7 years and older.",
          isCore: true,
          isRecurring: true,
          targetDateOverride: addDays(today(), 30),
          lifeStage: "Senior"
        });
      }

      // Juvenile kitten foundation records
      const juvenileKittenItems = [
        { id: "cat-deworm-14d", workflow: "Parasiticide", ageLabel: "2 Weeks Old", category: "deworm", className: "Deworming", care: "Kitten Deworming Dose 1", daysOffset: 14 },
        { id: "cat-deworm-28d", workflow: "Parasiticide", ageLabel: "4 Weeks Old", category: "deworm", className: "Deworming", care: "Kitten Deworming Dose 2", daysOffset: 28 },
        { id: "cat-fvrcp-1", workflow: "Immunization", ageLabel: "6 Weeks Old", category: "vaccine", className: "FVRCP / 4-in-1", care: "Kitten FVRCP Dose 1", daysOffset: 42 },
        { id: "cat-fvrcp-2", workflow: "Immunization", ageLabel: "10 Weeks Old", category: "vaccine", className: "FVRCP / 4-in-1", care: "Kitten FVRCP Dose 2", daysOffset: 70 },
        { id: "cat-fvrcp-3", workflow: "Immunization", ageLabel: "14 Weeks Old", category: "vaccine", className: "FVRCP / 4-in-1", care: "Kitten FVRCP Dose 3", daysOffset: 98 },
        { id: "cat-rabies-1", workflow: "Immunization", ageLabel: "12 Weeks Old", category: "vaccine", className: "Rabies", care: "First Feline Rabies Shot", daysOffset: 84 }
      ];

      juvenileKittenItems.forEach(item => {
        rawItems.push({
          ...item,
          protocol: "Completed during kittenhood (Juvenile Foundation Series)",
          target: "Juvenile core immunization & deworming",
          constraints: "Kitten series completed. Patient is currently on Adult Maintenance.",
          isCore: false,
          targetDateOverride: addDays(birthDate, item.daysOffset),
          isJuvenileCompleted: true
        });
      });
    } else {
      // Kitten schedule (< 12 months)
      rawItems = [
        // --- PARASITICIDE LOOP ---
        {
          id: "cat-deworm-14d",
          workflow: "Parasiticide",
          ageLabel: "2 Weeks Old (Day 14)",
          daysOffset: 14,
          category: "deworm",
          className: "Deworming",
          care: "Kitten Deworming Dose 1",
          target: "Intestinal Parasites (Roundworms / Toxocara cati)",
          protocol: "Oral preventative dose",
          constraints: "Start Condition: Patient_Age == 14 Days. Every 14 Days interval.",
          isCore: false
        },
        {
          id: "cat-deworm-28d",
          workflow: "Parasiticide",
          ageLabel: "4 Weeks Old (Day 28)",
          daysOffset: 28,
          category: "deworm",
          className: "Deworming",
          care: "Kitten Deworming Dose 2",
          target: "Intestinal Parasites",
          protocol: "Oral preventative dose",
          constraints: "Every 14 Days interval.",
          isCore: false
        },
        {
          id: "cat-deworm-42d",
          workflow: "Parasiticide",
          ageLabel: "6 Weeks Old (Day 42)",
          daysOffset: 42,
          category: "deworm",
          className: "Deworming",
          care: "Kitten Deworming Dose 3",
          target: "Intestinal Parasites",
          protocol: "Oral preventative dose concurrent with first vaccine consult",
          constraints: "Every 14 Days interval.",
          isCore: false
        },
        {
          id: "cat-deworm-180d",
          workflow: "Parasiticide",
          ageLabel: "6 Months Old (Day 180)",
          daysOffset: 180,
          category: "deworm",
          className: "Deworming",
          care: "Deworming Frequency Transition (Every 90 Days)",
          target: "Internal Parasite Maintenance",
          protocol: "Transition to every 90 days for indoor-only profiles at 6 months",
          constraints: "VCMS Rule: Transition to every 90 days for indoor-only profiles at 6 months.",
          isCore: false
        },
        {
          id: "cat-parasite-56d",
          workflow: "Parasiticide",
          ageLabel: "8 Weeks Old (Day 56)",
          daysOffset: 56,
          category: "parasite",
          className: "Flea/Tick/Mite",
          care: "Feline Topical Flea, Tick & Ear Mite Prevention",
          target: "Ectoparasites, Otodectes cynotis & Heartworm",
          protocol: "Feline-approved spot-on (Revolution Plus / Bravecto Plus) every 30 days",
          constraints: "Start Condition: Patient_Age >= 56 Days. TOXICOLOGY BLOCK: Completely restrict formulas containing Permethrin.",
          isCore: false
        },

        // --- IMMUNIZATION LOOP ---
        {
          id: "cat-fvrcp-1",
          workflow: "Immunization",
          ageLabel: "6 Weeks Old (Day 42)",
          daysOffset: 42,
          category: "vaccine",
          className: "FVRCP / 4-in-1",
          care: "Core Vaccine FVRCP (Dose 1)",
          target: "Rhinotracheitis, Calicivirus, Panleukopenia, Chlamydia",
          protocol: "Kitten core immunization start",
          vaccineName: "FVRCP 4-in-1 Dose 1",
          constraints: "Start Condition: Patient_Age >= 42 Days. Interval: Every 28 Days.",
          isCore: true
        },
        {
          id: "cat-fvrcp-2",
          workflow: "Immunization",
          ageLabel: "10 Weeks Old (Day 70)",
          daysOffset: 70,
          category: "vaccine",
          className: "FVRCP / 4-in-1",
          care: "Core Vaccine FVRCP (Dose 2)",
          target: "Feline Viral Rhinotracheitis, Calicivirus, Panleukopenia",
          protocol: "Booster spaced exactly 28 days apart",
          vaccineName: "FVRCP 4-in-1 Dose 2",
          constraints: "Interval: Every 28 Days. Maximum 3 kitten doses.",
          isCore: true
        },
        {
          id: "cat-fvrcp-3",
          workflow: "Immunization",
          ageLabel: "14 Weeks Old (Day 98)",
          daysOffset: 98,
          category: "vaccine",
          className: "FVRCP / 4-in-1",
          care: "Core Vaccine FVRCP (Dose 3 - Final Kitten Shot)",
          target: "Feline Viral Rhinotracheitis, Calicivirus, Panleukopenia",
          protocol: "Final kitten core shot. Completes initial series.",
          vaccineName: "FVRCP 4-in-1 Dose 3",
          constraints: "Maximum 3 kitten doses. Switch to 1-3 year adult cycles.",
          isCore: true
        },
        {
          id: "cat-rabies-1",
          workflow: "Immunization",
          ageLabel: "12 Weeks Old (Day 84)",
          daysOffset: 84,
          category: "vaccine",
          className: "Rabies",
          care: "Core Vaccine: Rabies (Feline Formulation)",
          target: "Rabies Virus Prophylaxis",
          protocol: "Annual compliance vaccination",
          vaccineName: "Feline Rabies",
          constraints: "Start Condition: Patient_Age >= 84 Days. Annual interval. Mandatory legal layout tracking.",
          isCore: true
        },
        {
          id: "cat-booster-1y",
          workflow: "Immunization",
          ageLabel: "1 Year Old (Day 365)",
          daysOffset: 365,
          category: "vaccine",
          className: "FVRCP / Rabies Booster",
          care: "First Adult Core Boosters (FVRCP + Rabies)",
          target: "Feline adult immunity renewal",
          protocol: "Administer 1 year after final kitten series",
          vaccineName: "Annual FVRCP & Rabies Booster",
          constraints: "Transition to 1-3 year adult cycles.",
          isCore: true
        }
      ];
    }
  } else if (species === "Lagomorph") {
    rawItems = [
      // --- IMMUNIZATION LOOP ---
      {
        id: "rabbit-rhdv",
        workflow: "Immunization",
        ageLabel: "5 Weeks Old (Day 35)",
        daysOffset: 35,
        category: "vaccine",
        className: "RHDV1 / RHDV2",
        care: "Core Vaccine: RHDV1 / RHDV2 (Rabbit Hemorrhagic Disease)",
        target: "Lagovirus (Calicivirus RHDV-1 & RHDV-2 strains)",
        protocol: "Single annual subcutaneous dose (Filavac or Eravac)",
        vaccineName: "RHDV1/RHDV2 Vaccine",
        constraints: "Start Condition: Patient_Age >= 35 Days. Annual interval. Flag reminder if regional outbreak status shifts to High.",
        isCore: true
      },
      {
        id: "rabbit-toxicology",
        workflow: "Parasiticide",
        ageLabel: "All Ages (Strict Toxicology Safety)",
        daysOffset: 1,
        category: "parasite",
        className: "Fipronil Block",
        care: "Toxicology Safety Alert: Fipronil Absolute Ban",
        target: "Strict Ectoparasite Safety Protocol",
        protocol: "DO NOT DISPENSE OR APPLY FIPRONIL (FRONTLINE)",
        constraints: "Toxicology Block: Strict ban on Fipronil (Frontline) due to fatal rabbit neurotoxicity. AI & UI interceptor active.",
        isCore: false
      },
      {
        id: "rabbit-dental-check",
        workflow: "Physical Exam",
        ageLabel: "Every 6 Months (Day 180)",
        daysOffset: 180,
        category: "exam",
        className: "Dental / GI Assessment",
        care: "Lagomorph Dental & Cecotrope Clinical Exam",
        target: "Elodont continuously growing incisors & molars, GI stasis screening",
        protocol: "Otoscopic molar spur inspection & dietary hay assessment",
        constraints: "Every 180 days interval for rabbit GI & dental health.",
        isCore: false,
        isRecurring: true
      }
    ];
  } else if (species === "Rodent") {
    rawItems = [
      {
        id: "rodent-dental-180d",
        workflow: "Physical Exam",
        ageLabel: "6 Months Old (Day 180)",
        daysOffset: 180,
        category: "exam",
        className: "Dental / Occlusion",
        care: "Molar & Incisor Overgrowth Clinical Exam",
        target: "Continuous elodont incisor/molar occlusion surveillance",
        protocol: "Visual otoscope / speculum examination for dental burr / trimming needs",
        constraints: "Start Condition: Patient_Age >= 180 Days. Interval: Every 180 Days. Enforce custom UI dropdown field for Molar/Incisor Overgrowth status.",
        isCore: true,
        isRecurring: true
      },
      {
        id: "rodent-wellness",
        workflow: "Physical Exam",
        ageLabel: "Annual Checkup (Day 365)",
        daysOffset: 365,
        category: "exam",
        className: "Wellness Check",
        care: "Comprehensive Small Rodent Wellness & Respiratory Exam",
        target: "Respiratory mycoplasma & nutritional evaluation",
        protocol: "Weight check, scent gland check & thoracic auscultation",
        constraints: "Annual wellness check.",
        isCore: false,
        isRecurring: true
      }
    ];
  } else if (species === "Avian") {
    rawItems = [
      {
        id: "avian-fecal-180d",
        workflow: "Diagnostic",
        ageLabel: "6 Months Old (Day 180)",
        daysOffset: 180,
        category: "diagnostic",
        className: "Fecal Float",
        care: "Diagnostic Fecal Floatation & Smear",
        target: "Endoparasites (Giardia, Ascarids, Coccidia) & Megabacteria",
        protocol: "Microscopic fecal screening examination",
        constraints: "Start Condition: Patient_Age >= 180 Days. Interval: Annual. Screening-based medicine framework. Injects Teflon/Oil home hazard pop-ups.",
        isCore: true,
        isRecurring: true
      },
      {
        id: "avian-teflon-alert",
        workflow: "Diagnostic",
        ageLabel: "Continuous Home Safety Protocol",
        daysOffset: 1,
        category: "exam",
        className: "Hazard Warning",
        care: "PTFE / Teflon & Oil Toxic Fume Home Hazard Safety",
        target: "Acute fatal polytetrafluoroethylene (PTFE) pulmonary hemorrhage",
        protocol: "Strict household prohibition of overheated non-stick cookware near birds",
        constraints: "VCMS Rule: Injects Teflon/Oil home hazard pop-ups.",
        isCore: false
      }
    ];
  } else {
    // Exotic / Other
    rawItems = [
      {
        id: "other-wellness-180d",
        workflow: "Physical Exam",
        ageLabel: "Every 6 - 12 Months",
        daysOffset: 180,
        category: "exam",
        className: "Wellness Exam",
        care: "Comprehensive Wellness & Parasite Check",
        target: "Species-specific metabolic & environmental husbandry review",
        protocol: "Annual veterinary health inspection",
        constraints: "Periodic wellness protocol.",
        isCore: true
      }
    ];
  }

  return rawItems.map(item => {
    const targetDate = item.targetDateOverride || addDays(birthDate, item.daysOffset);
    const isPast = targetDate < today();
    const isToday = targetDate === today();
    const isDueSoon = !isPast && targetDate <= addDays(today(), 14);

    if (item.isJuvenileCompleted) {
      return {
        ...item,
        targetDate,
        status: "Completed (Juvenile Foundation)",
        isDone: true
      };
    }

    // Check if matching record exists in completedVaccs
    const isDone = completedVaccs.some(v =>
      v.done && (
        (item.vaccineName && v.vaccine?.toLowerCase().includes(item.vaccineName.split(" ")[0].toLowerCase())) ||
        (item.className && v.vaccine?.toLowerCase().includes(item.className.toLowerCase())) ||
        (item.care && v.vaccine?.toLowerCase().includes(item.care.toLowerCase()))
      )
    );

    let status = "Upcoming";
    if (isDone) status = "Completed";
    else if (isPast) status = "Overdue";
    else if (isToday || isDueSoon) status = "Due Soon";

    return {
      ...item,
      targetDate,
      status,
      isDone
    };
  });
}

/**
 * Helper to get the single most relevant next milestone
 */
export function getNextMilestone(birthDate, species = "Canine", completedVaccs = []) {
  const schedule = getPreventiveSchedule(birthDate, species, completedVaccs);
  if (!schedule.length) return null;

  // Filter out advisory warnings and juvenile completed foundation items
  const actionable = schedule.filter(s =>
    s.daysOffset !== 1 &&
    !s.isJuvenileCompleted &&
    s.status !== "Completed (Juvenile Foundation)" &&
    s.status !== "Completed"
  );
  const list = actionable.length ? actionable : schedule.filter(s => !s.isJuvenileCompleted);

  // Find overdue first, then due soon, then first upcoming
  const overdue = list.find(s => s.status === "Overdue" && !s.isDone);
  if (overdue) return overdue;

  const dueSoon = list.find(s => s.status === "Due Soon" && !s.isDone);
  if (dueSoon) return dueSoon;

  const upcoming = list.find(s => s.status === "Upcoming" && !s.isDone);
  return upcoming || list[0] || null;
}

/**
 * Automated Weight Bracket & Safety Checker (VCMS Protocols v2.0)
 *
 * Implements:
 * 1. Dynamic Weight Check Logic:
 *    IF (Product_Min_Weight <= Patient_Weight <= Product_Max_Weight) THEN Allow_Dispense
 *    ELSE Flag_Error ("Patient weight out of product bracket range.")
 *
 * 2. Heartworm Preventative Safety Gap Trigger:
 *    IF (Patient_Species == "Canine" AND Patient_Age >= 210 Days AND Last_Dose_Gap > 45 Days) THEN
 *      Restrict_Product_Dispense()
 *      Inject_Workflow_Item("Heartworm Antigen Test Required")
 *
 * 3. System Toxicity Interceptor Matrix:
 *    IF (Product_Contains("Fipronil") AND Patient_Species == "Lagomorph") THEN
 *      BLOCK_DISPENSE("Fatal Rabbit Neurotoxin Check Failure")
 *    IF (Product_Contains("Permethrin") AND Patient_Species == "Feline") THEN
 *      BLOCK_DISPENSE("Fatal Feline Permethrin Toxicity Failure")
 */
export function computeWeightBracket(weightKg, rawSpecies = "Canine", birthDate = null, lastDoseDaysGap = 50) {
  const kg = parseFloat(weightKg);
  const species = normalizeSpecies(rawSpecies);

  const age = birthDate ? computeAgeDetails(birthDate) : null;
  const isPuppy = age ? age.months < 12 : null;
  const underAgeFloor = age ? age.weeks < 8 : false;
  const daysOld = age ? age.days : 0;

  let nexgard = null;
  let simparica = null;
  let alert = null;
  let heartwormAntigenTestRequired = false;
  let heartwormAlert = null;
  let toxicityAlert = null;

  // 1. Toxicity Interceptor Matrix
  if (species === "Lagomorph") {
    toxicityAlert = "Fatal Rabbit Neurotoxin Check Failure: Strict ban on Fipronil (Frontline) due to fatal rabbit neurotoxicity. Use only selamectin / advantage under exotic vet prescription.";
  } else if (species === "Feline") {
    toxicityAlert = "Fatal Feline Permethrin Toxicity Failure: Completely restrict all spot-ons containing Permethrin. Permethrin is fatal to cats.";
  } else if (species === "Avian") {
    toxicityAlert = "Avian Home Hazard Alert: Non-stick PTFE (Teflon) fumes and aerosol sprays cause acute fatal hemorrhagic pulmonary edema in birds.";
  }

  // 2. Heartworm Preventative Safety Gap Trigger (Canine, Age >= 210 Days, Gap > 45 Days)
  if (species === "Canine" && daysOld >= 210 && lastDoseDaysGap > 45) {
    heartwormAntigenTestRequired = true;
    heartwormAlert = `Heartworm Safety Gap Trigger: Patient Age >= 210 Days (${age?.formatted || "7+ months"}) and gap > 45 days. Dispense restricted until Heartworm Antigen Test is confirmed negative.`;
  }

  // 3. Dynamic Weight & Bracket Checks
  if (!isNaN(kg) && kg > 0 && species === "Canine") {
    // NexGard Spectra Brackets
    if (kg < 2.0) {
      nexgard = {
        box: "Under 2.0 kg",
        color: "#64748b",
        range: "< 2.0 kg",
        safe: false,
        note: "Under minimum weight (2.0 kg). Never split larger tablets in half! Pediatric topical spot-on required."
      };
    } else if (kg <= 3.5) {
      nexgard = {
        box: "Orange Box (Extra Small)",
        color: "#ea580c",
        range: "2.0 – 3.5 kg",
        safe: true,
        note: "Chewable tablet for Extra Small dogs (2.0 to 3.5 kg)."
      };
    } else if (kg <= 7.5) {
      nexgard = {
        box: "Yellow Box (Small)",
        color: "#ca8a04",
        range: "3.6 – 7.5 kg",
        safe: true,
        note: "Chewable tablet for Small dogs (3.6 to 7.5 kg)."
      };
    } else if (kg <= 15.0) {
      nexgard = {
        box: "Green Box (Medium)",
        color: "#16a34a",
        range: "7.6 – 15.0 kg",
        safe: true,
        note: "Chewable tablet for Medium dogs (7.6 to 15.0 kg)."
      };
    } else if (kg <= 30.0) {
      nexgard = {
        box: "Purple Box (Large)",
        color: "#9333ea",
        range: "15.1 – 30.0 kg",
        safe: true,
        note: "Chewable tablet for Large dogs (15.1 to 30.0 kg)."
      };
    } else if (kg <= 60.0) {
      nexgard = {
        box: "Red Box (Extra Large)",
        color: "#dc2626",
        range: "30.1 – 60.0 kg",
        safe: true,
        note: "Chewable tablet for Extra Large dogs (30.1 to 60.0 kg)."
      };
    } else {
      nexgard = {
        box: "Combination Dosing (> 60 kg)",
        color: "#0f172a",
        range: "> 60.0 kg",
        safe: true,
        note: "Dogs over 60 kg require an appropriate combination of whole chewable tablets under veterinary instruction."
      };
    }

    // Simparica Trio Brackets
    if (kg < 1.25) {
      simparica = {
        box: "Under 1.25 kg",
        range: "< 1.25 kg",
        safe: false,
        note: "Under minimum weight (1.25 kg) for Simparica Trio."
      };
    } else if (kg <= 2.5) {
      simparica = { box: "Gold Box (1.25 to 2.5 kg)", range: "1.25 – 2.5 kg", safe: true };
    } else if (kg <= 5.0) {
      simparica = { box: "Purple Box (2.6 to 5.0 kg)", range: "2.6 – 5.0 kg", safe: true };
    } else if (kg <= 10.0) {
      simparica = { box: "Green Box (5.1 to 10.0 kg)", range: "5.1 – 10.0 kg", safe: true };
    } else if (kg <= 20.0) {
      simparica = { box: "Blue Box (10.1 to 20.0 kg)", range: "10.1 – 20.0 kg", safe: true };
    } else if (kg <= 40.0) {
      simparica = { box: "Brown Box (20.1 to 40.0 kg)", range: "20.1 – 40.0 kg", safe: true };
    } else if (kg <= 60.0) {
      simparica = { box: "Red Box (40.1 to 60.0 kg)", range: "40.1 – 60.0 kg", safe: true };
    } else {
      simparica = { box: "Combination Dosing (> 60 kg)", range: "> 60.0 kg", safe: true };
    }

    // Strict puppy age floor rule
    if (underAgeFloor) {
      alert = `Age Floor Rule: At ${age?.formatted || "under 8 weeks"}, this puppy is too young for oral flea/tick/heartworm combo chews (requires min. 8 weeks of age and 1.25–2.0 kg). Please ask the clinic for a pediatric topical spot-on.`;
    } else if (kg < 2.0) {
      alert = `Minimum Weight Notice: At ${kg} kg, this dog is below 2.0 kg. Never split a larger pill in half—the active ingredients are not mixed evenly inside tablets. Use an exact pediatric dose.`;
    }
  }

  return {
    kg: isNaN(kg) ? null : kg,
    species,
    isPuppy,
    underAgeFloor,
    nexgard,
    simparica,
    alert,
    heartwormAntigenTestRequired,
    heartwormAlert,
    toxicityAlert
  };
}

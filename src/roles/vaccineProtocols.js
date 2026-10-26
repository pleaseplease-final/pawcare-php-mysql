// Veterinary clinical protocols for automated vaccination card generation
import { TODAY, plus, uid } from "../lib.jsx";

/**
 * Calculates pet age in weeks and months from birth date string (YYYY-MM-DD)
 */
export function calculateAge(birthDateStr) {
  if (!birthDateStr) return { weeks: 52, months: 12, isPuppyOrKitten: false };
  const birth = new Date(birthDateStr + "T00:00:00");
  const now = new Date(TODAY + "T00:00:00");
  const diffMs = Math.max(0, now - birth);
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  const weeks = Math.floor(diffDays / 7);
  const months = Math.floor(diffDays / 30.4375);
  return {
    days: diffDays,
    weeks,
    months,
    isPuppyOrKitten: weeks < 20, // under 5 months
  };
}

/**
 * Standard Veterinary Vaccination & Prophylaxis Protocols
 * Based on WSAVA (World Small Animal Veterinary Association)
 * and Philippine Veterinary Medical Association (PVMA) guidelines.
 */
export const CLINICAL_PROTOCOLS = {
  Dog: [
    {
      vaccine: "5-in-1 (DHPP Core)",
      brand: "Vanguard Plus 5",
      type: "Core",
      description: "Canine Distemper, Adenovirus (Hepatitis), Parvovirus, and Parainfluenza.",
      getSchedule: (age) => {
        // If puppy under 16 weeks, schedule initial dose and booster
        if (age.weeks < 8) {
          return { initialDue: plus(Math.max(1, (8 - age.weeks) * 7)), boosterDays: 28, doseNo: 1, doseOf: 3 };
        } else if (age.weeks < 16) {
          return { initialDue: plus(3), boosterDays: 28, doseNo: 2, doseOf: 3 };
        }
        // Adult dog: annual core
        return { initialDue: plus(7), boosterDays: 365, doseNo: 1, doseOf: 1 };
      },
    },
    {
      vaccine: "Anti-rabies",
      brand: "Defensor 3",
      type: "Mandatory Core (RA 9482)",
      description: "Philippine Anti-Rabies Act compliance. Mandatory protection against Rabies virus.",
      getSchedule: (age) => {
        // Rabies is legally administered at 12 weeks (3 months) or older
        if (age.weeks < 12) {
          return { initialDue: plus((12 - age.weeks) * 7), boosterDays: 365, doseNo: 1, doseOf: 1 };
        }
        return { initialDue: plus(14), boosterDays: 365, doseNo: 1, doseOf: 1 };
      },
    },
    {
      vaccine: "Broad-Spectrum Deworming",
      brand: "Canex Multi-Spectrum",
      type: "Prophylaxis",
      description: "Gastrointestinal parasite control (Roundworms, Hookworms, Tapeworms).",
      getSchedule: () => ({ initialDue: plus(5), boosterDays: 90, doseNo: 1, doseOf: 4 }),
    },
    {
      vaccine: "Bordetella (Kennel Cough)",
      brand: "Bronchi-Shield Oral",
      type: "Lifestyle / Respiratory",
      description: "Protection against infectious canine tracheobronchitis (Kennel Cough).",
      getSchedule: (age) => ({ initialDue: plus(age.weeks < 12 ? 28 : 21), boosterDays: 365, doseNo: 1, doseOf: 1 }),
    },
  ],

  Cat: [
    {
      vaccine: "4-in-1 (FVRCP Core)",
      brand: "Felocell 4",
      type: "Core",
      description: "Feline Rhinotracheitis, Calicivirus, Panleukopenia, and Chlamydia psittaci.",
      getSchedule: (age) => {
        if (age.weeks < 8) {
          return { initialDue: plus(Math.max(1, (8 - age.weeks) * 7)), boosterDays: 28, doseNo: 1, doseOf: 3 };
        } else if (age.weeks < 16) {
          return { initialDue: plus(3), boosterDays: 28, doseNo: 2, doseOf: 3 };
        }
        return { initialDue: plus(7), boosterDays: 365, doseNo: 1, doseOf: 1 };
      },
    },
    {
      vaccine: "Anti-rabies",
      brand: "Defensor 3",
      type: "Mandatory Core (RA 9482)",
      description: "Mandatory protection against Rabies virus for felines.",
      getSchedule: (age) => {
        if (age.weeks < 12) {
          return { initialDue: plus((12 - age.weeks) * 7), boosterDays: 365, doseNo: 1, doseOf: 1 };
        }
        return { initialDue: plus(14), boosterDays: 365, doseNo: 1, doseOf: 1 };
      },
    },
    {
      vaccine: "Feline Deworming",
      brand: "Profender Spot-on",
      type: "Prophylaxis",
      description: "Controls internal roundworms, hookworms, and tapeworms.",
      getSchedule: () => ({ initialDue: plus(5), boosterDays: 90, doseNo: 1, doseOf: 4 }),
    },
  ],

  Rabbit: [
    {
      vaccine: "RHDV1 / RHDV2 Core Vaccine",
      brand: "Filavac VHD K C+V",
      type: "Core Lagomorph",
      description: "Protects against Rabbit Hemorrhagic Disease Virus strains 1 and 2.",
      getSchedule: () => ({ initialDue: plus(7), boosterDays: 365, doseNo: 1, doseOf: 1 }),
    },
    {
      vaccine: "Comprehensive Deworming & Health Exam",
      brand: "Panacur (Fenbendazole)",
      type: "Prophylaxis & Wellness",
      description: "Encephalitozoon cuniculi and internal parasite protection.",
      getSchedule: () => ({ initialDue: plus(14), boosterDays: 180, doseNo: 1, doseOf: 2 }),
    },
  ],

  Lagomorph: [
    {
      vaccine: "RHDV1 / RHDV2 Core Vaccine",
      brand: "Filavac VHD K C+V",
      type: "Core Lagomorph",
      description: "Protects against Rabbit Hemorrhagic Disease Virus strains 1 and 2.",
      getSchedule: () => ({ initialDue: plus(7), boosterDays: 365, doseNo: 1, doseOf: 1 }),
    },
    {
      vaccine: "Comprehensive Deworming & Health Exam",
      brand: "Panacur (Fenbendazole)",
      type: "Prophylaxis & Wellness",
      description: "Encephalitozoon cuniculi and internal parasite protection.",
      getSchedule: () => ({ initialDue: plus(14), boosterDays: 180, doseNo: 1, doseOf: 2 }),
    },
  ],

  Rodent: [
    {
      vaccine: "Dental & Occlusion Clinical Assessment",
      brand: "VCMS Diagnostic Protocol",
      type: "Dental Surveillance",
      description: "Incisor and molar overgrowth surveillance and nutritional audit.",
      getSchedule: () => ({ initialDue: plus(7), boosterDays: 180, doseNo: 1, doseOf: 2 }),
    },
  ],

  Avian: [
    {
      vaccine: "Avian Fecal Float Diagnostic & Wellness",
      brand: "Microscopic Screening",
      type: "Diagnostic Screening",
      description: "Fecal parasite floatation, Gram stain and nutritional counseling.",
      getSchedule: () => ({ initialDue: plus(7), boosterDays: 365, doseNo: 1, doseOf: 1 }),
    },
  ],

  Other: [
    {
      vaccine: "General Wellness Examination & Parasite Check",
      brand: "Veterinary Standard",
      type: "Wellness Check",
      description: "Initial clinical physical examination and preventative healthcare check.",
      getSchedule: () => ({ initialDue: plus(7), boosterDays: 180, doseNo: 1, doseOf: 1 }),
    },
  ],
};

CLINICAL_PROTOCOLS.Canine = CLINICAL_PROTOCOLS.Dog;
CLINICAL_PROTOCOLS.Feline = CLINICAL_PROTOCOLS.Cat;

/**
 * Generates an official unique Pet Digital Vaccination Card ID
 * Format: VACC-YYYY-XXXX (e.g. VACC-2026-A8K2)
 */
export function generateCardId() {
  const year = new Date().getFullYear();
  const rand = Math.random().toString(36).substring(2, 6).toUpperCase();
  return `VACC-${year}-${rand}`;
}

/**
 * Automatically generates a complete digital vaccination card and schedule
 * for an approved pet based on species, breed, and birth date.
 * 
 * @param {Object} petData - Pet details (species, birth, breed, name, etc.)
 * @param {String} newPetId - Allocated pet ID
 * @param {String} approvedBy - Staff member who approved
 * @returns {Array<Object>} List of initialized vaccine records for db.vacc
 */
export function generateAutomatedVaccineSchedule(petData, newPetId, approvedBy = "Front Desk") {
  const rawSp = String(petData.species || "").toLowerCase();
  let key = "Other";
  if (rawSp.includes("dog") || rawSp.includes("canine")) key = "Dog";
  else if (rawSp.includes("cat") || rawSp.includes("feline")) key = "Cat";
  else if (rawSp.includes("rabbit") || rawSp.includes("lagomorph")) key = "Rabbit";
  else if (rawSp.includes("rodent") || rawSp.includes("hamster") || rawSp.includes("guinea")) key = "Rodent";
  else if (rawSp.includes("bird") || rawSp.includes("avian")) key = "Avian";

  const protocols = CLINICAL_PROTOCOLS[key] || CLINICAL_PROTOCOLS.Dog;
  const age = calculateAge(petData.birth);
  const cardId = petData.vaccinationCardId || generateCardId();

  return protocols.map((proto, idx) => {
    const sched = proto.getSchedule(age);
    return {
      id: "v" + uid(),
      petId: newPetId,
      cardId,
      vaccine: proto.vaccine,
      brand: proto.brand,
      batch: "Pending Administration",
      date: TODAY, // Card issuance date
      nextDue: sched.initialDue,
      doseNo: sched.doseNo,
      doseOf: sched.doseOf,
      done: false, // Pending clinic visit
      automated: true,
      protocolType: proto.type,
      notes: `Automatically scheduled upon online registration approval by ${approvedBy}. Recommended core protocol (${proto.description}).`,
    };
  });
}


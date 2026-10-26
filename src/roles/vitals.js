// Clinical veterinary intake rules & automated vitals analysis

export const BREED_WEIGHTS = {
  // Dogs
  chihuahua: { min: 1.5, max: 3.0 },
  pomeranian: { min: 1.8, max: 3.5 },
  "shih tzu": { min: 4.0, max: 7.5 },
  poodle: { min: 3.5, max: 8.0 },
  pug: { min: 6.0, max: 9.0 },
  "french bulldog": { min: 8.0, max: 13.0 },
  beagle: { min: 9.0, max: 14.0 },
  corgi: { min: 10.0, max: 14.0 },
  aspin: { min: 10.0, max: 18.0 },
  husky: { min: 16.0, max: 27.0 },
  "siberian husky": { min: 16.0, max: 27.0 },
  "golden retriever": { min: 25.0, max: 34.0 },
  labrador: { min: 25.0, max: 36.0 },
  "german shepherd": { min: 27.0, max: 38.0 },
  rottweiler: { min: 36.0, max: 50.0 },

  // Cats
  puspin: { min: 3.2, max: 5.2 },
  siamese: { min: 3.0, max: 4.8 },
  persian: { min: 3.5, max: 5.5 },
  "maine coon": { min: 5.5, max: 9.5 },
};

export const SPECIES_DEFAULTS = {
  Dog: { min: 6.0, max: 22.0, tempMin: 38.0, tempMax: 39.2, normalTempPreset: 38.5 },
  Canine: { min: 6.0, max: 22.0, tempMin: 38.0, tempMax: 39.2, normalTempPreset: 38.5 },
  Cat: { min: 3.2, max: 5.2, tempMin: 38.0, tempMax: 39.2, normalTempPreset: 38.4 },
  Feline: { min: 3.2, max: 5.2, tempMin: 38.0, tempMax: 39.2, normalTempPreset: 38.4 },
  Rabbit: { min: 1.5, max: 3.2, tempMin: 38.5, tempMax: 40.0, normalTempPreset: 39.0 },
  Lagomorph: { min: 1.5, max: 3.2, tempMin: 38.5, tempMax: 40.0, normalTempPreset: 39.0 },
  Rodent: { min: 0.1, max: 1.2, tempMin: 37.0, tempMax: 39.0, normalTempPreset: 38.0 },
  Bird: { min: 0.05, max: 0.6, tempMin: 40.0, tempMax: 42.0, normalTempPreset: 41.0 },
  Avian: { min: 0.05, max: 0.6, tempMin: 40.0, tempMax: 42.0, normalTempPreset: 41.0 },
  Other: { min: 1.0, max: 10.0, tempMin: 38.0, tempMax: 39.5, normalTempPreset: 38.5 },
};

export function getIdealWeight(species = "Dog", breed = "") {
  const b = String(breed || "").toLowerCase().trim();
  for (const [k, v] of Object.entries(BREED_WEIGHTS)) {
    if (b && (b.includes(k) || k.includes(b))) {
      return { min: v.min, max: v.max, source: `Breed standard (${breed})` };
    }
  }
  const def = SPECIES_DEFAULTS[species] || SPECIES_DEFAULTS.Other;
  return { min: def.min, max: def.max, source: `General ${species} standard` };
}

export function assessWeight(kg, species = "Dog", breed = "", prevKg = null) {
  const w = parseFloat(kg);
  if (isNaN(w) || w <= 0) return null;

  const ideal = getIdealWeight(species, breed);
  let status = "ideal";
  let label = "Normal / Ideal Weight";
  let color = "#16a34a"; // green
  let badgeClass = "ok";
  let warning = "";

  if (w < ideal.min) {
    status = "underweight";
    const percent = Math.round(((ideal.min - w) / ideal.min) * 100);
    label = `Underweight (${percent}% below ideal range)`;
    color = "#d97706"; // amber
    badgeClass = "wa";
    warning = `Patient is below expected ${ideal.min}–${ideal.max} kg. Recommend nutritional assessment.`;
  } else if (w > ideal.max * 1.2) {
    status = "obese";
    const percent = Math.round(((w - ideal.max) / ideal.max) * 100);
    label = `Obese (${percent}% above ideal range)`;
    color = "#dc2626"; // red
    badgeClass = "er";
    warning = `Significant excess weight detected. Flagged for dietary & joint management discussion.`;
  } else if (w > ideal.max) {
    status = "overweight";
    const percent = Math.round(((w - ideal.max) / ideal.max) * 100);
    label = `Overweight (+${percent}%)`;
    color = "#ea580c"; // orange
    badgeClass = "wa";
    warning = `Weight exceeds ideal ${ideal.min}–${ideal.max} kg range.`;
  }

  let trend = "";
  if (prevKg && !isNaN(+prevKg) && +prevKg > 0) {
    const diff = +(w - +prevKg).toFixed(1);
    if (diff > 0.1) {
      trend = `+${diff} kg since last visit (${prevKg} kg to ${w} kg)`;
    } else if (diff < -0.1) {
      trend = `${diff} kg loss since last visit (${prevKg} kg to ${w} kg)`;
    } else {
      trend = `Weight unchanged from last visit (${prevKg} kg)`;
    }
  }

  return {
    weight: w,
    status,
    label,
    color,
    badgeClass,
    warning,
    idealRange: `${ideal.min} – ${ideal.max} kg`,
    source: ideal.source,
    trend,
  };
}

export function assessTemp(celsius, species = "Dog") {
  const t = parseFloat(celsius);
  if (isNaN(t) || t <= 0) return null;

  const conf = SPECIES_DEFAULTS[species] || SPECIES_DEFAULTS.Other;
  const { tempMin, tempMax } = conf;

  if (t < tempMin - 0.5) {
    return {
      temp: t,
      status: "hypothermia",
      label: "Hypothermia Alert (Low Temp)",
      flag: "Hypothermia Warning",
      color: "#2563eb",
      badgeClass: "b2",
      alert: true,
      severity: "high",
      advice: `Temperature ${t}°C is significantly below normal (${tempMin}–${tempMax}°C). Check heating & clinical status.`,
    };
  }

  if (t < tempMin) {
    return {
      temp: t,
      status: "mild_low",
      label: "Slightly Low Temp",
      flag: "Subnormal Temp",
      color: "#3b82f6",
      badgeClass: "b2",
      alert: false,
      severity: "low",
      advice: `Temperature is on the lower threshold.`,
    };
  }

  if (t > tempMax + 1.2) {
    return {
      temp: t,
      status: "high_fever",
      label: "High Fever (Severe Pyrexia)",
      flag: "HIGH FEVER ALERT",
      color: "#dc2626",
      badgeClass: "er",
      alert: true,
      severity: "critical",
      advice: `Temperature ${t}°C indicates severe pyrexia (Normal: ${tempMin}–${tempMax}°C). Flagged doctor immediately.`,
    };
  }

  if (t > tempMax) {
    return {
      temp: t,
      status: "mild_fever",
      label: "Elevated Temp / Mild Fever",
      flag: "Elevated Temperature",
      color: "#ea580c",
      badgeClass: "wa",
      alert: true,
      severity: "medium",
      advice: `Mild elevation above normal ${tempMin}–${tempMax}°C. Doctor notified.`,
    };
  }

  return {
    temp: t,
    status: "normal",
    label: "Normal Body Temperature",
    flag: "Normal Temp",
    color: "#16a34a",
    badgeClass: "ok",
    alert: false,
    severity: "normal",
    advice: `Temperature is within normal clinical range (${tempMin}–${tempMax}°C).`,
  };
}


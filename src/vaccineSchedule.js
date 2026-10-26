import {normalizeSpecies} from './preventiveSchedule.js';

// Suggested vaccine schedule for the vet form. A suggestion only: the vet still approves it.
// Puppy / kitten series (WSAVA core guidance): doses every 3 weeks until about 16 weeks old,
// then one booster a year later. Adults on a single annual dose.
const SERIES = {
  '5-in-1':{species:'Canine',doses:3},
  '6-in-1':{species:'Canine',doses:3},
  '8-in-1':{species:'Canine',doses:3},
  'Feline 4-in-1':{species:'Feline',doses:3},
  'Feline Leukemia (FeLV)':{species:'Feline',doses:2},
};
const ANNUAL = ['Anti-rabies','Kennel cough'];
// The only products a vaccination record can be certified for; the form offers these and the server checks them.
export const ADMINISTERED_VACCINES = ['Anti-rabies', '5-in-1', '6-in-1', '8-in-1', 'Kennel cough', 'Feline 4-in-1', 'Feline Leukemia (FeLV)', 'Other', 'Deworming'];
const SERIES_GAP_DAYS = 21, JUVENILE_WEEKS = 16, RABIES_MIN_WEEKS = 12;

export const VACCINE_BRANDS = {
  'Anti-rabies':['Defensor 3','Rabisin','Nobivac Rabies'],
  '5-in-1':['Vanguard Plus 5','Nobivac DHPPi','Eurican DHPPi'],
  '6-in-1':['Vanguard Plus 5/L','Nobivac DHPPi + L'],
  '8-in-1':['Eurican DAPPi-Lmulti','Nobivac DHPPi + L4'],
  'Kennel cough':['Bronchi-Shield','Nobivac KC'],
  'Feline 4-in-1':['Felocell 4','Nobivac Tricat Trio','Purevax RCP'],
  'Feline Leukemia (FeLV)':['Purevax FeLV','Leukocell 2'],
};

const dateOnly = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value));
const daysBetween = (from, to) => (Date.parse(to) - Date.parse(from)) / 86400000;

export function vaccineSchedule({vaccine, date, birth, species, prior = []}) {
  if (!dateOnly(date) || (!SERIES[vaccine] && !ANNUAL.includes(vaccine))) return null;
  const kind = normalizeSpecies(species), series = SERIES[vaccine];
  const ageWeeks = dateOnly(birth) && birth <= date ? Math.floor(daysBetween(birth, date) / 7) : null;
  const warning = vaccine === 'Anti-rabies' && ageWeeks !== null && ageWeeks < RABIES_MIN_WEEKS
    ? `Anti-rabies is normally given from ${RABIES_MIN_WEEKS} weeks of age. This patient is ${ageWeeks} weeks old.`
    : series && series.species !== kind && ['Canine','Feline'].includes(kind) ? `This vaccine is intended for ${series.species.toLowerCase()} patients.` : '';
  if (!series || ageWeeks === null || ageWeeks >= JUVENILE_WEEKS) {
    return {intervalDays:'365',doseNo:'1',doseOf:'1',warning,reason:ageWeeks === null && series ? 'Annual booster · birth date not recorded' : 'Annual booster'};
  }
  const given = prior.filter(v => v.done && v.vaccine === vaccine && dateOnly(v.date) && v.date < date && daysBetween(v.date, date) <= 120).length;
  const doseNo = Math.min(given + 1, series.doses);
  const last = doseNo >= series.doses;
  return {intervalDays:String(last ? 365 : SERIES_GAP_DAYS),doseNo:String(doseNo),doseOf:String(series.doses),warning,
    reason:last ? `Final dose of the ${series.doses}-dose young-patient series · booster in a year` : `Young-patient series · dose ${doseNo} of ${series.doses}, next dose in ${SERIES_GAP_DAYS} days`};
}

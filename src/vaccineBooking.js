import { normalizeSpecies } from './preventiveSchedule.js';

// Booking requests do not certify administration or choose a clinical interval.
// Prices are read from the server catalog; unconfigured services stay unpriced.
export const VACCINE_CHOICES = [
  {id:'rabies',name:'Anti-rabies',catalogId:'srv_rabies',species:['Canine','Feline']},
  {id:'canine-core',name:'5-in-1',catalogId:'srv_dhpp',species:['Canine']},
  {id:'feline-core',name:'Feline 4-in-1',catalogId:'srv_fvrcp',species:['Feline']},
  {id:'canine-six',name:'6-in-1',species:['Canine']},
  {id:'canine-eight',name:'8-in-1',species:['Canine']},
  {id:'bordetella',name:'Bordetella',species:['Canine']},
  {id:'felv',name:'Feline Leukemia (FeLV)',species:['Feline']},
  {id:'vet-review',name:'Ask the veterinarian which vaccine is needed'}
];
export function vaccineChoiceError(id, species) {
  const choice=VACCINE_CHOICES.find(c=>c.id===id);
  if(!choice)return 'Choose a vaccine or ask the veterinarian to advise.';
  if(choice.species && !choice.species.includes(normalizeSpecies(species)))return 'This vaccine does not match the selected pet’s species. Choose a suitable request or veterinarian advice.';
  return '';
}
export function vaccineIdFromReason(reason='') {
  const name=String(reason).replace(/^(?:vaccination\s*[:–-]\s*)+/i,'').trim();
  if(/^(anti[- ]?rabies|rabies)\b/i.test(name))return 'rabies';
  if(/^6[- ]in[- ]1\b/i.test(name))return 'canine-six';
  if(/^8[- ]in[- ]1\b/i.test(name))return 'canine-eight';
  if(/^(?:dhpp|5[- ]in[- ]1|puppy\s+dhpp|annual\s+5[- ]in[- ]1)\b/i.test(name))return 'canine-core';
  if(/^(?:fvrcp|feline\s+4[- ]in[- ]1)\b/i.test(name))return 'feline-core';
  if(/^bordetella\b/i.test(name))return 'bordetella';
  if(/^(?:feline leukemia|felv)\b/i.test(name))return 'felv';
  if(/^ask the veterinarian/i.test(name))return 'vet-review';
  return '';
}
export function vaccineReason(id, original='') {
  const choice=VACCINE_CHOICES.find(c=>c.id===id);
  if(!choice)return '';
  // Retain an explicitly requested, unconfigured booster when asking for review.
  const detail=String(original).replace(/^(?:vaccination\s*[:–-]\s*)+/i,'').trim();
  const inferred=vaccineIdFromReason(detail);
  const name=id==='vet-review' && detail ? (inferred==='vet-review' ? detail : !inferred ? `${choice.name}: ${detail}` : choice.name) : choice.name;
  return `Vaccination: ${name}`;
}
export function vaccinePrice(id, catalog=[]) {
  const choice=VACCINE_CHOICES.find(c=>c.id===id);
  const item=choice?.catalogId && catalog.find(p=>p.id===choice.catalogId);
  return item && Number.isFinite(item.price) && item.price>0 ? item.price : null;
}
export const phpPrice=value=>new Intl.NumberFormat('en-PH',{style:'currency',currency:'PHP'}).format(value);
export const vaccinePriceLabel=(id,catalog)=>vaccinePrice(id,catalog)===null ? 'Price to be confirmed by the clinic' : `${phpPrice(vaccinePrice(id,catalog))} estimated vaccine price`;

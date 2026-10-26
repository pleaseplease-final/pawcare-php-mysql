const PREFIX = 'pawcare_soap_draft_v1:';
export const soapDraftKey = (userId, visitId, petId) => PREFIX + [userId, visitId, petId].map(encodeURIComponent).join(':');

export function readSoapDraft(storage, key, initialForm) {
  const raw = storage.getItem(key);
  if (!raw) return null;
  const draft = JSON.parse(raw);
  if(draft.form && draft.form.dewormingManual===undefined && initialForm.dewormingManual!==undefined) draft.form.dewormingManual=!!draft.form.intervalDays;
  if(draft.form && draft.form.vaccineManual===undefined && initialForm.vaccineManual!==undefined) draft.form.vaccineManual=!!draft.form.intervalDays;
  if(draft.form)for(const key of ['manufacturer','serialNumber','microchipNumber','microchipDate','visitAnswers','dewormingManual','vaccineManual','procedureType','procedureDecision','procedureNotes','dewormingWeaned','dewormingMonthlyRisk','dewormingProductId','symptomStart','carePlanChoice'])if(draft.form[key]===undefined && initialForm[key]!==undefined)draft.form[key]=initialForm[key];
  if (draft.form?.visitAnswers != null && (typeof draft.form.visitAnswers !== 'object' || Array.isArray(draft.form.visitAnswers) || Object.values(draft.form.visitAnswers).some(value=>typeof value!=='string'))) throw new Error('Invalid visit answers.');
  if (draft.version !== 1 || !Number.isFinite(draft.savedAt)
      || !draft.expectedVisit || !draft.consultationId || !draft.vaccinationId
      || !draft.form || !Object.entries(initialForm).every(([field, value]) => typeof draft.form[field] === typeof value)
      || !Array.isArray(draft.prescriptionItems) || !draft.prescriptionItems.every(p => p && typeof p.catalogId === 'string' && typeof p.name === 'string' && typeof p.price === 'number' && typeof p.instructions === 'string')
      || !Array.isArray(draft.performedServices) || !draft.performedServices.every(id => typeof id === 'string')) {
    throw new Error('This saved draft is unreadable.');
  }
  return draft;
}

export function writeSoapDraft(storage, key, draft, now = Date.now()) {
  storage.setItem(key, JSON.stringify({...draft, version:1, savedAt:now}));
}

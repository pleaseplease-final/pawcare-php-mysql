// Surgery and dental procedures are not offered by the clinic, so visits no longer record a procedure decision.
// These exports stay as no-ops so older saved forms and imports keep working.
export const PROCEDURE_TYPES = [];
export const PROCEDURE_DECISIONS = {};
export const PRE_OP_TEMPLATE = '';
export const procedureRequired = () => false;
export const procedureNote = () => '';
export const procedureErrors = () => ({});

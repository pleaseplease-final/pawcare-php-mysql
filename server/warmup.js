// Runs the one-time schema checks the clinic data request needs. Each check remembers that it
// finished, so doing them early (while someone is still on the login page) removes that wait
// from the first screen they see after signing in.
import {ensurePetRegistrationSchema} from './petRegistration.js';
import {ensureAppointmentApprovalSchema} from './appointmentApproval.js';
import {ensureVitalsSchema} from './vitals.js';
import {ensureCareSchema} from './careWorkflow.js';
import {ensurePrescriptionSchema} from './prescriptions.js';
import {ensureAdmissionsSchema} from './admissions.js';

let warming;
export function warmClinicSchemas() {
  return warming ||= (async () => {
    await ensurePetRegistrationSchema();
    await ensureAppointmentApprovalSchema();
    await ensureVitalsSchema();
    await ensureCareSchema();
    await ensurePrescriptionSchema();
    await ensureAdmissionsSchema();
  })().catch(error => { warming = undefined; throw error; });
}

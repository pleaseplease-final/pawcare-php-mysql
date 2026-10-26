# Clinic workflow rollout

## Existing database: migrate without demo seeding

Use Node 24+, installed production dependencies, and a database migration role
with DDL permissions. `DATABASE_URL` must be supplied privately by the hosting
platform or shell. Never put it in source control, screenshots, or logs.

1. Back up the target database and confirm a restore works on an isolated copy.
2. Pause clinic writes and reminder jobs during migration. The batch takes table
   locks; its advisory lock serializes this runner's retries, not old app instances.
3. Restore the backup to an isolated staging database. Run:

   ```sh
   npm run db:migrate:check
   npm run db:migrate
   npm run db:migrate
   ```

   The check executes pending DDL/backfills and rolls the transaction back. The
   first apply commits; the second reuses the saved ledger. Check mode can still
   take locks, so use staging first. No account, patient, or appointment demo
   fixtures are seeded. The whole pending batch and its ledger commit together;
   failures roll them back. Each statement has a 120-second limit and lock waits
   have a 10-second limit. A large production copy may require a separately
   planned migration window; test its actual size before production.
4. Compare patient/appointment IDs, consultation and vaccination contents, and
   admission/medicine/discharge records before and after. Verify row counts and
   relationships, allowing documented additive backfills for pending patients,
   registration reports, and measured vitals. Available legacy intake snapshots
   are retained; temperatures overwritten before history existed are unrecoverable.
   Original unknown timestamps and staff attribution remain unknown.
5. Run the check and apply against production with the same release and migration
   role after staging succeeds. Do **not** use `npm run db:init` on an existing
   clinic: that initializer seeds synthetic users and records.

The runner uses `pawcare_deployment_migrations` to record SHA-256 hashes. Existing
`pawcare_schema_migrations` markers are adopted without replaying already applied
backfills or legacy views. An applied file whose hash changes aborts the batch;
add a new migration for future changes. Keep these ledgers in database backups.
A failed apply leaves the prior schema/data in place. After a successful apply,
roll back application code only if compatible; database reversal requires the
verified backup/restore procedure, not deleting preserved medical records.

## Vaccination cards and clinical records

The standard vaccination card includes saved pet and owner details, actual
vaccinations and deworming, visit weights and recorded veterinarian credentials.
Cards and PDFs do not require payment or an Official Document Details setup.
The old certification/publication prerequisite has been removed. Do not configure
invented clinic credentials or use payment as proof that treatment was given.
Planned protocols and unverified external references are separate from administered
doses. A dose belongs to a clinical visit only when its saved visit/record link
identifies that visit; matching patient and date alone is insufficient.

Clinical completion, payment, discharge approval and actual release are separate
saved events. An admitted pet stays under care until the veterinarian approves
discharge. Reception then records payment and confirms actual release.

## Role handoffs

- Online owner: verify account → add pet or link existing clinic records at
  reception → request appointment → combined appointment/pet review → arrival
  and measured intake → assigned veterinarian → checkout → owner history.
- Walk-in: reception selects or registers the owner and patient explicitly →
  reviews arrival/service/vet → saves arrival → records measured intake →
  assigned veterinarian → checkout. Pending registration must be approved first.
- Admissions: veterinarian admits from an active visit → assistant records care
  and owner updates → veterinarian finalizes visit notes and approves discharge
  → reception records payment → reception confirms release.
- Administrator: oversees staff access, calendar, clinical choices, sales and
  audit history. Use the saved record’s next-step guidance to identify the role
  responsible for the next action.

Admission **Finish visit notes** opens the exact assigned visit. **Open this
visit’s checkout** opens the corresponding receptionist invoice. If a visit has
changed or is outside the role’s scope, refresh and review the current state.
Earlier unfinished visits remain visible in the vet queue with their original
date and a separate count. Clinical triage priority is preserved.

Historical reports require complete, fresh history. **Load all history** follows
saved pages sequentially, displays progress and stops on an error; retry explicitly.
Exports remain blocked until loading completes. Form close/Escape/backdrop actions
ask before discarding unsaved booking, arrival, intake and checkout changes;
clinical notes retain their existing draft recovery. Review dialogs must be
confirmed before a write starts.

## Hosting

For the repository's existing Vercel configuration:

- Set the target project's private `DATABASE_URL`, trusted HTTPS `APP_URL`, and
  `CRON_SECRET`. Retain the existing clinic's provider configuration. Do not
  replace it with local test values. Email/SMS delivery requires separately
  configured providers; these workflow checks send no provider messages.
- Build with `npm run build`, output `dist`. `vercel.json` routes `/api/*` to
  `api/index.js`, includes the PDF font and server/shared source files, and
  configures the reminder cron. Preserve those function assets.
- Apply the reviewed database migration before enabling the new release. Use
  the existing deployment pipeline for the intended project/environment.
- Check `/api/health` reports `db: connected`; verify the HTTPS URL, login/session
  restoration, and private document downloads on the actual deployment.
- Restore reminder execution after verifying release readiness. Do not start
  competing reminder workers for the same deployment.

No hosting account/project connection or production database is included in this
checkout. Local checks do not constitute a live deployment or migration of the
clinic's actual records.

## Acceptance checks with isolated synthetic accounts

Use separate owner, other-owner, assistant, veterinarian and administrator
sessions against a real database. Verify:

- Combined approval rollback, duplicate clicks, slot conflicts and preserved
  patient identity after cancellation/rejection.
- Assistant/veterinarian intake; every weight and temperature measurement,
  linked corrections, recording staff, units and timestamps.
- Owner registration weights remain distinguishable from clinic measurements.
- Standard cards and PDFs remain available independently of payment. Saving
  payment records a receipt; it does not certify that treatment was given.
- Standard card PDFs include the pet, owner, actual vaccinations/deworming,
  visit weights and recorded veterinarian details. Filters and visible-page
  limits do not truncate the export; planned doses and SOAP stay outside the card.
- Admission care, notes and medicine events persist through veterinarian discharge
  approval, payment and separate release confirmation. Payment leaves the patient
  **Ready for discharge**. Owner documents exclude private admission observations.
- A different owner cannot access patient JSON, vitals, admissions or PDFs. Check
  unauthorized responses and browser reload/session restoration.

Local automated suites and a synthetic full-app rehearsal cover these boundaries.
Run the same checks on staging using the actual deployment configuration before
publishing to the clinic. A production-like backup rehearsal and live checks remain
necessary when real data and hosting access become available.

### Reception review and previous-clinic references

The front-desk request inbox is the primary approval path for booked patients. Open **View request details** and review the submitted pet details, owner contact, symptoms and requested slot. Approval still verifies registration and confirms the booking in one transaction. Each additional pet follows the same process. Registrations with a pending booking appear in that booking review; the standalone registration inbox contains pets without a pending visit. Past unresolved requests remain visible for rescheduling or rejection. Confirmed upcoming visits remain visible with the nearest date first.

Owners can provide previous-clinic vaccination names and notes during registration and update reference details from a verified pet's profile. These are unverified owner reports, separate from administered vaccinations and approved booster dates. Reference edits are versioned and audited. Legacy external-guide rows retain their IDs and stored content while the card/PDF labels them as unverified references with unknown administration dates.

Veterinarians select an admission reason (or describe Other), review/edit the provided care and monitoring templates, and confirm the patient-specific plan. The assistant records actual owner consent and emergency-contact details in the admission care record. Consent is an authorization received by staff, not a fabricated electronic signature. A newly created admission shows the pending assistant task; historical consent remains retained. Existing authorized clinical API clients can still submit consent they actually received. Vet discharge approval, saved payment and separate confirmed release remain distinct.

New consultations default to today in Manila. Historical dates require a saved explanation and cannot precede the linked appointment or the patient's birth. Existing historical medical records are preserved. Apply the additive `patient-reference-history` migration using the migration commands above before rollout; it preserves existing IDs and adds reference storage/audit and consultation backdating metadata.

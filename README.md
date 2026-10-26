# PawCare – Veterinary Clinic & Pet Vaccination Daily Hub (React UI)

Front-end only. Data lives in memory (`SEED` in `src/lib.jsx`) and resets on refresh.

    npm install
    npm run dev

## Demo accounts
| Role | Username | Password |
|---|---|---|
| Clinic Administrator | admin | Admin123 |
| Veterinarian | vet | Vet12345 |
| Vet Assistant | assistant | Assist123 |
| Pet Owner | owner | Owner123 |

## Structure
- `src/pages/Landing.jsx`, `src/pages/Login.jsx` – public pages
- `src/roles/` – one file per role: its own menu, dashboard and theme
- `src/Portal.jsx` – shared sidebar/header shell; `src/EntityPage.jsx` – CRUD list + validated form
- `src/lib.jsx` – mock data, validation rules, entity config, shared components

## Connecting a back end later
Replace the `db`/`setDb` state in `src/App.jsx` and the add/edit/delete handlers in `src/EntityPage.jsx` with API calls. Passwords are plain text in the mock data; hash them server-side.

## Permissions (C = create, R = read, U = update, D = delete)
| Section | Admin | Vet | Assistant | Owner |
|---|---|---|---|---|
| User accounts | CRUD | none | none | none |
| Owners | CRUD | R | CRU | none (menu hidden) |
| Pets | CRUD | CRU | CRU | R, own pets only |
| Appointments | CRUD | CRU | CRU | CRU, own pets only |
| Vaccinations | CRUD | CRUD | CRU | R, own pets only |
| Consultations | R | CRUD | R | R, own pets only |
| Reports | yes | yes | no | no |

Rules live in each entity's `perm` in `src/lib.jsx`. Buttons are hidden in the UI, and `src/EntityPage.jsx` re-checks them on save and delete.

## Account activation

Sign up → verify the email link → enter the SMS OTP → log in with your password.
Email links open the OTP screen directly. Verification sessions cannot open the
portal; completing OTP clears them and returns to login. Reloading the OTP screen
resumes the same account's pending verification.

Run `npm run test:auth` with Node.js 24+ for the HTTP authentication regression
checks. Tests isolate database and message delivery dependencies with Node's
experimental module mocking; they do not send real email/SMS or use a live database.

## Persistent account settings

Signed-in owners, assistants, veterinarians and administrators use
`/api/auth/profile` for their own registration details and profile photo.
Photo and contact saves require the active verified session; a server failure
is shown instead of reporting a temporary browser-only save. Photos are resized
in the browser and stored in PostgreSQL's `account_photos` table. The table is
included in `server/database/schema.sql` and created on first profile use for
existing databases (the application database role needs CREATE permission).
`/api/auth/password` verifies the current password, saves a bcrypt hash and
revokes other login sessions while keeping the current session signed in.

Run `npm run test:account` for account settings and isolation regression checks.

### Clinic access and durable saves

Clinic APIs require a verified session (the `sid` cookie or Bearer token). Owners receive only their own patient data; veterinarians receive their assigned appointments and those patients’ histories. Reception handles registration, intake, scheduling and payment. Administrators have read-only clinical oversight; staff invitations remain administrator-only. Clinical finalization requires an assigned visit in consultation and commits the note, optional vaccine and visit completion together.

The application no longer uses demo/in-memory saves when the API fails. A failed request leaves the form open for correction/retry. The legacy instant-approval `/api/owner/pets` route is retired: use pending pet registration requests. Account edits use `/api/auth/profile/contact`. Client-supplied audit identities and manual audit-log inserts are not accepted.

For existing databases, apply the idempotent checkout `ALTER TABLE appointments` block at the end of `server/database/schema.sql` before deployment (do not rerun demo seeding on a live database). Checkout also initializes these missing columns on first use and therefore requires `ALTER` permission if the migration was not applied. Checkout stores the discount, payment reference, cash received and change in `payment_details`; entering a reference records staff confirmation and does not independently verify a provider transfer.

Run clinic regressions with `npm run test:clinic`.

### Booking availability and vaccination automation

Apply `server/database/scheduling.sql` once to existing databases (after
`schema.sql`), using the database migration role. `npm run db:init` includes it
for new local databases. Booking/reminder endpoints also attempt the same
idempotent migration; a runtime role without DDL permissions requires the
migration to be applied first. It adds service, duration, arrival type and notes,
plus the persisted reminder queue and worker health table. No appointments or
vaccination dates are rewritten by this migration.

Bookings use **Asia/Manila**, 08:00–17:00, 30-minute start intervals, the existing
Philippine holiday closure calendar, and a rolling **90-day** window. Service
lengths are in `src/booking.js`: vaccination/deworming 30 minutes, consultation
and grooming 60, surgery/dental assessment 120. Reception confirms procedural
preparation and suitability. Both booking forms request the server's open times;
owners receive slot strings only. Server transactions serialize reservation
checks and writes, including edits, to reject overlapping visits and duplicate
pet/day bookings. Legacy AM/PM times remain supported and legacy visits without
service metadata occupy 30 minutes. Unknown legacy time formats close availability
for that day until reception corrects them. Walk-ins are reception arrivals with
measured intake afterward; they enter the queue without reserving a future slot.
Pet approval no longer silently reserves a fixed doctor/time. Annual one-off
holiday dates still need maintenance in the shared holiday table.

The reminder worker uses the **latest administered, veterinarian-certified dose**
for each pet/vaccine family. Uncertified protocol suggestions do not trigger
messages. A newer dose replaces the older recall schedule, including when the
new dose has no next date. Milestones are **30, 14 and 3 days** before the approved
booster date, at **09:00 Manila**, by email and TextBee SMS. Future jobs are stored
in PostgreSQL with unique milestone/channel keys. Missed runs catch up within
the current milestone window; a milestone before the record existed is not sent
retroactively. Old pending jobs expire at the next milestone or due date.

For a persistent Node deployment, supervise `npm run reminders:worker` separately
from the web process. It checks every five minutes; `npm run reminders:once`
performs one bounded batch. For Vercel, the included daily 01:00 UTC cron calls
`GET /api/jobs/vaccination-reminders`; set a long random **CRON_SECRET** in Vercel
so its `Authorization: Bearer ...` header can be verified. Calls without it are
rejected. For faster retry recovery or larger queues, use an authenticated
external scheduler every five minutes (or increase the Vercel cron frequency on
a plan that supports it). Each invocation handles up to 500 messages within a
four-minute processing budget; monitor backlog and invoke again when needed.
The Vercel API function permits a 300-second duration.

Configure email with `BREVO_API_KEY` + `BREVO_SENDER_EMAIL`, or `SMTP_HOST`,
`SMTP_PORT`, `SMTP_USER`, `SMTP_PASS` (port465 uses TLS). Configure SMS with
`TEXTBEE_API_KEY` (or `TEXTBEE_KEY`) + `TEXTBEE_DEVICE_ID`. Reminder sends never
count the development outbox as success. Known rejections retry with exponential
backoff (15, 30, 60, 120 minutes; maximum five attempts) on subsequent worker
runs. Timeouts, server errors and interrupted sends are marked **uncertain** and
require checking provider history before further contact; the providers do not
supply a shared idempotency guarantee. **Accepted** means the provider accepted
the request, not confirmed handset/inbox delivery. The front desk's automatic
reminder panel shows missing setup, stale workers, backlog, failures and uncertain
submissions. A missing completed run or a run older than 26 hours needs checking;
this window accommodates both the daily scheduler and the five-minute worker.
Provider configuration is shown separately from processing activity. A failed
status refresh labels the retained counts as out of date. Contact the owner after checking the provider when manual follow-up
is needed. Owner contact edits are picked up at dispatch time.

Validation (no live provider messages):

```bash
npm run test:clinic
npm run test:scheduling
TEST_DATABASE_URL=postgres://postgres:postgres@localhost:5432/pawcare npm run test:scheduling:postgres
npm run build
```

The PostgreSQL integration test requires a disposable local database and permission
to create/drop an isolated test schema. It checks concurrent reservations,
reminder claims, milestone creation, retries, supersession and crash recovery;
provider delivery is replaced with synthetic adapters.

### Durable consultation checkout

Apply `server/database/checkout-inbox.sql` to existing databases after
`schema.sql`, using the migration role. `npm run db:init` includes it for new
databases. Checkout endpoints also attempt this idempotent migration; apply it
before deployment when the runtime database role cannot run DDL.

Finalizing a consultation creates its reception task in the same transaction.
The front desk inbox recovers unpaid completed visits from earlier dates and
persists them across refreshes. Front Desk and today’s Daily Sales share this
inbox for every visit type. Waiting visits open a new transaction with the patient
and saved charges loaded, including on the first page load, when reception is
idle; an open profile, intake form, invoice or receipt is kept on screen. Tasks
arriving during that work wait until the form closes. The inbox refreshes every
three seconds and shows failures with a retry action. No separate worker is
needed for checkout. Historical Daily Sales dates remain reports.

Opening an unpaid invoice reserves it for that receptionist and browser window
for five minutes, renewed every minute while open. Other receptionists can see
who is handling it. Closing releases the reservation; a disconnected or crashed
window recovers through expiry. A lost claim disables payment and offers retry
without clearing invoice entries. Payment and task completion commit together;
failed payments keep the invoice open and do not issue a receipt. Only assistants
can claim tasks or record payments. Existing payment integrations without a claim
remain supported when no active reservation exists; they cannot override one.

The PostgreSQL integration suite above also verifies checkout rollback,
prior-day recovery, competing receptionists, claim renewal/release/expiry,
failed-payment recovery and payment/task atomicity.

### Pet registration review and correction

Apply `server/database/pet-registration.sql` after `schema.sql` before deploying
with a runtime database role that cannot run DDL. `npm run db:init` includes it;
state/registration endpoints also attempt the idempotent migration. It adds
request photos, dental details and a review revision, and preserves dental
details on the approved pet. Existing requests start at revision zero.

Owners submit required pet details for reception review. The server validates
real birth dates before today (Asia/Manila, within 40 years), species, sex,
spay/neuter status, weight 0.05–120 kg with up to two decimal places, text lengths,
and bounded JPG/PNG/WEBP data. Photos chosen in the form are resized before
submission and remain with the approved pet. The same image checks apply to
later pet-picture changes. Registration weight/dental details are owner reports;
they do not replace measured clinical intake or a veterinarian examination.

Corrections use `PUT /api/pet-requests/:id` and return the same request to Pending;
resending a declined request clears its decline reason. The owner can hold up
to 10 pets/requests and up to 3 pending requests. Name and capacity checks serialize
per owner to prevent simultaneous submissions bypassing the limits. Owners can
withdraw pending/declined requests; approved patients remain clinic records.

Edits, approval and decline must include the latest integer `revision` from
state or the previous response. This tightens the earlier unversioned review
API: older clients must reload/use the updated form. A stale review returns 409
and requires reopening the request. Failed saves retain form entries. Creation,
correction, withdrawal and review audit writes commit with the related data;
failed approval never leaves a patient or vaccination schedule behind. Approval
preserves the existing rule that no appointment is reserved automatically.

Validate against a disposable local database (no provider messages):

```bash
TEST_DATABASE_URL=postgres://postgres:postgres@localhost:5432/pawcare npm run test:registration:postgres
```

### Administrator governance

The administrator portal uses real account records for staff access and account
counts. Its overview guides review of locked staff, visits assigned to inactive
doctors, unfinished arrivals, unpaid completed visits and automatic reminder
exceptions. Reception performs booking, intake and payment; veterinarians author
clinical records. Admin calendar and clinical views remain read-only, and the
sales page provides financial review/printing without collection controls.

Apply `server/database/staff-access.sql` after `schema.sql` before deploying with
a runtime database role that cannot alter tables. `npm run db:init` includes it;
admin endpoints also attempt the idempotent migration. Existing accounts remain
active by default. Deactivation retains historical records and removes doctors
from new booking choices. Reception must reassign affected upcoming visits.

Staff access changes require a reason and the latest integer `revision` from
`GET /api/admin/staff`. Only veterinarian and assistant accounts are eligible;
admin/owner accounts cannot be changed here. Stale actions return 409. Access
changes and their audit entries commit together and revoke existing sessions.
Reactivation preserves account locks and verification requirements; unlocking
clears failed attempts and cooldowns, then requires a fresh sign-in.

Staff invitations permit only the vet/assistant roles. An admin can revoke an
unused invitation or issue a replacement. Invitation creation returns an
admin-only activation link and a delivery status, **not a login token**. Provider
acceptance is not proof of inbox delivery. Development outbox responses report
`not_sent`. Acceptance validates identity/mobile/password, locks and consumes the
invitation once, and creates a restricted OTP session atomically. After mobile
verification, staff sign in again. OTP values are never returned by setup.

The overview shows the latest 100 saved audit entries. System Audit Trail searches
all saved entries with pages of 50, including trusted staff access changes,
invitations and successful verified sign-ins. A sign-in session and its audit
entry commit together. This adds future sign-in history; it cannot reconstruct
older events that were never recorded.

Validate governance against an isolated schema in a disposable local database
(provider adapters are mocked, so no email/SMS is sent):

```bash
TEST_DATABASE_URL=postgres://postgres:postgres@localhost:5432/pawcare npm run test:admin:postgres
```

### Fixed prices and continuity of care

Owners can browse Services & Prices. New invoices require catalog IDs and the
exact official names and unit prices; the server rejects custom or altered lines.
Retail quantities remain available to reception within saved prescription limits.
New payments use no discount; paid historical receipts retain their original amounts. Older unpaid custom invoices
must be rebuilt from the catalog before payment.

Configure additional fixed products using the server environment variable
`CLINIC_PRODUCTS_JSON`, a JSON array of `{id,name,category,price}`. IDs must start
with `product_` and contain lowercase letters, digits or underscores. Categories
are `Pet shampoo`, `Pet vitamins`, `Pet medicine`, `Pet accessories`,
`Prescription diet`, and `Dental & ear care`.
Prices must be positive PHP amounts with at most two decimals. Use the clinic's
approved product names, sizes and prices; none are invented by the application.
The built-in catalog contains all 31 products from the supplied Vet Clinic Product
Selection Guide (pages 1–4), using its listed estimated amounts as fixed clinic
prices per the requested pricing policy. An absent array adds no extra products;
invalid configuration or IDs colliding with built-in products fail closed. Restart
the API after configuration changes. The same catalog serves owners and checkout.

Apply `server/database/care-workflow.sql` to existing databases before deployment.
New database initialization includes it; endpoints also initialize it when DDL
permission is available. Follow-up/recheck status, target date and instructions
commit with the consultation. Owners and reception see follow-up cards; booking
still uses available slots and clinic confirmation. A target date is not a reserved
appointment or an automatic SMS reminder.

Veterinarians manage vaccination cards from their menu and certify doses through
SOAP finalization. Reception retains registration, read-only card access and
reminder coordination. Owner booking derives its reason from the selected service;
optional notes retain symptoms and special requests.

An assigned veterinarian can hand an active arrival to another active veterinarian
with required instructions. Transfer, note and audit commit together, returning
the visit to Checked-in for the receiving vet. The recipient sees the patient
history and timestamped handoff chain; the former vet loses visit access unless
another assignment still grants patient-history access. Handoffs move an existing
arrival into the receiving queue; they do not reserve another appointment slot.

Regression checks: `node --test server/tests/care-workflow.test.js`,
`npm run test:clinic`, `npm run test:scheduling`, and the PostgreSQL scheduling
suite, which includes handoff and care-plan persistence tests.


### Structured prescriptions and automatic billing

Apply `server/database/prescriptions.sql` after `schema.sql` on existing databases.
`npm run db:init` includes it; state, consultation and checkout endpoints also
initialize it when DDL permission is available. No old prescriptions or receipts
are rewritten. Legacy prescription text remains readable; new billing of medicines
or prescription diets requires a structured product order for that visit.

The assigned veterinarian selects catalog products in the SOAP prescription
builder, enters directions and confirms a whole item/package supply quantity.
The builder shows directions, a whole quantity, product total, and Remove.
It does not ask the veterinarian to calculate course supply. Valid calculations
in older browser drafts are converted to editable directions and quantity;
unfinished calculations require manual completion. The legacy API still accepts
structured dose calculations for compatibility. This replaces the former generic dose presets
and their fallback 5 kg weight. Product forms grouped in the PDF (tablets/drops,
liquid/capsules, wet/kibble, etc.) still need confirmation against the actual
product dispensed. The guide supplies no antibiotic/painkiller/dewormer prices
or drug strength/package data, so no such entries are invented.

Additional home-care or external-prescription text is saved without a clinic
charge. Selected products, canonical prices, directions and quantities are saved
as a structured prescription. The prescription, generated text, invoice products,
visit completion and checkout task commit in one transaction. Checkout claims
return the persisted invoice directly, avoiding dependence on browser polling.
The owner history and printed EMR/Rx use the generated prescription text.

Reception confirms products actually dispensed, can reduce/remove prescription product invoice items,
and can add services and retail products at fixed catalog prices. The signed
prescription stays intact. Pet medicines, existing catalog antiparasitic tablets,
and prescription diets require a structured order on the same visit; the server
rejects unprescribed products and total quantities above the ordered supply,
including quantities split across duplicate invoice lines. This enforces the
provided guide's medicine/diet dispensing process. Dose/unit choices remain the
veterinarian's responsibility. Inventory counts and stock deductions are not
implemented by this workflow.

Checks: `node --test server/tests/care-workflow.test.js server/tests/prescriptions.test.js`,
`npm run test:clinic`, `npm run test:scheduling:postgres` with a disposable local
database, and `npm run build`.

### Confirmed services, booster schedules and linked follow-ups

Apply the updated `server/database/care-workflow.sql` after `schema.sql` on existing databases. It adds `consultations.performed_services` and `appointments.follow_up_id`, with a unique index allowing one booked/completed visit per request. Existing care plans remain individual requests; no historical appointment links are guessed. `npm run db:init` and the affected endpoints initialize these fields when DDL permission is available.

Veterinarians confirm performed services in SOAP. Confirmed services and mapped administered vaccines are added once to the same transaction as the prescription, finalized visit and checkout task. Reception retains each confirmed service at quantity one; the server rejects removal or duplication at payment. Product dispensing quantities retain the existing prescription controls. Unsupported vaccine types remain recordable with a visible notice that no configured vaccine price was added; no price is invented.

The former SOAP booster helper used today's date and assumed an annual interval for unknown vaccines. SOAP now requires the actual dose number/series length, an explicit interval, and veterinarian approval after reviewing the patient's birth date, species, prior doses and product. It calculates the due date from the administration date. Changing the date, product identity, dose or interval clears the approval. The server validates the calculation and saves the dose numbers, vet and approved interval. This intentionally requires updated clients to supply approval and dose information. Suggested registration protocols still do not generate reminders until administration is certified by a vet.

Each consultation care plan remains visible even after later routine consultations. Owners and reception explicitly select its request when booking; pet/ownership checks and a database constraint prevent cross-pet links and duplicate bookings. Rescheduling retains the link; cancellation/no-show returns the request to Needs booking. Only completion of its linked visit marks it Completed. The linked instructions appear in the veterinarian's SOAP form.

Additional checks: `node --test server/tests/clinical-process.test.js`; the PostgreSQL scheduling suite covers booking races, cancellation/rebooking, charge retention and approved booster dates.

### Owner booster continuity

Owner dashboard, vaccination card and appointment calendar use the same latest
vet-certified booster schedule as reception and reminders (`currentVaccinationDue`).
A completed dose can still have an upcoming booster. Newer certifications supersede
older recall dates, including when no next date is set; historical doses remain
readable. Uncertified suggestions are labelled for vet review and do not appear as
given doses or approved recalls. Vaccine booking preserves the approved due date
separately from the selected visit date, clamps overdue requests to today, and asks
for a date when the due date exceeds the 90-day booking window. A due date does not
reserve a slot. Only active visits explicitly naming the same vaccine family are
shown as matching appointments; unrelated same-day visits are not labelled booked.

Check: `node --test tests/owner-vaccination.test.js` and `npm run build`.

### Owner visit summaries and follow-up actions

Visit History opens with one click or its accessible View visit button. Owners
can filter by follow-up booking status and read prescribed products, the vet's
saved directions and prescribed supply alongside the unchanged full prescription
and home-care text. Prescribed supply is not presented as confirmed dispensing.
Vet names come from the clinic directory; missing names are not replaced with
sample identities. Details refresh from the current owner-scoped record.

Each follow-up action retains its consultation ID and pet. Unrelated visits do
not fulfill the request; cancelled/no-show linked visits allow rebooking, while
completed linked visits remain completed. Booking carries the exact request into
the form and displays its saved instructions and target date. The appointment
date is adjusted to the current booking window; the clinical target is unchanged.
The target date does not reserve an appointment or trigger a new reminder.

Checks: `node --test tests/owner-care.test.js` and `npm run build`.

### Owner bills and payment records

Owners can open Bills & Payments from their menu/dashboard or read the same saved
charges in appointment details and linked visit history. The view is read-only;
reception retains checkout and payment recording. Scheduled visits do not produce
a bill from the booking amount default. Saved unpaid invoice lines are labelled
as drafts awaiting reception confirmation; a completed visit without lines shows
Awaiting checkout without inventing a total.

Paid amounts, item prices, discounts, method, reference and payment date come
from the saved appointment. Historical custom lines remain readable and are not
repriced with the current catalog. Older payments without itemization show their
recorded amount and identify the missing breakdown. Inconsistent saved totals
retain the recorded paid amount and ask reception for clarification. The page
shows visit references, not newly issued receipt numbers or online payment links.

Checks: `node --test tests/owner-billing.test.js` and `npm run build`.

### Owner summaries and assistant intake continuity

Pet profile summaries use the same latest certified booster dates as the card
and reminders. Registration suggestions remain awaiting vet review. An empty
allergy list means no allergies recorded, and weight history identifies its
recorded source without assuming verification. Appointment details follow current
clinic state; failed cancellations retain the reason and allow retry.

Reception uses Philippine clinic dates and times for its queue, walk-ins and
arrival measurements. Editing an already checked-in patient's intake retains
saved measurements, triage, fasting and notes. New arrivals require actual
measurements; adjustment buttons cannot supply invented starting values.
Booster actions prefill the exact patient, service, vaccine and approved due date
in the clinic calendar, with available times still selected by staff. Only an
active appointment for the same vaccine family marks a recall as booked.

### Assistant collections and patient flow

Daily collections and the assistant dashboard use the saved payment timestamp
(`paidAt`) in Asia/Manila. The visit date does not determine when money was
collected. Legacy missing, invalid or time-only payment dates remain visible
in an undated ledger and are excluded from daily totals. Missing amounts are
flagged and excluded without substituting invoice totals. Missing methods are
shown as “Not recorded”; Cash, GCash, Maya, card, other and unrecorded method
totals use separate categories. Historical paid amounts stay unchanged.

Completed visits on the selected visit date remain available for checkout.
Pending charge totals come only from saved invoice lines minus saved discounts,
are labelled drafts, and exclude appointments still awaiting an invoice.
Checkout retains the server-returned payment snapshot, including the timestamp,
so collections update immediately without needing a page reload.

The assistant patient flow separates expected arrivals, patients waiting for
the vet, consultations, completed visits and missed visits. The waiting display
shows recorded Emergency and Priority triage first, then appointment time.
This does not assign clinical treatment or change veterinarian assignments.
Staff follow-up actions retain the exact consultation and pet, use clinic dates
and the booking window, and show the vet's target and instructions in booking.
A target beyond the booking window requires selecting a visit date; it is not
silently changed to today.

Check: `node --test tests/assistant-workflow.test.js`; `npm run build`.

### Assistant registration review

The review screen identifies vaccine protocol dates as suggestions needing vet
review. The official card number appears only after server approval; preview
values do not create a card, certify a dose or reserve an appointment. Approval
and decline retain the server-returned request revision and recorded metadata.
The screen does not invent measurement history or claim email/SMS delivery.
Owners can read decisions and correction instructions in their portal.

Only the pending version the assistant opened can be reviewed. Live request
changes or a server version conflict require closing and reopening the latest
request. Duplicate approval/decline submissions are blocked while saving; other
failures keep the form and decline reason available for retry. Declined request
details remain read-only until the owner corrects and resubmits the request,
following the existing registration contract. Review filters wrap on mobile.

Check: `node --test tests/registration-review.test.js`; `npm run build`.


### Walk-in registration and intake

Reception enters the patient's species, sex, birth date and measured weight;
these fields start blank and follow the same server validation as online pet
registration. Missing optional email/address remain blank. Neutered and dental
status start as unknown or not evaluated. Dental details and the measured weight
are saved with the patient.

The saved card and vaccine rows appear immediately in clinic state. External
history remains a reference guide requiring veterinarian review. Adding today's
arrival opens intake with the exact saved appointment; the arrival remains
Scheduled until reception records current vitals. Duplicate form submissions
are blocked while saving, failures retain entered details, and registration plus
its audit commit together. The printed registration summary provides record
information; it does not grant owner sign-in access.

Checks: `node --test tests/walk-in-registration.test.js server/tests/walk-in-registration.test.js`,
`npm run test:clinic`, `npm run test:registration:postgres` with a disposable
local database, and `npm run build`.


### Existing-patient arrivals

Reception can continue today's saved visit directly from Existing patient
check-in, keeping its assigned veterinarian and reason. Checked-in visits open
the saved intake for review. Visits already in consultation remain with the
veterinarian. Completed, cancelled and missed visits do not prevent a new
arrival; the server still enforces active patient/day uniqueness.

New arrivals require a saved patient/owner and a veterinarian in the current
directory. Saving blocks repeated submissions, keeps the form on failure and
opens measured intake only after the server confirms that patient's appointment.
No new appointment is needed to review an existing arrival.


### Intake changes and concurrent staff work

Intake forms keep a snapshot of the visit they opened. A change to the patient,
veterinarian, date/time, reason, status or saved vitals requires reception to
close the form, refresh clinic records and reopen intake. The server checks
this optional `expectedVisit` snapshot inside the locked status transaction,
so two current intake forms cannot overwrite each other's measurements.
Existing API callers without a snapshot retain their status-transition rules.

The form retains measurements after a failed request and allows retry; a
conflict or unconfirmed success requires reopening. Local patient weight, intake
and the completion callback use the acknowledged server record.
Status changes and their audit entries now commit together. An audit failure
rolls back the status, intake and patient weight; the previous audit helper
silently ignored that failure.

Checks: `node --test tests/intake-visit.test.js`, `npm run test:clinic`,
`npm run test:scheduling:postgres` with a disposable local database, and
`npm run build`.

### Appointment confirmations and status actions

Dashboard, calendar, card and visit-list status actions send the displayed visit
snapshot. The server checks it under the appointment lock before confirming or
starting a consultation, including when only the slot, assigned veterinarian or
intake has changed. Existing role and transition rules still apply.

Repeated actions for one appointment share a pending lock across views using the
same clinic store. Dashboard/calendar confirmation buttons show their pending
state, errors remain visible and failed requests allow retry. Only a matching
server acknowledgment updates local records; an older response cannot replace a
newer local visit. Cards follow the current saved appointment and never replace
a removed patient with another patient's details.

Checks: `node --test tests/appointment-status.test.js`, `npm run test:clinic`,
`npm run test:scheduling:postgres` with a disposable local database, and
`npm run build`.

### Reception reminder call records

The assistant's Log call form records an observed outcome: Reached owner,
No answer, Callback requested or Contact unavailable. Optional notes and the
latest 20 patient call records show the saved staff name, contact snapshot and
Manila date/time. A missing phone allows only Contact unavailable. This form
records calls; automatic email/SMS delivery results remain in the reminder panel.

`POST /api/reminders/log-call` with `logOnly: true` requires an authenticated
assistant and the saved patient, owner, current certified vaccination recall,
booster date and contact snapshot. A stable request UUID makes identical retries
return the original record, including after an uncertain response. Changed
payloads cannot reuse that UUID. The call and its audit entry commit together;
errors retain the form and stale details require refreshing and reopening it.
`GET /api/reminders/calls?petId=...` exposes patient history to assistants and
admins. Owners and veterinarians cannot access this reception endpoint.
Existing dispatch requests without `logOnly` and `/api/reminders/send` retain
their existing behavior.

The `server/database/reminder-calls.sql` schema is included in `npm run db:init`
and is also created on first use. Deployment must include `src/reminderCall.js`
alongside the server files. Checks: `node --test tests/reminder-call.test.js`,
`npm run test:clinic`, `npm run test:scheduling:postgres` with a disposable local
database, and `npm run build`.

### Veterinarian handoff confirmation and continuity

The care-transfer form shows the actual patient and saved intake and sends the
visit snapshot it opened. The server checks that optional `expectedVisit` under
the appointment lock before transferring; changed assignment, status, slot,
reason or intake requires refreshing and reopening the form. Existing callers
without a snapshot retain their original transfer rules. A successful response
now also identifies the saved visit, recipient and handoff instructions.

The form blocks repeated saves, retains instructions on failure and confirms the
actual receiving vet after saving. If the clinic-state refresh fails, the receipt
still confirms the transfer and offers a separate refresh retry. The former vet's
local patient history is removed unless another assignment still grants access,
matching the server scope. Transfer, instructions and audit remain atomic; the
receiving vet's visit returns to Checked-in, without creating another reservation.

Saved handoff history is visible in the receiving vet's SOAP screen as well as
the queue, with Manila timestamps. SOAP history tabs wrap on small screens.
Checks: `node --test tests/vet-handoff.test.js server/tests/care-workflow.test.js`,
`npm run test:clinic`, `npm run test:scheduling`,
`npm run test:scheduling:postgres` with a disposable local database, and
`npm run build`.

### Consultation completion acknowledgment

SOAP keeps the visit snapshot from when it opened, even if a parent view later
refreshes its appointment prop. Changed assignment, status, patient, slot, reason
or intake blocks completion and leaves the entered notes visible. Current clients
send `expectedVisit`; the server checks it under the appointment lock. Older
callers without this optional snapshot retain the original finalization rules.

While saving, form fields and close actions are disabled and repeated submissions
share one pending guard. Failed requests retain the form and reuse its consultation
and vaccination IDs. An uncertain response still requires refreshing clinic
records to check whether completion committed; IDs do not bypass assignment or
completed-visit guards.

The successful response includes the persisted consultation, completed appointment,
certified vaccination and saved weight author. The current UI verifies their
identity before updating records, vaccine cards/recalls, care plans and checkout
state. Both local collection aliases follow these saved values. A late response
cannot restore a removed or reassigned patient. Care plan, vaccine, weight,
completion, checkout task and audit remain one transaction.

Default consultation/follow-up dates use Asia/Manila. Brand and lot remain actual
entered values; the form no longer inserts an unconfirmed subcutaneous-route note.
Checks: `node --test tests/consultation-save.test.js`, `npm run test:clinic`,
`npm run test:scheduling:postgres` with a disposable local database, and
`npm run build`.

### Veterinarian clinical queue

The vet desk separates Waiting, Active and Completed visits. Waiting patients
are ordered by recorded Emergency, Priority, then routine triage, with appointment
date/time breaking ties. Start next uses this same order. Unfinished checked-in
visits remain visible across midnight. Starting care blocks repeated dashboard
submissions while awaiting confirmation and keeps failures visible for retry.

The booster count uses the latest certified dose per patient/vaccine family,
including overdue dates through the next 14 days. Registration suggestions do
not count. Completed visits open the saved consultation for that exact visit in
a read-only view; missing notes prompt a refresh. Incomplete summaries identify
missing clinical fields without assuming normal findings, a diagnosis, a sample
vet, current patient weight, vaccine brand/lot, annual boosters or dispensing.

Checks: `node --test tests/vet-queue.test.js tests/appointment-status.test.js
 tests/consultation-save.test.js tests/owner-vaccination.test.js`,
`npm run test:clinic`, and `npm run build`.

### Shared clinic data loading

All four portals use one session-scoped data sync. The first load shows a loading
state instead of empty lists and zero counts. Failures offer Retry; later refresh
failures retain loaded records with an out-of-date warning. The pending request
is cancelled on session cleanup and times out after 20 seconds. Polling runs
three seconds after each completed request, with no overlapping requests; hidden
and offline tabs pause and resume when visible/online. Initial portal code loads
only for the selected role.

`GET /api/state` keeps its existing JSON envelope and authorization/scope rules.
After successful scoped reads, it sends a response tag. A matching
`If-None-Match` returns 304 with no body. The last response and tag live only in
the current sync session's memory; clinical data is not stored in a browser or
shared HTTP cache (`Cache-Control: private, no-store`). This reduces repeated
record/photo transfers, not the number of authorization or database checks.
The server indexes administered vaccine names once while preserving the existing
rules for hiding superseded suggestions.

Unchanged rows and collections retain their references to avoid unnecessary UI
updates. A refresh started before a locally acknowledged record change cannot
replace that change; the following refresh reconciles the current server state.

Checks: `node --test tests/clinic-loading.test.js server/tests/state-performance.test.js`,
`node --test tests/*.test.js`, `npm run test:clinic`, `npm run test:auth`,
`npm run test:account`, and `npm run build`.

### Vet SOAP field feedback

SOAP now checks all four clinical sections, real nonfuture consultation dates,
optional finite weights greater than 0 and up to 120 kg, prescription-note length,
and real follow-up targets with bounded instructions before sending. Errors appear
beside the fields and retain entered notes. The appended follow-up text counts
toward the server's existing 10,000-character treatment limit. Vaccine dose,
brand/lot, booster approval, stale-visit and duplicate-save guards remain in place.
The server retains final validation and authorization. Missing intake assessments
are labelled as unrecorded instead of assuming normal temperature or ideal weight.

Check: `node --test tests/soap-validation.test.js`; `npm run test:clinic`;
`npm run build`.

### Appointment booking permissions

Owners and reception book visits. Doctors view their assigned schedule and start
care for checked-in patients; they cannot book, reschedule, confirm or cancel
appointments. A doctor can record a clinical follow-up request in SOAP; reception
or the owner selects and books its time slot. These permissions apply to calendar
prefills, patient cards, directory actions and direct API requests.

### Vet calendar and administrative feedback

The vet queue shows assigned patients. Calendar timeline, month/day and list
views share the same patient-care actions: starting care shows pending/error
feedback, active visits resume SOAP, and completed visits open the exact saved,
read-only notes. Booking remains restricted to owners and reception.

Staff and audit refreshes cancel obsolete reads and retain prior results on
errors. Staff polling waits for pending requests; access changes reload the
current revisions. Audit results identify their saved search and do not append
pages from a failed new search. Invitation fields remain fixed while sending,
and the created activation link stays visible while staff lists refresh.

### Reception booking and checkout confirmation

Calendar booking locks the form while saving, keeps failed entries visible with
an inline error, and uses the exact server-confirmed visit. Checkout shows an
initial loading state and retains loaded tasks on a failed refresh; reads do not
overlap and obsolete responses cannot replace newer inbox data.

Cash received is entered by reception and is never filled from a booking amount
or increased when invoice items change. Payment fields lock while saving. A
receipt opens only after the response confirms the same completed visit, paid
amount, itemized invoice and payment details. Server role, claim and invoice
validation remain authoritative. Missing intake assessments are shown as
unrecorded rather than normal.


### Connected visit handoffs

Owner bookings become saved Pending Approval requests. Reception approves them as Scheduled,
records intake and assigns a live veterinarian. Existing-patient walk-ins from
the patient card use the same saved booking and intake flow. A patient joins the
vet queue only after measured intake is saved. Waiting and active visits stay in
reception's queue across midnight.

Reception can use **Reschedule / edit** in the calendar's timeline, month or
list view to change an upcoming Pending Approval/Scheduled visit's doctor or schedule.
Use the list view to find visits assigned to a doctor who is no longer active.
Changes keep the visit ID, owner notes and linked follow-up; changed slots return
to Pending Approval for approval with the owner. Started visits require the
existing clinical handoff process rather than appointment rescheduling.

The assigned vet finalizes saved notes, which completes the visit and creates
reception's checkout task. Reception records payment; the owner sees the saved
notes and receipt. Admin reviews these records, exceptions and audit history.
Booking, cancellation and payment screens require matching server confirmation
before displaying success. Admin and vet accounts cannot book visits.


### Review before submitting

Consequential forms now validate first and open a review card before saving.
The card shows the entered details and the result of confirmation:

| Team | Review cards |
| --- | --- |
| Owner | Booking or appointment changes; new or corrected pet registration requests |
| Reception | Bookings and reassignment; walk-in arrivals; new patient/card registration; measured intake; invoice and received payment |
| Veterinarian | Final clinical notes, prescribed supplies, performed services, vaccine/booster details and follow-up; care transfer recipient and instructions |
| Administrator | Staff invitation recipient and access role |

**Back to edit** or Escape keeps the original form and entered values. The final
button names the actual action (for example **Confirm payment** or **Finalize
visit**). No save request starts before confirmation; repeated confirmation
cannot send duplicate requests. A changed form or relevant live clinic record
invalidates an open review and requires a fresh review. Existing cancellation,
registration approval/decline and staff-access decision screens remain the final
confirmation for those actions. Routine sign-in, search and filtering do not
require another confirmation card.

The review dialog traps keyboard focus, starts on Back to edit, scrolls for long
clinical notes and uses a stacked layout on small screens. After confirmation,
the existing pending/error/server-acknowledgment behavior still applies.

### Scheduled-day arrival validation

Reception can initially check in a Scheduled visit only on its saved appointment date, using the clinic date in Asia/Manila. Same-day early arrival is allowed. If a patient arrives on another day, use **Reschedule / edit** in the calendar to reschedule before check-in. Status changes cannot rewrite the date/time or convert a reservation into a walk-in; new walk-ins use the existing arrival workflow. The API validates the locked saved appointment, so sending today's date cannot bypass this rule.

Already Checked-in patients can have vitals remeasured and continue care after midnight without changing their original visit date or time.

### P1 validation repairs

Standalone `POST /vaccinations` is retired (410 for vets): certify doses through the assigned encounter's SOAP finalization, which validates the administered date, brand/lot, approved interval, dose series, canonical card and clinical charges in one transaction. `POST /owners` and `POST /pets` are retired (410 for reception): use reviewed in-clinic registration (`/walk-in`) or owner registration requests. Generic reception Add Owner/Add Pet opens that registration form. Existing clients calling the retired endpoints must move to these workflows.

The weight endpoint accepts measured numeric weights of 0.05–120 kg with at most two decimals and real dates from the patient's birth through today's Manila date. Recorder identity comes from the session; measurement, current-weight update and audit commit together. Adding older history does not replace a newer current measurement.

Apply `server/database/contact-changes.sql` before deployment when the runtime role cannot create tables. `db:init` includes it; account contact routes otherwise initialize it on first use. Address-only changes save immediately. Email/mobile changes now create a pending proposal and send separate six-digit codes to the changed destinations. The old contacts remain active until every required code is verified. Proposals expire after ten minutes, allow five attempts, and can be replaced after one minute. Codes are stored as scoped hashes; API responses never expose them. Unconfirmed/dev-outbox delivery cannot authorize a change. Successful verification atomically updates the account, owner contact and address, consumes the proposal, audits the change and revokes other sessions. The current session remains available. Pending codes do not survive a replacement or successful save. Provider delivery still depends on configured email/SMS services.

### Password recovery and trusted deployment URL

Forgot password uses the registered, verified email address for every role.
Codes expire after ten minutes, allow five attempts and can be requested once
per minute. Limits persist in PostgreSQL for both known and unknown emails;
responses do not disclose account existence or codes. Only confirmed provider
acceptance enables a code; development outbox messages cannot authorize resets.
A successful reset preserves account role/verification, clears login lockout,
revokes all sessions and requires a new login. Changed email/password or inactive
accounts invalidate older recovery codes. Password, code consumption, session
revocation and audit save atomically. In-flight sign-ins serialize with resets.

Apply `server/database/password-recovery.sql` before deployment when the runtime
role cannot create tables. `npm run db:init` includes it; otherwise recovery
initializes it on first use. Provider delivery needs the existing email setup.

Set **APP_URL** to the clinic's canonical HTTPS origin in production. SITE_URL or
Vercel deployment configuration is used only when APP_URL is absent. Verification
and staff-invitation links never use Origin, Referer, Host or forwarded headers.
Browser API requests must match the configured origin; external origins receive
403. Server clients without an Origin header remain supported. Local development
defaults to `http://localhost:5173`; production requires HTTPS and sends Secure,
HttpOnly, SameSite=Lax session cookies. Align preview environment APP_URL with its
actual frontend origin; an arbitrary request cannot add an allowed origin.

### Deactivating a veterinarian with active patients

An administrator cannot deactivate a veterinarian who still has Checked-in or
In consultation visits, including prior-day patients. The assigned veterinarian
must hand those visits to another active veterinarian first. Upcoming bookings
remain reception's responsibility to reassign. Access changes, arrival and
handoff serialize so simultaneous requests cannot strand a newly arrived patient
with an inactive vet. A blocked deactivation retains access, sessions and records.
For patients already assigned to an inactive vet, reactivate that vet, complete
the clinical handoff, then deactivate after transfer. No new administrative
authority over clinical notes or transfers is granted.

Checks: `npm run test:origin`, `npm run test:auth`, `npm run test:clinic`,
`TEST_DATABASE_URL=<disposable-local-db> npm run test:recovery:postgres`,
`npm run test:admin:postgres` and `npm run test:scheduling:postgres` with the same
local database setting, plus `npm run build`.

### Verification delivery, clinic date and history loading

Apply `server/database/verification-delivery.sql` and
`server/database/state-read-indexes.sql` before deployment (both are included in
`npm run db:init`). Verification routes can initialize their migration when the
runtime role allows DDL. State indexes are installed by the initializer.

New email/mobile verification tokens start unconfirmed, are bound to the saved
contact, and become usable only after the provider confirms acceptance. This is
not proof of inbox/handset delivery. Development outbox, missing/failed provider
responses and exceptions report unavailable delivery. A failed signup delivery
still returns the saved account and a retry instruction. Durable per-account,
per-channel 60-second resend limits survive refresh, token exhaustion and failed
delivery; OTP verification allows three atomic attempts. Completing mobile
verification still revokes setup sessions and requires a fresh password login.
Pending tokens issued before this migration have unknown delivery status and
must be resent; already verified accounts keep their verification.

Clinic dates use Asia/Manila. Mounted portal screens update at midnight and on
focus/visibility restoration. Views following today advance; explicitly selected
historical dates and unsaved form values are preserved. Date-only preventive
schedule calculations do not depend on the browser timezone.

The UI polls `/api/state/summary`, keeping current/future visits, overnight active
care, unpaid completed visits, today's collections and linked saved notes (including backdated notes), unresolved followups,
current vaccine recalls and latest weights. Dashboard totals are computed over
the complete authorized scope. Owner summaries also include their five most recent
paid transactions. Other older notes, settled visits, dose details and weight
histories are not fetched on each poll. Legacy `/api/state` retains
its complete response contract for existing callers.

`/api/state/history` reads up to 50 primary records per collection per page,
ordered by `(date DESC, id DESC)` with a continuation cursor rather than OFFSET.
It also includes the linked appointments (at most 50) needed to read a page's
saved notes/vitals. Optional `petId` filtering retains the same owner/vet scope;
cursors never grant access. History is held only in the current authenticated
portal's memory. The UI loads the first batch on history screens and further
batches on demand, indicates partial searches, preserves earlier pages on errors,
and marks loaded history stale after summary changes. Complete report/card
printing and historical sales totals require all history batches to be loaded.
Refresh history to see a new consistent traversal after records change. Current
summary records take precedence over older loaded copies, and records for pets
leaving the authenticated scope are removed.

Validation commands:

```sh
npm run test:auth
npm run test:clinic
npm run test:dates
node --test tests/clinic-loading.test.js
TEST_DATABASE_URL=postgresql://localhost/disposable_test_database npm run test:system:postgres
npm run build
```

Database tests accept only a local disposable PostgreSQL endpoint and mock email
and SMS delivery; they never verify production delivery.


### Rendering regression checks

Run `npm run test:ui` to render every visible portal screen with empty and
populated records, plus vaccination history, loaded profiles and recovery UI.
The checks bundle the real JSX with the existing Vite/esbuild toolchain and use
synthetic local records; they do not connect to a database or send messages.
Page rendering failures keep the portal navigation available. Production
recovery screens show retry/home actions and keep exception details in the console.

### Owner booking and reception approvals

Selecting a day in My Appointments carries that date into either booking button.
The form shows the selected date once, with Change date available; changing it
clears the selected time and reloads availability. Booking still requires review,
a server acknowledgment and reception confirmation.

Front Desk includes a Needs clinic approval inbox with Visit requests and Pet
registrations. Today’s and future Pending Approval requests appear independently of the
arrival queue. Approve visit uses the Scheduled transition and displayed
visit snapshot; failed requests remain available for retry. Pet registrations use
the existing revision-checked review and card issuance flow. Clinical booster
dates still require veterinarian certification.

Checks: `node --test tests/assistant-workflow.test.js tests/appointment-status.test.js tests/reception-saves.test.js tests/owner-vaccination.test.js tests/ui-rendering.test.js`
and `npm run build`. Browser checks cover selected-date handoff, retry behavior,
photo controls and owner/assistant layouts at phone, tablet and desktop sizes.

### Booking feedback and portal layouts

Owner booking forms explain the one-visit-per-pet-per-day rule and show the
existing visit before submission. Different pets can book the same day;
Cancelled and No-show visits release the restriction. Completed visits still
count. The server serializes reservations and remains authoritative for current
availability, ownership, follow-up links and service duration. Client checks now
reject invalid calendar dates and use the same date window and clinic hours.

Owner and assistant pages share clearer navigation, focus indicators, compact
cards and consistent filters. Assistant payment, patient, household and
consultation tables become labelled cards on phones. Patient recall labels use
the latest certified vaccine dose; no active recall does not imply vaccine coverage.

Checks: `node --test tests/owner-booking.test.js`, `npm run test:ui`,
`TEST_DATABASE_URL=postgresql://localhost/disposable_test_database npm run test:scheduling:postgres`
and `npm run build`.

### Paginated records and account settings

Record tables and lists show at most 10 entries per screen page. Filters return
to page 1; removing records clamps the current page to the last available page.
Pagination changes the screen only: totals, CSV exports and printed tables use
all filtered loaded records. History still loads in server cursor batches;
use Load older history to include earlier records in searches and pages.
Complete-history print/export requirements remain in place.

Clients & Patients supports an owner filter and an Owner & pets dialog with
contact details, linked patients and links to each pet's existing record. Links
use explicit owner or account IDs, including when two clients share a name.
The dialog respects the patient data already available to the current role.

All four roles share Profile and Change Password layouts, with grouped contact
and address fields, verification status, password requirements and strength
feedback. Existing verified contact proposals, current-password checks and
server-confirmed saves remain authoritative.

Checks: `node --test tests/owner-relationships.test.js`, `npm run test:ui`, and
`npm run build`. Browser fixtures cover more than 10 records, page navigation,
filter resets, owner/pet links, account failure/retry and responsive layouts.

### Requested vaccines and admin activity

Vaccination booking now asks owners or reception to choose a species-compatible
vaccine (or ask the veterinarian for advice). The same selection is saved in the
visit purpose and displayed in approvals, appointment details, intake, clinical
queues and checkout. Known prices come from `/api/services/prices`; estimates
exclude additional care, and unpriced products require clinic confirmation.
The server validates explicit choices and species independently. Changing a
scheduled vaccination request returns it to Pending Approval for reception approval.
Generic older bookings remain readable. A request never certifies an administered
dose, sets a booster interval or creates a charge: the veterinarian confirms
performed care and checkout retains the canonical invoice rules.

Admin activity shows a derived activity category, saved action, actor, role,
Manila time and record reference. Exact saved actions remain available in the
expanded details. Search uses the saved audit history; role/type filters apply to
loaded entries. Cursor loading retains older history and screens show at most
10 entries per page. Failed reads retain the last loaded entries for retry.


### Unfinished SOAP consultations and keyboard access

SOAP edits (including prescriptions, performed services, vaccines and follow-up
fields) are saved as a browser draft for the signed-in veterinarian, appointment
and patient. Close, Cancel, Escape and the backdrop offer **Keep editing**,
**Keep draft and close**, and **Discard edits**. Reloading or leaving the browser
prompts when there are edits. Reopening the same visit automatically recovers its
draft, including its original visit snapshot and request IDs. A changed assignment,
intake or visit still blocks finalization; recovered notes stay visible for reference.
Drafts stay on this browser until finalized or discarded and are
not medical records or a substitute for finalization. Storage failures are visible
and keep the form available. Confirmed finalization and explicit discard remove
the draft. Network failures retain it.

Consultation, saved-record, handoff and patient-card dialogs use native modal
behavior. Tab and Shift+Tab remain inside the active dialog; Escape closes the
active dialog (or opens the unfinished-note confirmation). Nested reviews return
to the underlying dialog. Closing returns focus to the opening control, with the
workspace as a fallback if the control no longer exists.

### Clinic-managed diagnosis and treatment entries

Administrators can open **Clinical Note Choices** to add, edit, order or retire
optional diagnosis and treatment entries (one per line). Empty lists are allowed.
Veterinarians load the saved lists when opening SOAP; they can always type their
own notes, including if choices are unavailable. Entries append text only; billed
services still require separate confirmation. Retiring an entry does not alter
existing clinical records. Unsaved choices are protected when reloading the lists,
leaving the page, logging out, or reloading the browser. A failed list reload keeps
the current entries. Saving requires confirmation of the exact lists and the next
revision; a conflicting or incomplete response retains entries and requires
reloading the saved choices before another save.

Each SOAP list has a search field and an explicit **Add to notes** action.
Veterinarians can add multiple entries, edit the resulting text, or type their
own diagnosis and treatment directly into the notes. Searches filter clinic
choices only; selecting a diagnosis leaves treatment selection to the vet.
Custom notes stay with the visit and are not automatically added to the shared
lists. Administrators maintain veterinarian-approved entries separately in
**Clinical Note Choices**. Final review shows the actual edited assessment and
plan before the veterinarian confirms the visit. Medication directions and
supply still require explicit entry or confirmation in the prescription builder.

Deploy `server/database/note-options.sql` with the migration role for existing
databases. `npm run db:init` includes it for new installations. The endpoint can
initialize it when the runtime role has DDL permission. The initial seed preserves
the former built-in entries. Only administrators can update the catalog; vets and
administrators can read it. Updates use a revision check and commit the audit entry
in the same transaction, so concurrent changes cannot silently overwrite one another.

### Basic admission and owner updates

During SOAP consultation, veterinarians use **Admit [patient]** under **Plan**.
The admission dialog is locked to the current patient and visit, shows the current
assessment/plan for reference, and allows explicit reuse of the consultation plan.
The vet enters the admission reason, monitoring instructions and a separate owner
message. Saving the admission leaves SOAP open; finalizing SOAP keeps the pet
admitted until the separate discharge workflow is completed. Unfinished SOAP
retains the existing browser draft protection. **Admitted Pets** also offers a
fallback that requires explicitly choosing an eligible consultation or finalized
visit. A pet
has at most one active admission; a visit has at most one admission. The admission
follows the visit's veterinarian assignment when active care is handed over.
Staff deactivation is blocked while a veterinarian still has an admitted patient,
including after the consultation has been signed.

Veterinarians review the care timeline, add clinical updates and revise the plan.
Assistants use **Admitted Pets** to follow that plan, record observations and
optional measured temperature/weight, and explicitly share a factual owner
message. Internal notes, plans and measurements are never returned by the owner
API. Owners see their own pets' status, saved shared messages and discharge
instructions in **Pet Admission Updates**, with an active-stay shortcut on My Pets.
The pages poll while open and show refresh failures and the last check time.

### Discharge, payment and release

For admitted pets the workflow is **Admitted → Ready for discharge → payment →
Discharged (released to owner)**. The assigned veterinarian signs SOAP, approves
discharge and records a private summary plus owner-visible home-care instructions.
Approval closes care entry and sends the visit to final checkout; it does not mark
the pet as released. Reception records payment through the existing claim-based
checkout, then confirms actual release in Admitted Pets. Payment never changes
admission status by itself. Pending release still counts as an active stay.

This intentionally replaces the earlier admission behavior that allowed checkout
before discharge approval. Ordinary outpatient checkout is unchanged. Existing
Discharged rows retain their original status, timestamps and history. A paid visit
cannot start a new admission, and an active reception checkout claim must be closed
before admission. Final payment and claim endpoints both enforce the discharge
approval guard. Historically paid active stays can still be approved and released.

### Medicine orders, actual doses and supplies

Only the assigned veterinarian adds or stops admission medicine orders. Each order
records a medicine, dose with units, route, frequency, instructions and author. It
may authorize a clinic catalog supply with a maximum number of whole items/packages.
These quantities describe billable supplies, not doses; no clinical decision or
supply-to-dose conversion is inferred. Custom medicine names can be recorded without
an additional catalog supply charge. Take-home supplies are prescribed in SOAP.

Veterinarians and assistants record each actual medicine event against an active
order: **Given**, **Missed**, or **Held**, actual Manila date/time, observed response,
reaction or reason, and any whole clinic items/packages actually used. The event
retains the veterinarian's dose and route; assistants cannot substitute a different
medicine or dose. Dates cannot precede the order/admission or be in the future.
Missed/held events have no medicine supply charge. The total clinic supply cannot
exceed the veterinarian's authorization. Giving a dose is an explicit staff action;
prescribing, signing SOAP, paying or releasing a pet never creates a dose entry.

The assigned vet can mark an incorrect medicine event as entered in error while
care is open. The original entry remains visible, with an appended reason and
correction reference; it is excluded from supply totals and billing. A correction
to an owner-shared entry requires an owner correction message. Stopping an order
retains its history and blocks later events against that order.

Final checkout loads recorded clinic-use supplies once, separately from take-home
products even when both use the same catalog item. Their saved quantities/prices
cannot be removed, duplicated or changed at payment. Home supplies still require
the original SOAP prescription where applicable; an admission medicine order does
not authorize additional home supplies. The invoice retains a clinic-use label.
This is recording and billing only: no stock deduction, automated diagnosis,
treatment recommendations, inferred doses, admission fees or inventory expansion.

After release, the admission, care timeline, medicine orders/events/corrections,
SOAP prescription and invoice stay linked to the pet and visit. Owners receive
only explicitly entered messages, status, discharge instructions and their existing
prescription/payment views. Internal orders, doses, observations and corrections
are not exposed through the owner admission API unless staff explicitly describes
them in an owner message. Discharged stays remain readable; new care entries close
at vet discharge approval.

All writes require a connected server save. Forms keep entries on save failure,
confirm discarding unsaved text and warn before browser navigation; they do not
store admission entries on the device. Revisions reject conflicting staff saves,
request IDs make retries idempotent, and updates and audit entries commit together.
Timeline and stay history are paginated. No external clinic records are retrieved.

Apply `server/database/admissions.sql` followed by `server/database/admission-workflow.sql` using the migration role before deploying
when the runtime role cannot create tables. `npm run db:init` includes the migration
for new installations; do not run demo seeding on a live database. Admission routes
otherwise initialize missing tables on first use.

Checks: `npm run test:admissions:postgres`, `npm run test:workflow:postgres`
(with `TEST_DATABASE_URL` pointing at a disposable local PostgreSQL database),
`npm run test:ui`, and `npm run build`.

### Loading and connected workflow checks

Public screens load on demand alongside the existing role portals. The network
client no longer initializes unreachable in-memory API routes. Registration-only
location and provider data can be eliminated from screens that do not use it;
validation and real server acknowledgments retain their existing rules. The build
keeps Vite's original chunk warning threshold.

Run the connected HTTP/PostgreSQL regression against a disposable local database:

```bash
TEST_DATABASE_URL=<disposable-local-db> npm run test:workflow:postgres
node --test tests/soap-draft.test.js server/tests/note-options.test.js
npm run build
```

The workflow regression follows owner booking, reception approval and measured
check-in, assigned-vet consultation, reception checkout and payment, then owner
record visibility and isolation. It also checks catalog authorization, concurrent
edits, audit rollback, and preservation of medical notes after retiring choices.

### Live form validation

New and updated data-entry forms should give field feedback while users type,
without requiring blur or a failed save. Keep untouched empty fields quiet;
recalculate related constraints when values change. Keep entered values when a
save fails. Validation messages must be linked to controls with
`aria-describedby` and `aria-invalid`.

- Use `useFormValidation` with a pure field-error map for domain rules. Spread
  `formProps` on the form, `field(key)` on each control, render `feedback(key)`,
  and call `validate(event)` before reviewing or sending data. Its
  input and change handlers mark edits, including incomplete native numbers
  such as `-` and `1e`; keep value updates in each control's `onChange`. Use
  `changed(key)` when a preset assigns a field value so obsolete native errors
  clear, and `touch(key)` to mark other edits. The returned `errors` map exposes
  current visible feedback for forms retaining existing error markup. SOAP
  recalculates its field errors, including related dose/date constraints, on
  every edit; untouched blank fields remain quiet.
- Use `LiveControl` for forms governed by native required, range, length and
  format constraints. It retains native submit blocking and reacts to changed
  bounds. Existing `useLive` forms already recalculate their domain rules on
  each change.
- Keep server checks for permissions, saved revisions, availability, remaining
  medicine authorization and all record writes. Inline feedback does not prove
  a record was saved or replace a veterinarian's clinical judgment.

### Admission care and discharge documents

Admission is an explicit veterinarian decision based on examination and clinical need; a diagnosis or vaccination booking never admits a pet automatically. Vaccination and deworming visits use a focused record with suitability assessment, care/after-care instructions and actual administration; they do not display SOAP, admission, unrelated services or take-home product controls. Grooming uses its own care record and grooming service. Consultations and surgical assessments use SOAP, admission and prescriptions, with unrelated vaccine and grooming controls hidden. Explicit booking service takes precedence; legacy visits use their reason. All forms retain the existing durable clinical record format for history, checkout and documents, with visit reason and saved intake retained. Hidden selections in earlier drafts do not become charges or follow-up requests.

New admissions require a future first observation time in Manila time. The assistant records staff-confirmed owner/representative consent (name and method). The pet owner’s existing contact details are the primary contact; a separate alternate contact is optional. If any alternate detail is entered, the name, valid phone and relationship must all be supplied. This is not an electronic signature or automatic emergency treatment authorization. Existing stays retain unknown consent/times as unrecorded. Care staff can record or replace consent/contact details in an update; prior entries remain in the private care timeline.

Assistants see the saved care plan and pending observation, record findings and explicitly confirm a scheduled check performed now. General updates and medicine events do not complete it. Only a veterinarian can set another observation time; no checks or medicines are recorded automatically. Task changes, completion and consent are transactional, audited and revision guarded. Owner updates remain explicitly shared; internal care plans/tasks remain private.

After veterinarian discharge approval, staff and the owning client can open **View / print discharge summary**. The document uses saved consultation assessment, take-home prescriptions/directions, discharge instructions and invoice/payment data. Inpatient medicine orders are not take-home prescriptions. Unpaid checkout and pending actual release are labeled; saved payment never implies release. Clinical and administration history remains retained separately after discharge.

### First-pet setup and pending registration

After account email/SMS verification and login, owners without a saved pet or prior registration see required first-pet setup. Escape and backdrop clicks keep it open; logout remains available. Fields validate inline, and failed saves retain entries for retry. A successful save immediately shows **Pending verification**, unlocks the dashboard, and allows appointment requests. Setup completion persists across reloads and withdrawal of an unused request.

`server/database/owner-pet-onboarding.sql` adds provisional patient status and persistent setup completion, and backfills existing pending requests. Registration saves and retries preserve one patient identity; clinic approval verifies that same patient so bookings stay linked. Pending patients have no official card or invented vitals history. Reception reviews a pending registration together with its appointment and approves both in one transaction. Pet verification remains required before clinical intake. Requests with appointment history cannot be withdrawn. Account verification before login is unchanged.


### Appointment requests and separate payment status

The visit lifecycle is **Pending Approval → Scheduled → Checked-in → In consultation → Completed**. Owners may request visits for their saved Pending verification pets. Reception reviews and approves pending pet registration together with the requested visit. Staff-created walk-in arrivals start Scheduled and require measured intake before joining the clinical queue.

New requests appear in the owner's local list after server acknowledgement and in the assistant inbox through the existing visible-tab state sync (every three seconds after the previous read completes). Calendars, lists, dashboards, linked vaccine reminders and reports use the same saved status. Rejected and cancelled requests remain in history with their reason and release their reserved slot. Reception can reject requests from the inbox or calendar; owners and reception can cancel upcoming visits. Changing an approved date, time, pet, veterinarian or service returns the same visit to Pending Approval. Started visits require clinical handoff instead.

Create forms retain a stable booking ID for retry. The server serializes reservations, checks duration overlap and pet/day duplicates, returns the existing matching booking on an exact retry, and rejects reuse of an ID with different details. Rescheduling rechecks availability under the same lock and checks the reviewed visit snapshot when supplied. Owners cannot approve, reject, record intake or change payment through appointment actions.

Payment is separate: **Unbilled** at booking, **Unpaid** after consultation finalization creates the charges, and **Paid** only through reception checkout. Payment does not change Completed back into another clinical status; admission/discharge rules remain enforced.

The one-time server/database/appointment-status.sql migration changes legacy Scheduled → Pending Approval and Confirmed → Scheduled atomically, normalizes legacy Pending billing to Unbilled, and marks existing completed visits with charges Unpaid without changing paid records. It also updates the active-follow-up uniqueness rule to release rejected requests. It runs before authenticated clinic reads/writes and through db:init. Run the new server and frontend together; the legacy Confirmed API value is retired.

### Combined appointment and registration approval

Apply `server/database/appointment-approval.sql` after the registration/onboarding
migrations on existing databases. New initialization includes it; state and approval
endpoints also apply it when the runtime role has DDL permission. This additive,
repeatable migration preserves patient IDs, bookings and medical history. Historical
approvals retain unknown audit timestamps/identities rather than inventing them.

Reception's **Pending Appointment Requests** queue shows patient registration details
and the requested visit together. One assistant approval uses a single transaction to
recheck the active doctor and available slot, verify the linked pending registration,
preserve its patient/card reference, confirm the appointment and save the authenticated
approver's user ID, name and timestamp. Existing protocol suggestions remain unadministered.
Standalone registration review remains available without a booking. When a pending
visit is linked, registration review presents that visit and uses the combined action;
the registration-only API rejects attempts to bypass its appointment review.

Clients confirming a pending patient send `expectedRegistration: {id, revision}` with
`PATCH /api/appointments/:id/status` (`status: "Scheduled"`) and the reviewed
`expectedVisit` snapshot. Stale or declined registrations must be corrected/reviewed
again. Approval shares the booking lock with reservations and rescheduling. Repeated
approval of the same scheduled visit returns the saved result without another patient,
protocol set, weight baseline or audit entry. A changed booking requires a fresh review.
Cancellation/rejection never downgrades a verified patient. Rescheduling clears the
appointment's current approval metadata; the earlier audit entry remains saved.

Validation: `TEST_DATABASE_URL=postgres://postgres:postgres@localhost:5432/pawcare_test npm run test:approval:postgres`.
The database must be disposable and local; the test uses isolated schemas and synthetic records.

### Check-in and complete vitals history

Apply `server/database/vitals-history.sql` after the registration/onboarding and
admission/workflow/care migrations. `db:init` includes it, and clinical endpoints
initialize it when the runtime role has DDL permission. Deploy the server and
frontend together. This repeatable migration retains existing patient, visit,
weight and admission records and IDs. It imports recorded weights, saved intake
snapshots and admission observations. Unknown historical visit links, exact times
and staff IDs stay unknown. Temperatures overwritten before this migration cannot
be reconstructed from the latest snapshot.

Assistants and assigned veterinarians can capture initial intake on the scheduled
Manila day. They can record more measurements while Checked-in or In consultation,
including ongoing care after midnight. Remeasurement preserves the consultation
stage. Every new intake saves separate weight (kg) and temperature (°C) events with
patient, visit, timestamp and authenticated staff identity. The latest intake
snapshot is retained for clinical summaries; it no longer replaces the history.

**Vitals and observations history** is available in patient details and the owner's
medical profile. It loads independently of the summary state and pages through the
complete journal. Registration weights are explicitly reported registration data;
unknown legacy sources are labeled as such. They are not used as measured intake
or automatically recorded again when SOAP is finalized. SOAP keeps saved intake in
the exam summary and accepts an optional explicitly entered new weight.

Clinical staff can record a value and reason using **Correct entry**. A correction
appends a linked entry with its own recording staff/time and retains the original
measurement and its measurement time. Only the current referenced snapshot is
refreshed. Correcting an older event cannot replace a newer measurement. Repeated
correction requests return the saved result, and competing corrections require a
refresh. Journal rows cannot be edited or deleted. Intake, history, weight mirrors
and durable audits commit or roll back together.

Measurement and correction fields validate inline on each edit, including ranges,
precision and correction reason length; server validation also applies. Owners can
only read their own patient histories and cannot correct measurements. Admission
clinical observations and their corrections remain staff-only, including through
the shared weight summary. Admission notes, medication records, discharge approval,
payment and confirmed release retain their existing workflow.

API compatibility: `POST /api/pets/:id/weights` now requires `visitId` and an actual
`measuredAt` ISO timestamp with timezone alongside `kg`. Date-only payloads must be
updated; the timestamp determines the Manila measurement day. The assigned-vet
boundary applies to veterinarian writes. Intake screens supply server-stamped
measurement metadata automatically. `GET /api/pets/:id/vitals` returns keyset pages;
`POST /api/pets/:id/vitals/:measurementId/correct` accepts a stable UUID `requestId`,
numeric `value` and correction `reason`.

Validation: run `TEST_DATABASE_URL=postgres://postgres:postgres@localhost:5432/pawcare_test node --test server/tests/vitals-postgres.test.js`
against a disposable local database. The suite uses isolated schemas and synthetic
identities to check migration, access, repeat measurements, correction races,
rollback, private observations and complete pagination.

### Standard vaccination card and PDF

The Digital Vet Card contains pet identity, optional microchip number and
implantation/scan date, the owner's name/address/phone/email, administered
vaccines with brand/manufacturer/lot/serial and booster due date, deworming
medication and dates, current clinic-measured visit weights, and the attending
veterinarian's name with space for a handwritten signature. No signature is
created automatically. Optional identifiers can be entered by the veterinarian
in vaccination/deworming visits. Existing missing details remain “Not recorded”.

Cards and PDFs do not require clinic-document setup or payment. Pet, appointment,
vaccination and consultation IDs are preserved. Snapshots retain stable internal
references and revisions; unchanged downloads do not create new revisions.
The legacy clinic-profile API retains its access controls for compatibility but
is no longer part of card setup or the administrator menu.

Plans and unverified external guides are not presented as administered doses.
SOAP notes, prescriptions, billing, registration weight reports, temperatures
and private admission observations remain in their clinical workflows. Staff can
open **Clinical history** separately from the card to review/correct measurements.
Corrections retain the original clinical history while the card shows the current
weight. Owners and veterinarians retain their existing patient access scopes.

**Download PDF** and **Print Card** use the complete saved card, independent of
screen filters and pagination. PDFKit supports multiple pages and the bundled
Unicode font. Admission/discharge/payment/release rules remain independent of
the card. Card persistence and audit changes still share their caller transaction.

Apply additive `server/database/vaccination-card-fields.sql` after the existing
`digital-vet-card.sql` and its prerequisites, using `npm run db:migrate` for an
existing database. Runtime card/consultation/payment initialization also applies
it when DDL permission is available. Never use demo seeding for a live database.

Assistants can browse **Services & Prices** using the same saved catalog as billing.
Check-in validates meaningful visit reasons while typing and on the server, and
keeps product dispensing recommendations outside the intake form.

Checks:

```bash
TEST_DATABASE_URL=postgres://postgres:postgres@localhost:5432/pawcare_test node --experimental-test-module-mocks --test --test-concurrency=1 server/tests/digital-vet-card-postgres.test.js server/tests/connected-workflow-postgres.test.js server/tests/migration-rollout-postgres.test.js tests/vet-card.test.js
```

### Safe workflow rollout

For existing clinic databases, use `npm run db:migrate:check` followed by
`npm run db:migrate` with the intended `DATABASE_URL` and migration role. Check
mode rolls back; apply commits all pending migrations together without demo
seeding. Existing migration markers are respected and applied file hashes are
recorded. Never run the demo-seeding `db:init` against a live clinic.

See [workflow rollout](docs/workflow-rollout.md) for backup/staging steps, verified
clinic configuration, Vercel release settings, and acceptance checks. Real clinic
identity and hosting/database access are required to finish a live rollout.

### Visit form suggestions and saved intake

Saved intake measurements are displayed as text, separately from additional
examination findings. A veterinarian may record a new measured weight in its
own field; saving notes alone does not create a measurement. Diagnosis suggestions
include an expanded default list of common veterinary conditions as documentation
shortcuts. Existing untouched defaults are expanded once; administrator edits
remain intact. These suggestions never select a diagnosis automatically.
Administrators can edit or retire any suggestion; retired entries are not
reintroduced by initialization. Treatment suggestions and patient-specific free
text remain independent of diagnosis and billing.

### Walk-in reception process and inline feedback

1. Search for the patient first. **Existing patient check-in** keeps the owner and clinical history linked; **Walk-In Registration** creates a patient only when they are new. An existing owner can add a new pet through the same registration form.
2. Choose today's purpose, the requested vaccine when applicable, and the attending veterinarian. Review the owner/patient and visit details, then save the arrival. Walk-ins use the clinic's current Manila date/time, start **Scheduled / Unbilled**, and do not reserve a future slot. Saving registration alone (arrival unchecked) does not create a visit.
3. Record today's measured weight and temperature, triage, reason and observations in intake. Registration weight and earlier measurements do not complete intake. Saving intake changes the visit to **Checked-in** and puts it in the assigned veterinarian's queue. For urgent cases, alert the attending veterinarian and record the assessed triage during intake.
4. The veterinarian opens the visit and completes the form for its saved purpose: consultation/SOAP, vaccination, deworming or grooming. Admission is an explicit clinical decision. Reception handles checkout after the clinical record is finalized.

If the pet already has an active visit today, continue that visit's intake instead of creating another arrival. Rejected, cancelled, completed and no-show visits remain in history and do not block a new walk-in. A rejected patient registration still needs correction and verification. Failed saves keep entries open; reception proceeds to intake only after the API confirms the patient, veterinarian, purpose, reason and Scheduled walk-in arrival.

Active forms use inline feedback through `useFormValidation`, `LiveControl`, or the owner/authentication `useLive`/`Field` controls. Required values, format, length, date, numeric range and related-field rules are shown beside fields during editing/blur and on submission, with accessible error descriptions. Invalid submission focuses the first invalid field where the form supports field-level focus. Disabled and removed controls do not retain stale native submission errors. Search/filter controls remain optional. Browser feedback supplements server validation; clinic state, roles, revisions and transactional checks remain enforced by the API.

Admission dropdowns capture their values before state updates, and validation runs after field change handlers. The review shows the reason and selected templates. Saved template names and patient-specific plan/instructions are retained in the staff care timeline; owners see only explicitly shared updates. Choosing another template replaces its starting text and requires the veterinarian to review the plan again. A new care update intentionally leaves optional plan/task inputs blank to keep existing instructions unless a change is entered.

For DOM regressions, run `npm run dev` and open `/tests/browser/forms.html` in the application preview. The page reports `passed: true` after checking corrected vaccine selections, numeric ranges, disabled/removed fields and repeated admission selections after invalid submissions. It uses synthetic incomplete forms and makes no clinical save or provider request. Pure/SSR coverage runs with `node --test tests/*.test.js`; clinic security and local PostgreSQL workflows retain their documented commands above.


### Connecting owner records across online and walk-in visits

Online and walk-in arrivals share one patient history: owner → pet → visit → clinical record → checkout → follow-up. New online owners verify email and mobile before login. Owners with pets already registered at the clinic choose **Link my clinic records** during first-pet setup (or **Link clinic records** in My Pets) and give reception their verified account email.

Reception opens **Clients & Patients Masterlist → Clients & Households → Link online account** on the existing clinic owner. The assistant looks up the verified account, reviews both identities/contacts and every pet, confirms ownership with the owner, then links. This transaction keeps the established clinic owner ID and all patient, visit, vaccination, weight, admission and invoice IDs. Any distinct pets and registration requests from the online owner are consolidated into that clinic owner. The verified account supplies the primary name and contacts; its address is used when present. The obsolete empty owner record is removed only after its references are transferred. The owner refreshes the portal to load the linked identity.

Only assistants can perform this action. Unverified/inactive accounts, clinic records already claimed by another account, stale reviews, duplicate patient names and totals above the existing ten-pet account limit block linking. Duplicate patient records must be resolved before linking; linking never combines two patient histories. Audit failure rolls back the entire link. This action sends no email or SMS.

Walk-in registration now offers an explicit owner selector. Contact matches are suggestions for review; they never silently select the first matching email or phone. Invalid/stale selected owners are rejected. Pending patients must use **Review registration** in Existing patient check-in before saving an arrival or intake. Existing pending online bookings continue through their combined registration/appointment review. Declined registrations need owner correction and resubmission.

Roles stay connected through saved actions: reception verifies registration and arrival, the vet records care for the visit purpose, reception records checkout/payment, and the owner sees their records and follow-up. Admin manages access and audits. Admission additionally requires veterinarian orders/discharge approval, reception consent/care tasks and recorded actual release.

Regression coverage: `TEST_DATABASE_URL=<local-disposable-database> node --test server/tests/owner-account-link-postgres.test.js`, the registration/connected workflow PostgreSQL suites, `npm run test:clinic`, `node --test tests/*.test.js`, and `npm run build`.


### Current workflow actions and history loading

Visits show the next responsible role and action from saved clinical, admission
and payment status. In Admitted Pets, **Finish visit notes** opens the exact
assigned visit, and **Open this visit’s checkout** opens its reception invoice.
An admitted pet cannot proceed to final checkout before discharge approval;
payment still requires a separate release confirmation.

The vet queue separates **Today** and **Earlier unfinished** with date filters,
original dates and a carryover count. The default queue preserves triage priority
across dates. Completed-today counts exclude earlier unfinished visits.

**Load all history** follows every saved history page sequentially with progress.
Failures stop loading and offer explicit retry; incomplete or stale history keeps
report exports disabled. Manual **Load older history** remains available.

Booking, patient registration, arrival, measured intake, checkout, staff invitation,
calendar booking, care transfers, account changes, linking and reminder-call forms ask before
closing unsaved edits. Clinical visit notes retain browser draft recovery;
admission/medicine forms retain their existing discard guards. Saving keeps a
form open until the server confirms the outcome; failed saves retain entries.

Development browser regressions (Vite required):

- `/tests/browser/forms.html`: controlled fields and inline feedback.
- `/tests/browser/history.html`: failed history recovery and selected-pet booking.
- `/tests/browser/history-all.html`: sequential loading, progress and error recovery.
- `/tests/browser/workflow-forms.html`: use `window.checkWorkflowForms()` at desktop
  and mobile sizes for modal layout, close guards, inline feedback and exact visit
  handoffs. This page intercepts API calls with synthetic state and blocks writes;
  real route/database journeys run through `test:workflow:postgres` and related
  PostgreSQL suites using isolated synthetic schemas.

Run `window.checkNextWorkflowFixes()` on the same browser fixture for handoff
field errors/edit retention, blocked close during saving, failed-transfer recovery,
patient checkout amounts/admission holds and checkout waiting behind a native
rejection dialog. It also checks that a patient's active arrival takes precedence
over an earlier completed visit. See [the clinic process](docs/PROCESS.md) for the
current online, walk-in, admission and payment handoffs.

### Deworming visit shortcuts

The veterinarian explicitly confirms suitability and actual administration. For confirmed deworming, the record generates the suitability statement, treatment date, product (when entered), and next due date; additional findings and after-care instructions are optional. Deferred visits still require assessment and next steps. New visits default to one administration (1 of 1), with optional series editing; these counts are not tablet quantities or a calculated medicine dose. The next due date is the care date plus the veterinarian-approved interval. Brand and lot remain actual-package entries because the service catalog contains no stock-lot inventory.

### Forms matched to visit reasons

The booked service determines which care can be recorded. Within consultations,
visit reasons select focused history fields and examination prompts for wellness,
skin/ear concerns, injury/mobility, vomiting/diarrhea, appetite/drinking changes,
dental assessment, surgical assessment, follow-up/recheck and urgent care. Custom
reasons retain the general consultation form. Grooming includes a sanitary-care
variant; vaccination and deworming retain their own administration fields.

Focused history entries are optional, retained in browser drafts, and appended to
the durable visit history automatically. Each entry validates during typing with
a 500-character limit. Existing SOAP limits still apply to the assembled record.
Confirmed vaccination, deworming and grooming generate suitability and care
statements; additional assessment and after-care notes are optional. Deferral
still requires a reason and next steps. Booking alone never confirms care,
chooses a dose, approves an interval or creates an administration charge.

Editing administration details clears interval approval and shows feedback next
to that control. Date arithmetic, saved intake, requested vaccine selection,
service prices and prescription totals remain automatic. Surgery intake offers
surgical/dental/recheck choices. Diagnosis, medicine instructions and actual
product identifiers remain explicit entries.

Browser regression checks: run `npm run dev:frontend -- --host 0.0.0.0` and open
`/tests/browser/visit-forms.html`. The synthetic fixture checks live validation,
draft recovery, confirmed-care notes, calculated dates and invalidated approval.
It replaces API reads locally and performs no clinical writes.

### Automatic deworming suggestions and product lots

Confirmed care keeps additional assessment/after-care text boxes collapsed;
deferrals expose them. Deworming product choices come from the clinic endpoint,
with Canex/Drontal defaults matching the existing service catalog. Other actual
products can still be entered. Lot autofill uses only configured unexpired lots,
choosing the earliest expiry first and allowing the vet to select another lot.
No lot is fabricated; absent stock data retains a batch field.

Set deployment variable `CLINIC_DEWORMING_PRODUCTS_JSON` to an array of
`{ "id": "product-id", "name": "Actual product name", "lots": [] }` objects.
Each actual stocked lot has `batch` (up to 60 characters) and `expiresOn`
(`YYYY-MM-DD`). Keep this stock list current; it is not a stock-depletion system.
The authenticated `/api/services/prices` response exposes it as
`dewormingProducts`. Do not populate it with example or generated lot numbers.

Scheduling suggestions follow [ESCCAP GL1, June 2025, pp. 9–13](https://www.esccap.org/link-document/27/):
14 days for the early-life stage; one calendar month for weaned juveniles with
ongoing risk or increased-risk adults; three calendar months for adults whose
risk is not established. The vet confirms weaning more than two weeks ago;
birth date alone cannot establish weaning. A young pet with unknown weaning
stage receives the early-life suggestion for review. Monthly juvenile prevention
requires review of infection risk. Missing/invalid birth dates, unsupported
species and ages below the guideline's starting ages require a custom schedule.
The displayed day count is calculated from the selected care date (today in
Manila by default), with month-end clamping. Historical care uses its actual
care date. These are European guideline-based suggestions, not a universal
Philippine protocol or a product dose instruction; the vet approves or customizes
for the patient/product. Existing draft intervals are preserved as custom.

### Care planning and calculation by visit reason

Consultations offer care-plan choices for wellness, skin/ear, mobility/injury,
digestive, appetite, dental, surgical, urgent and follow-up visits. Choosing a
plan adds its intended care text to the clinical record; it does not assert that
a service was performed. Patient-specific instructions remain editable. Matching
services appear first; other clinical services remain available in a collapsed
section. Selected service charges are totalled automatically.

An optional symptom-start date calculates elapsed days at the care date. A
recheck interval calculates the follow-up date from that same care date; the
existing rule still rejects follow-up dates before today. Changing a preset
clears obsolete inline errors. These calculations do not choose a diagnosis,
medicine dose or clinically appropriate recheck interval.

Deworming saves may now omit an unavailable manufacturer lot. The server fills
an available configured lot when a catalog product is selected, and rejects
expired or mismatched configured lots. Missing lots stay empty and appear as
“Not recorded” in review. The automatically generated administration ID is shown
separately as the record reference; it is never written into the lot field.
Vaccination still requires the actual lot. This replaces the earlier requirement
that every deworming save include a lot, without changing existing recorded lots.

Deworming brand selection also supports older service-price responses that omit
product metadata: it retains the existing Canex/Drontal choices with no invented
stock. Explicitly configured product lists take precedence. The optional lot
input is hidden when no configured lots are available; configured lot selection
and required vaccination lot entry remain available.


### Login lock and checkout limits

An incorrect password shows the remaining attempt. Two consecutive incorrect
passwords lock an active account until its emailed unlock link is confirmed.
Unlock links expire after 30 minutes, are stored as hashes, require confirmed
email delivery and can be consumed once. Repeated login requests while locked
can resend the email at most once per minute. Missing or failed email delivery
keeps the account locked and offers a retry; development outbox messages do not
authorize unlocks.

Confirming the link returns to login and starts a server-enforced two-minute
cooldown. The login countdown survives refresh in the same tab. Changing browser
storage does not bypass the server deadline. After it expires, login is available
and a wrong password starts a fresh two-attempt cycle. Password recovery and an
administrator's explicit staff unlock retain their existing recovery behavior.

New payments do not accept discounts. Checkout add-ons are limited to shampoo
and accessories from the official catalog. Saved veterinarian-confirmed services,
prescriptions and admission supplies remain on the invoice with their existing
quantity rules; reception cannot introduce additional clinical services or other
products. Historical receipts retain their original discounts and amounts.

Checks: `npm run test:auth`, `npm run test:clinic`,
`TEST_DATABASE_URL=<disposable-local-database> npm run test:lockout:postgres`,
`npm run test:recovery:postgres` with the same local database, `npm run test:ui`,
and `npm run build`. The `/tests/browser/auth-checkout.html` fixture uses synthetic
HTTP responses and checks warning/lock feedback, unlock POST, persistent
countdown, retail-only additions, totals and inline quantity/cash/reference
validation without sending email or committing a payment.


### Owner next care and recent transactions

The vaccination card shows a **Next preventive care** summary above its history,
including the latest saved next-due dates for deworming and each vaccination
family. History filters do not hide this summary. The downloaded/printed card
includes these dates too. A later administration that records no next date
clears the earlier reminder; same-day records use their saved creation time.

The owner card distinguishes vet-approved due dates from actual booked visits.
A matching active appointment shows its date and status; otherwise **Book
deworming** or **Book vaccination** opens the appointment form with that pet,
treatment and approved due date prefilled within the booking window. It does
not create a booking until the owner submits the form.

My Pets labels deworming and vaccination together as preventive care and shows
five recent transactions with saved amounts, payment status and payment-detail
actions. The owner state summary includes their latest five paid records across
visit dates, alongside its existing current/unpaid records. The preview ranks
recorded payment time ahead of the original visit date. Full billing/history
remains available from **View all bills & payments**. Booking estimates do not
become transaction amounts, and other owners’ records remain excluded.

Checks: `node --test tests/owner-vaccination.test.js tests/owner-billing.test.js
tests/vet-card.test.js`, `npm run test:ui`, `npm run test:clinic`,
`npm run test:system:postgres` and the digital-vet-card PostgreSQL suite with a
disposable local TEST_DATABASE_URL, `npm run build`, and the synthetic browser
fixture `/tests/browser/owner-care.html` (`window.ownerCareResult`).

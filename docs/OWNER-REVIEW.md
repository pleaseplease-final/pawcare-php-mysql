# Owner side review

## What was wrong or missing
1. Dashboard "next visit" used UTC date (`toISOString`), so before 8 AM in the Philippines it treated today as yesterday. Now uses local date.
2. Booking only checked the vet's exact slot. Added: same pet can't have two visits on one day, past times today are blocked, max 90 days ahead.
3. Editing a Confirmed visit kept it Confirmed even after the date/time/vet changed. Now it returns to Scheduled for re-confirmation.
4. Edits only re-checked permissions, not status. Now re-checks that the visit is still Scheduled/Confirmed and the pet is the owner's.
5. Cancelling was one click with no confirmation or reason. Now a dialog with a reason dropdown.
6. Visit History hid the prescription. Now shown in an expandable details row.
7. Vaccine/visit pages had only a search box. Added pet, status and date-range filters.
8. Owner could not update phone/email/address, yet reminders are sent to that phone. Added My Profile (contact details + change password).
9. No pets on the account: Book button is disabled with an explanation.

## Not changed (outside owner side) - suggestions
- Login has no "forgot password" and owners can't self-register; staff create accounts.
- Auto No-show only runs once at load.
- Staff screens don't show the new owner `notes` / `cancelReason` fields yet.
- Consider a no-booking rule for Sundays/holidays and a cutoff for same-day cancellations.

## Round 2
- **Request a Pet was removed** (owner side). Adding pets stays with clinic staff.
- Clinic hours text is now 8:00 AM - 5:00 PM (12-hour) in the owner screens.
- Placeholder text removed from owner form boxes. Guidance now sits under each field as a hint; search boxes have a hint line, date filters have visible labels.

## Round 3: typing guards
- Letters-only boxes (pet name, breed, animal type) strip digits/symbols as you type or paste, and flash a short message. Must start with a letter.
- Numbers-only boxes: weight (digits + one decimal point, max 2 decimals), phone (digits, + only at the start, max 13 chars).
- Free-text boxes (reason, notes, cancel reason, address, request note) allow numbers but can't be only numbers/symbols.
- Change password now requires a symbol and no spaces (plus 8+ chars, letter, number). Strength bar updated.
- Admin "User Accounts" still uses the old password rule (not touched).

## Round 4
- **Vaccination Cards** (replaces the Vaccine Records table): pets show as square cards on the left; clicking one opens that pet's vaccination card on the right (photo, details, records, Book button, Print card). Stacks on phones.
- **Header profile menu (owner only):** picture + name opens My Profile, Change Password, Log out. The sidebar "My Profile" item is hidden.
- **My Calendar:** monthly calendar with visits, vaccines given, vaccines due and overdue, pet filter, day details, "Book a visit on this day".
- **Picture upload:** owner profile picture (My Profile) and pet picture (on the vaccination card). JPG/PNG/WEBP, max 5 MB, min 64x64, cropped square and shrunk to 256 px. Live error messages.
- Pet pictures are saved as `pet.photo`, so owners can now change that one field on their own pets.
- Shared-file edits (Portal.jsx): menu items can be hidden (`hide`), and a role can supply its own header (`cfg.Header`). Other roles do not use either.

## Round 5: Booking by service
- **Book a visit now starts with a service**: Vaccination (30 min) or Check-up (1 hr). The form then asks the matching question (which vaccine or check-up reason) instead of one generic reason list.
- **Time is a list of open start times that fit the chosen service** (not a dropdown with "(taken)" entries). A time shows only if the whole visit fits before 5:00 PM, does not overlap that vet's other visits, and is not in the past today. Longer services show their end time. If a day is full, a "Jump to" link goes to the next day with an opening.
- Changing the service, date, vet or time on a Confirmed visit sends it back to Scheduled, same as before.
- My Appointments shows the service and end time, and has an "All services" filter.
- Visits keep a `service` field next to `reason` (reason stays readable, e.g. "Vaccination – Anti-rabies"). Older visits and staff bookings have no `service`; it is worked out from the reason and they count as 30 minutes.
- Service lengths and options live in one table at the top of `src/roles/owner/services.jsx`.
- Not changed (staff side): staff booking still only checks the exact start time, so a staff booking can still land inside a longer owner visit like a Check-up.

## Round 6
- **Landing page:** the Log in button moved from the middle (hero) to the top-right of the header, next to Contact us.
- **My Calendar:** days before today are greyed out, disabled (can't be clicked or focused) and labelled "past day" for screen readers. Events on past days stay visible but greyed. A legend entry explains the grey squares.
- **Pet medical profile** (Vaccination Cards > pick a pet > "Medical profile" tab, new file `src/roles/owner/MedProfile.jsx`):
  - Allergies: add/remove tags with live validation (no duplicates, max 10, 40 characters). Allergies also show as a red line in the pet card header.
  - Weight history: chart + table with change since the previous weight. Owners add entries (date not in the future or before birth, one per date, 0.1-120 kg). Clinic-recorded weights are locked; owners can only remove their own. The pet's current weight always follows the latest entry.
  - Care notes: free text up to 300 characters with tap-to-add suggestions such as "Afraid of loud noises."
  - New optional pet fields: `allergies` (array), `notes` (text), `weights` (array of `{date, kg, by}`). Demo pets have sample data.
- Not changed (staff side): staff screens don't show these fields yet.

- **No booking on Philippine holidays**: holiday dates show no open times, the date field shows an error, and the calendar marks them as "Holiday (clinic closed)". The list lives in `services.jsx` (`FIXED_HOLIDAYS`, `HOLIDAYS_BY_YEAR`); Holy Week and National Heroes Day are worked out automatically. Add each year's one-off dates (Chinese New Year, Eid, extra special days) once the Palace releases them.

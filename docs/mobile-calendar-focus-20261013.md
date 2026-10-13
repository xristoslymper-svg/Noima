# Mobile calendar focus — 2026-10-13

The user requested more space for the actionable calendar, preserving the palette and appointment functionality. Mobile-only day view now reuses the existing time-grid callbacks with one date column; week view retains seven columns and local horizontal scrolling. Desktop day agenda and controls remain unchanged. The feature requires the existing mobile build flag and a viewport at most 760px wide.

Compact date navigation, day/week selection and a day strip replace the large control card. Date entry, all five status filters, Today and Refresh remain available in the date menu. Peach/cream and appointment status colors are retained. Calendar hour height is 88px on mobile and the existing 68px on desktop. No database, clinical form, or appointment API changes.

## Verification

- Typecheck, lint, remote Vercel build and 394 tests passed, including gate-disabled behavior, responsive hook cleanup and availability of the compact control functions.
- Authenticated browser QA on the deployed preview at 390x844 and 320x740: one-column day grid, seven-column week grid, locally scrolling calendar and no page horizontal overflow.
- Existing synthetic appointment opens its original detail actions: patient folder, questionnaire, appointment options and payment status. Its existing in-progress restriction still disables editing that appointment. No records were changed.
- Status filter set to Completed produced zero matching events, then All restored events. Direct date entry selected 14 October. Tapping an empty slot opened New Appointment with 14 October at 14:00, original duration/type/recurrence/SMS controls; closed without saving.
- At 1440x900, desktop day view retains the agenda, has no mobile grid, and retains the exact control-bar position and dimensions measured before the change (x275.071, y188.571, w1120, h54.286). No console errors observed. Physical-device touch/Safari testing remains outside this browser verification.
- Ready preview `dpl_GddG4VX21PPPmBj4rcsZstpXhwUR` was assigned to `noima-mobile.vercel.app` and the live alias verified authenticated with the new calendar.

Evidence: `test-results/mobile-calendar-focus-20261013/`: mobile day/week at 390, day at 320, desktop before/after day, and `stable-mobile-calendar-390.png`. Test output: `test-results/mobile-calendar-redesign-tests.log`.

## Palette balance follow-up

User requested more green relative to peach/cream. Only the existing mobile calendar media-query CSS was adjusted: active view/day deep green, sage controls/header/time axis and neutral grid surface. Warm surrounding surfaces and semantic appointment colors retained. No geometry or interaction changes. READY preview `dpl_5BiKsWjqKPC731pGT5weWDP1omGG` now backs the stable alias; build/lint/typecheck pass. Live alias verified at 390x844 (active green rgb36,92,71 and no horizontal overflow), and desktop control geometry at 1440x900 still matches the preceding verification. Screenshot `stable-mobile-calendar-balanced-390.png` in the same evidence directory. No additional behavioral tests added or repeated for this color-only change.

# NOIMA Mobile Design Lab

Status: isolated design prototype; not an integrated application.
Reference source: `31bf67fcc0af6eaf7bef45b4ccc9bf266e127161`.
Branch: `design/mobile-v2`.
Date: 2026-10-11.

## Goal

Create a modern, calm, premium mobile presentation that makes the existing clinical workspace easier to read and operate on a phone. Preserve the web application's UX semantics, clinical state, data contracts and desktop presentation. Do not invent a second database or a simplified clinical workflow.

## Tool status

A separate Figma Design file was created:
https://www.figma.com/design/ijzQfGrqV1CCVY6ZvMtSHw

Figma file creation and read-only inspection succeeded. The next call was rejected with a Starter-plan MCP tool-call-limit error. No designed screens have been written into that file. Do not treat the empty file as a completed deliverable. Continue with an isolated, self-contained browser prototype without purchasing an upgrade. Import/rebuild editable components in Figma only when access is available.

## Isolation contract

- No modifications to `app/`, `components/`, `lib/`, database migrations, auth, global styles, environment settings or production configuration during this phase.
- Keep design documentation/prototype assets separate under `docs/mobile-lab/` or in the delivered prototype package.
- No merge or production deployment without explicit approval.
- No real data in a preview. A Vercel Preview can still point at production services; a different hostname is not data isolation.
- Initial prototype: authored synthetic fixtures, no credentials, no fetch/XHR/WebSocket, no browser storage for clinical text. State is temporary and resets on reload. Simulations must be disclosed in the UI.

## Preserved information architecture

Primary destinations remain Επισκόπηση, Ημερολόγιο, Ασθενείς, Βιβλιοθήκη. Mobile may express the same destinations as a thumb-reachable navigation bar. Do not introduce a new home concept, new clinical workflow or hidden replacement destination.

The patient workspace remains Σύνοψη, Πορεία, Θεραπεία, Ιστορικό, Καταγραφή. A horizontally scrollable tab strip is presentation adaptation; converting visits into a multi-step wizard is a UX change and is not authorized.

## Source-to-screen mapping

### Overview

Source: `app/page.tsx`.
Contract: `GET /api/overview` returns `events`, `tasks`, `psychometrics`, `intakes`.

Preserve the current counter semantics:
- Upcoming scheduled appointments today, not all patients or lifetime appointments.
- Open tasks.
- Grouped patient submissions, not a fabricated number of clinical alerts.
- Pending payments, excluding cancelled appointments.

The day agenda selects a patient for the pre-visit briefing; the folder action opens the patient with appointment context. Keep these distinct. The current selection is preserved on Back. Use clinic time (`Europe/Athens`), not the device's timezone, to group appointments.

Display loading, stale snapshot, failed load and genuinely empty results distinctly. No zero counters when loading has failed.

### Calendar

Source: `app/calendar/page.tsx`, existing calendar helpers and `useCalendarDialog`.

Use the existing `CalendarEvent` semantics: `patient_id`, `session_id`, `appointment_type`, `scheduled_start`, `scheduled_end`, `status`, `payment_status`, readiness/detail. Status values include scheduled/cancelled/completed; payment values include unknown/pending/paid/not_applicable. Never coerce unknown to unpaid.

Retain appointment/patient association, open-folder/record behavior, rescheduling, cancellation, payment and intake/psychometric actions. Cancellation history must not become an active appointment. Preserve the existing guards for starting an appointment on another date, linked sessions, multiple same-day appointments and draft reuse.

A compact day agenda and touch-sized action sheet are candidate mobile presentations, not permission to remove supported calendar modes or actions from the eventual implementation. Creation/rescheduling forms remain existing workflows and must be validated before integration.

### Patient registry

Source: `lib/patients/demo-runtime.ts` (`listPatientRows`) and the patient registry route.

Preserve registry ordering/numbering and existing search/filter semantics. Row data includes patient identity plus derived `diagnosis`, `draft`, `last_session`, `next_appointment`. Diagnosis is derived from completed assessment documents and structured corrections; it is not a new free-text property to add to the patient table.

### Patient workspace

Sources: `components/patients/PatientWorkspace.tsx`, `lib/clinical/visit-workspace-state.ts`.

Keep the canonical patient/session/appointment/tab context and guarded navigation. Opening a record must reuse an existing appropriate draft/session. Do not create a new session when the view changes or mounts. Preserve separate shell loading and full context loading.

### Patient summary

Source: `components/patients/PatientRecordSummary.tsx`; projection: `patientRecord(bundle)`.

Preserve section meanings and their distinction:
1. Open issues where present: pending PHQ-9 item-9 review, active adverse effects, dated safety alerts.
2. Last completed visit's clinician-confirmed clinical summary and provenance.
3. Confirmed next-review focus.
4. Last recorded medication, measures and risk with dates.
5. Newer entries and enduring clinical context.
6. Patient-reported history and optional clinical synthesis.

Do not present an old negative risk observation as a current safety clearance. No global green "safe" badge. Distinguish unassessed, unknown, stale/unavailable and negative.

### Treatment / progression / history

Source contracts include `PatientBundle.medications`, `medicationEvents`, `medicationSideEffects`, `medicationRevisions`, `assessments`, `history`, `contextRevisions`, completed sessions and corrections. Reuse `PatientTreatment`, `PatientTimeline`, `HistoryPanel` and canonical projections during integration.

A mobile card must retain dose + unit + frequency, effective dates and relevant status. Do not flatten corrected medication history into an invented current regimen. Treat patient-reported history as patient-reported, not clinician-approved. A source mapping is not evidence that all live database behavior has been tested.

### Clinical recording

Sources: `VisitWorkspace.tsx`, `PatientSession.tsx`, `FollowupClosure.tsx`.

Preserve the current compact follow-up structure:
- Visit notes (`transcript`).
- Clinical picture (`clinical_state_summary`).
- Treatment decision (`treatment_decision`) and next-review focus (`next_review_focus`).
- Current medication with explicit Good/Neutral response, separate dose/frequency editing and structured adverse-effect flow.
- Existing MSE and risk editors; expand when current review/assessment is missing according to existing behavior.
- Psychometric measures.
- Relevant earlier context when present.
- Next appointment as a separate section.
- Completion and continue-later actions with their current meaning.

Do not reintroduce removed adherence or pinned-context quick forms. Retain legacy stored notes. Good/Neutral response currently updates clinician-authored clinical summary, not a new database field.

Canonical mutations include `save_closure`, `start_session`, `finish_session_later`, `finalize_closure`/`finalize_session`. Preserve expected versions, clinical context freshness, unfinished medication guards, finalization blockers, correction/provenance semantics and failed-save handling. Do not duplicate these rules in a second mobile implementation.

Dictation and AI are explicit clinician actions in the same editor. The initial prototype may demonstrate placement with clearly marked synthetic text, but must not record audio, send text to a model or imply a successful server save.

### Library

Preserve the current instrument catalog and intake/assessment assignment, preview, submission provenance, review and patient attribution. Do not invent questionnaire items, licensing status, scoring rules or new instruments. Prototype cards can demonstrate catalog navigation; sending a form and clinical scoring remain disabled simulations until using the existing backend.

## Visual direction

Warm canvas `#F8F5EF` is present in `PatientRecord.module.css`. Use a small coherent mobile palette with near-white content surfaces, deep green text/actions and subtle peach/sage emphasis. Inter is declared in the inspected base stylesheet; retain source-compatible system fallbacks. Avoid importing a font dependency or changing desktop font settings for this experiment.

Use readable 14–16px body content, 44px design-target touch areas, visible focus, adequate contrast, modest 16–24px surface radii and restrained shadows. These are design targets to validate, not a claim of accessibility certification. Prefer real clinical value over oversized greetings, decorative avatars/photos, new dashboards or invented metrics.

Prototype viewports: 360, 390, 430px; check narrow landscape and keyboard/focus behavior before integration. Keep visible clinical warnings readable rather than truncating them.

## Review scenarios

- Overview selection changes briefing while folder navigation retains the intended patient.
- Navigation uses the existing destinations; Back restores patient/tab context.
- Existing draft versus completed visit remains explicit.
- Older risk findings remain dated; no assumption of safety.
- An absent/unavailable medication load is not rendered as a confirmed empty regimen.
- MSE/risk today is not filled from an old visit without review.
- Cancelling an appointment does not silently cancel or finalize the clinical session.
- Unknown payment remains unknown until an explicit change.
- A pending side-effect or medication form cannot be abandoned without the established guard.
- Dictation/AI does not create new panels, silently finalize notes or discard recoverable text.

## Completion boundaries

A clickable design validates presentation and candidate interaction placement only. It does not validate real authentication, database compatibility end-to-end, clinical calculations, actual microphone support, network failures or iOS/Android device behavior.

Before integrating: review the latest source diff from the reference SHA, validate the full interaction/state matrix, establish desktop baselines, implement with existing components/contracts, run project checks and verify with synthetic data in an isolated test environment.

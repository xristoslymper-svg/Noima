# Existing patient experience — implementation and verification

Date: 17 October 2026. All test records and documents are synthetic.

## Scope and baseline

This branch is based on `integration/noima-all-20261016` at
`a095f231c97bd653f110b152ff4c7144f9f84645`, the head of draft integration
[PR #108](https://github.com/xristoslymper-svg/Noima/pull/108). At inspection,
#108 was open and mergeable, 70 commits ahead of main and zero behind. A final
fetch confirmed the same integration head before delivery. Main was
`27e61cefd3a7bb568a73a02a4e08ebf70a9a762a`. The original checkout contained no
unpublished changes.

The integration already provided the patient workspace, previous clinical
course, structured history and risk, prescription/event history, questionnaires
and scoring, assignment-linked paper scanning, the calendar, and the prepared
Clinical Summary architecture. Existing calendar commands could create a future
appointment without an assessment or session.

The missing pieces were independent historical totals, generic private
attachments, and a reviewed scan import without an assignment code. Existing
medication entry assumed start dates and needed an explicit registration source.
Measurements were buried in treatment, and the visible navigation used longer
labels. These were workflow gaps, not a reason to add another tab or dashboard.

## Implemented behavior

The four tabs are **Σύνοψη | Πορεία | Θεραπεία | Ιστορικό**.

| Entry point | Behavior |
| --- | --- |
| Πορεία → Μετρήσεις → + Βαθμολογία | Inline instrument, total and examination date; optional note. PHQ-9 defaults, while score/date remain blank. Save updates the chart and chronological record. |
| Ιστορικό → + Προσθήκη → Βαθμολογία | Opens the same score form directly within the selected record. |
| Ιστορικό → + Προσθήκη → Έγγραφο | Choose/drop a file and save. Title, category and document date are optional. No extraction is requested. |
| Ιστορικό → + Προσθήκη → Σάρωση εντύπου | Upload starts extraction automatically. Review the result, correct uncertain fields and approve once. PHQ-9, GAD-7 and psychiatric history are supported. |
| Θεραπεία → + Αγωγή | Opens the existing inline medication editor, defaulting to already taking. Medication, dose and frequency are required; unit is prefilled. Unknown dates remain unknown. |
| New basic record | A quiet optional «Προσθήκη παλαιών δεδομένων» action opens History. It is not a required sequence. The record is described as a new folder, not a new course of care. |

Previous clinical course continues to use the existing editor. Important history
and safety remain within the existing History/Risk architecture. No new calendar
or clinical encounter workflow was introduced.

### Clinical integrity and provenance

- Manual PHQ-9 and GAD-7 totals are validated in the API and SQL (0–27 and
  0–21). They are immutable historical measurements, not stored questionnaire
  assignments. Answers, appointment and session links remain null. Corrections
  append a replacement with clinician, time and reason.
- Examination dates, actual entry timestamps and clinician identity are stored
  separately. Charts and summary evidence use the examination date. A regression
  covers the Athens/UTC midnight boundary for date-only measurements.
- The shared chart adapter never reconstructs answers from a total. Historical
  projections cannot adopt an incidental encounter link or satisfy the actual
  questionnaire/visit-finalization gates.
- Scanned answers are saved only when complete, valid and consistent with their
  calculated total. A source containing only a total remains total-only.
  Unreadable answers remain absent until the clinician explicitly supplies a
  correction. Reported/computed discrepancies are visible during review.
- Scan approval is a single transaction. The public manual RPC cannot assert
  scanned provenance; only the approved scan transaction can call the private
  shared saver. Recognized patient-name conflicts require explicit confirmation.
- History review shows relevant new/different sections, leaving conflicting
  existing sections unselected. Approved text appends through the existing
  optimistic history version check. Exact repeated paragraphs are excluded.
  Immutable imports retain originals, selected additions, attribution, clinician,
  timestamp and the prior history version. Canonical appended text also retains
  concise patient-reported/document attribution.
- Existing/discontinued medication registration creates no visit or start event.
  Known dates are retained; blank dates remain SQL NULL. New prescribing requires
  the explicit prescribing choice. Subsequent clinical changes use the existing
  medication event/revision architecture.
- Summary policy 26 consumes confirmed historical measurements, previous course,
  treatment and approved history with source links. Positive historical item 9
  is historical context, not a current risk assessment. Raw documents and
  unreviewed extraction are excluded. Measurement/medication-only records use the
  deterministic summary path without an unnecessary model call. Print and
  clinical-assistant consumers preserve the same temporal/source distinctions.

### Documents and reliability

Originals use the private `patient-documents` bucket. Owner-scoped metadata and
storage policies bind each object to a workspace, patient and stable document
ID. The authenticated original endpoint validates that linkage and the stored
size/type/checksum before returning private, non-cacheable bytes. Upload,
retrieval and approval events are audited. No public object URLs are produced.

The allowlist is PDF, JPEG, PNG and WebP, up to 3 MiB per file and six originals
per scan. The application validates decoded structure as well as signatures,
dimensions and declared type. Active PDF content, malformed objects and corrupt
images are rejected. `pdf-lib` is pinned to 1.17.1 and `sharp` to the already
used 0.35.4 version. The file size limit keeps the existing Vercel request path
usable without introducing a separate upload service.

Stable request IDs make repeat saves/uploads/approvals idempotent; changed
payloads under the same ID fail. Score drafts use the existing bounded session
recovery mechanism. Upload/review dialogs preserve their in-memory work on close
and request failure. Originals remain available independently of extraction.

## Cognitive-load audit

Counts begin with the relevant tab already open. **Action clicks** count opening
the control/menu, choosing an action, opening the file picker and saving or
approving. They exclude typing, field focus, native file selection and correction
controls. Mouse-only totals vary with field choice; medication entry typically
adds two clicks for dose focus/frequency, plus an optional autocomplete choice.
Decision counts include preselected choices and the clinical judgments in the
tested case; known clinical values are counted as fields.

| Workflow | Action clicks | Required input | Decisions in tested case | Dialogs | Screen transitions |
| --- | ---: | --- | ---: | ---: | ---: |
| Historical score | 2 | 3 fields; instrument prefilled | 1 | 0 | 0 |
| Document | 4 | 1 file | 1 | 1 | 0 |
| Questionnaire scan | 4 | 1 file; supported extracted values prefilled | 3, including one uncertain correction | 1 | 0 |
| History import | 4 | 1 file; two relevant differences reviewed | 4 | 1 | 0 |
| Existing medication | 2 | Medication, dose, frequency | 1; existing status prefilled | 0 | 0 |

The final audit removed duplicate instrument/patient choices, mandatory dates
for old medication, classification screens, generic menus before score entry,
and questionnaire wording for manual totals. Notes, metadata, recognized
answers and detailed history comparisons stay behind disclosures. Clinical
approval and conflict choices remain explicit.

Browser inspection found and corrected medication-table overflow, a narrow
mobile dose field, a duplicate accessible file input and a large blank PDF pane
on browsers without a native PDF viewer. The final table retains seven semantic
column headers and readable mobile controls. Charts are compact and aligned
with their heading. No new page transition or permanent toolbar is required.

Real Next.js HTTP checks exposed the global framing headers overriding the
document endpoint's intended policy. An exact document-route header rule
preserves its sandbox and permits same-origin framing; other endpoints retain
the global framing denial. The real-service suite checks both policies.

## Verification evidence

The [evidence report](existing-patient-evidence-20261017/report.json) includes
the counting method, execution scope and limitations. The directory contains
14 current desktop/mobile screenshots and four additional regression reports.

| Gate or scenario | Evidence |
| --- | --- |
| Unit/regression gate | `npm test`: 89 test-file entries passed, zero failed/skipped. |
| Types, lint and languages | `npm run typecheck`, `npm run lint`, `npm run check:i18n` passed; both dictionaries complete with zero unused messages. |
| Production compilation | `npm run build` passed. Existing Next/webpack cache and previous-course CSS warnings are non-fatal. |
| A: historical scores | Three dates entered out of order, bounds, persisted ordering, chart, null answers/item9, immutable correction and date boundary verified. |
| B: documents | Synthetic discharge PDF upload, metadata, private policies, exact authorized bytes, cross-patient denial and audit verified. |
| C: historical questionnaire | Code-free PHQ-9 extraction fixture, uncertain item-9 correction, discrepancy and explicit approval verified; original PNG rendered beside review. |
| D: old history | Selected hospitalization appended, conflicting allergy retained, stale review rejected and equivalent repeat import excluded. |
| E: medication | Existing/discontinued entries with unknown dates, no visits/start events, lost-response retry and double-click behavior verified. |
| F: existing workflows | 32 visit/calendar, 10 warm-workspace, 10 clinical-reliability and 9 clinical-editor/MSE/recorder browser checks passed (61 total). |
| G: security | Actual authorization wrappers, RPCs, migration RLS/grants, private-saver denial, spoofed workspace, anonymous/cross-origin access, malformed content and retry collisions verified. |

The new API suites contain 16 named cases (6 score/calendar/medication and
10 document/scan/history/security). Additional focused suites cover medication
transitions (8), historical summary (8), PDF/scan validation (9), and printed
exports (5). The existing-patient browser runner passed at 1440×1000 and
390×844 and is included in the clinical UI GitHub Actions workflow.

### What this does and does not prove

The local React/API suites ran against actual repository SQL migrations, RPCs,
triggers, authorization and RLS in disposable PGlite PostgreSQL databases.
Synthetic adapters supplied Supabase-owned Auth, REST transport and object-byte
transport. Extraction used deterministic provider responses.

The separate **Isolated visit application APIs** GitHub Actions workflow starts
disposable Supabase services, applies the repository migrations and builds the
actual Next application with loopback-only endpoints. Its existing visit and
calendar regression passed with real cookie Auth and PostgREST. The workflow
now also enables private Storage and invokes
[`existing-patient-supabase.mjs`](../browser-tests/existing-patient-supabase.mjs)
on desktop and mobile. That helper exercises historical scores, original bytes,
Storage policies, cross-patient/workspace denial, retries, reviewed imports,
existing medication, previous course and a calendar-only appointment.
Its execution results and screenshots are written to the workflow's
`visit-application-api-evidence` artifact under `existingPatientResults`.

External AI remains disabled in that real-service suite, including an assertion
that the actual extraction endpoint refuses the request. Only the browser's
extraction response is a deterministic fixture, backed by authenticated scan
RPCs and an original that was really uploaded and retrieved. Upload, review and
final approval continue through real application routes. The service-role
client only sets up synthetic users and inspects the private bucket settings;
clinical writes and document delivery use the authenticated clinician client.
No real clinical data, email or SMS is used.

Deployment-specific hosted configuration and live extraction accuracy remain
untested. No isolated hosted branch was available; the branch creation request
did not complete, and a subsequent read confirmed that no branch was created.
The local headless browser has no native PDF viewer: authorized PDF bytes and
the compact protected-original fallback were verified, while native PDF viewer
rendering remains unverified. Image originals were visibly rendered.

## Database and release boundary

Three new migrations are committed for review, in order:

1. `20261017091927_historical_measurements.sql`
2. `20261017091931_patient_document_imports.sql`
3. `20261017092001_existing_patient_medication_registration.sql`

They have only been applied to disposable local and GitHub CI test databases. **No shared or
production database migration, merge or production deployment is authorized or
performed by this change.** A code preview against the existing shared schema
cannot establish successful hosted writes for these additions. Missing-feature
RPCs fail explicitly while existing patient reads retain their fallback path.

The next release gate is an approved isolated hosted database and application
preview configured exclusively for it, followed by deployment-specific
Auth/Storage and live scan tests with synthetic records. Shared-database
migration and merge require separate explicit authorization.

Bulk CSV/Excel migration remains future scope. It would need a reviewed staging
format, explicit patient matching and stable external record IDs before safe
batch writes; no bulk importer was built here.

# NOIMA integrity audit — 8 October 2026

## 1–3. Repository and production state

Inspected current main: `76c0e7e4fd1f3a968f02ce4c6294e99b219f5464`, verified against remote before editing and again before publication. Main did not advance. Vercel's latest READY production deployment reports `ef95fbf068b838cd1d724fda5f08d183abc96ca8` (deployment `GdXczCTtLEjXTiqa2L6gKjvNAUdL`). The live app is behind main. The intended medication CRUD and patient-submissions changes were retained; production was not used to reverse them. Deployment metadata was observed; authenticated production UI was not exercised.

## 4. Overall health

The code has useful transaction boundaries, explicit demo ownership, medication event history, version checks, and separate patient-reported versus clinician-reviewed data. The original 167 tests passed, but they missed reproducible identity-resolution and medication workflow defects. The audit adds behavioral and database coverage and fixes these defects without a visual redesign.

This is a code, API and local PostgreSQL audit with component interaction testing, not a completed real-device or authenticated browser acceptance certification. All 191 tests pass. External provider delivery, real Supabase concurrency and mobile visual/accessibility acceptance remain release gates.

## 5–6. Findings and implemented fixes

### P0 — confirmed integrity failures, fixed locally

- Exact-AMKA conflict resolution accepted an unrelated owned folder. A clinician could attach reported history and assessments to a folder with a different AMKA. The resolver now requires the submitted AMKA to match the target folder; unrelated targets and new-person resolution are rejected. Regression tests reproduce the original failure and prove payload preservation and correct linkage.
- A phone/email conflict could be resolved as a new person after another folder with the same submitted AMKA was created. Resolution now rechecks identity under the shared workspace transaction lock. A trigger also guards manual creation and AMKA changes, without merging or rewriting existing folders. Same AMKA in different workspaces remains allowed. Existing legacy duplicates are not repaired by this migration.

### P1 — core workflow/reliability failures, fixed

- Inline medication stop used a compatibility RPC that obtained the latest version instead of enforcing the version the clinician saw. Stop now uses the versioned event-write action, preserving optimistic concurrency and explicit draft-session association.
- Starting and stopping on the same date failed with `event_date_conflict`. A terminal stop may now coexist with that day's start/change; chronological course validation still rejects events before a start, after a stop, and repeated stops. New event timestamps preserve ordering within one transaction.
- Folder opening could generate an AI summary synchronously on cache miss/staleness. GET now immediately returns the canonical record-derived summary and sources. Normal navigation never falls back to generation POST. Existing background jobs and explicit manual refresh remain available.

### P2 — interaction and trust defects, fixed where intent was clear

- Autocomplete could reopen after selection, Escape or blur and display stale requests. Sequence invalidation, abort handling, focus/dismissal checks and clearing results prevent this. Brand selection changes only the name; free text remains supported. Keyboard and mouse selection are tested.
- Medication mutations could be submitted twice before a render disabled the controls. Synchronous in-flight guards now prevent duplicate submissions. Committed additions whose reload fails clear the draft and show an explicit reconciliation error instead of inviting a duplicate retry.
- Draft visits used the old medication modal while folders used inline CRUD. Both now use the same explicit edit/stop/add table. Folder edits do not silently attach to an arbitrary existing draft.
- History integration could discard edited review content on close/navigation. Dirty review edits now receive cancellation confirmation and navigation/unload guards; local unsaved history blocks starting integration.
- Conflict resolution lacked consistent dismissal, body scroll locking, busy-close protection and HTTP failure handling. Shared overlay behavior now handles those paths. Intake send/resolve also have synchronous duplicate-action guards.
- Nested Library/launcher Escape listeners could close multiple layers. A shared topmost-overlay stack now closes one layer, preserves pre-existing body overflow and cleans up listeners. Appointment choices and mobile navigation use it too; appointment-start native-dialog backdrop clicks are checked against the actual bounds.
- Overview grouping could still offer Psychometrics after assessments were reviewed merely because the original intake selected those tools. Destinations now reflect outstanding assessments and history independently, preserving channel, identity-conflict state, timestamps and item-9 pending review.
- Library PHQ-9/GAD-7 text duplicated the instrument registry and described demo Greek wording as official/validated. Previews now use the canonical wording/answer labels and honest demo source labels. ASRS scoring was retained after checking its published scoring update. Repeated custom question wording no longer creates duplicate React keys.
- Dependency audit identified the high-severity sharp advisory. A global patch override updates sharp to 0.35.5 for Next and Transformers. Audit high/critical counts are now zero; five moderate dependency-chain findings remain.

### P3 — low-risk cleanup

- Removed `MedicationModal`, its import/render path, obsolete modal state, management callback and modal-only session guards.
- Removed unused `onManage`/mode paths from MedicationTable and proven modal-only CSS, preserving shared history/risk styles.
- Extracted medication action construction and submission grouping into focused shared helpers.

## 7. Dead/stale code deliberately retained

The legacy database/API medication-stop compatibility path remains for existing callers; the current table no longer uses it. Removing public RPC contracts without a caller migration was outside this safe cleanup. History preview/print definitions and SQL instrument scoring/version constants still have separate representations. They need coordinated canonicalization rather than blind deletion.

## 8. Tests added

24 net additional tests (167 → 191), including seven new PostgreSQL transaction tests and actual React component interaction tests:

- Intake assignment does not create a ghost folder; invalid submission rollback; successful/repeated finalization creates and links once; history and PHQ/GAD scores/provenance persist.
- Generic assessment review/history integration do not clear pending PHQ-9 item-9 review.
- Exact AMKA cannot link unrelated folders; later-created AMKA cannot be duplicated; explicit distinct-person phone/email conflicts and provisional appointment links remain supported.
- Manual AMKA uniqueness and cross-workspace isolation; same-day medication start/stop, stale writes, invalid course rollback and future projections.
- Required medication fields, free text, decimals, double clicks, cancel, errors, draft association, edits and stop dates, reload failure recovery, keyboard/mouse autocomplete and stale-response dismissal.
- Submission grouping and independent destinations/provenance; nested overlay cleanup; appointment dialog inside/outside dismissal; new/draft workspace CTA placement and direct medication-tab reload; Library wording/source honesty.
- Summary GET fallback without provider generation; explicit manual refresh and mismatch handling.

Tests use fictional local fixtures, mocked providers and PGlite executing the migration chain. They do not send emails or write real patient data. React renderer emits a deprecation notice; replacing that harness with browser interaction tests is a future maintenance task.

## 9–10. Remaining risks and deployment restrictions

1. Migration `20261008125342_audit_intake_and_medication_integrity.sql` is generated through the Supabase CLI and tested locally only. It replaces intake resolution and the private medication implementation, and adds the AMKA guard trigger. It preserves the public authenticated medication wrapper. Stage this migration on a development Supabase database, run security/performance advisors, exercise concurrent identity operations and verify grants before any production application. No live migration/advisor run was performed.
2. Do not deploy the frontend alone and assume its database fixes exist. Do not deploy this audit directly to production before the migration and acceptance gates. Existing live production remains unchanged.
3. Intake assignment retries are not fully end-to-end idempotent: a lost response/mail failure can leave an assignment and retry can create a new token. Add a stable assignment request key and delivery/outbox reconciliation. Email recipient reset logic already exists; no stale-subject fix was claimed.
4. Summary background work still needs durable scheduling/deduplication and stale-cache backfill checks. Navigation is now provider-independent, but immediate fresh generated prose is not guaranteed after every mutation.
5. Tablet/shared-device completion, scanned-form provider extraction plus human confirmation, print layout, real delivery/completion loops and authenticated desktop/mobile navigation require browser/device acceptance. They were not certified by the component tests. Patient submissions must remain reported data until explicit clinical review.
6. Instrument rights, Greek translation validation and intended clinical use need approval before clinical rollout. The demo labels are honest; they do not establish validated translations. Custom instruments remain preview-only. Further registry/print/SQL unification is needed.
7. Some overlays still lack complete focus trapping and restoration; the shared Escape/scroll fix does not certify universal modal accessibility.
8. Five moderate npm findings remain in the Transformers/sprintf-js dependency chain. No patched sprintf-js release was available in the checked registry. A suggested major Transformers upgrade was not forced during a regression audit. Application exploitability was not proven or dismissed.

No production deployment, billing/settings changes, real emails, or real patient writes occurred. No full-recording feature or unrelated visual redesign was introduced. Existing section dictation and calendar command intent were preserved.

## 11–12. Commands and validation results

Run in the isolated checkout:

```text
git clone https://github.com/xristoslymper-svg/Noima.git
git ls-remote origin refs/heads/main
git switch -c audit/noima-integrity-20261008
npm ci --ignore-scripts
npx supabase migration new audit_intake_and_medication_integrity
npm install --save-dev --save-exact react-test-renderer@19.3.0 --ignore-scripts
npm install --ignore-scripts
npm ls sharp
npm audit --json
npm run typecheck
npm run lint
npm test
npm run build
git diff --check
```

Focused test runs used `node --experimental-strip-types --test` with `tests/database.test.mjs`, `tests/medication-interactions.test.mjs`, `tests/submissions.test.mjs`, `tests/workspace-overlays.test.mjs`, and summary route/request tests during fixes.

| Check | Result |
|---|---|
| Typecheck | Passed |
| Lint | Passed, zero warnings |
| Tests | 191 passed, zero failed/skipped |
| Production build | Passed with dummy Supabase/OpenAI/encryption settings |
| Diff whitespace | Passed after removing trailing whitespace |
| Dependency audit | 0 critical, 0 high, 5 moderate; audit exits nonzero for remaining findings |

The first sandboxed build failed with EPERM creating generated Next files; the authorized retry passed. No build was skipped. Dummy build configuration validates compilation, not a live backend/provider connection.

## 13–15. Delivery

Branch: `audit/noima-integrity-20261008`. The companion delivery report records the final commit and draft PR after publication. This report is committed with the implementation so reviewers can inspect the scope and release gates together.

## 16. Guided pilot decision

Conditionally suitable for a supervised fictional/demo-data pilot after the migration is staged and authenticated acceptance checks pass. Not a sign-off for real-patient clinical deployment. The older live deployment does not include either intended main's recent changes or this audit's fixes.

## 17. Top five next engineering priorities

1. Stage the identity/medication migration; verify concurrent operations, grants and Supabase advisors; inspect legacy AMKA duplicates without automatic merges.
2. Make assignment creation and email delivery retries idempotent and observable, including lost responses and partial delivery failures.
3. Add authenticated browser E2E coverage and desktop/mobile/tablet acceptance for intake, conflict resolution, visit finalization, scan confirmation and external completion loops.
4. Finish instrument metadata/print/SQL canonicalization and establish translation/licensing/clinical-use gates.
5. Make summary background jobs durable and deduplicated; remediate the remaining moderate dependency chain with a separately validated upgrade.

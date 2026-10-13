# Clinical workflow reliability — implementation and verification

## Scope and source preservation

Work remains in draft PR #100 on `codex/deployed-workflow-fixes-20261012`, based on `codex/first-assessment-release`. No production deployment, merge, alias change, shared database migration or real email was performed during this verification pass.

The prior unpublished privacy safeguards remain in their separate ancestor commit `ef17836756ec50d00d8415f9d318a838bfd2a47a`. The clean checkout, git diff and ancestry were verified in the existing CI runner before edits. README and security-readiness guidance were read; no tracked AGENTS.md or CONTRIBUTING file was found. A different, inaccessible developer working tree was not inspected or reset. Temporary source-handoff scripts/workflows removed themselves after appending the verified edits; no permanent privileged write workflow was added.

The final implementation before this documentation-only commit is `f96e7ea4fecf04a5c7f9dd61cea0edc1a1824238`.

## Findings → repairs → evidence

| Request | Confirmed finding and implemented repair | Verification and limit |
| --- | --- | --- |
| 1. Finalization | Late shell/full/visit responses could replace newer state. Completion acknowledgement, database completion and successful UI refresh were not sufficiently separated. Added explicit identity/version validation, irreversible completed-state reconciliation, single-flight finalization, authoritative post-write read and awaited folder refresh before success. A committed operation with failed refresh is reported as committed-but-unverified, not retried or described as an untouched draft. | Regression tests cover malformed success, stale response, missing fields, optimistic conflict, refresh failure, read-only retry, timeline and grounded summary sources/cache key. Actual repository RPCs executed in disposable PostgreSQL. The user's exact hosted incident was not replayed. |
| 2. Resume versus Record | Detailed follow-up omitted its shared transcript field, and independent responses could overwrite the selected visit's newer state. Exposed the same stored transcript and reconciled by patient/session/row identity and independent closure version. Preserved explicit empty edits, legacy content and provenance. | Browser tests switch tabs and reload while retaining the exact session and current text; unit tests reject foreign patient/tenant data and prevent historical notes being copied into current findings. |
| 3. Psychometrics | Pending-result navigation needed an explicit submission target rather than only a generic patient destination. Links retain the assessment identifier; the corresponding result opens with answers, score and review controls. | Actual server-scored PHQ-9 submission, duplicate submission, exact patient/session linkage, score 13, answers, timestamps, timeline/context invalidation and cross-tenant rejection are tested in PostgreSQL. Browser tests open the exact result on desktop/mobile and verify that viewing/reloading never records clinical review. Item-9 review remains separate from general review. |
| 4. Calendar and new patient | Provisional scheduling did not provide atomic, retry-safe patient creation. Added a scoped request ledger and transactional RPC for patient + appointment. Also found the saved-appointment scroll effect had no target assigned by the editor callback. The callback now sets target/day before reload can trigger automatic centering. | Database tests verify identical retry, changed-payload rejection, foreign request rejection and rollback of patient/history on appointment failure. The actual save callback was tested failing before the focus patch and passing afterwards, including delayed/failed refresh. Full hosted calendar/browser/database flow remains unverified. |
| 5. Patient details | Editing was difficult to discover. Added registry edit access and per-field pencil/Save/Cancel in a row/column layout. Renamed History to Στοιχεία & ιστορικό. Unsaved demographic edits now block navigation instead of silently saving. | Desktop/mobile browser tests exercise edit, blocked navigation, cancel, explicit save and reload persistence. Clinical history autosave remains a separate existing behavior. |
| 6. Treatment terminology | Renamed the tab to Θεραπευτικό πλάνο while retaining medication as a distinct section. | Existing workspace views and navigation checks pass at desktop/mobile widths. |
| 7. AI affordance | The icon alone did not communicate intent. Added a visible wording-improvement label and contextual accessible label/tooltip. | Clinical editor accessibility checks retain the same editor, explicit proposal confirmation and original/source text. No new AI calls or automatic clinical approval. |
| 8. Second medication | SideEffectEntry initialized/reopened automatically for first assessments. It now opens only on request and closes after save/cancel. Existing medication-ID keys and independent drafts are retained. | Unit isolation tests and browser tests add a second synthetic medication, verify no unsolicited effects/history editor or values, and reload the saved row. |
| 9. Invitation email | Reworked Greek invitation wording with a neutral subject and minimal clinical detail. | Source/template review and existing validation only; no real delivery was attempted. |
| 10. Microphone | Added cancellation checks before acquisition and permission-state inspection; denied permission is explained rather than reacquired repeatedly. Existing global recorder lease and track cleanup remain. | Permission/cancellation unit tests and native Chromium synthetic-audio checks pass. This does not guarantee persistent browser permission or remove operating-system/Safari/iOS prompts. No live microphone is retained after exit. |

## Verification evidence

- 388 automated tests passed in the final calendar-focus verification runner, including the added actual-RPC roundtrips and three save-focus regression tests.
- TypeScript, lint and production build passed in the same runner.
- 29 clinical browser scenarios passed before the final calendar-only callback change: 9 clinical editor checks, 10 workspace viewport/tab checks and 10 critical workflow checks (5 flows at desktop 1440px and mobile 390px).
- The separate synthetic recorder browser workflow passed.
- The documentation commit reruns the normal PR checks; their exact head SHA and conclusion are the release authority, not this prose.

Evidence:
- Final callback reproduction, all 388 tests, typecheck, lint and build: https://github.com/xristoslymper-svg/Noima/actions/runs/38315682205
- Clinical browser suites: https://github.com/xristoslymper-svg/Noima/actions/runs/38315302679
- Synthetic recorder checks: https://github.com/xristoslymper-svg/Noima/actions/runs/38315302659

## Test boundaries and release prerequisites

Browser checks use real React components and CSS with persistent synthetic HTTP responses. PostgreSQL tests separately execute the repository migrations and actual RPCs in PGlite. These are not a single authenticated hosted browser-to-Supabase end-to-end run. No real patient records, email deliveries or external model responses were used. Automated viewport checks do not substitute for manual validation on physical mobile devices.

`supabase/migrations/20261012195628_calendar_patient_retry.sql` is included and tested only in the isolated database. It is necessary for atomic idempotent calendar patient creation and must be reviewed and applied through an authorized release process before enabling that path on the deployed database. Do not silently fall back to two non-atomic calls.

The install audit reports six existing dependency vulnerabilities (four moderate, two high). No unrelated forced dependency upgrades were introduced. This PR is not a certification of production or regulatory readiness.

No RAG, agents, additional clinical inference, new persistent infrastructure or removal of clinical/tenant safeguards was introduced. Keep the PR unmerged until hosted validation and the migration prerequisite are resolved.

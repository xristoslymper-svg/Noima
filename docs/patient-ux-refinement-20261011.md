# Patient workflow refinement — 11 October 2026

## Baseline and method

Audit completed before application edits, against main `31bf67fcc0af6eaf7bef45b4ccc9bf266e127161`. Vercel's signed-in Deployments UI showed Ready production `noima-clnpj8nuy-xristoslymper-3481.vercel.app` on the same commit. The Vercel connector returned a scope-access 403; browser inspection supplied the deployment evidence. No production changes are authorized.

Open work considered: #97 completed-MSE display, #87 recording surfaces/MSE, #66 autosave and initial-summary/risk integrity, #59 voice capture, #56 patient IA, #55 identity/medication integrity, #93 Overview. This pass does not absorb those branches. Some older PR ideas are already present on main; titles alone are not evidence of missing functionality.

Rendered inspection uses the actual registry, PatientWorkspace and nested visit components, imported unchanged into a local esbuild harness with synthetic HTTP fixtures. Only Next navigation/link adapters and API responses are simulated. Production auth and backend are not bypassed or modified. Baseline scenarios cover empty, initial-only, initial-plus-follow-up, six visits, active medication with five events, a draft, and incomplete history at 1440, 768 and 390px. An additional initial draft covers documentation. This verifies frontend behavior, not hosted persistence or provider behavior.

## Executive assessment

The five-tab record is coherent. The warm reading surface, explicit encounter provenance, independent draft flushers, clinician-triggered writing assistance, and explicit previous-MSE confirmation are strengths. The highest-value changes are recoverable navigation, readable registry details, visible draft status, and separating treatment-response choices from tolerability actions. Preserve clinical concepts and the existing visual language.

## Ranked findings

| Screen | Finding | Why it matters | Proposed improvement | Risk | Priority |
|---|---|---|---|---|---|
| Summary | **Confirmed:** “All changes in Timeline” calls `onVisit()` and opens Record. Reproduced in browser. | Breaks the path from recent events to longitudinal context. | Dedicated timeline callback through the existing guarded tab transition. | B / low, small | P1 |
| Registry | **Confirmed:** 10px supporting text, pale blue-grey metadata, 28×32px folder link at 390px. | Clinical context is hard to read and touch actions are small. | Raise supporting type/contrast; 44px mobile actions; preserve serif heading and compact rows. | A / low, small | P1 |
| Registry | **Confirmed:** draft count/filter exists but individual rows do not identify drafts. | Clinician cannot identify unfinished visits without filtering/opening folders. | Small “Πρόχειρη επίσκεψη” indicator derived from existing `draft`. | B / low, small | P1 |
| Registry | **Confirmed:** search lacks an accessible name, filters lack pressed state, no-results has no reset. | Keyboard/screen-reader users receive less context; recovery takes extra steps. | Label search, expose selection, distinguish empty registry from filtered emptiness and add reset. | B / low, small | P1 |
| Workspace | **Confirmed geometry; spacing preference:** inherited shell adds 32px above tabs, on top of hero spacing; tablet tabs overflow while name is squeezed beside the action. | Delays access to the record and hides actions at intermediate widths. | Remove only inherited shell padding; wrap tabs/header within patient module at tablet widths. | A / low, small | P2 |
| Compact follow-up | **Confirmed:** side-effect action is inside the response group alongside Good/Neutral. | Visually suggests tolerability is a mutually exclusive efficacy value. | Separate labeled tolerability row; keep the same side-effect modal and stored response behavior. | B / low, small | P1 |
| History | **Confirmed:** populated clinical notes are behind a disclosure labeled only “Optional”. | Existing history can be overlooked or assumed absent. | Indicate existing content from current draft values and explain the shared record source. | B / low, small | P1 |
| Treatment | **Confirmed:** adherence shows a bare date beneath the text. | Old encounter information can be mistaken for today's assessment. | Label it as the last completed encounter's confirmed record, preserving its timestamp. | B / low, small | P2 |
| Initial/detailed documentation | **Confirmed:** Risk/Scores navigation labels are inconsistent with Greek section headings; adherence is labeled “Συμμόρφωση”. | Adds terminology friction without a clinical benefit. | Greek navigation labels, “Λήψη αγωγής”, and a symmetric “Σύντομη καταγραφή” mode-switch label. | B / low, small | P2 |
| Initial-only summary | **Confirmed:** summary reads approved continuity only; a completed structured initial without continuity produces the no-confirmed-memory message. | Structured assessment and plan are available in the visit but absent from summary. | Defer source-aware fallback with correction provenance; review overlapping #66 separately. | C / clinical/source logic, medium | P1 |
| Summary risk | **Source-confirmed:** concise risk wording uses `suicidal_ideation`; structured tree includes a distinct death-wish question. | Wording must match the question actually assessed; unknown/unassessed are not negative. | Defer structured, question-specific presentation with fixtures for each tree branch; coordinate #66. | C / clinical semantics, medium | P1 |
| Compact vs detailed | **Confirmed source overlap, not interchangeable concepts:** closure has approved summary/decision/review fields; detailed mode uses separate sections. | Re-entering/switching views can create conflicting expectations about which draft supplies final text. | Keep contracts; separately audit bidirectional synchronization and finalization semantics before changing any field. | C / persistence and clinical finalization, high | P1 |
| Treatment/longitudinal record | **Confirmed architecture:** response markers live in clinical-state text; medication events and adverse effects are separate entities. | Structured efficacy trends cannot safely be inferred from a cleaned-up UI; duplicate *display* of effects is not duplicate input. | Preserve both views and markers; consider a separately approved response model only when clinically needed. | C / schema/export/AI context, high | P2 |

## Workflow and downstream dependency audit

Registry (`app/patients/page.tsx`) reads patient rows, latest completed visit, existing draft and next appointment. PatientWorkspace owns URL tabs and guarded navigation, combines a fast visit shell with full record context, and keeps VisitWorkspace mounted while switching tabs so draft guards remain active. Summary and Timeline share `patientRecord`; Treatment uses the same current medication/event/side-effect bundle; History and VisitHistory both write `save_history` to the same patient history.

`PatientSession` routes drafts to initial/detailed editors or `FollowupClosure`, and completed records to `CompletedRecordEditor`. SectionEditor/StructuredVisitEditor and useClinicalDraft retain autosave, version checks, recovery and explicit flush-before-navigation. VisitWorkspace retains finalization and defer calls. Nothing in this pass changes required-field checks, risk trees, MSE reuse, finalization, audit history, or clinical selectors.

| Apparent overlap | Stored source and distinction | Downstream behavior preserved |
|---|---|---|
| Presenting complaint vs interview vs assessment | Patient identity `chief_complaint`; encounter `interview`; structured assessment diagnosis/impression | Existing chief complaint reference remains available; no fields combined or copied automatically. |
| Stable history vs visit history | Both edit patient history; patient self-report remains a separate intake source | Shared autosave/version semantics and original self-report preserved. |
| MSE today vs previous | Encounter document and explicit prior references/corrections | No automatic carry-forward or inference that a blank domain is normal. |
| Risk vs summary | Encounter risk/tree, correction-aware record selector, concise summary label | No clinical reclassification in this pass; source wording concern deferred. |
| Plan vs next review | Separate section keys and separate continuity fields | Treatment decision and future assessment focus remain independently persisted/exported. |
| Medication vs changes vs response vs adherence vs effects | Current regimen/event history; textual response markers; adherence text; adverse-effect entities | No prescription mutation, response parser, side-effect handler, or clinical-day logic changed. |
| Summary vs timeline | Approved latest continuity vs dated completed visits/events/measurements | Timeline callback corrected only; chronology and draft exclusion unchanged. |
| Notes vs approved continuity | Raw transcript and clinician-approved text, with writing provenance | AI remains explicit and field-scoped; original text, retry and review controls retained. |

API route contracts, database migrations/RPCs, summary generation, clinical export (TXT/print), AI context builders, and audit/correction files remain unchanged. Calendar linkage is an existing dependency; this pass does not alter Calendar, Dashboard, Library or authentication.

## Verification and delivery

Implemented the nine A/B refinements above. No category C changes. Existing completed-editor adherence labels also use “Λήψη αγωγής”; no completed MSE presentation changes were imported from #97.

- TypeScript: PASS (`npm run typecheck`). ESLint: PASS (`npm run lint`). Existing tests: 343/343 PASS (`npm test`). Optimized production build: PASS (`npm run build`).
- Browser: all five tabs at 1440, 768 and 390px, correct selected state, no document or tab-strip horizontal overflow. Registry search/reset, draft filter and row indicators, named actions, populated history disclosure, and summary-to-timeline transition verified.
- Draft scenario: enter distinct clinical picture/decision/review text; choose efficacy; defer; reload; reopen. Exact text and response marker retained; treatment decision and review stayed separate. Side-effect action opened the existing modal and cancel preserved efficacy. Missing risk blocked completion. Explicit risk/MSE review then exercised the frontend completed-record transition with a simulated success response.
- Static scope review: no migration, API, auth, summary generation, export implementation, draft hook or clinical finalization edits. The only `lib` edit translates navigation labels.
- Existing tests cover history/record chronology, correction attribution, risk/MSE guards, response parsing, draft recovery, navigation and exports. Browser behavior checks target the actual UI regressions rather than adding string-matching tests that merely duplicate the markup.

Browser fixtures are synthetic. Hosted authentication, real database persistence, transcription and AI output are not established by the local harness. No merge or production promotion. Hosted preview verification and delivery identifiers are recorded with the PR.

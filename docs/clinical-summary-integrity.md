# Clinical Summary integrity contract

Baseline: 30f70e17421f45318aba94b2fa8b2649f49bea18. Demo runtime is explicitly fictional. Production-grade clinician authentication and ownership on this consumer remain a separate release gate; the parallel foundation does not protect demo data.

## Preserved invariants

| Existing invariant | Change | Why it still holds |
|---|---|---|
| Exact appointment/session identity and one intended active draft | No lifecycle RPC replaced | Existing transactional identities, uniqueness and retry behavior remain enforced. |
| Immutable finalized sessions; append-only corrections | All addenda enter derived context regardless of parent age | Summary performs reads only; old narrative is withheld from synthesis when a correction exists, rather than rewritten. |
| Medication history and point-in-time state | Context includes events, revisions, dates, resolved and unresolved effects | Existing date-based RPC remains authoritative. Future events are explicitly separate. |
| Risk uncertainty and psychometric provenance | Canonical deterministic findings carry all risk fields and review timestamps | Neither model output nor narrative overwrites structured state; missing is not negative. |
| Approval, optimistic concurrency and reload | No write contract weakened | Existing approval/version tests remain applicable; Summary hash includes every canonical bundle field plus clinic date and policy. |
| Input-to-display provenance | Each source has kind, ID, session ID, timestamp, label, target and exact content | Multiple evidence entries open individual canonical snapshots before optional record navigation. |
| No AI mutation | Summary reads canonical bundle, generates derived output in memory | No new clinical writes or derived-to-canonical promotion exists. |
| Psychometric/session synchronization | Revoke PUBLIC execution on private trigger function | Trigger execution continues; direct unnecessary execution privilege is removed. |

## Architecture

`buildSummaryContext` builds durable history/safety evidence, current authoritative state, recent trajectory, all corrections, and a complete narrative archive. It retains old safety notes in their original provenance rather than promoting them into structured history. All finalized narrative is available to the model; no arbitrary last-N cutoff decides whether old corrections exist.

Canonical risk, medications, planned changes, adverse effects, psychometric trends and review timestamps are deterministic. They are included independently of model output and checked by a critical-coverage gate. The model selects a small number of exact complete-sentence quotations across sections for picture, trajectory and plan. Unsupported quotations, lost negation, duplicate/mismatched categories, review assertions, and corrected-parent quotations invalidate the entire model result. This deliberately uses extractive rather than unrestricted abstractive synthesis: the model can choose evidence, not invent or reinterpret authoritative states.

Corrections are preserved verbatim and suppress reused original conclusions; their exact scope remains a clinician decision. Conservative narrative/structured reconciliation cues ask for review rather than declaring a diagnosis or changing data. Lexical cues are not a complete medical-language classifier; all narrative and corrections stay inspectable.

Context version is SHA-256 over a stable serialization of the full canonical bundle, clinic day, and Summary policy version. Answer order is preserved. Client and server use the same contract; request mismatch is 409, old responses cannot render for a newer key, and generation is cached by exact hash with bounded in-memory storage. The workspace refreshes visible Summary on focus and every 30 seconds for external edits/date changes. Same-workspace mutations refresh immediately. This is a dated snapshot, not a real-time collaboration guarantee.

Provider failures and invalid output return only deterministic facts and attributed safety/correction evidence, with synthesis explicitly unavailable. No copied latest plan is presented as a fallback conclusion. If the complete record exceeds the bounded provider input, synthesis is withheld; canonical facts and evidence remain available, without silent truncation.

## Product decision before Phase B

- KEEP: session approval, autosave/flush, explicit risk, finalized read-only view, append-only addenda, temporal medication and questionnaire linkage.
- SIMPLIFY: repeat source buttons into category groups and exact evidence lists; reduce duplicate new-session actions and explanatory copy.
- CHANGE: calendar opens appointment-specific patient context before exact linked start; pre-visit view puts unresolved safety/review state first.
- ADD: compact score trajectories and readable complete record export. Investigate selective reuse only if provenance and explicit approval are clear.
- REMOVE: old unsafe narrative fallback and independent Dashboard risk/plan conclusions; no generic chat or unrelated modules.

## Boundaries

Not production-grade authentication. Real-patient readiness remains blocked. The `CLINICAL_DATA_MODE=real` switch fails closed on the patient runtime, Summary and export endpoints and hides the application UI; it does not secure direct public demo access or turn the demo into a real clinical tenancy. Only fictional data is permitted in this application surface. Full authentication would require connecting the actual data consumer and all lifecycle RPCs to trusted clinician/practice membership rather than repurposing the client UUID; this is deliberately not represented as complete.

Selective carry-forward was inspected and deferred: the present section source contract records manual/approved AI input, but not a prior-section identity with explicit current-visit approval. Copying text through that contract would lose the requested provenance. No risk assessment or prior note is automatically copied. Existing progressive disclosure of optional sections and all five backend-required sections remain intact.

## Current main Summary remediation (2026-10-05)

The earlier architecture and access boundary above describe the historical baseline, not current main. This pass does not change authentication or RLS.

Current Summary permits longitudinal Greek paraphrases with 5–8 clinically selected bullets for rich longitudinal charts; sparse charts may have fewer. Structural validation requires real, unique source IDs, complete bounded sentences, and every applicable correction/revision. An independent provider verification checks each exact bullet against its cited evidence and authoritative state before caching or display. Verification failure rejects the entire synthesis. This is a probabilistic semantic safeguard, not a formal guarantee.

Successful synthesis includes only genuinely necessary deterministic attention findings. Routine adverse-effect mentions, resolved mild effects, explicit denied allergies and unasked conditional intent/plan after negative ideation do not force a canonical chart dump. Unknown primary risk fields, actual risk conflicts, unresolved severe effects and corrections remain visible. Canonical fallback remains explicit when generation or verification fails; the UI distinguishes AI synthesis from chart records.

The fictional Dokimos A medication snapshot lacked any timeline events. The existing date-based projector correctly returned cancelled with no live events. `repair-dokimos-medication.sql` restores only this fixture's documented Sep 24 start at 5 mg and Oct 1 change to 10 mg, once, without changing projector rules or clinical workflow contracts. The repair is tested for idempotence and point-in-time doses.

The historical source-kind mismatch reproduces unsupported_source; a historical failed provider payload was unavailable. Current main already generated seven bullets before this pass, with an excessive deterministic warning appendage. Do not represent the old invocation's exact failure as proven.

Verification: 91 tests pass; production build, lint/type checks pass. A live provider check on the actual fictional chart returned seven supported bullets. A separate adversarial provider check rejected invented bipolar diagnosis, reversed anger-event negation and false medication discontinuation despite valid source IDs. Opt-in helper: `node --experimental-strip-types tests/support/verify-dokimos-summary.mjs`; it expects an exported fixture at ../dokimos-summary-fixed.json and a local ignored provider key. It never writes clinical data. Remove local credentials after use.

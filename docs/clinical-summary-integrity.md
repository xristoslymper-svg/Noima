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

Not production-grade authentication. Real-patient readiness remains blocked. The `CLINICAL_DATA_MODE=real` switch fails closed on demo clinical endpoints; it does not secure direct public demo access or turn the demo into a real clinical tenancy. Only fictional data is permitted in this application surface.

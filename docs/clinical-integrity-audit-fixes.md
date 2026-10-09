# Clinical integrity fixes from the 2026-10-09 audit

Scope: findings 1–3 only. Baseline main and audited production commit:
`a4b7b1d90decfddb24a23d7bc629fb415e535bce`. No migration, production release,
or changes to unfinished voice PR #59. Do not merge until preview verification.

## Before and after

| Finding | Before | Root cause | Change | Verification |
| --- | --- | --- | --- | --- |
| 1 autosave | Still reproducible in the old hook simulation; prior authenticated journey lost a correction | Recovery effect reran on own version increments; pending recovery retained the old version; field spreads could use stale rendered values; accepting server could discard local text | Recover once per editor; rebase pending browser recovery after acknowledged writes; functional updates use latest text; preserve an accessible local copy before accepting server | Delayed writes, rapid field edits, refresh, interrupted recovery, genuine conflict; actual PostgreSQL finalize/reopen keeps exact correction |
| 2 initial summary | Still present in main | Summary only read approved follow-up continuity | Read completed initial assessment, review and plan, including corrections, certainty and reference dates; label as encounter documentation, without promoting persistent context | Actual summary component rendering plus empty/draft/structured/corrected/approved-follow-up cases |
| 3 risk | Still present in main | Summary labelled a tree death-wish answer as overall ideation | Use stored question wording; show separate unknown/unassessed domains, historical attempts, previous branches and notes | Negative wish with unassessed ideation; historical positive/current unknown; unknown versus unassessed; legacy wording and component rendering |

The browser recovery mechanism still uses optimistic locking. Real stale writes
remain blocked. No warning has been hidden to make finalization appear successful.
The same-version recovered draft retries using its original expected version.
When loading the server version after a genuine conflict, a local backup is kept
and exposed in an optional disclosure. It can be restored for review; saving still
uses optimistic locking. This adds no routine confirmation screen.

## Deferred findings / current status

4 email/channel switching: still present in main code, deferred.
5 encounter without returned intake: main's audited path still depends on intake;
deferred rather than changing identity architecture.
6 raw values: still visible in authenticated production folder, deferred.
7 contextual self-report: still absent in main encounter editor, deferred.
8 medication search: main retains different editors, deferred.
9 AI gender/editability: partially addressed in open draft PR #59, not merged;
do not duplicate its implementation or claim real-model correctness from its tests.
10 small viewport: requires device investigation; no confirmed device bug claim.

## Validation and release gate

- 239 automated tests pass, including actual existing PostgreSQL migrations/RPCs.
- TypeScript and ESLint pass; optimized production build passes.
- The actual hook is exercised with controlled React commits/storage/delayed I/O.
  These are simulations, not physical clinician or browser journeys.
- Two timing tests against unchanged main reproduce a false conflict and an
  outdated browser recovery version. The corrected hook passes both.
- Authenticated production read confirms the original test record still exists;
  no real patient data was changed. New-code preview journey is a separate gate.
- Required preview gate: actual AI proposal → apply → clinically meaningful edit
  while autosave is in flight → normal context refresh → finalize → reopen; then
  initial assessment summary and negative wish / unknown historical risk display.
  If deployment quota blocks preview, leave this PR draft and report the limitation.

## Interactions and rollback

Normal autosave requires no recovery/load/second-finalize workaround. This can
remove 2–3 recovery actions from the observed failing path, not every visit.
Initial clinical impression and review focus require no extra confirmation.
Risk details add only an optional disclosure for source fields and notes.

Rollback: revert this PR's commit and redeploy the previous approved application
version. There is no migration to reverse and no rewrite of stored clinical data.
Local recovery keys remain compatible. Reverting restores the known autosave
defect, so rollback does not itself establish clinical release readiness.

Integration note: PR #59 also touches FollowupClosure. Resolve any overlapping
handler changes by retaining the latest-value functional updates from this PR
and the explicitly reviewed editable proposal/dictation behavior from #59.

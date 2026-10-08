# NOIMA audit inventory — before fixes

Baseline: main 76c0e7e4fd1f3a968f02ce4c6294e99b219f5464. Latest ready production: ef95fbf068b838cd1d724fda5f08d183abc96ca8. Branch: audit/noima-integrity-20261008.

## P0 candidates requiring transaction tests

- Identity resolution accepts any owned folder for an exact AMKA conflict, including a different AMKA. This can misfile submitted clinical information.
- Resolving a phone/email conflict as new does not recheck AMKA under the submission identity lock. A folder created after submission can be duplicated.

## P1

- Inline stop uses the compatibility RPC that reads the latest version instead of checking the clinician's plan_version.
- Stopping on the day of an existing event hits event_date_conflict. The inline UI offers no recovery, including immediately after adding a medication.
- Intake workflows lack automated transaction coverage. PHQ-9 generic/item-9 review separation exists in SQL but has no regression test.

## P2

- Autocomplete can reopen after selecting, Escape, or blur because pending results unconditionally set open=true. Empty-query invalidation is incomplete.
- Draft visits still use the medication modal while the folder uses explicit inline CRUD.
- History integration modal can close or navigate away with edited integration text without a guard.
- Conflict resolver lacks Escape, scroll lock, busy close protection and HTTP failure handling.
- Library preview duplicates PHQ-9/GAD-7 wording and falsely labels demo-version wording as official validated Greek sources.
- Library nested Escape can dismiss both launcher and preview; duplicate custom question text creates duplicate React keys.
- Appointment-start dialog lacks backdrop dismissal; appointment-choice overlay lacks Escape.

## P3

- Medication modal and modal-only state can be removed after draft visits migrate to the table; onManage becomes unused.

## Investigate / retain as release risks

- Summary cache misses trigger synchronous POST generation during folder opening; preserve cached/precomputed architecture and avoid a broad rewrite.
- History preview/print definitions remain separate; SQL scoring/version constants remain separate from TS registry.
- Intake assignment retry after a lost response generates a new id/token; mail failure can strand an assignment.
- Scan depends on configured provider and human review; tablet shared-device queue needs real-device acceptance testing.
- Dependency audit reports sharp high-severity advisory and sprintf-js moderate advisory through Transformers. Check reachability and patch-only options; no major upgrade during this audit.
- Live authenticated browser and external email/tablet provider paths are not yet verified. No production data writes or emails authorized.

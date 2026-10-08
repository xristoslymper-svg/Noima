# NOIMA PR #55 — release-readiness verification

**Final decision: NO-GO.** Local verification is successful after a further identity fix, but there is no identified non-production hosted Supabase target. Hosted staging migration registration/schema reload, hosted advisors and authenticated application smoke verification are incomplete. Migration-ledger divergence must also be reconciled before release. This recommendation does not authorize a merge or deployment.

## 1. Repository state

- Remote main reverified: `76c0e7e4fd1f3a968f02ce4c6294e99b219f5464`.
- PR #55 inspected head: `375f3c988c713be95ac944a7f03f546780045d7b`, branch `audit/noima-integrity-20261008`. Open, draft, unmerged, mergeable with no reported conflicts. The same PR is being updated with the changes below; the delivery copy records its final head after pushing.
- Latest READY Vercel production: `ef95fbf068b838cd1d724fda5f08d183abc96ca8`, deployment `GdXczCTtLEjXTiqa2L6gKjvNAUdL`. Production remains behind main. No deployment or alias/settings changes were performed.
- Entire original 27-file PR diff reviewed, including application code, migration, removed code/styles, package lock and tests. Main has not advanced and no new remote branch migration appeared before this verification.
- Supabase topology: one Noima project `mgpnaxaquzeoomxdzhic`, PostgreSQL 17.11, no development branches. The other projects are Same-side and Opportunity Lab; neither is a Noima staging target. No project was repurposed or created.
- Read-only hosted migration metadata has 54 entries versus 52 repository migration files, with historical name/version differences. Hosted entries include `fix_intake_identity_matching_v4`, `harden_function_search_paths`, and `20261008101942_unattached_paper_destination`. Do not blindly replay the entire repository chain against that ledger. Read-only definitions of the affected intake/medication functions match expected pre-audit semantics; this is not a full hosted schema equivalence proof. No patient rows were read for this check.

## 2. Migration status and safety review

Reviewed and applied only to isolated local PostgreSQL 17.10 and PGlite databases:
`20261008125342_audit_intake_and_medication_integrity.sql`.
Final Git blob: `9b01eb6e0d4a7fc1e64638698274e2120263212a`.

The audit migration is absent from the hosted Noima migration ledger. No hosted migration was applied, and no production DDL or data mutation occurred. There was no clearly safe staging target, so the requested local fallback was used. Local SQL application is not hosted Supabase migration-history registration or PostgREST schema-reload verification.

Safety conclusions:

- Forward migration: replaces two function definitions and creates one trigger/function. No historical row rewrite, deletion, merge or automatic duplicate cleanup. Seeded legacy duplicate-AMKA rows were compared before/after and remained identical.
- Trigger fires before insert or update of AMKA/tester. Empty AMKA bypasses the uniqueness check; unchanged AMKA/tester permits demographic edits of legacy duplicates. Nonempty duplicate AMKA is blocked within a tester; identical AMKA in different testers is allowed. Stored AMKA is NOT NULL; direct NULL remains rejected by the existing table constraint. Supported public create/update/finalize paths strip non-digits and validate zero/11 digits. The trigger compares stored canonical values; it does not rewrite existing formatted legacy values. Raw privileged maintenance writers must preserve that normalization contract.
- Identity operations share advisory lock namespace 841 per tester. The resolver/finalizer first lock the intake row, then the workspace identity lock; creation/update passes through the identity trigger. Medication writes first lock the medication row and check the submitted version.
- The deterministic tests exercised real waits and checked `pg_blocking_pids`, not sequential simulations. No tested race deadlocked. Tests cover normal READ COMMITTED transactions; other isolation levels and arbitrary multi-operation maintenance transactions are not certified. This is not a proof against every possible lock cycle.
- Trigger creation briefly requires a table-level SHARE ROW EXCLUSIVE lock, which can block concurrent writes. Plan a bounded migration transaction and maintenance window in staging; there is no table rewrite. Existing tester index scopes lookups; there is no new index or constraint validation scan. Very large workspaces may warrant a nonunique `(tester_id, amka)` index after measurement.
- RPC signatures/default arguments and the public medication wrapper remain compatible. Public wrappers retain ownership checks. Internal medication implementation and AMKA trigger function are denied to PUBLIC/anon/authenticated; the public intake resolver and medication event wrapper remain callable by authenticated owners, not anon. Existing token-based intake submit remains its intended separate capability.
- All three migration-affected privileged functions now have empty search paths and qualified application references; write functions retain VOLATILE behavior. RLS remains enabled on all 16 demo public tables. Authenticated/anon cannot create objects in public in the local native catalog.

## 3. Supabase advisors

Supabase CLI 2.119.0 security and performance advisors ran with an explicit loopback `--db-url` on both the pre-PR migration database and the corrected post-PR database. All four calls returned `{"results":[],"message":"db advisors"}`. The first TLS-default attempt failed because the local server has no TLS; the retry used `sslmode=disable` on loopback only.

**New CLI-returned notices: zero. Pre-existing CLI-returned notices: zero.** This is a local result, not a hosted project security/performance advisor sign-off. Hosted advisors were not called on production.

Independent catalog comparison found 55 pre-existing SECURITY DEFINER functions without an empty search path before the audit, reduced to 54 afterward by hardening the modified medication implementation. These are targeted catalog observations, not fabricated advisor notices. Existing private helper grants (`approve_section`, `complete_session`, `is_practice_member`, `pilot_owns`) are unchanged; no new private implementation/trigger exposure was introduced. Patient indexes and the 16 demo-table RLS states are unchanged.

## 4. Identity verification

| Case | Local result |
|---|---|
| Exact AMKA → unrelated folder | Rejected; payload remains recoverable, no clinical materialization into that folder |
| Exact AMKA → matching folder | Success; history/PHQ/GAD materialize once |
| Later-created duplicate → create new | Rejected after lock/recheck |
| Phone/email possible match | Explicit distinct person remains supported; matching-existing attachment remains the resolver contract |
| Stale phone-match classification + later exact AMKA | Original head failed: unrelated phone candidate accepted. Fixed: rejected, payload retained, exact folder succeeds |
| Cross-workspace same AMKA | Allowed; other owner's row is invisible and foreign-owner resolution rejected |
| Manual same-workspace create/update | Duplicate rejected; blank identifiers remain unrestricted |

Native simultaneous tests covered two manual creations, two demographic updates, two resolutions of one intake, two distinct resolutions in one workspace, creation versus resolution in both orders, finalization versus resolution, and two token finalizations. Expected winners/rejections and row counts were checked after commit. No duplicate identities, duplicate clinical materialization, partial writes or tested deadlocks were observed.

## 5. Medication verification

Local migrated PostgreSQL accepted start, dose and frequency changes, future scheduling, stop, historical medication and fictional side effects. Same-day start/stop and same-day historical exposure retain readable start/stop events and the stopped projection. Date/creation/id order remains the event projector contract; new writes use clock timestamps.

Stale edit/stop versions, changes before start, stops before start, repeated stops and changes after stop were rejected with transaction rollback. Future projections switch on their effective dates; current reads do not mutate the medication rows. Concurrent edit versus stop with the same plan version produced one winner, one stale rejection, two total valid events and one version increment. The legacy stop RPC remains for compatibility; the current UI passes the versioned event action.

## 6. PHQ-9 item-9 safety

Passed on PGlite and native PostgreSQL. PHQ-9 item 9 > 0 remains visible in Overview after generic assessment review and after history integration. Grouping retains the pending assessment. It leaves the pending queue only through the intended item-9 review flow. No clinical interpretation or prescribing recommendation was added.

## 7. Patient submissions

Grouping tests preserve one intake grouping for history plus psychometrics, standalone assessment grouping, identity-conflict tools, patient name/channel/time/provenance and separate outstanding destinations. Reviewed psychometrics do not reappear via the original intake tools; item-9 pending remains visible. Source review confirms `Υποβολές ασθενών`, `Νέα`, `Χρειάζεται ταυτοποίηση`, and action `Ταυτοποίηση`; the old widget heading was not reintroduced. Local native Overview results were checked in the smoke flow. No authenticated hosted visual acceptance was performed.

## 8. Summary navigation

Route/request tests passed for missing/stale generated cache, provider failure and explicit manual refresh. Normal navigation performs GET only and returns canonical recorded facts/sources without provider generation; mismatch/error never falls back to generation POST. Manual refresh retains POST and error handling. No live provider calls were made.

## 9. Medication autocomplete

Existing eight interaction tests passed: brand and active-ingredient search, free text, rapid typing/stale responses, keyboard navigation/Enter, Escape, mouse selection, blur, empty query, unavailable catalog and no immediate reopening after selection. It remains a demo catalog, not an official or complete EOF/IDIKA source. No prescribing advice was added.

## 10. Overlay/modal verification

Existing interaction tests passed for topmost-only shared Escape, busy dismissal guards, preserving/restoring previous body overflow, listener cleanup, native appointment dialog outside-backdrop versus inside clicks, and workspace/deep links. Library/launcher/conflict/mobile/history hook call sites and backdrop/inside handlers were reviewed. Dirty history review still uses cancellation/navigation guards. These component tests are not complete browser focus-trap, native-event or touchscreen acceptance; no universal modal accessibility certification is claimed.

## 11. Tests

- Previous default baseline: 191 tests.
- Final default suite: **192 passed**, zero failed/skipped.
- Existing database suite independently: **58 passed** on PGlite and **58 passed** on native PostgreSQL.
- Additional opt-in native release gate: **14 passed**, zero failed/skipped.
- New default regression covers the stale possible-match/exact-AMKA misrouting. Native tests add deterministic concurrent operations, before/after grants/RLS/search-path checks, legacy-data preservation and a fictional direct-DB smoke flow.
- The smoke flow exercises assignment, identity/history/PHQ/GAD submission, folder materialization, Overview, generic/history/item-9 review, medication add/edit/stop and timeline reload. It does not exercise an authenticated browser → PostgREST → hosted DB flow.
- No tests were removed/weakened. Timestamp comparison now compares complete values directly, allowing native/PostgREST-like microsecond strings as well as PGlite Date values. Native URL guard rejects hosted targets; default tests remain in-process.

## 12. Validation and exact commands

| Check | Result |
|---|---|
| `npm run typecheck` | Passed |
| `npm run lint` | Passed, zero warnings |
| `npm test` | 192 passed |
| `node --experimental-strip-types --test tests/database.test.mjs` | 58 passed on each runtime |
| `npm run test:postgres` | 14 passed |
| `npm run build` | Passed, dummy Supabase/OpenAI/encryption configuration |
| `git diff --check` | Passed |
| `npm ls sharp` | Next and Transformers use sharp 0.35.5, deduplicated/overridden |
| `npm audit --json` | 0 critical, 0 high, 5 moderate; nonzero audit status retained |

Local native runtime was downloaded only into the workspace, not application dependencies: `@embedded-postgres/windows-x64@17.10.0-beta.17` (PostgreSQL 17.10). The pinned dev client is `pg@8.16.3`. No server or system service was installed globally. Separate fresh `noima_release_gate_*` databases were used; PostgreSQL was bound to 127.0.0.1:55465. Auth/JWT context was emulated. Local major 17 matches hosted major 17, but patch versions differ (17.10 versus 17.11).

Additional commands:

```text
git fetch origin main audit/noima-integrity-20261008
git ls-remote origin refs/heads/main refs/heads/audit/noima-integrity-20261008
git diff origin/main...HEAD
npx supabase db advisors --help
npx supabase db advisors --db-url postgresql://postgres@127.0.0.1:55465/noima_release_gate_pre?sslmode=disable --type security --output-format json
npx supabase db advisors --db-url postgresql://postgres@127.0.0.1:55465/noima_release_gate_pre?sslmode=disable --type performance --output-format json
npx supabase db advisors --db-url postgresql://postgres@127.0.0.1:55465/noima_release_gate_final?sslmode=disable --type security --output-format json
npx supabase db advisors --db-url postgresql://postgres@127.0.0.1:55465/noima_release_gate_final?sslmode=disable --type performance --output-format json
```

Remaining moderate chain: Transformers → onnxruntime-node → global-agent → roarr → sprintf-js. The terminal advisory is [sprintf-js unbounded precision DoS](https://github.com/advisories/GHSA-hp3w-g68c-fv3c). No forced major upgrade or zero-audit claim was made.

## 13. Changes to PR #55

Same branch and PR retained. Release-blocking stale-classification identity routing fixed in the unapplied audit migration; affected medication implementation hardened to empty search path with qualified references. Added native runtime/test helper, concurrency gate and instructions; pinned pg dev client and lockfile; extended existing database test and added this report. No unrelated UI redesign or product feature changes.

Changed files in this follow-up: `supabase/migrations/20261008125342_audit_intake_and_medication_integrity.sql`, `tests/database.test.mjs`, `tests/helpers/database-runtime.mjs`, `tests/native-postgres/release-gate.mjs`, `tests/native-postgres/README.md`, `package.json`, `package-lock.json`, and this report. Final commit is recorded in the delivered report after publication. No second PR was opened.

## 14. Remaining known risks

Hosted environment grants, extensions, migrations, actual Auth/PostgREST behavior and isolation configuration are not represented completely by the local harness. Pre-existing mutable search paths and migration-ledger divergence require review on the proper staging baseline. Legacy AMKA duplicates were preserved and need operator identity decisions; do not merge them automatically. Delivery idempotency, durable summary job scheduling, catalog/instrument clinical-validation rights, and complete modal focus handling remain earlier known risks. Default native tests do not test alternate isolation levels or production scale. No real patient, email or provider acceptance was attempted.

## 15. Explicit release blockers

1. No designated non-production Noima Supabase project/branch: hosted staging application, migration registration, schema reload and hosted advisor verification are incomplete.
2. Repository/hosted migration history differs: reconcile a staging baseline and migration application plan before any automated `db push`; do not replay historical migrations blindly.
3. No authenticated staging application smoke flow or desktop/mobile/tablet acceptance. Direct database/component results cannot close that gate.

The newly reproduced code-level identity blocker is fixed and green locally. The three verification blockers remain unresolved. No production deployment, production migration, production mutation, real emails, real patients, merge, billing changes, alias changes or legacy cleanup occurred. Hosted access in this task was read-only project/migration/function metadata.

## 16. Final decision

**NO-GO.** Keep PR #55 as draft until the specified hosted staging and application gates are completed and its migration baseline is reconciled. Local checks are strong evidence for the fixes, but are not substitutes for those gates.

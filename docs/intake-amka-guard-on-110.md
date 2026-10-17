# Targeted AMKA integrity follow-up to #110

Base: `5173c51a0259e12beb667c5c56e5e17a0c10eaa7`. This branch does not merge #55.

## Behavior

- Recheck the submitted AMKA after acquiring the same workspace identity lock used by intake finalization.
- If an exact AMKA folder exists (including one created after a phone/email conflict was recorded), reject another folder and reject new-folder resolution.
- Serialize new AMKA assignments on patient insert/update with intake resolution to prevent duplicates from manual creation, demographic edits and concurrent conflict resolution.
- Preserve existing duplicate records without rewrites or merges. Unchanged legacy identities remain editable.
- Preserve authorization, assessment lineage, and the no-appointment/no-visit/no-medication-write behavior.

Only one new database migration, regression tests, their isolated CI workflow and this note are added. Historical migrations, product UI and #110 preservation hashes stay unchanged.

## Verification and release boundary

GitHub Actions first reproduces the missing rejection against the schema with only this new migration skipped, then verifies the migrated schema using PGlite and a disposable PostgreSQL 17 service. Native checks assert actual lock waits, one winner for duplicate identities, one materialization, rollback, cross-workspace isolation and legacy preservation.

Auth/JWT context is synthetic. These are SQL integration tests, not hosted end-to-end sign-off. All fixtures are synthetic; no email or AI provider is called.

Vercel builds an application preview from Git. A READY build cannot activate a database-only fix: the new migration is deliberately **not applied** to the shared Supabase database. The existing shared database remains unpatched until a separately authorized release. Authenticated preview writes against it must not be presented as validation of this fix.

No production deployment, promotion, aliases, environment variables or shared database changes are authorized by this branch.

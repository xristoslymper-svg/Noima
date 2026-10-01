# Noima database foundation — Phase 1

Remote project: `mgpnaxaquzeoomxdzhic` (Noima, Frankfurt / `eu-central-1`).
Dashboard: https://supabase.com/dashboard/project/mgpnaxaquzeoomxdzhic

The existing frontend is still the original fictional demo. Phase 1 does not wire
clinical forms to the database, provision practitioner logins, deliver emails,
or call AI providers. No production patients are seeded.

## Reproduce and verify

Install the exact dependencies with `npm ci`. Run:

```text
npm test
npm run typecheck
npm run build
```

`npm test` runs the exact migrations in PGlite (real embedded PostgreSQL). It
emulates only Supabase's Auth users table and JWT/role context; no SQL policies,
grants or triggers are mocked. Docker is not installed on the implementation
machine. For a full local Supabase stack install Docker, use the pinned CLI
(`npx supabase start`), and apply migrations with `npx supabase db reset`.
Disable CLI telemetry with `DO_NOT_TRACK=1` if desired.

`tests/remote_smoke.sql` verifies the deployed database with actual Supabase
roles and Auth schema, then rolls back every fixture. Execute as an administrator
in a single connection. The full local suite also injects a failure after session
update to verify atomic rollback.

Migration files were created with the Supabase CLI. A migration applied via the
connector receives a server-generated version; its local filename is aligned to
that recorded version so future CLI pushes will not reapply the schema.

## Authorization and provenance

- All 21 tables have RLS, including private invitations. Clinical rows require
  practice membership. Composite foreign keys enforce matching patient/practice
  and session/patient relationships.
- Membership and profile provisioning remain administrative until Phase 2.
  Self-assignment to practices is not allowed.
- Ordinary clinical operations use the authenticated practitioner's JWT, not
  a service-role client. No anonymous clinical-table grants exist.
- Only the assigned session clinician can edit its children. Parent-row locks
  serialize these edits with approval/completion.
- Raw transcripts, immutable proposals and official sections are separate.
  `approve_clinical_section(section_id, expected_version)` explicitly approves
  a reviewed draft. Approved sections cannot be silently rewritten.
- `complete_clinical_session(session_id, expected_version)` requires all existing
  sections approved, the six core sections present, and a structured risk row.
  It completes the session, linked scheduled appointment and audit in one
  transaction. NULL risk fields remain unassessed; they are not converted to No.
- There are no client DELETE grants. Completed sessions and their clinical
  children are immutable. A future amendment workflow will create new records.
- Medication events record the previous/current dose, timing, route and notes;
  they cannot be modified by clinicians. `effective_from` carries the clinical
  change date, separately from the event's actual recording timestamp.
- Audit triggers record actor, entity and action, with no note text in metadata.
  Underlying clinical writes invalidate the cached patient summary.
- Private SECURITY DEFINER functions are narrowly granted, use empty search paths,
  and explicitly authorize callers. Public RPC wrappers are SECURITY INVOKER.
  Trigger-only definer functions have no client execution grants.

## Fictional seed

Automatic seeding is disabled. `seed.sql` requires an explicit transaction setting
and an existing isolated LOCAL Auth account. It creates no passwords or emails.
In a local administrative SQL connection only:

```sql
begin;
set local noima.allow_demo = 'yes';
set local noima.demo_user_id = '<local-auth-user-uuid>';
-- Execute supabase/seed.sql in this same transaction.
commit;
```

The seed creates a visibly named fictional practice, Dr. Katerina, Maria, Kostas,
Giannis and Eleni. It retains Maria's 25 → 50 → 100 mg Sertraline history,
Trazodone 50 mg, adverse effects, three historical visits, eight historical scale
totals and the four appointments visible in the UI. Exact birth dates and scale
item responses are not fabricated. The conflicting dose-change dates in the
demo are resolved to 3 September, matching its medication and session history.

Historical visit imports contain only the abbreviated notes actually present
in the demo; the privileged seed imports them without inventing missing section
documentation. This is not a clinician-facing completion bypass. Kostas remains
pre-assessment: no fabricated approved risk findings or completed summary.
The original UI fixtures remain in place for later screen-by-screen parity.

## Remaining phases and limits

Phase 2 implements Auth, protected routes, provisioning and SSR clients. Local
Auth configuration disables signup/anonymous login; hosted Auth configuration
must be verified as part of that phase (local config is not implicitly pushed).
Phases 3–5 implement repositories and clinical form integration. Phase 6 adds
reviewed instrument versions, score validation, secure token redemption with
expiration/replay tests, rate limiting and mock delivery. Invitations currently
have hash-only private storage with no redeem endpoint or anonymous access.
Phase 7 adds provider interfaces. This foundation does not retain raw audio.

Supabase's advisory for RLS-without-policy on private invitations is intentional:
there are no grants or policies, so access is denied until the narrow token
workflow exists. Newly created unused indexes are expected before app traffic.
Reference: https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy

Dependencies are pinned in package.json and package-lock.json. PostCSS is
overridden to 8.5.28 to resolve the dependency audit findings without changing
the Next.js major version. No UI source or styling was changed.

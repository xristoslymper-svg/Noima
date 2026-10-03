# Clinical core milestone

Implemented against main `8d96f12` on `feat/clinical-core-milestone`.

## Existing architecture and scope

The running fictional-patient workspace uses the existing `demo_patients` identity, `demo_sessions`, section/risk RPCs, calendar links and medication events. A separate authenticated production foundation already exists. This milestone extends the running workspace; it does not create another patient identity or migrate the UI onto that unused foundation. Calendar voice behavior and authentication architecture are unchanged (a misleading local function name was fixed for lint).

## Behavior

- Field dictation keeps the existing recorder/transcription dialog. Accepting a transcript opens a proposal review; it does not save clinical text. The existing extraction API persists the original transcript, proposal, model and canonical patient/session links. Approval atomically appends/replaces the section with actor, timestamp and resulting version. Approved provenance is immutable. Manual fallback is explicitly approved and labelled dictation rather than AI.
- Autosave serializes per-field writes. Stale data requires explicit server/local comparison and replace/merge choice. Session-local recovery retains unsaved text and edited proposals; failure does not convert missing information into a negative finding. Open proposals prevent finalization until reviewed or closed.
- Finalization locks the session, checks required fields and risk, and is idempotent. Completed content cannot be updated/deleted through the normal RPCs or editor. Addenda are separate, immutable, reasoned entries with an idempotency key and current tester identity.
- Summary is derived from completed sessions, events and assessments. Comparison shows exact documented before/after text with source session links; it does not label improvement/worsening. Addenda remain visible alongside their original sources.
- PHQ-9/GAD-7 assignments use 256-bit opaque tokens in URL fragments, SHA-256 token hashes in a private table, 14-day expiry, revocation, row-locked submissions and server scoring. A retry with identical answers is safe; a different second submission is rejected. Item 9 produces a clinician review signal, never a risk assessment. Links are generated, not emailed. The patient view exposes no patient identity or clinician navigation.
- Medication state is derived for a date from non-superseded canonical events. Reads do not apply due changes. Revisions retain cancelled/replaced events. Plan-version checks reject stale plans; timeline checks reject changes before start, after stop, and same-date conflicts. Backdated corrections require deliberate replacement/reason. Cancelled future starts cannot become active later. Seed functions do not resurrect stopped medications.

## Database changes

Apply in order, after the migrations already on main:

1. `20261002180024_clinical_core_lifecycle.sql`: approval provenance, addenda, strict section/risk concurrency, finalization/immutability, serialized draft creation.
2. `20261002180923_clinical_psychometrics.sql`: private assignments, token lifecycle and scoring RPCs.
3. `20261002181354_clinical_medication_temporal.sql`: medication plan versions, event revisions, date-derived state and compatible existing entry points.

The SQL was exercised from an empty database with all repository migrations using PGlite. No remote migration was applied during implementation.

## Verification

`npm test` runs database and deterministic-summary tests (Node 22.6+ / 24 for TypeScript stripping). `npm run lint`, `npm run typecheck`, and `npm run build` are the normal quality gates.

For isolated API/browser verification, start two terminals from the repo:

```powershell
node tests/support/runtime-server.mjs
```

```powershell
$env:NEXT_PUBLIC_SUPABASE_URL='http://127.0.0.1:55440'
$env:NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY='local-test'
$env:OPENAI_BASE_URL='http://127.0.0.1:55440/v1'
$env:OPENAI_API_KEY='local-fixture'
npm run dev -- --port 3100
```

Then `node tests/support/check-core-api.mjs`. The loopback adapter uses real migrations/RPCs, in-memory data and deterministic fake transcription/extraction. It never connects to Supabase or OpenAI. Its simplified HTTP adapter is not a PostgREST/RLS integration replacement. Do not deploy it or set the fixture environment on Vercel.

Browser checks cover field recording with synthetic audio, proposal editing/append approval preserving existing text, finalization, immutable completed view/addendum, PHQ-9 completion returning 9/27 and an item-9 review signal, and 100 mg current versus 150 mg scheduled medication. API checks cover failures, stale writes, retries and provenance.

## Release boundaries

- Fictional patients only. Public demo tables and tester UUIDs are not authenticated clinician isolation. The bearer questionnaire token grants access to one completion surface, not proof of patient identity. No auth/RLS rewrite was attempted.
- Real OpenAI model access, microphone recognition quality, Greek clinical fidelity and provider failures need a controlled staging test. Local provider fixtures do not prove model quality. Existing model defaults are retained; clinical extraction can use `OPENAI_CLINICAL_MODEL`. Explicit approval remains essential.
- Greek questionnaire wording is the existing demo wording, version `el-demo-2026-10-v1`. Validate the clinical translation before real use. No diagnostic severity interpretation or autonomous emergency decision is produced.
- Sessions/risk and medication plans have concurrency checks. The pre-existing general history editor still lacks server-side version checking; dirty local text is now protected against background reloads, but simultaneous history saves remain a follow-up.
- The medication timeline has calendar-day precision (Athens), not within-day dosing sequences. Same-day changes require explicit replacement. Historical data cannot reconstruct unrecorded doses; backfill retains the earliest available documented state and date. Existing conflicting legacy histories require review before rollout.
- Browser recovery is sessionStorage, not durable encrypted storage across devices. Closing a browser session can remove unsubmitted drafts/proposals. Audio itself is not retained by this workflow.
- Addenda are visible, source-linked text; they do not automatically rewrite derived diagnoses or plans. Clinician review of the correction remains necessary.
- No email transport, production alert delivery, usage-rate controls or live monitoring was added. Public paid AI endpoints still need abuse controls before a broad public launch.

## Rollout

Use a staging database containing the latest main schema plus these three migrations. Inspect existing medication timelines before backfill. Deploy the matching branch with staging Supabase and real provider configuration, then repeat the acceptance scenarios with fictional patients and a real microphone. Coordinate application and database promotion together: the new app requires the new schema, and the temporal RPC changes mean rolling back only the frontend would show stale raw medication doses. Take a database backup before production promotion; prefer a forward fix to destructive migration rollback.

This branch is not a production deployment. Do not point its preview at the old production schema and assume the workflows are ready.

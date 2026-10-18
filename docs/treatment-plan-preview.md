# Treatment plan follow-up
Branch: codex/treatment-plan-visit-links; base: e11b42d5e2e7778f6c3bf85454721e3b1445ee76.
Scope: completed/corrected visit plan and next review surfaced without duplicate storage; explicit draft/unlinked medication association, including table, modal and history corrections; compact empty medication state; visible measurement action and same-version score comparison.
Reuses PatientRecord sections, links, tables, typography and palette. New CSS contains layout only.
No migration, database write, production deployment, LLM prompt or four-tab navigation redesign.
The existing RPC still requires a draft when a session is supplied. Missing or completed selections fail before a request; server remains authoritative for races.
Corrections retain the original event in existing revision history; the new correction is attributed only to the explicitly selected draft, or remains unlinked.
Preview-only /patients/demo/treatment-preview?tab=treatment uses the actual workspace with its existing read-only synthetic provider. It is 404 outside this exact preview branch.
Tests run in GitHub using isolated synthetic HTTP fixtures; no live credentials/data/email/provider calls. Historical release preservation checks retain all unrelated hashes, with the explicitly listed follow-up paths documented in their manifest.

# Public practice preview
Branch: codex/public-practice. Production remains disabled.
Uses existing free isolated Supabase project Noima Calendar Preview (yncfbugkneywrwotuyls), never the production database.
Apply docs/sql/public-practice.sql only to this isolated project. Source-controlled Edge Function practice-preview verifies the existing NOIMA Auth user and pilot membership before owner operations; owner IDs never come from a browser payload.
Public routes expose only an explicit publication snapshot. Anonymous users cannot read tables, drafts or request lists. The backend service key stays in the Edge runtime.
Draft editing/local recovery retains the existing browser storage. Explicit publication persists the snapshot; public URL survives browser refresh/redeployment. A revision guard prevents stale tab overwrites.
Requests require name/email/phone/preference/consent, have idempotency and contact/preference deduplication, remain pending and do not create appointments, patients or send email.
Free preview limits: 50 sites, 100 requests/site/day and 1000 requests total. No paid resources provisioned. No recording, payments or external AI.
Preview remains noindex and synthetic-only. Do not send real patient data. Real production activation, request retention/deletion tools and calendar confirmation remain separate work.

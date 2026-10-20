# Google & Maps foundation (preview only)

Branch: codex/google-maps-foundation. No database, Google configuration, secrets, paid services or production settings are changed.

The Digital Presence tab is visible only on the exact Vercel preview branch. The live start and callback routes return 503 and never access Google, Auth, a database or callback parameters. Credentials or environment flags cannot enable them. The NOIMA login, mail sender and calendar OAuth remain independent.

The browser demo uses a fixed synthetic location, explicit opt-in, denial/cancellation, location choice, field-by-field comparison, explicit confirmation and disconnect. It changes only in-memory synthetic profile fields, never the page draft or public page. Refresh resets it. No Google SDK, Maps embed, API key, token or external request is used.

OAuth protocol primitives are server-side: 256-bit random state, S256 PKCE, exact HTTPS callback, binding to authenticated user AND workspace, 10-minute expiry, single-use atomic consume adapter, denial and replay handling. They are not wired to a real authorization redirect/token exchange yet. A future reviewed activation must add trusted server transaction storage, encrypted refresh-token storage, token exchange/revocation, account/location discovery, and per-write confirmation. Never put credentials, codes, transactions or tokens in localStorage or client props.

## Later activation prerequisites
- Actual verified Business Profile and approved Business Profile API access.
- Provider setup and verified branding, privacy/terms and authorized domain.
- Separate Business Profile OAuth credentials and exact callback, scope business.manage.
- Free-only project policy, quota/rate limits and revocation/disconnect workflow.
- Isolated integration test environment and explicit authorization before any real connection.

No claim of real Google connection or synchronization is made.

## Validation
Unit tests cover PKCE/state isolation, callback configuration, tenant mismatch, expiry, denial, malformed/duplicate response, replay/concurrency, scoped confirmed synthetic edits and disabled endpoints.
GitHub browser fixtures run desktop/mobile, deny external requests, test opt-in, denial, cancellation, selection, compare, confirm, disconnect, refresh, existing editor and overflow.

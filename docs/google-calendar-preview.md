# Google Calendar preview implementation

Branch: codex/google-calendar-sync. No production configuration or database changes.

## Available now
- Provider adapter for paginated incremental synchronization, final-page cursors, conditional ETag writes, stable insert IDs and ambiguous retry recovery.
- Reconciliation and orchestration with a typed durable-store contract. Synthetic tests cover both directions, cancellations, time moves, duplicate retries, concurrent changes, auth failure, expired cursor, started visits and overlap.
- Dedicated OAuth utilities with PKCE/offline grants and Calendar-only scopes. No login or mail credentials reused.
- Browser-only synthetic demonstration at /calendar/google-preview using existing UI classes and no API/database writes.

## Not enabled / not claimed as verified
Real Google connection, OAuth callback, durable token storage, account settings, appointment persistence, automatic scheduled synchronization and push channel renewal are NOT wired yet. No successful fixture is evidence of a real Google end-to-end connection. User explicitly chose code and synthetic tests first because no isolated database exists.

## Next integration boundary
Implement SyncStore in an isolated hosted database, with owner+workspace+calendar unique identity, encrypted refresh tokens bound to owner, atomic remote-cache/cursor writes, revision CAS and transaction-scoped overlap checks. Durable leases need expiration, fencing and renewal; process-local locking is insufficient. Persist unresolved conflicts and show them using existing components. External events stay availability blocks and never create patients. All-day events need calendar-timezone-aware day boundaries.

The callback must validate authenticated user, single-use state, age, PKCE, granted scopes and writable selected calendar. Encrypt refresh tokens server-side. Never return tokens to browser or logs. Reconnect must retain mappings; disconnect must stop workers and revoke/delete credentials while retaining local appointments. Bind selected calendar to mappings; changing calendar requires explicit handling, never reuse IDs across calendars.

Fetch complete paginated changes into a cache before planning. On 410 replace only the remote cache, retain local appointments and mappings, and reconcile previously linked missing events via direct lookup before classifying deletion. Sparse cancellations are tombstones; absence alone is never cancellation. Preserve recurring instance identity; do not collapse a series into one appointment. Restoring a deleted Google event requires an explicit tested policy before enabling restoration.

Apply inbound changes with existing appointment validation, preserving patient/session links and blocking changes to started/completed visits. Outbound title is generic and contains no patient name/diagnosis/notes. Use persistent outbox/transactional checkpoints for multi-appointment atomicity; a failed checkpoint must retry with the same provider identity. Refuse simultaneous conflicting edits, never last-write-wins. Do not advertise automatic conflict resolution.

Enable live routes only after isolation, durable storage and OAuth are verified. Use scheduled incremental catch-up plus authenticated validated push channel notifications; pushes are hints, not event payloads. Maintain a last successful-sync timestamp and reconnect state.

## Official references
- https://developers.google.com/workspace/calendar/api/guides/sync
- https://developers.google.com/workspace/calendar/api/guides/create-events
- https://developers.google.com/workspace/calendar/api/guides/push

## Explicit connection and conflict choice
The synthetic UI starts disconnected. A checkbox and explicit connect button enable only the in-memory simulation; connecting does not sync. Conflict review displays both complete time ranges in Europe/Athens, including cancellation. Local/remote choices update both synthetic sides after revision, ETag and slot checks. Postpone preserves both versions. Real OAuth consent and durable conflict application remain disabled/unwired.

## Free live-test preparation
User authorized only $0. Supabase quoted $0/month and a separate project Noima Calendar Preview (yncfbugkneywrwotuyls, eu-central-1) was created. It is isolated from production mgpnaxaquzeoomxdzhic. No existing projects were altered. The new project is not yet wired to app credentials or calendar data. Dedicated Google OAuth client/Calendar API and preview redirect setup remain required before real authentication can be tested. Never change NOIMA login or mail OAuth client settings for this test.

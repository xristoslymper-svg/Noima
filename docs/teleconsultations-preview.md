# Teleconsultations preview
The memory-only simulation is available in production and the designated teleconsultation preview branches. Real Daily calls remain disabled. No database changes.

## Available now
- Sidebar entry after Library; /teleconsultations is available in production and the designated simulation preview branches.
- Synthetic appointment linked to one synthetic patient and visit, never written to shared storage.
- Call-area simulation with explicit labels: no real video/audio or email delivery.
- Existing FollowupDraftProvider, FollowupField, ContinuityDraft and useClinicalDraft save/recovery mechanism reused. A dependency-injected fixture write replaces only the API persistence in this preview. Normal patient-record default is unchanged.
- Call and record view share the same mounted draft provider. Stopping a simulated call does not finalize the visit. A failed save blocks closing the visit and preserves text.
- PHQ-9/GAD-7/history assignment simulation retains the same appointment/patient/visit and deduplicates repeats. Existing intake visual classes reused; these are NOT real sends.
- The injected preview save transport disables dictation/AI buttons so fixture identifiers cannot reach shared APIs.

## Daily preparation (NOT live enabled)
Official API: https://docs.daily.co/reference/rest-api/rooms/create-room
Pricing: https://www.daily.co/pricing/video-sdk/
Private two-participant room policy with absolute expiry and eject_at_room_exp, recording/transcription disabled. Server-only adapter rejects missing reservations and ambiguous provider responses.
9000 participant-minute conservative cap (provider free allowance 10000) and per-room rounding margin. reserveCall requires an injected DURABLE ATOMIC global ledger. Its interface is not a deployed database or a functioning global budget counter. Tests use an isolated fake ledger and fake Daily fetch; no vendor requests or charges.
No key, API endpoint for live creation, billing card, or live room has been configured. The user explicitly requested preview/fixtures before creating a Daily account.

## Required before real calls
Dedicated test Daily account without a payment method; server-only preview key; verify provider account-level free eligibility and unrelated usage.
Durable transactional reservations shared across all users and deployment instances; bound rejoin/reconnection behaviour; reconcile actual provider usage including rounding, abandoned allocations, UTC month boundary, races and ambiguous timeouts before recycling any budget. Fail closed if ledger/usage unavailable.
Host authorization and expiring guest tokens, admission, cancellation revocation, link delivery and cross-patient access tests. Bind actual room to canonical appointment/visit and use existing note persistence/intake flows, never fixture transport.
Real two-browser/media/mobile testing and privacy configuration review.
No claim of live Daily integration or guaranteed zero-cost production usage is made by this preview.


Stitch composition: dark video with internal controls; separate visit/transcript/MSE/risk/continuity cards. Existing StructuredVisitEditor and RiskTreeEditor receive optional in-memory persistence adapters; defaults remain unchanged. Current MSE/risk begin unassessed. Existing followupCompletionIssues runs only after flushing all drafts; synthetic review cannot finalize a real visit.


Visit lifecycle: end-call opens the existing editable draft without completing it. Review flushes all editors, validates the same follow-up requirements and captures closure/MSE/risk versions. Explicit registration uses finalizeAndVerify with an in-memory adapter, promoting the same visit/continuity/appointment only after confirmation. No database API calls are made. Failed registration preserves the review and draft; duplicate registration is guarded and completed snapshots are immutable. The synthetic chart shows the final reviewed notes and evaluation, not the initial input. Real-call and persistent-record integration remain disabled; reload discards this fixture.


Notes-oriented polish: removed the tall visit title/stepper card; primary visit notes occupy the writing area. Optional chart reference is inline and read-only. Today's existing MSE/risk editors and continuity fields remain mounted under two initially closed native disclosures; missing completion requirements reveal them during review. No clinical fields or requirements were removed or inferred. Same tokens, font, controls and finalization contract.


General entry: scheduled and immediate synthetic visits, patient search after two characters, separate retained workspace per session. Returning to the list keeps mounted drafts and completion state in the open page. Invitations use a visibly demo-only, expiring URL fragment carrying only synthetic scope. The exact public synthetic guest path is available wherever the simulation is enabled; it renders no chart data and never requests media. The demo link is not an authentication credential, cannot connect Daily, cannot notify/admit a real guest and must never be reused as production authorization. Real invitations still require an authenticated durable invitation/meeting-token service and the real Daily integration.

## Canonical notes preview
On codex/teleconsultation-visit-persistence only, /teleconsultations opens existing follow-up visits from the authenticated workspace. Patient/session query parameters reopen the exact visit after refresh. No session creation occurs in this entry.
The same visual workspace and editors use existing save_closure, save_document and save_risk actions with expected versions; explicit registration uses finalize_closure and canonical read-back verification. Registered visits are immutable, and failed verification offers a read-only retry.
Read-only chart context comes from that patient's bundle, not the synthetic fixture. Existing draft recovery handles refresh during failed saves; version conflicts require comparison and an explicit choice.
Video remains simulated; Daily and guest invitations are disabled in connected mode. Production keeps its memory-only simulation. No migrations or shared-database test writes. Unit, isolated PostgreSQL and HTTP-fixture browser tests exercise recovery, cross-tab conflicts, the ordinary folder editor and completion.

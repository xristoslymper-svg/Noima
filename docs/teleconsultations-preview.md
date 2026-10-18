# Teleconsultations preview
Branch: codex/daily-teleconsultations. No production deployment or database changes.

## Available now
- Sidebar entry after Library; /teleconsultations is server-gated to this exact Vercel preview branch.
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


Visit lifecycle: end-call opens the existing editable draft without completing it. Review flushes all editors, validates the same follow-up requirements and captures closure/MSE/risk versions. Explicit registration uses finalizeAndVerify with an in-memory adapter, promoting the same visit/continuity/appointment only after confirmation. No database API calls are made. Failed registration preserves the review and draft; duplicate registration is guarded and completed snapshots are immutable. The synthetic chart shows the final reviewed notes and evaluation, not the initial input. Production integration remains disabled; reload discards this fixture.


Notes-oriented polish: removed the tall visit title/stepper card; primary visit notes occupy the writing area. Optional chart reference is inline and read-only. Today's existing MSE/risk editors and continuity fields remain mounted under two initially closed native disclosures; missing completion requirements reveal them during review. No clinical fields or requirements were removed or inferred. Same tokens, font, controls and finalization contract.

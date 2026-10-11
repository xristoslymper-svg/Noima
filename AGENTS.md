# NOIMA — Agent instructions

## Scope and authority

NOIMA is a Greek-language clinical workspace. The current task is an isolated mobile presentation experiment, not a new clinical product or a desktop redesign.

Read `docs/MOBILE_DESIGN.md` before mobile design or implementation. Read the current source and any more-specific instructions before editing. Current executable behavior and explicit user decisions take priority over old mockups. Surface conflicts instead of silently inventing a compromise.

Work only on `design/mobile-v2` for this experiment. Do not merge, change the production branch, promote a deployment, purchase a subscription, or modify account/billing settings without explicit authorization. A branch isolates code, not data or environment secrets.

## Product and UX invariants

- Preserve the current destinations, terminology, clinical information architecture, required fields, action meanings, and draft/finalization distinction. Visual freedom is not authorization to change workflows.
- Keep the four primary destinations: Επισκόπηση, Ημερολόγιο, Ασθενείς, Βιβλιοθήκη.
- Preserve the patient workspace destinations: Σύνοψη, Πορεία, Θεραπεία, Ιστορικό, Καταγραφή. Do not conflate a pre-visit briefing, last completed visit, and current draft.
- Preserve patient, appointment, session and tab context during navigation, including browser Back. Never open another patient's draft or create duplicate sessions because a layout remounted.
- Preserve unknown, not assessed, unavailable, loading, error, stale, empty and negative as distinct states. Never replace failed reads with reassuring zero counts, no medication, or no risk.
- Prioritize meaningful changes without omitting older important clinical context. Date historical findings and expose their source.
- Retain the existing risk/MSE review, clinical provenance, corrections, concurrency guards and finalization requirements. Previous MSE is a reference, not a new observation.
- Minimize visual clutter, repeated headings, nested cards and needless confirmations. Retain confirmations that protect clinical data or irreversible actions.
- Keep dictation and clinician-triggered AI wording assistance in the existing editor. No decorative AI panels, large recording overlays, silent acceptance of AI text, or extra approval workflow without a concrete need. Preserve retry/discard protection for failed audio and undo/review of proposed wording.
- Do not restore removed adherence/pinned-context quick-entry forms merely because they existed in an earlier design. Retain historical values.

## Mobile presentation boundaries

Mobile may change spacing, composition, touch targets, line wrapping, responsive presentation and visual hierarchy. Represent existing destinations compactly without adding workflow steps or removing access to required information.

Do not edit desktop JSX, global CSS, shared route behavior or business logic as part of the initial design experiment. Keep prototypes under `docs/mobile-lab/` and use local, synthetic fixtures only. A downloadable prototype is not an integrated application.

For a later approved implementation, use isolated presentation components and narrowly scoped mobile styles. Reuse canonical data loaders, projections, editors, mutations and validation. Do not fork clinical logic or mount hidden duplicate editors/loaders. Check server rendering and hydration, keyboard appearance, safe areas, orientation and touch interaction. Define an explicit breakpoint strategy and desktop screenshot baseline before integration.

## Visual direction

Use calm warm-cream surfaces, restrained green accents, readable type and generous but efficient spacing. The historical patient canvas is `#F8F5EF`; inspect current and historical source for related surfaces, borders and tokens. Do not apply one warm background indiscriminately to every element.

Keep useful content prominent rather than oversized greetings, decorative charts or administrative dashboard styling. Reuse components and semantic tokens; avoid scattered overrides and specificity hacks. Mobile visual exploration must not alter the desktop palette.

## Figma / Stitch collaboration

Design tools propose visuals; the agent remains responsible for UX and engineering review.

1. Inspect source and write a screen-to-data/workflow map.
2. Give the design tool a focused brief with required states and protected interactions.
3. Critique effort, discoverability, accessibility, information loss and feasibility before accepting output.
4. Revise the specific problem rather than regenerating the whole product.
5. Prefer editable components, text, vector icons, variables and responsive structure over flattened screen images.
6. Label proposals and simulated interactions honestly. Do not call mock screens production-ready or database-integrated.
7. Report tool access/rate limits accurately. Never upgrade a plan or claim a blocked tool completed work.

## Data and privacy

Never send real patient records, audio, screenshots, identifiers, credentials or production database responses to external design tools. Use intentionally authored synthetic cases with a persistent prototype notice. Do not fetch live clinical data to populate a visual mockup.

The initial mobile prototype must make no network/database requests, include no credentials and persist no entered clinical data to browser storage. Keep sample interactions in memory only. Mark simulated save, dictation, AI, appointment and payment actions explicitly; no fake clinical success messages.

No schema migrations, database writes, authentication/RLS changes, new API contracts or changes to clinical calculation/persistence behavior are authorized by a visual task.

## Verification and reporting

For prototypes, test navigation, patient context, browser Back, search/filter behavior, overlays/keyboard dismissal, no horizontal overflow at 360/390/430px, and no outgoing network requests. Check empty/error/stale and safety states, not only ideal screenshots.

For integrated code changes, run the repository's relevant TypeScript, lint, build, unit and browser checks. Compare desktop screenshots at fixed viewports and use synthetic clinical regression cases. Never claim tests passed unless executed. A design-only prototype does not prove backend, mobile microphone, real-device or clinical persistence correctness.

Report exactly which files/branch changed, what is simulated, checks executed, limitations and whether any deployment occurred. Preserve unrelated work. Request approval before changing clinical workflows or desktop behavior.

# Mobile Lab 01 — Review status

Reference implementation: `31bf67fcc0af6eaf7bef45b4ccc9bf266e127161`.
Design-only branch: `design/mobile-v2`.

## Delivered review artifact

A self-contained HTML/CSS/JavaScript prototype was authored and delivered separately in the conversation as `NOIMA_Mobile_Prototype.html`, with editable source and screenshots in `NOIMA_Mobile_Design_Lab.zip`. The prototype source is in that delivered package; it has NOT been integrated into this repository's application routes or committed under this directory.

SHA-256 of the delivered standalone HTML:
`4b442b99cd9fa5bb76c6a8b04a43d6408efa7eb35358445dad840165e405fa6d`

The prototype includes the four existing main destinations, the five patient workspace tabs, registry search/filter/sort, an agenda and appointment action sheet, a sample follow-up editor, library navigation and explicit unavailable/loading/stale/empty states.

All patient cases were manually authored as synthetic examples. Only one case contains a full interactive compact follow-up example. Secondary forms are explicitly marked as not implemented instead of inventing replacement clinical logic. Sample appointment, payment and task changes live only in page memory. Dictation and wording assistance are explicitly labelled local demonstrations, not real recording or AI. Clinical finalization is blocked.

## Executed validation

17 grouped prototype checks passed. One group covers 36 route/viewport combinations across 360x800, 390x844, 430x932 and 740x390. The executed groups cover:

- Four-destination navigation and active state.
- Overview patient selection, distinct folder action and browser Back.
- Accent-insensitive registry search, diagnosis search, filters and sort.
- No medication, risk or draft leakage between synthetic patients; historical findings retain dates.
- In-memory draft retention without overwriting the last completed visit's summary.
- Inline simulated dictation/stop/undo and explicitly local wording changes/undo.
- No fake finalization or server-save success.
- Calendar states, unknown payment, cancellation history and safe sample changes.
- Limited synthetic appointment creation.
- Tasks distinct from clinical completion.
- Catalog discovery and honest non-sending behavior.
- Loading/error/stale/empty distinctions.
- Responsive layout without page/main horizontal overflow in the 36 tested combinations.
- Phone-aligned action sheets and Escape dismissal.
- Main-surface button naming.
- No JavaScript runtime errors.
- No outgoing requests observed.

Node syntax validation for the prototype JavaScript also passed. Screenshots were rendered and visually inspected in Chromium. Tests loaded the standalone HTML into browser memory using Playwright `page.set_content`, not a deployed URL. The package includes the executable checks and JSON results.

## Not verified or implemented

No application build, TypeScript check, repository test suite, database integration, authentication, real recording/transcription/AI, live clinical persistence, physical iOS/Android tests or full accessibility audit was executed. Source-to-screen mapping is documented in `../MOBILE_DESIGN.md`; it is not evidence of end-to-end database compatibility.

The Figma file remains blank: creation and inspection succeeded but further MCP calls hit the account's Starter limit. No subscription upgrade was made. Do not describe these HTML screens as Figma-created screens.

## Isolation and next gate

Only documentation is added to the branch in this phase. No desktop/application component, global CSS, API, authentication or database file has been changed. No production merge or manual deployment was performed.

Before integration, obtain feedback on the visual proposal, inspect changes since the reference commit, and reuse the existing loaders/projections/editors/mutations and clinical guards. Do not copy the fixture logic into production. Preserve desktop baselines and use an isolated synthetic-data environment before requesting merge approval.

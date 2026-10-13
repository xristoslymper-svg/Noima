# Mobile presentation on the current patient workspace

Branch: `codex/mobile-current-base-20261013` (includes the current, uncommitted recording-dialog/Visits changes).

Reference work: interrupted `Integrate mobile clinical follow-up`, checkout `C:/Users/xrist/noima-mobile-v2`. Transferred presentation selectively; no old clinical business logic replaced the current implementation.

## Isolation

- Default gate OFF: `NEXT_PUBLIC_NOIMA_MOBILE_V2 === '1'` is required.
- Gate enabled only via `--build-env` on this Vercel Preview, without changing project environment settings.
- New styles/components live in `components/mobile`. Visual changes only inside the 760px media boundary and opted-in patient/calendar roots.
- Minimal shared component additions attach styles, navigation and section anchors. The existing draft, recording, medication, finalization and navigation callbacks remain authoritative.
- No schema, API, auth or clinical reconciliation changes. Preview deployments share the existing configured data service; UI deployment isolation does not imply isolated patient data.
- Keeps the current four tabs, Visits label, recording dialog and Print/PDF dropdown. Mobile recording uses the same dialog as a full-height view, with a sticky close header.

## Deployments

- Previous desktop reference: https://noima-6fgqpoiwt-xristoslymper-3481.vercel.app
- Mobile-enabled preview: https://noima-apiqszcjq-xristoslymper-3481.vercel.app
- Deployment: `dpl_32vpX8CCHNwcbJx2TNJUyfzWxkHX`, READY, Preview.
- No production deployment or Git push.

## Verified

- 389/389 existing tests; typecheck and lint pass. Vercel remote build passes.
- Actual Vercel browser screenshots are byte-identical between the previous preview and mobile-enabled preview: patient summary at 1440x900 and calendar day view at 1280x800, with the same data and view selection.
- Patient summary has no page overflow at widths 320, 360, 390, 430, 759, 760 and 761. New bottom navigation is grid through 760px and hidden at 761px.
- Mobile calendar at 390px has no page overflow. Calendar appointment details → Folder retains the original patient and appointment identity.
- Synthetic patient `4efe4b33-b66e-45e5-af92-b41f3040c3f2`: new followup `941ce895-d658-41c8-bd1d-28579b2fa1a1` filled through browser form inputs, not API seeding.
- New notes, clinical state, decision and next-review fields survive guarded close/reload/resume. MSE baseline confirmed and negative risk answers saved through the existing controls.
- Mobile section shortcut expands/focuses MSE; recording dialog does not overflow horizontally at 390px.
- Finalization initially blocks missing adherence. Filling adherence allows finalization; completed view has the entered text and confirmed MSE/risk. Visits contains three completed entries, and summary shows the new clinical state and review focus.
- Browser console contains no captured errors for the tested flow.

Evidence: `test-results/mobile-current-base-20261013/`.

## Scope and remaining device validation

This continues the calendar → patient summary → compact followup slice. Other routes retain their existing presentation. Initial assessment uses the existing full-screen recording dialog; its form content was not redesigned. Physical phone keyboard, Safari/WebKit, audio dictation and OS printing were not tested in this pass. Screenshot parity is evidence for the two captured desktop views, not a claim that every application screen has been exhaustively compared.

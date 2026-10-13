# Mobile visual refinement

Scope: presentation only, on the current shared application. The implementation change for this pass is entirely in `components/mobile/MobileClinical.module.css`; no TSX, API, authentication, draft, clinical, schema or desktop stylesheet changes were made in this pass. Earlier task changes remain in the working tree.

## Presentation

- Unified system typography: 26px page titles, 20px section titles, 14–15px reading text, 16px form fields, 12–13px metadata.
- Consistent screen padding, spacing, border radii and restrained shadows. Mobile bottom navigation keeps its active state.
- Overview schedule rows keep the folder action next to the patient and reclaim space from decorative initials.
- Registry allocates more width to full patient names; filters and controls retain their existing behavior.
- Library descriptions, categories, metadata, previews and controls are enlarged for reading and tapping.
- Calendar filters fill the screen width; separate appointment cards replace nested surrounding card framing.
- Patient folder has clearer tab layout, larger recording action, flatter framing and distinct summary sections.
- Initial/followup fields retain their existing editors. Removed redundant inner surfaces; improved section navigation and reading dimensions.
- Followup medication table rows are visually arranged as labelled cards, preserving the existing table, headers and actions. Medication name, dose, frequency, period, status, response, adverse-effect and modification controls remain present.
- Medication modal now layers above the recording header. Dose/unit sit side by side; redundant field boxes are removed. Close controls are at least 44x44px.

## Desktop containment

- All 197 new CSS rules are inside media queries with `max-width:760px` or the narrower 360px boundary, and scoped to opt-in mobile classes. Verified by parsing the final CSS with PostCSS.
- Existing desktop source styles and JavaScript were not changed; the production deployment was not updated.
- Compared desktop screenshots at 1440x900 for overview, registry, library, calendar, patient summary and recording. Registry and patient-summary application regions had zero pixel differences outside the Vercel toolbar area. Some other captures have transient synthesis content, screenshot encoding/viewport differences and toolbar overlays; they are visual checks, not claims of full-image byte equality.

## Verification

- 391 existing tests pass; typecheck, lint and the final remote Vercel build pass.
- Actual stable URL: https://noima-mobile.vercel.app/calendar
- Final Preview: `dpl_HaLVjAVZvZryUTmcTUkShMkyvrNg`, https://noima-26h4f55ta-xristoslymper-3481.vercel.app
- Overview, calendar, registry and Library were visited via the bottom navigation at 320, 360, 390 and 430px. All 16 checks reported no horizontal page overflow.
- Existing synthetic initial assessment and followup were opened without editing or saving clinical content. Initial assessment reported no page/dialog overflow at 320, 360, 390, 430, 759, 760 and 761px; at 760x430 the dialog header is static and the dialog fits the viewport.
- Followup medication cards preserve a discoverable table and all eight header labels. All displayed medication actions measured at least 44px high. The medication scroller fits its container without horizontal scrolling.
- Existing medication modification modal was opened and cancelled/closed without changing data. Final backdrop z-index is 100 versus recording header 25; close control measured 44x44px.
- Checked patient folder action typography (15px), form fields (16px), and section navigation. Previous draft selection and close callbacks remain unchanged.

Evidence: `test-results/mobile-ui-pass-20261013/`, including `mobile-overview-final-390.png`, `mobile-calendar-final-390.png`, `mobile-patients-final-390.png`, `mobile-library-final-390.png`, `mobile-folder-final-390.png`, `mobile-followup-live-390.png` and `mobile-medication-live-390.png`.

Browser viewport simulation only; physical keyboard behavior and Safari/WebKit were not tested. This pass does not redesign separate account, login, scanner or public questionnaire routes.

## Palette correction

Following user feedback, restored peach/cream instead of the overly neutral white surfaces. New mobile canvas `#f8f1e8`, cream card surface `#fffaf3`, field surface `#fffdf9`, peach accent `#f4e1d2`, warm borders `#e6ddd1`. Scoped palette overrides cover main pages, folder, forms and modal surfaces; active green states and warning/status colors remain distinct. No geometry, desktop or behavior change. All ten palette rules are within the 760px media boundary. Vercel build passes. Verified actual computed colors and no page overflow in Overview and registry at 390px. Screenshot: `mobile-peach-cream-overview-390.png`. Current alias points to `dpl_33pqX3m4zKD4U4VnAbv4X9vqmLWU`.

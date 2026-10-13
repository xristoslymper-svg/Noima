# Mobile color harmony

User requested a broader harmony pass in the same green/cream/peach palette. CSS-only edits within opt-in mobile roots and the existing <=760px media boundary. No geometry, handlers, data, or desktop styles changed.

Palette: warm canvas #f8f5ef, ivory surfaces #fffdf8, field #fffefa, restrained peach #f3e5d9, border #dde3d9, primary green #245c47, sage #edf4ef, ink #263d33, secondary text #586d62. Active registry/library filters and patient folder tabs share primary green; secondary controls/chips use sage. Overview metric surfaces use sage/cream/peach with consistent green values. Patient visit CTA subtitle corrected to light green for readability on the existing green CTA. Appointment status and warning colors retained.

Ready Preview dpl_ACobkpLrmXHynj6zm3iK29WDvhsM, https://noima-42u85hum9-xristoslymper-3481.vercel.app now backs https://noima-mobile.vercel.app. Remote build, lint and typecheck passed. Authenticated visual QA at 390x844 covered registry, overview, library and completed synthetic patient folder; no records changed. Desktop registry computed colors, borders and geometry for workspace, heading, primary action, active filter and registry matched before/after exactly at 1440x900. Main text color pair contrast ratios: green/ivory 7.66:1, muted/ivory 5.47:1, ink/canvas 10.74:1; these are sampled token pairs, not a full accessibility audit. Existing behavioral suite was not rerun for CSS color-only edits.

Screenshots in test-results/mobile-calendar-focus-20261013: harmonized-overview-390.png, harmonized-patients-390.png, harmonized-library-390.png, harmonized-folder-390.png.

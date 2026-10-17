# Patient journey on #111

Based on #111 at d45803159498ff0b3041b67c19067c974feca165. This branch implements the accepted patient journey using the existing warm ivory, green typography, navigation and clinical editors.

- Four tabs remain: Σύνοψη | Επισκέψεις | Θεραπευτικό πλάνο | Στοιχεία & ιστορικό.
- The header dates drafts and distinguishes explicitly linked appointments. Multiple drafts or a different current-day appointment require selecting the specific encounter; opening the file never creates an encounter.
- Summary opens with short, dated excerpts of completed clinician-authored notes. The existing analytical clinical synthesis and all source records remain available through disclosure.
- Visit recording is inline within Visits. Pending-work guards, exact session identity, browser history, existing save/version semantics and draft recovery remain in place.
- Previous confirmed context excludes the current encounter, drafts and clinical dates at or after the selected encounter. It does not prefill a current MSE or risk assessment.
- Both initial and follow-up editors flush and validate before review. Editors stay mounted while review is shown; confirmation flushes and validates again before the unchanged verified completion path.
- The completion screen appears only after server completion and refreshed patient identity are verified. It offers reading the record or returning to the refreshed summary, without claiming that external AI synthesis has already completed.
- Medication and appointment writes remain immediately committed by the existing APIs. The UI explicitly distinguishes them from draft clinical notes.

No API, migration, shared database, production deployment, alias or environment change. The #111 migration remains inherited but is not applied hosted. No paid temporary database.

The earlier #110 blanket preservation contract is deliberately narrowed for the three authorized editor/summary files and PatientWorkspace. All other existing production hashes (22) and original patient/global styles remain enforced. New journey behavior is covered by focused unit and desktop/mobile fixture tests. CI evidence must not be described as authenticated hosted E2E or shared-schema activation of the inherited AMKA fix.

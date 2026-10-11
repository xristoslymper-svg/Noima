# Recording and record coherence — 11 October 2026

## Documentation structure

Plan and reassessment now form one compact “Decisions and next review” section. They retain separate stored values and labels so today's intervention cannot overwrite the next review's purpose. Functioning sits next to the presenting clinical picture. Adherence and overall tolerability sit beside the medication table; they remain distinct from one another and from medication-specific adverse events. No absent answer is converted into a normal finding.

Initial and detailed follow-up medication entry now reuse the Treatment tab's inline table, including its existing save guards and versioned medication events. Frequency offers independent Morning, Noon and Evening buttons. Custom schedules remain editable text and require an explicit reset before time buttons replace them. Existing schedules are not parsed into inferred doses or translated prescriptions.

## Source and update contracts

| Recording source | Destination | Update rule |
| --- | --- | --- |
| Clinical picture, functioning, decisions, next review | Summary | Latest completed encounter's sections; recorded text corrections take precedence; approved continuity is a fallback only if that encounter has no section. Drafts and earlier encounters do not silently supply missing fields. |
| Adherence and overall tolerability | Treatment | Same completed-encounter projection and correction precedence as Summary, with encounter date. |
| Medication start/change/stop and drug-specific side effect | Recording, Treatment, Summary, Timeline | Existing shared medication/event records, refreshed immediately after saving; independent of whether the encounter is still a draft. |
| Longitudinal history | Recording and History | Existing shared history record and refresh callback; present-visit functioning is not merged into longitudinal social history. |
| Risk | Summary and completed record | Existing effective risk projection; Summary uses the actual question's label, including the death-wish question where applicable. |
| Measurements | Summary, Treatment, Timeline | Existing completed measurement projection and visit linkage; incomplete measures remain excluded. |
| Completed encounter | Timeline | Existing dated completion event opens that encounter. |
| Next appointment | Existing appointment views | Existing shared scheduling record and refresh callback. |

Leaving Recording for another record tab now refreshes the patient bundle after pending writes finish. This also avoids briefly showing stale corrections in a different tab.

Compact and detailed follow-up views now share one versioned closure draft, including writing provenance. Previously they could preserve independent, contradictory text. Historical disagreement is displayed with both versions and requires an explicit choice before completion; it is never silently overwritten. Existing backend finalization and required clinical checks are unchanged.

## Validation

- 350 tests pass, including all eight time-button combinations, preservation of custom schedules, initial-visit projections, corrected/cleared fields, missing current-encounter values, shared draft provenance, and legacy conflicts.
- TypeScript and ESLint pass. Production build passes.
- Local browser: inline add opens without a dialog; Morning + Evening yields the exact stored label; plan and review remain distinct; edits survive compact → detailed → compact and reload.
- Existing first-pass hosted evidence remains in the patient UX audit. This pass requires its own exact-commit preview check before it is described as hosted verified.

No schema migration, new clinical inference, automatic normal values, production promotion or main-branch merge is included. Typed overall tolerability does not automatically create a drug-specific adverse-event record; attribution requires the existing explicit action. AI rewriting, microphone capture and concurrent independent browser writers are outside this pass's manual end-to-end verification.

# Patient continuity — functional evaluation, no visual redesign
Baseline: d304862c1e065d99b303fb4528ea07908d6c2822 on PR #114. This is an engineering scenario evaluation, not an observed psychiatrist usability study.
Criteria: source integrity, predictable persistence, completeness, no duplicate entry, continuity across visits.

| Scenario | Baseline assessment | Follow-up acceptance |
| --- | --- | --- |
| Find current plan and next review | Supported in treatment preview | Preserve completed/corrected projection, no second editor |
| Identify source visit of medication change | Partial: replacement could lose displayed origin | Trace explicit revision ancestry, reject ambiguity, never match dates |
| Distinguish self-report/draft/confirmed | UI distinguishes, summary lacks self-report | Separate attributed sources, no promotion to medication/risk/history |
| Know whether summary includes recent change | Partial: GET-only cached read and passive cooldown | Fresh supplemental hash; canonical current fallback; explicit generation only |
| Complete follow-up without re-entry | Partial: previous review excerpt may truncate tasks | Full corrected previous review in existing reference; current assessment remains clinician-authored |

Implementation 1–6: medication revision lineage; fresh summary read + explicit manual update; retrospective course source; original self-report source with attribution validation; full agreed review reference and outcome guidance in existing fields; existing save-boundary text includes chart-wide clinical history.
No CSS, palette, layout, tabs, database migrations, clinical data writes, production change or new task/goal schema. No automatic copying into draft notes, current risk or medication. Clinical source read failure cannot validate stale synthesis.
Validation runs with synthetic records and stubbed providers only. No live model calls, email or clinical writes are used for testing.

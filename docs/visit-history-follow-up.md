# Encounter-specific History follow-up

The visit questionnaire edits the existing mutable, version-protected patient-level history. It is clinician-side; no remote patient submission or review flow is implemented. Finalizing an encounter freezes its clinical sections and risk record, but does not freeze the longitudinal history questionnaire.

Preserving the exact History reviewed at an encounter requires a separate product/schema decision: capture an immutable encounter snapshot or reference an immutable history revision, record authorship and review time, and define addendum/correction and export behavior. A future patient submission flow must preserve submitted answers and clinician review separately from canonical longitudinal history.

This remediation changes neither the history schema nor historical records. It deliberately avoids a partial snapshot that could imply encounter provenance without enforcing it.

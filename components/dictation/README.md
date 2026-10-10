# Clinical writing

ClinicalTextField owns one existing textarea with microphone and explicit wording assistance. ClinicalWriting keeps pending review out of the autosaving clinical draft, with stable session/section/field identity and session-local recovery cleared on account change.

FieldRecorder uses pause/resume, one microphone lease, 60 seconds of active audio and the existing 25 MB upload limit. It releases tracks on completion, cancellation and unmount. Transcription uses /api/transcribe; failed uploads retain audio in memory for explicit retry. Audio is never saved to browser storage. Additional dictation appends another paragraph; it never launches AI.

Polishing uses /api/clinical/polish, verified draft-session ownership, existing Responses API configuration and conservative wording-only instructions. Stale responses are discarded. The editable inline proposal requires acceptance, followed by a 10-second undo.

Narrative confirmation creates an unapproved provenance entry and invokes the existing version-checked approval RPC. Assessment and closure use their existing JSON/versioned save paths with reviewed provenance metadata. Pending text is never autosaved as clinical documentation. Legacy proposals recover inline without launching AI.

Real microphone, recognition quality and authenticated live persistence require browser/clinician verification; deterministic tests and synthetic UI fixtures are not live microphone E2E.

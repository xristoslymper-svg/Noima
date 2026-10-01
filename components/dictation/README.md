# Section dictation demo

Maria → Sessions → a section's Υπαγόρευση button opens `SectionDictation`.
It loads multilingual Whisper base (q8, WASM, single thread) in a dedicated
worker, records at most 60 seconds, decodes/downmixes/resamples to 16 kHz, and
transcribes in Greek. No paid API, server route, credential, or installation.
Model assets download from Hugging Face and are browser-cached where supported.
This requires internet for the first model download, HTTPS/localhost, microphone
permission, MediaRecorder, Web Audio and WebAssembly. Speed/memory vary by device.

The result appears read-only with **ΟΚ / Επεξεργασία**. Editing does not insert it;
ΟΚ appends the reviewed text to the selected section without replacing existing
text. Close/Escape cancels. Recording tracks stop on completion/cancel/unmount;
the worker is terminated on unmount. Audio is held only in memory, never uploaded
or persisted. The worker receives audio only, not the patient or section title.
Only model files are cached. No transcript or audio logging is implemented.

This remains a fictional-case demo: text is React state and disappears on leaving
the Sessions tab or refreshing. It does not approve official clinical records,
save to Supabase, structure notes with an LLM, or change other dictation demos.
Silence/short-input checks reduce accidental empty recordings but cannot prevent
all Whisper hallucinations. Clinician review is essential.

Validation: production build/typecheck; real browser microphone pipeline using
a public speech WAV as Chrome's fake capture source; actual Whisper inference;
review-before-insertion, edit then OK, section isolation, cancellation, no POST
uploads, and responsive layout. The fixture verifies plumbing, not Greek clinical
accuracy. Before broader use, test Greek drug names, doses, negations, mixed
Greek/English speech, permission denial, noisy/silent audio, 60-second cutoff,
and cancellation on target desktop/mobile browsers with fictional examples.

The targeted sharp override patches an unused server-side image dependency of
Transformers.js; the browser uses neither sharp nor onnxruntime-node.

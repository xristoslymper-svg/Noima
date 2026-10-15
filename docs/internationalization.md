# Greek and English localization

PR: https://github.com/xristoslymper-svg/Noima/pull/106

Feature branch: `codex/greek-english-i18n`, based on the existing visit workflow branch at `edf089ad9b4990561113c3bdb410a8d66c69d013`. This change does not merge to main, deploy to production, migrate a production database, or edit production records. Application builds and browser/database tests run on disposable GitHub runners. Vercel receives Git preview deployments.

## Architecture

The existing Next.js App Router uses **next-intl 4.14.9**. `i18n/messages/el.json` is the typed message schema; `en.json` has the same semantic namespaces and ICU argument names. There are 2,260 message keys. Components read the provider through `useTranslations`. Server exports and deterministic assistant replies use next-intl's `createTranslator`. Ordinary interface translations never call AI or an external translation service.

`i18n/config.ts` defines supported locales, names, the explicit-preference cookie and Athens timezone. `messages.ts` loads a single selected dictionary with static lazy imports. A provider shares it throughout the page; components do not import complete dictionaries. `request.ts` resolves SSR messages from the verified middleware header. Middleware removes caller-supplied locale headers and reuses its existing verified authentication read. Both initial HTML and hydration receive the same locale.

Resolution order for clinician pages is authenticated `user_metadata.noima_locale`, explicit `noima-locale` cookie, then Greek. Browser Accept-Language is not consulted. `/api/locale` accepts only `locale`, checks same-origin requests and uses the current user's Supabase `updateUser`; it accepts no user/workspace identifier. Anonymous choices set only the HttpOnly, SameSite=Lax cookie (Secure on HTTPS). Auth or persistence failures leave the active language unchanged.

**No database migration is needed.** The preference uses existing Supabase Auth user metadata. No new table, RLS policy, service credential or RPC signature is introduced. Locale metadata is presentation data, never an authorization input.

`LocaleProvider` changes messages and locale in React state only after persistence succeeds. It does not navigate, refresh the router, change a subtree key, flush/replace a draft, or regenerate a summary. Patient, visit, tab, appointment, scroll context and pending editor DOM remain in place. MSE keys are canonical, independent of translated labels. The document `lang` attribute follows the selected locale.

Dates use locale-specific formatting with **Europe/Athens** in both languages. Date parsing, ISO timestamps and DST ambiguity checks are unchanged. Counts and parameterized validation use ICU interpolation/plural rules; the locale does not change appointment instants.

Missing messages produce a readable translated fallback rather than a raw key. Development logs identify missing keys. CI fails for dictionary mismatches, extra/unused keys, unknown literal translation keys, invalid ICU, unequal interpolation arguments, or hardcoded Greek JSX text/accessibility attributes (apart from the brand mark).

## Language selectors

- **Profile → Settings → Language** shows `Ελληνικά` and `English`. The native select supports keyboard interaction and has a label, disabled saving state and live success/error feedback.
- The visit dialog contains a compact Profile/Settings control, so language remains accessible while its native modal makes the underlying page inert.
- Login has the same compact selector. Account preference takes precedence after sign-in; a cookie is the fallback for an account without an explicit preference.
- Recipient forms and exports have a separate **Recipient language** control, defaulting to Greek. They do not inherit or write the doctor's preference.

## Coverage

| Surface | Migration |
| --- | --- |
| Login, account, password reset, profile, mailbox settings | Labels, instructions, validation, status, accessibility |
| Dashboard and mobile navigation | Navigation, tasks, counts, payment status, empty/loading/error states |
| Calendar | Views, dates, create/move/cancel/repeat, appointment types, reminders, payment, voice command clarification |
| Patient directory and creation | Search, filters, identity, demographics, validation |
| Patient workspace | Summary headings/source links, timeline, treatment, history, tabs, export menu |
| Initial and follow-up visits | Navigation, sections, compact/detailed views, MSE/risk choices, diagnosis, medications, adherence, tolerability, measurements |
| Reliability workflows | Save/finalize/finish later, unsaved/conflict messages, recovery, correction/addendum controls, administration |
| Psychometric library | Categories, descriptions, instructions, score interpretation, previews and delivery controls |
| Patient-facing forms | Explicit independent locale, history questions/options, completion/error states, tablet UI |
| Mail and print | Explicit recipient locale for composer/templates/links and printable record labels, dates and counts |
| Dictation and AI | Recorder controls, writing assistance, new-output language hints, deterministic assistant replies and error states |
| APIs | Existing error/code preserved; additive `message_key`; UI system-message adapter for legacy responses |

The full changed-file inventory is in [i18n-changed-files.txt](i18n-changed-files.txt). Implementation groups are `i18n/`, root middleware/layout, existing `app/` and `components/` surfaces, presentation helpers under `lib/`, test adapters, browser coverage and CI workflows. No parallel set of translated pages was created.

## Clinical and document boundaries

Patient names, free text, diagnoses and ICD labels, medication names/doses, dictation, submitted answers, stored history, previous summaries and completed record content retain their recorded language. Clinical notes are never passed through the system-error or option-label adapters. Old canonical Greek option values continue to be written as before; only their UI labels are localized. IDs, statuses, field names and RPC parameters remain unchanged.

The clinical summary's recorded/derived narrative payload is preserved as evidence, including existing compiled historical sentences. Surrounding headings, source-link captions and deterministic review notices are localized. Changing the UI does not replace this payload or request a new AI generation. New AI requests explicitly carry `x-noima-output-locale`; request-scoped AsyncLocalStorage isolates concurrent users. The provider instruction preserves names, codes, quotes, negation, uncertainty and attribution. Existing cached summaries remain in their original language until an explicit refresh/new generation.

**Instrument text is versioned clinical source content.** The existing PHQ-9/GAD-7 Greek items and answer wording (`el-demo-2026-10-v1`) remain Greek, visibly identified as the original instrument language even when the form interface is English. Library instruments originally supplied in English likewise retain their source language. This PR does not claim to introduce a validated English instrument version or silently relabel an existing administration. Adding a separate instrument version requires its own clinical/version review.

The raw TXT technical backup preserves its canonical field names, headings and JSON. The print/PDF presentation uses the explicit document locale and preserves all clinical values. Brand, drug names and PHQ-9, GAD-7, MSE, ICD-10 remain unchanged.

Recipient language is explicit in the form URL (`?lang=`); the private token stays in the fragment. Switching document language uses `history.replaceState` and keeps the same form/answers. Intake email requests pass a presentation locale to the server template, never to an RPC as an identifier. Questionnaire composer language is separate from clinician settings and does not overwrite an edited draft. Copilot questionnaire delivery explicitly retains the existing Greek recipient template. No live email or SMS was sent in validation.

No legal consent contract is replaced. Translated patient instructions/privacy guidance and clinical terminology should receive the product's clinical/editorial review before production release.

## Verification

Detailed final results and screenshot provenance are recorded in [i18n-verification.md](i18n-verification.md). The new real-application suite runs at 1440×1000 and 390×844 with synthetic users and patients, actual Next handlers, disposable Supabase Auth/PostgREST/RPCs and external AI disabled. It rejects remote database URLs and blocks unrelated browser requests.

The suite holds an actual clinical save request before it reaches the API, switches Greek → English → Greek, and verifies the exact same editor node/text, patient/visit URL and unchanged database rows/versions. It also checks refresh/relogin preference, two-user isolation, forged IDs and cross-origin writes, initial/follow-up finalization, recipient locale independence, accessibility labels, raw keys, mixed control text and horizontal overflow. Existing workflow and recorder assertions remain active.

A failure found during this testing was fixed: a late lightweight patient shell could erase already loaded payment fields. Shell reconciliation now preserves fields omitted by the lightweight projection and refuses to replace a newer appointment with an older timestamp. A regression test covers omitted, stale and genuinely newer payment data as well as removal.

## Adding another language

1. Add its locale to `locales` and its native name to `localeNames` in `i18n/config.ts`; add the appropriate BCP-47 formatting mapping to `intlLocale` if needed. Keep the default `el` and clinical timezone unchanged.
2. Add `i18n/messages/<locale>.json` with the same semantic keys and ICU argument names. Translate complete messages and plural branches; do not translate IDs or stored values.
3. Add a static lazy import entry in `i18n/messages.ts`. Extend the server-only dictionary map in `output-translator.ts` and the language-name instruction mapping in `output-language.ts` for new AI output. Components require no rewrite.
4. Extend locale test matrices and the explicit recipient/document selectors (selectors already enumerate configured locales). Review localized email/print content separately from instrument versions.
5. Run `npm run check:i18n`, typecheck, lint, unit/database tests, build and the isolated browser suites in CI. Review screenshots at desktop/mobile widths, clinical terminology and keyboard/accessibility behavior before release.

Do not add locale to a clinical record identity, editor React key, summary cache key or autosave dependency. New locales must preserve the same clinical-data and unsaved-work invariants.

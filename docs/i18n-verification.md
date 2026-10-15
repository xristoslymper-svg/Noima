# Internationalization verification — 15 October 2026

Application source under test: `229dd99` (`codex/greek-english-i18n`). Later evidence-only commits do not change application or test code.

## Remote results

| Check | Result / evidence |
| --- | --- |
| TypeScript, ESLint, translation audit | Passed in [Quality gate](https://github.com/xristoslymper-svg/Noima/actions/runs/38796746317) |
| Unit and database regression tests | **472 passed, 0 failed** in the same Quality gate |
| Production build | Passed in the same Quality gate |
| Translation dictionaries | 2,260 keys; 2,625 translation calls; no missing/extra/unused keys, ICU/argument errors or Greek JSX/a11y literals |
| Real application browser → API → Supabase | Passed for desktop and mobile in [real application suite](https://github.com/xristoslymper-svg/Noima/actions/runs/38796746566), including database tests |
| Existing visual/interaction tests | Passed in [visual and interaction suite](https://github.com/xristoslymper-svg/Noima/actions/runs/38796746381) |
| Existing browser recorder/upload tests | Passed in [synthetic recorder suite](https://github.com/xristoslymper-svg/Noima/actions/runs/38796746680) |
| Copilot evaluation | Passed in [evaluation](https://github.com/xristoslymper-svg/Noima/actions/runs/38796746334) |
| Vercel preview | [Deployment completed](https://vercel.com/xristoslymper-3481/noima/EkWNQTCPyGEVMCsk6Zwtxati2fvm) |

The public [preview login](https://noima-git-codex-greek-english-i18n-xristoslymper-3481.vercel.app/login) was also checked interactively: Greek initial UI, English selected through the actual selector, English retained after refresh and after the updated deployment. No clinical account was opened during this preview smoke check.

## Acceptance checks

The real browser suite uses **1440×1000 desktop** and **390×844 mobile** viewports, a deliberately English browser locale, synthetic patients/users and real Next.js handlers plus disposable Supabase Auth/PostgREST/RPCs on the GitHub runner. It refuses remote database URLs, blocks unrelated browser requests and disables external AI.

| Requirement | Automated evidence |
| --- | --- |
| Greek default | Login remains Greek despite the browser's en-US locale; resolution unit tests |
| Select English | Actual login and Profile → Settings language selects |
| Refresh persistence | Anonymous cookie and authenticated account refresh |
| Logout/login persistence | Actual logout/login routes, then page reload |
| Unsaved clinical text | Actual save request held before the API; identical editor DOM marker and exact text after el → en → el |
| Patient/visit context | Exact URL/session ID retained during every held-save switch |
| Calendar times | Athens/DST unit assertions plus actual appointment/payment/follow-up booking flows |
| Clinical invariance | Deep equality of session, section, risk and patient rows/versions while the save is held |
| Validation in both languages | Actual dictionaries and system-message adapter; required section and MSE count assertions |
| Translation completeness | Dictionary/schema/ICU/source audit in CI |
| No visible raw keys | Browser assertions on the actual visit UI |
| No mixed controls | Greek-script assertion on English visit headings, labels and buttons, excluding language names/brand |
| Recipient locale | Independent public form explicitly Greek under an English clinician; English/Greek switch and reload preserve the entered answer |
| Desktop/mobile | Initial assessment, compact follow-up and detailed follow-up at both viewport sizes; overflow checks |
| Accessibility | Localized roles/names used as browser locators; labelled native language select and live status |
| Multi-user isolation | Two actual authenticated users, independent metadata, rejected forged-user, cross-origin and unsupported-locale requests |

The application suite additionally finalizes a follow-up entirely in the English UI and verifies `completed` in the database. Existing Greek finalization/payment/booking checks remain enabled. No original test assertion was removed to accommodate localization; source-based Greek layout assertions resolve dictionary values, and isolated component/route harnesses use the real next-intl translator.

## Screenshots

The final [workflow artifact](https://github.com/xristoslymper-svg/Noima/actions/runs/38796746566/artifacts/12001909567) was downloaded and its SHA-256 verified. Its 28 screenshots and [machine-readable result](i18n-evidence/report.json) are retained in this repository because the GitHub artifact expires. [Provenance](i18n-evidence/provenance.json) records the full tested commit, workflow, artifact and checksum. These are synthetic records only. Any Greek note inside an English editor is intentional evidence that clinical content is unchanged.

| Flow | Viewport | Greek | English |
| --- | --- | --- | --- |
| Login | Desktop | [Greek](i18n-evidence/desktop-login-el.png) | [English](i18n-evidence/desktop-login-en.png) |
| Login | Mobile | [Greek](i18n-evidence/mobile-login-el.png) | [English](i18n-evidence/mobile-login-en.png) |
| Initial assessment, unsaved draft | Desktop | [Greek](i18n-evidence/desktop-initial-el.png) | [English](i18n-evidence/desktop-initial-en.png) |
| Initial assessment, unsaved draft | Mobile | [Greek](i18n-evidence/mobile-initial-el.png) | [English](i18n-evidence/mobile-initial-en.png) |
| Compact follow-up | Desktop | [Greek](i18n-evidence/desktop-followup-compact-el.png) | [English](i18n-evidence/desktop-followup-compact-en.png) |
| Compact follow-up | Mobile | [Greek](i18n-evidence/mobile-followup-compact-el.png) | [English](i18n-evidence/mobile-followup-compact-en.png) |
| Detailed follow-up | Desktop | [Greek](i18n-evidence/desktop-followup-detailed-el.png) | [English](i18n-evidence/desktop-followup-detailed-en.png) |
| Detailed follow-up | Mobile | [Greek](i18n-evidence/mobile-followup-detailed-el.png) | [English](i18n-evidence/mobile-followup-detailed-en.png) |
| Independent recipient form | Desktop | [Greek](i18n-evidence/desktop-recipient-el.png) | [English](i18n-evidence/desktop-recipient-en.png) |
| Independent recipient form | Mobile | [Greek](i18n-evidence/mobile-recipient-el.png) | [English](i18n-evidence/mobile-recipient-en.png) |

Completed English follow-ups: [desktop](i18n-evidence/desktop-followup-finalized-en.png), [mobile](i18n-evidence/mobile-followup-finalized-en.png). The remaining six screenshots preserve the existing compact/detailed/completed workflow evidence at both viewport sizes.

## Limits of verification

- The browser checks exercise the critical clinical workflows and recipient form, not every possible account state, device or assistive technology.
- External AI provider calls and real email/SMS delivery are disabled in the isolated suite. Request-scoped language instructions, contracts and deterministic replies are tested without transmitting clinical data to a provider.
- Existing instrument items and recorded/derived historical clinical narratives retain their source language. UI localization is not validation of a new clinical instrument version; see [the coverage and boundaries report](internationalization.md).
- No production deployment, production migration, real-patient data write or main merge occurred. The database schema/RPC signatures are unchanged.

## Bugs found by the new tests

- Visit step labels were still Greek after changing to English; they now use explicit typed semantic keys.
- A translated MSE fieldset key could remount controls; it now uses the unchanged canonical axis key, with a browser DOM-identity assertion.
- A late lightweight shell could hide a persisted payment by replacing complete appointment rows with a partial projection; reconciliation now preserves omitted fields and newer timestamps. Regression tests cover omitted, stale, newer and removed appointments.
- Finalization validation retained the Greek required-section name; section aliases now localize at the UI boundary.
- Singular pending-change counts and already-visible success notices now update correctly with the selected language.

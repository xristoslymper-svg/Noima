# Stable mobile preview URL

- User-facing entry: https://noima-mobile.vercel.app/calendar
- Vercel alias `noima-mobile.vercel.app` → Preview deployment `dpl_5NHG9xKon8Dtp3DakuP7HpwEzvX9`, https://noima-fwu288fnu-xristoslymper-3481.vercel.app
- Same `noima` project and existing Supabase service. No production deploy, schema change, or account/data copy.
- `NEXT_PUBLIC_NOIMA_MOBILE_V2=1` passed only for the Preview build. For authenticated members, login/pilot/forgot-password entry now opens calendar when this flag is active. Default desktop builds retain overview. Password recovery remains `/reset-password`.
- Supabase URL Configuration initially had 16 redirect URLs; the existing preview wildcard did not match the short alias. Google returned to the configured default Site URL. Added only `https://noima-mobile.vercel.app/auth/callback`, bringing the list to 17. Existing Site URL and entries retained.
- Verified real Google OAuth from a fresh alias login, landing on `https://noima-mobile.vercel.app/calendar`, same account/calendar events, mobile bottom navigation visible at 390x844.
- 391 tests pass, including new coverage of mobile/desktop login destinations, anonymous access, membership setup and password recovery. Typecheck and Vercel build/lint pass.
- Screenshot: `test-results/mobile-current-base-20261013/stable-mobile-calendar.png`.

## Navigation follow-up

Added the existing MobileClinicalNav to Overview, patient registry and Library, with correct active states and mobile-only bottom clearance. Calendar and patient workspace retain their existing navigation integration and guarded patient-editor navigation. At 390x844, verified the real stable URL navigation cycle Calendar → Overview → Patients → Library, with one visible bottom nav, correct active links and no page overflow. Library's menu hides the bottom nav and closing it restores the nav. At 1280x800 the bottom nav is hidden. Typecheck, lint, 391 tests and Vercel build pass. Screenshots: `navigation-overview-390.png`, `navigation-patients-390.png`, `navigation-library-390.png` in the same evidence directory. Desktop production remains unchanged.

## Future mobile updates

The latest preview includes the mobile calendar focus redesign. Day view uses the existing interactive time grid; compact controls expose date/filter/refresh on demand. See `mobile-calendar-focus-20261013.md` for verification. 394 tests pass.

Deploy from the current shared code with the mobile build flag, wait for READY, and verify before assigning the stable alias to the new preview:

```text
vercel deploy --target preview --scope team_zAcy3FrAbLeKGXCGOq0DJQ4j --build-env NEXT_PUBLIC_NOIMA_MOBILE_V2=1 --yes
vercel alias set <verified-ready-mobile-preview-url> noima-mobile.vercel.app --scope team_zAcy3FrAbLeKGXCGOq0DJQ4j
```

The alias stays on its assigned deployment until explicitly updated. Shared patient data is live across these deployments; separate UI URLs do not create separate databases. A different hostname needs its own login cookie, but uses the same account.

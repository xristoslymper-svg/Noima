# Approved calendar reference

User supplied a screenshot and then its HTML, requesting this mobile calendar design without the top-left menu button. Applied styling to the existing live calendar, preserving its time-grid positioning, actions, filters, day/week modes and data. The provided static appointment positions and placeholder links were not copied into functional code.

Calendar-only CSS under the existing opted-in mobile root and <=760px boundary: neutral #FAF8F5 shell, white time canvas, #F3F6F3 header, sand #EAE5DB segmented control, #224837 active states, rounded controls and cards. The redundant menu button is hidden only on the mobile calendar; account link and bottom navigation remain. Bottom navigation selection uses an icon pill as in the supplied HTML. Existing semantic event status colors are preserved. No external Tailwind runtime or viewport zoom restriction was introduced.

Targeted mobile calendar tests pass (3). Final deployment and visual verification are recorded in the stable URL document.

Final READY preview dpl_T2ibabUn3nM2XbDEp7fCEomocw5B assigned to the stable mobile alias. Vercel build/lint/typecheck pass. Live QA at 390x844 confirms hidden menu, white time canvas, bottom nav present and no horizontal page overflow. Day/week switch works; synthetic appointment opens the original folder/questionnaire/appointment/payment actions, closed without changes. At 1440x900 the original desktop controls/day agenda render and no mobile grid is present. Screenshot: test-results/mobile-calendar-focus-20261013/approved-reference-calendar-day-390.png. Static reference was adapted to real screen height and live time/data rather than hardcoding its sample timeline.

## Remove duplicated chrome

User requested removal of the CL/DEMO top row and the repeated day header. Mobile calendar topbar is hidden and its 64px returned to the calendar content height. Only the single-day grid header/corner are hidden; its first grid row collapses to zero. Week column headers remain. Existing click/drop minute calculations are retained. All changes are within the existing mobile opt-in root and viewport boundary. Targeted calendar tests (3) pass.

READY preview dpl_7kv3e9LWZdPj2UdKRTMK4JEzQCjs assigned to stable alias. Remote build/lint/typecheck passed. At 390x844: topbar and day header display none; calendar card moves from y331.44 to y267.44, height grows from435.99 to499.99, while removing86.79px of internal duplicate header. No horizontal overflow. Synthetic appointment detail actions verified, closed without changes. Week retains seven visible headers/columns. At1440x900 topbar remains flex, original controls present and mobile grid absent. Evidence: test-results/mobile-calendar-focus-20261013/compact-calendar-day-390.png.

## Appointment button and account placement

User requested New Appointment between previous/next arrows instead of the date title, and the existing CL account control in the heading instead of microphone and New. Mobile layout reuses PilotProfile and the same appointment editor callback. Date/filter/refresh menu remains accessible through its compact calendar icon and by clicking the selected day; no date/filter functionality removed. Desktop retains its original profile, microphone and appointment button. React component review: hooks remain unconditional, handlers reuse existing state, native details and labelled controls retained, no data-fetching changes.

Typecheck, 3 targeted calendar tests and Vercel build/lint pass. READY dpl_5NHG9xKon8Dtp3DakuP7HpwEzvX9 now backs the stable alias. Live QA at390x844: centered action opens original New Appointment form (closed without saving), selected day reveals date input, CL opens existing account page with logout/account functions; navigated back without submitting anything. At1440x900 original voice, New Appointment and control bar visible. Screenshot: test-results/mobile-calendar-focus-20261013/calendar-new-button-profile-390.png.

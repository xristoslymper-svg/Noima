import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const source=readFileSync('app/calendar/page.tsx','utf8');
test('empty day retains the existing clickable appointment grid instead of a dead-end list',()=>{
 assert.doesNotMatch(source,/dayEvents\.length\s*\?/);
 assert.match(source,/view==='day'\?days\.filter\(day=>day.key===focusDate\):days/);
 assert.match(source,/className="calendar-week-card interactive-week"/);
 assert.match(source,/onClick=\{click => \{[\s\S]*setAppointmentEditor\(/);
 assert.match(source,/calendar-single-day-grid\{grid-template-columns:64px minmax\(0,1fr\)!important\}/);
});
test('calendar adds one optional Google entry and does not start synchronization',()=>{
 assert.equal((source.match(/<CalendarConnectionMenu\/>/g)||[]).length,1);
 assert.doesNotMatch(source,/synchronizeCalendar|calendarAuthorization|googleapis\.com/);
 assert.match(source,/className="add-appointment calendar-toolbar-add"/);
 assert.match(source,/expected_updated_at/);
});

test('provider disclosure keeps Google explicit and Outlook unavailable',()=>{
 const menu=readFileSync('components/calendar/CalendarConnectionMenu.tsx','utf8');
 assert.match(menu,/useState\(false\)/);
 assert.match(menu,/aria-expanded=\{open\}/);
 assert.match(menu,/Google Calendar/);assert.match(menu,/Outlook \/ Hotmail/);
 assert.match(menu,/type="button" disabled/);
 assert.match(menu,/Escape/);assert.match(menu,/removeEventListener/);
 assert.doesNotMatch(menu,/fetch\(|calendarAuthorization|googleapis/);
});

test('calendar reuses existing patient search without duplicating appointment controls',()=>{
 assert.match(source,/<OverviewShortcuts searchOnly\/>/);
 const shared=readFileSync('components/overview/RecordAssistant.tsx','utf8');
 assert.match(shared,/searchOnly=false/);assert.match(shared,/!searchOnly&&/);
 assert.match(shared,/\/api\/records\/search\?q=/);assert.match(shared,/patients\/demo\//);
 assert.match(shared,/250/);assert.match(shared,/AbortController/);
});

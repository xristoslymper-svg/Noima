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
 assert.equal((source.match(/Σύνδεση Google Calendar/g)||[]).length,1);
 assert.match(source,/href="\/calendar\/google-preview"/);
 assert.doesNotMatch(source,/synchronizeCalendar|calendarAuthorization|googleapis\.com/);
 assert.match(source,/className="add-appointment calendar-toolbar-add"/);
 assert.match(source,/expected_updated_at/);
});

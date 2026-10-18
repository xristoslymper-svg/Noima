import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';
const calendar=readFileSync('app/calendar/page.tsx','utf8'),overview=readFileSync('app/page.tsx','utf8');
test('calendar ports the approved manual toolbar without voice activation',()=>{
 assert.doesNotMatch(calendar,/CalendarVoiceCommand|setVoice|voice-calendar-button/);
 assert.match(calendar,/className="calendar-date-tools"/);
 assert.match(calendar,/className="add-appointment calendar-toolbar-add"/);
 assert.doesNotMatch(calendar,/<span className="calendar-day-count"/);
 assert.match(calendar,/MobileCalendarControls[\s\S]*onNew=\{\(\)=>setAppointmentEditor/);
 assert.doesNotMatch(overview,/calendar\?voice=1/);
 assert.match(calendar,/expected_updated_at/);
});

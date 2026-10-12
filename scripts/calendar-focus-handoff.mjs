import {readFileSync,writeFileSync} from 'node:fs';
import assert from 'node:assert/strict';
const path='app/calendar/page.tsx',source=readFileSync(path,'utf8');
const before=`          onSaved={async (event) => {
            setAppointmentEditor(null);
            await refreshEvents();
            if (event?.scheduled_start) setFocusDate(dateKey(new Date(event.scheduled_start)));
          }}`;
const after=`          onSaved={async (event) => {
            setAppointmentEditor(null);
            if (event?.scheduled_start) {
              setSavedAppointment(event);
              setFocusDate(dateKey(new Date(event.scheduled_start)));
            }
            await refreshEvents();
          }}`;
assert.equal(source.split(before).length-1,1,'reviewed calendar callback must match exactly');
writeFileSync(path,source.replace(before,after));

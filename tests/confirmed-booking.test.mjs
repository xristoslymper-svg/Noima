import {test} from 'node:test';
import assert from 'node:assert/strict';
import {confirmedBooking} from '../lib/calendar/confirmed-booking.ts';
const start='2026-10-25T10:00:00Z',end='2026-10-25T10:50:00Z';
const event={id:'10000000-0000-4000-8000-000000000001',patient_id:'p',status:'scheduled',appointment_type:'follow_up',scheduled_start:start,scheduled_end:end};
test('booking acknowledgement verifies patient, event and exact time interval',()=>{
 assert.equal(confirmedBooking(event,'p',start,end),event);
 for(const patch of [{id:''},{patient_id:'other'},{status:'cancelled'},{scheduled_start:end},{scheduled_end:start},{appointment_type:'initial_assessment'}])assert.throws(()=>confirmedBooking({...event,...patch},'p',start,end));
 for(const invalid of [null,{},'success'])assert.throws(()=>confirmedBooking(invalid,'p',start,end));
});

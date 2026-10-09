import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readCalendarPosition, nextWeekDate, upcomingAppointments, applyPaymentUpdate} from '../lib/calendar/appointment-context.ts';

test('calendar return state is valid, workspace scoped and rejects corrupt history',()=>{
  const saved={workspace:'a',date:'2026-10-12',view:'week',filter:'scheduled',top:535,left:210,pageTop:80};
  assert.deepEqual(readCalendarPosition(saved,'a'),saved);
  for(const value of [null,{}, {...saved,workspace:'b'},{...saved,date:'2026-02-31'},{...saved,top:-1},{...saved,filter:'invalid'}]) assert.equal(readCalendarPosition(value,'a'),null);
  assert.equal(readCalendarPosition(saved,''),null);
});
test('next appointment advances calendar days across month, year and DST boundaries',()=>{
  assert.equal(nextWeekDate('2026-10-23'),'2026-10-30');
  assert.equal(nextWeekDate('2026-12-28'),'2027-01-04');
  assert.equal(nextWeekDate('2028-02-23'),'2028-03-01');
});
test('upcoming appointments are patient scoped, sorted, future scheduled only and exclude source',()=>{
  const row={patient_id:'p',status:'scheduled',scheduled_start:'2026-10-23T15:00:00Z'};
  const events=[{...row,id:'later',scheduled_start:'2026-10-30T16:00:00Z'},{...row,id:'first'}, {...row,id:'source'}, {...row,id:'cancelled',status:'cancelled'}, {...row,id:'done',status:'completed'}, {...row,id:'other',patient_id:'other'}, {...row,id:'past',scheduled_start:'2026-10-01T10:00:00Z'}];
  assert.deepEqual(upcomingAppointments(events,'p',Date.parse('2026-10-09'),'source').map(e=>e.id),['first','later']);
  assert.deepEqual(upcomingAppointments(events,'',0),[]);
  assert.equal(events[0].id,'later');
});
test('payment reset preserves SMS projection and every unrelated appointment field',()=>{
  const event={id:'e',payment_status:'paid',updated_at:'old',sms_reminder:{status:'queued',due_at:'later'},readiness_label:'Ready',scheduled_start:'same'};
  const result=applyPaymentUpdate(event,{payment_status:'unknown',updated_at:'new',sms_reminder:null});
  assert.deepEqual(result,{...event,payment_status:'unknown',updated_at:'new'});
  assert.equal(event.payment_status,'paid');
});

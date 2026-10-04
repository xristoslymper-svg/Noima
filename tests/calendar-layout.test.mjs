import {test} from 'node:test';
import assert from 'node:assert/strict';
import {calendarWindow,calendarSegment,calendarLanes} from '../lib/calendar/layout.ts';
import {clinicLocalToIso} from '../lib/clinic-time.ts';
const event=(id,start,end)=>({id,scheduled_start:start,scheduled_end:end});

test('calendar keeps early/late-only days visible and never produces a negative window',()=>{
 const early=event('early','2026-10-05T04:00Z','2026-10-05T04:50Z');
 const late=event('late','2026-10-05T19:30Z','2026-10-05T20:20Z');
 for(const events of [[early],[late],[early,late]]){
  const window=calendarWindow(events,['2026-10-05']);assert.ok(window.end>window.start);
  for(const item of events){const part=calendarSegment(item,'2026-10-05');assert.ok(part.start>=window.start&&part.end<=window.end)}
 }
});
test('overnight events split at midnight and exclusive end does not create a phantom appointment',()=>{
 const item=event('night','2026-10-05T20:30Z','2026-10-05T22:30Z');
 assert.deepEqual(calendarSegment(item,'2026-10-05'),{start:1410,end:1440});
 assert.deepEqual(calendarSegment(item,'2026-10-06'),{start:0,end:90});
 assert.equal(calendarSegment(event('midnight','2026-10-05T20:00Z','2026-10-05T21:00Z'),'2026-10-06'),null);
});
test('history overlaps use separate lanes, adjacent appointments reuse a lane',()=>{
 const a=event('a','2026-10-05T09:00Z','2026-10-05T09:50Z'),b=event('b','2026-10-05T09:15Z','2026-10-05T10:00Z'),c=event('c','2026-10-05T10:00Z','2026-10-05T10:50Z');
 const lanes=calendarLanes([a,b,c],'2026-10-05');assert.notEqual(lanes.get('a').lane,lanes.get('b').lane);assert.equal(lanes.get('a').total,2);assert.equal(lanes.get('c').total,1);
});
test('clinic time round trips across DST and refuses impossible/ambiguous wall times',()=>{
 assert.equal(clinicLocalToIso('2026-10-19','09:00'),'2026-10-19T06:00:00.000Z');
 assert.equal(clinicLocalToIso('2026-10-26','09:00'),'2026-10-26T07:00:00.000Z');
 assert.throws(()=>clinicLocalToIso('2026-03-29','03:30'));
 assert.throws(()=>clinicLocalToIso('2026-10-25','03:30'));
 assert.throws(()=>clinicLocalToIso('2026-02-30','09:00'));
});

import {test} from 'node:test';
import assert from 'node:assert/strict';
import {calendarWindow,calendarSegment,calendarLanes,cancelledHistoryPlacement} from '../lib/calendar/layout.ts';
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


test('cancelled history uses the 25/75 split only for the exact replacement slot',()=>{
 const start='2026-10-05T09:00Z',end='2026-10-05T09:50Z';
 const cancelled={...event('cancelled',start,end),status:'cancelled'};
 const active={...event('active',start,end),status:'scheduled'};
 assert.deepEqual(cancelledHistoryPlacement(active,[cancelled,active]),{paired:true,leftPercent:25,widthPercent:75});
 assert.deepEqual(cancelledHistoryPlacement(cancelled,[cancelled,active]),{paired:true,leftPercent:0,widthPercent:25});
 const equivalent={...event('equivalent','2026-10-05T11:00+02:00','2026-10-05T11:50+02:00'),status:'scheduled'};
 assert.deepEqual(cancelledHistoryPlacement(equivalent,[cancelled,equivalent]),{paired:true,leftPercent:25,widthPercent:75});
 const partial={...event('partial','2026-10-05T09:20Z','2026-10-05T10:10Z'),status:'scheduled'};
 assert.equal(cancelledHistoryPlacement(partial,[cancelled,partial]),null);
 assert.equal(cancelledHistoryPlacement(cancelled,[cancelled,partial]),null);
});

test('multiple cancelled histories remain individually clickable within the history quarter',()=>{
 const start='2026-10-05T09:00Z',end='2026-10-05T09:50Z';
 const c1={...event('a',start,end),status:'cancelled'},c2={...event('b',start,end),status:'cancelled'},active={...event('z',start,end),status:'scheduled'};
 assert.deepEqual(cancelledHistoryPlacement(c1,[c1,c2,active]),{paired:true,leftPercent:0,widthPercent:12.5});
 assert.deepEqual(cancelledHistoryPlacement(c2,[c1,c2,active]),{paired:true,leftPercent:12.5,widthPercent:12.5});
 assert.deepEqual(cancelledHistoryPlacement(active,[c1,c2,active]),{paired:true,leftPercent:25,widthPercent:75});
});

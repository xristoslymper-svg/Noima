import {test} from 'node:test';
import assert from 'node:assert/strict';
import {agendaNeedsScroll,sortedAgenda} from '../lib/overview/agenda-layout.ts';

test('daily agenda stays unscrolled with 0–4 visits and uses bounded scrolling for 5–12+',()=>{
 for(const n of [0,1,2,3,4])assert.equal(agendaNeedsScroll(n),false);
 for(const n of [5,7,8,12,17])assert.equal(agendaNeedsScroll(n),true);
});

test('sorting is stable and never mutates source appointment array or times',()=>{
 const events=[{id:'b',scheduled_start:'2026-10-11T12:00:00Z'},{id:'z',scheduled_start:'2026-10-11T09:00:00Z'},{id:'a',scheduled_start:'2026-10-11T12:00:00Z'}];
 const before=JSON.stringify(events);
 const sorted=sortedAgenda(events);
 assert.deepEqual(sorted.map(e=>e.id),['z','a','b']);
 assert.equal(JSON.stringify(events),before);
 assert.deepEqual(sorted.map(e=>e.scheduled_start),[events[1].scheduled_start,events[2].scheduled_start,events[0].scheduled_start]);
 assert.deepEqual(sortedAgenda([]),[]);
});

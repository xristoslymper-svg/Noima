import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const source=readFileSync('app/calendar/page.tsx','utf8');
// Execute the real JSX callback body, not a replacement implementation. No JSX
// rendering, clock, network, real appointment or patient data is involved.
const matches=[...source.matchAll(/onSaved=\{async \(event\) => \{([\s\S]*?)\n          \}\}/g)];
assert.equal(matches.length,1,'exactly one appointment-editor save callback');
const AsyncFunction=Object.getPrototypeOf(async function(){}).constructor;
const invoke=new AsyncFunction('event','setAppointmentEditor','setSavedAppointment','setFocusDate','dateKey','refreshEvents',matches[0][1]);
const event={id:'synthetic-appointment',scheduled_start:'2026-10-15T16:30:00Z'};
const dateKey=date=>new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Athens',year:'numeric',month:'2-digit',day:'2-digit'}).format(date);

test('saved appointment focus is armed before a delayed reload can center the calendar elsewhere',async()=>{
 const calls=[];let resolve;const pending=new Promise(done=>resolve=done);
 const task=invoke(event,value=>calls.push(['editor',value]),value=>calls.push(['target',value]),value=>calls.push(['day',value]),dateKey,()=>{calls.push(['reload']);return pending});
 assert.deepEqual(calls,[['editor',null],['target',event],['day','2026-10-15'],['reload']],'saved target must be armed before reload');
 resolve();await task;assert.equal(calls.length,4,'reload must not reset the requested day or time');
});

test('failed calendar refresh retains the saved target and never recreates the appointment',async()=>{
 const calls=[];
 await assert.rejects(invoke(event,()=>{},value=>calls.push(['target',value]),value=>calls.push(['day',value]),dateKey,async()=>{throw Error('synthetic offline')}),/synthetic offline/);
 assert.deepEqual(calls,[['target',event],['day','2026-10-15']]);
});

test('no appointment payload causes no invented target or date change',async()=>{
 let targets=0,dates=0,reloads=0;
 await invoke(undefined,()=>{},()=>targets++,()=>dates++,dateKey,async()=>reloads++);
 assert.equal(targets,0);assert.equal(dates,0);assert.equal(reloads,1);
});

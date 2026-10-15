import assert from 'node:assert/strict';
import {test} from 'node:test';
import {selectUpcomingAppointments} from '../lib/calendar/upcoming.ts';
import {upcomingAppointments as calendarUpcoming} from '../lib/calendar/appointment-context.ts';
import {upcomingAppointments as recordUpcoming} from '../lib/clinical/patient-record.ts';
import {validCalendarDeparture} from '../lib/calendar/return-context.ts';
import {followupFinalizationVersion} from '../lib/clinical/followup-finalization.ts';
import {emptyContinuity} from '../lib/clinical/continuity.ts';
const now=Date.parse('2026-10-15T10:15:00Z');
const current={id:'current',patient_id:'p',session_id:'s',status:'scheduled',scheduled_start:'2026-10-15T10:00:00Z',scheduled_end:'2026-10-15T10:50:00Z'};
const next={...current,id:'next',session_id:null,scheduled_start:'2026-10-29T10:00:00Z',scheduled_end:'2026-10-29T10:50:00Z'};
test('next visit excludes the currently running appointment',()=>assert.deepEqual(selectUpcomingAppointments([current,next],now,{excludeSessionId:'s'}).map(a=>a.id),['next']));
test('early-opened future appointment is excluded by session identity',()=>assert.deepEqual(selectUpcomingAppointments([current,next],Date.parse('2026-10-15T09:00:00Z'),{excludeSessionId:'s'}).map(a=>a.id),['next']));
test('explicit appointment exclusion works even before a session is linked',()=>assert.deepEqual(selectUpcomingAppointments([{...current,session_id:null},next],now-7200000,{excludeAppointmentId:'current'}).map(a=>a.id),['next']));
test('calendar and record use the same definition of upcoming',()=>assert.deepEqual(calendarUpcoming([current,next],'p',now,'current').map(a=>a.id),recordUpcoming({appointments:[current,next]},new Date(now),{excludeAppointmentId:'current'}).map(a=>a.id)));
test('cancelled, completed and invalid dates never become the next appointment',()=>assert.deepEqual(selectUpcomingAppointments([{...next,id:'c',status:'cancelled'},{...next,id:'d',status:'completed'},{...next,id:'invalid',scheduled_start:'no-date'}],now),[]));
test('equal times have deterministic ordering and input is not mutated',()=>{const rows=[{...next,id:'b'},{...next,id:'a'}];assert.deepEqual(selectUpcomingAppointments(rows,now).map(a=>a.id),['a','b']);assert.equal(rows[0].id,'b')});
const position={workspace:'a',date:'2026-10-29',view:'week',filter:'scheduled',top:725,left:0,pageTop:24};

test('same-day future visits with another linked session remain eligible across Athens DST',()=>{
 const rows=[{...next,id:'first',session_id:'other',scheduled_start:'2026-10-25T03:30:00+03:00'},{...next,id:'second',session_id:'future',scheduled_start:'2026-10-25T03:30:00+02:00'}];
 assert.deepEqual(selectUpcomingAppointments(rows,Date.parse('2026-10-25T00:45:00Z'),{excludeSessionId:'s'}).map(a=>a.id),['second']);
 const spring=[{...next,id:'before',scheduled_start:'2026-03-29T02:30:00+02:00'},{...next,id:'after',scheduled_start:'2026-03-29T04:30:00+03:00'}];
 assert.deepEqual(selectUpcomingAppointments(spring,Date.parse('2026-03-29T01:00:00Z')).map(a=>a.id),['after']);
});
test('a return position is scoped to the correct workspace',()=>{assert.deepEqual(validCalendarDeparture({at:now,explicit:true,position},'a',false,now),position);assert.equal(validCalendarDeparture({at:now,explicit:true,position},'b',false,now),null)});
test('stale and future departure tickets fail closed',()=>{assert.equal(validCalendarDeparture({at:now-60001,explicit:true,position},'a',false,now),null);assert.equal(validCalendarDeparture({at:now+1,explicit:true,position},'a',false,now),null)});
test('unrelated direct visits do not inherit a calendar position',()=>assert.equal(validCalendarDeparture({at:now,position},'a',false,now),null));
test('a hard navigation from the calendar retains position',()=>assert.deepEqual(validCalendarDeparture({at:now,position},'a',true,now),position));
function followup(){return {patient:{id:'p'},sessions:[{id:'s',patient_id:'p',status:'draft',session_type:'follow_up',started_at:'2026-10-15T10:00:00Z',closure_version:4,closure_draft:{...emptyContinuity,clinical_state_summary:'QA state',treatment_decision:'QA plan',next_review_focus:'QA review',adherence:'QA adherence'}}],sections:[{session_id:'s',section_key:'mse',content:'QA MSE'}],risks:[{session_id:'s',suicidal_ideation:'negative',intent:'not_assessed',plan:'not_assessed',self_harm:'not_assessed',attempt_history:'not_assessed'}],appointments:[],corrections:[],addenda:[]}}
test('both follow-up views can use the exact saved closure version',()=>assert.equal(followupFinalizationVersion(followup(),'s'),4));
test('missing clinical fields block finalization',()=>{const b=followup();b.sessions[0].closure_draft.treatment_decision='';assert.throws(()=>followupFinalizationVersion(b,'s'),/Απόφαση/)});
test('risk assessment cannot be bypassed',()=>{const b=followup();b.risks=[];assert.throws(()=>followupFinalizationVersion(b,'s'),/κινδύνου/)});
test('positive risk still requires the existing extra checks',()=>{const b=followup();b.risks[0].suicidal_ideation='positive';assert.throws(()=>followupFinalizationVersion(b,'s'),/θετικό ιδεασμό/)});
test('legacy contradictory notes are never silently overwritten',()=>{const b=followup();b.sections.push({session_id:'s',section_key:'interview',content:'different'});assert.throws(()=>followupFinalizationVersion(b,'s'),/παλαιότερες/)});
test('invalid version, wrong patient and completed session are rejected',()=>{for(const change of [{closure_version:NaN},{patient_id:'other'},{status:'completed'}]){const b=followup();Object.assign(b.sessions[0],change);assert.throws(()=>followupFinalizationVersion(b,'s'))}});

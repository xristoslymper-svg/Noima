import test from 'node:test';
import assert from 'node:assert/strict';
import {startMeetingVisit,currentMeetings,athensDay} from '../lib/teleconsultations/meeting-start.ts';
const patient='20000000-0000-4000-8000-000000000001',other='20000000-0000-4000-8000-000000000002',sid='40000000-0000-4000-8000-000000000001',second='40000000-0000-4000-8000-000000000002',appointment='50000000-0000-4000-8000-000000000001';
const visit={id:sid,patient_id:patient,status:'draft',session_type:'follow_up'};
test('new meeting uses the existing canonical start and validates the returned patient and visit',async()=>{
 const calls=[];assert.equal(await startMeetingVisit({patientId:patient,visits:[]},async body=>{calls.push(body);return {session:visit}}),sid);
 assert.deepEqual(calls,[{action:'start_session',patient_id:patient,session_type:'follow_up'}]);
 for(const patch of [{patient_id:other},{status:'completed'},{session_type:'initial_assessment'},{id:'invalid'}]){
  await assert.rejects(startMeetingVisit({patientId:patient,visits:[]},async()=>({session:{...visit,...patch}})),/επιβεβαιώθηκε/);
 }
});
test('reopening a meeting reuses its exact draft and never creates another visit',async()=>{
 const fail=async()=>{assert.fail('must reuse visit')};
 assert.equal(await startMeetingVisit({patientId:patient,visits:[visit]},fail),sid);
 assert.equal(await startMeetingVisit({patientId:patient,visits:[visit,{...visit,id:second}],sessionId:second},fail),second);
 await assert.rejects(startMeetingVisit({patientId:other,visits:[visit],sessionId:sid},fail),/διαθέσιμη/);
});
test('ambiguous open visits require an explicit choice; initial assessment is never silently reused',async()=>{
 const fail=async()=>{assert.fail('no write before choice')};
 await assert.rejects(startMeetingVisit({patientId:patient,visits:[visit,{...visit,id:second}]},fail),/Επιλέξτε/);
 await assert.rejects(startMeetingVisit({patientId:patient,visits:[{...visit,session_type:'initial_assessment'}]},fail),/αρχική/);
});
test('scheduled meeting uses appointment start RPC so notes and calendar share the same visit',async()=>{
 const calls=[];assert.equal(await startMeetingVisit({patientId:patient,visits:[],appointmentId:appointment},async body=>{calls.push(body);return {session:visit}}),sid);
 assert.deepEqual(calls,[{action:'start_session',appointment_id:appointment}]);
});
test('500 completed historic visits do not populate the meeting entry screen',()=>{
 const history=Array.from({length:500},(_,i)=>({completed:true,record:{sessionId:'old-'+i,appointment:{status:'completed',scheduled_start:'2025-01-01T12:00:00Z'}}}));
 const current={completed:false,record:{sessionId:sid,appointment:{status:'scheduled',scheduled_start:'2026-10-19T12:00:00Z'}}};
 assert.deepEqual(currentMeetings([...history,current,current],Date.parse('2026-10-19T09:00:00Z')),[current]);
});
test('today uses Athens midnight, excludes cancelled/future entries and retains explicit active drafts',()=>{
 const row=(id,date,status='scheduled',active=false)=>({completed:false,active,record:{sessionId:id,appointment:{scheduled_start:date,status}}});
 const now=Date.parse('2026-10-18T22:00:00Z');assert.equal(athensDay(now),'2026-10-19');
 const active=row('active','2026-10-01T12:00:00Z','scheduled',true),today=row('today','2026-10-18T21:30:00Z');
 assert.deepEqual(currentMeetings([row('yesterday','2026-10-18T18:00:00Z'),row('tomorrow','2026-10-20T10:00:00Z'),row('cancelled','2026-10-19T10:00:00Z','cancelled'),today,active],now),[active,today]);
});

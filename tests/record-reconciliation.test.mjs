import {test} from 'node:test';
import assert from 'node:assert/strict';
import {assertRecordIdentity,reconcileRecord,reconcileSession} from '../lib/clinical/record-reconciliation.ts';
import {finalizeAndVerify,confirmedCompletion} from '../lib/clinical/finalization.ts';
import {patientRecord} from '../lib/clinical/patient-record.ts';
const patient={id:'patient-a',tester_id:'tenant-a',updated_at:'2026-10-12T10:00:00Z'};
const draft={id:'visit-a',patient_id:patient.id,tester_id:patient.tester_id,status:'draft',version:2,closure_version:1,closure_draft:{clinical_state_summary:'CURRENT'},started_at:'2026-10-12T10:00:00Z',completed_at:null};
const completed={...draft,status:'completed',version:3,completed_at:'2026-10-12T11:00:00Z'};
const bundle=(sessions=[draft])=>({patient,sessions,sections:[],risks:[],proposals:[],addenda:[],corrections:[],assessments:[],medications:[],medicationEvents:[],medicationSideEffects:[],medicationRevisions:[],appointments:[],history:null});
test('transport rejects another patient, another tenant and a missing selected visit',()=>{
 assertRecordIdentity(bundle(),patient.id,draft.id);
 for(const value of [null,{}, {...bundle(),patient:{...patient,id:'patient-b'}},{...bundle(),sections:[{id:'s',patient_id:'patient-b'}]},{...bundle(),sessions:[{...draft,tester_id:'tenant-b'}]},{...bundle(),sessions:[]}])assert.throws(()=>assertRecordIdentity(value,patient.id,draft.id));
});
test('full and shell reloads cannot reopen a confirmed completed visit',()=>{
 for(const mode of ['full','shell','visit']){
  const result=reconcileRecord(bundle([completed]),bundle(),mode);
  assert.equal(result.sessions[0].status,'completed');assert.equal(result.sessions[0].version,3);
 }
});
test('a late lightweight shell preserves confirmed payment fields omitted from its projection',()=>{
 const paid={id:'appointment-a',patient_id:patient.id,session_id:draft.id,status:'completed',payment_status:'paid',updated_at:'2026-10-12T12:00:00Z'};
 const previous={...bundle([completed]),appointments:[paid]};
 const shell={...bundle([completed]),appointments:[{id:paid.id,session_id:draft.id,status:'completed'}]};
 assert.equal(reconcileRecord(previous,shell,'shell').appointments[0].payment_status,'paid');
 assert.equal(reconcileRecord(previous,{...shell,appointments:[{...paid,payment_status:'pending',updated_at:'2026-10-12T11:00:00Z'}]},'shell').appointments[0].payment_status,'paid');
 assert.equal(reconcileRecord(previous,{...shell,appointments:[{...paid,payment_status:'not_applicable',updated_at:'2026-10-12T13:00:00Z'}]},'shell').appointments[0].payment_status,'not_applicable');
 assert.equal(reconcileRecord(previous,{...shell,appointments:[]},'shell').appointments.length,0);
});
test('closure version is independent and an empty newer field remains an intentional clear',()=>{
 const current={...draft,version:4,closure_version:7,closure_draft:{clinical_state_summary:''}};
 const late={...draft,version:5,closure_version:6,closure_draft:{clinical_state_summary:'STALE'}};
 const result=reconcileSession(current,late);
 assert.equal(result.version,5);assert.equal(result.closure_version,7);assert.equal(result.closure_draft.clinical_state_summary,'');
});
test('merging a visit never copies older findings into the current session',()=>{
 const old={id:'old-note',patient_id:patient.id,session_id:'visit-old',content:'OLD FINDING',version:1};
 const now={id:'new-note',patient_id:patient.id,session_id:draft.id,content:'',version:2};
 const current={...bundle(),sections:[old,now]};
 const response={...bundle(),sections:[{...now,content:'STALE',version:1}]};
 const merged=reconcileRecord(current,response,'visit');
 assert.deepEqual(merged.sections,[old,now]);assert.equal(merged.sections.find(row=>row.session_id===draft.id).content,'');
 assert.throws(()=>reconcileRecord(current,{...response,patient:{...patient,id:'other'}}));
});
test('finalization publishes success only after mutation, authoritative read and folder refresh',async()=>{
 let reads=0,writes=0;const order=[];
 const result=await finalizeAndVerify({sessionId:draft.id,patientId:patient.id,read:async()=>{order.push('read');return ++reads===1?bundle():bundle([completed])},write:async body=>{writes++;assert.equal(body.expected_version,2);order.push('write');return {session:completed}},onCommitted:()=>order.push('committed'),onVerified:async()=>order.push('verified')});
 assert.equal(result.status,'completed');assert.equal(writes,1);assert.deepEqual(order,['read','write','committed','read','verified']);
});
test('malformed success never notifies; refresh failure remains committed and never retries RPC',async()=>{
 for(const response of [{session:draft},{session:{...completed,patient_id:'other'}},{}]){
  let notifications=0;await assert.rejects(finalizeAndVerify({sessionId:draft.id,patientId:patient.id,read:async()=>bundle(),write:async()=>response,onCommitted:()=>notifications++,onVerified:()=>notifications++}));assert.equal(notifications,0);
 }
 let reads=0,writes=0,commits=0,success=0;
 await assert.rejects(finalizeAndVerify({sessionId:draft.id,patientId:patient.id,read:async()=>{if(++reads>1)throw new Error('offline');return bundle()},write:async()=>{writes++;return {session:completed}},onCommitted:()=>commits++,onVerified:()=>success++}),error=>error.committed===true);
 assert.equal(writes,1);assert.equal(commits,1);assert.equal(success,0);
});
test('verification rejects a stale post-commit draft; retrying an already completed session is read-only',async()=>{
 let writes=0,success=0;
 await assert.rejects(finalizeAndVerify({sessionId:draft.id,patientId:patient.id,read:async()=>bundle(),write:async()=>{writes++;return{session:completed}},onCommitted:()=>{},onVerified:()=>success++}),error=>error.committed===true);
 assert.equal(success,0);assert.equal(writes,1);
 await finalizeAndVerify({sessionId:draft.id,patientId:patient.id,read:async()=>bundle([completed]),write:async()=>{throw Error('must not write')},onCommitted:()=>{},onVerified:()=>success++});assert.equal(success,1);
});
test('invalid timestamp and invalid optimistic versions are not completion evidence',()=>{
 for(const changes of [{completed_at:'not-a-date'},{version:-1},{version:1.5},{version:Number.MAX_SAFE_INTEGER+1}])assert.throws(()=>confirmedCompletion({...completed,...changes},draft.id,patient.id));
});
test('verified finalization updates the completed visit, timeline and latest-record projection',async()=>{
 let current=bundle(),reads=0,writes=0;
 const verified={...bundle([completed]),sections:[{id:'current-note',patient_id:patient.id,session_id:draft.id,section_key:'interview',content:'QA CURRENT VISIT',version:1}]};
 await finalizeAndVerify({sessionId:draft.id,patientId:patient.id,read:async()=>++reads===1?bundle():verified,write:async()=>{writes++;return {session:completed}},onCommitted:session=>{current=reconcileRecord(current,{...current,sessions:[session]})},onVerified:(_,fresh)=>{current=reconcileRecord(current,fresh)}});
 assert.equal(writes,1);assert.equal(current.sessions[0].status,'completed');assert.equal(current.sections[0].content,'QA CURRENT VISIT');
 const projection=patientRecord(current,new Date('2026-10-12T12:00:00Z'));
 assert.equal(projection.latestVisit.id,draft.id);assert.equal(projection.completed.length,1);assert.equal(projection.events.filter(e=>e.kind==='visits'&&e.sessionId===draft.id).length,1);
 // A stale shell cannot remove the committed visit or its current findings.
 current=reconcileRecord(current,bundle(),'shell');assert.equal(current.sessions[0].status,'completed');assert.equal(current.sections[0].content,'QA CURRENT VISIT');
});

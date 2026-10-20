import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {reviewFixtureVisit,visitRevision,completeFixtureVisit} from '../lib/teleconsultations/visit-lifecycle.ts';
import {finalizeAndVerify} from '../lib/clinical/finalization.ts';
import {emptyContinuity} from '../lib/clinical/continuity.ts';
const source=JSON.parse(readFileSync('lib/clinical/treatment-preview.json','utf8'));
function setup(){
 const patientId=source.patient.id,sessionId='synthetic-lifecycle';
 const notes={...emptyContinuity,transcript:'Αρχική σημείωση',clinical_state_summary:'Σημερινή εικόνα',treatment_decision:'Συνθετική απόφαση',next_review_focus:'Συνθετική επανεκτίμηση',adherence:'Αναφερόμενη λήψη'};
 const record={patientId,sessionId,version:1,notes,assignments:[],appointment:{id:'synthetic-appointment',patient_id:patientId,session_id:sessionId,status:'scheduled',scheduled_start:'2026-10-18T14:00:00Z',scheduled_end:'2026-10-18T14:50:00Z'}};
 const mse={id:'synthetic-mse',patient_id:patientId,session_id:sessionId,section_key:'mse',content:'Σημερινή παρατήρηση',document:{kind:'mse',fields:[{key:'appearance',label:'Εμφάνιση',text:'Σημερινή παρατήρηση'}]},source:'clinician',version:1,updated_at:'2026-10-18T15:00:00Z'};
 const risk={patient_id:patientId,session_id:sessionId,suicidal_ideation:'negative',intent:'not_assessed',plan:'not_assessed',self_harm:'not_assessed',attempt_history:'not_assessed',harm_to_others:'not_assessed',protective_factors:'',clinical_note:'',version:1,updated_at:'2026-10-18T15:00:00Z',tree:{version:1,answers:{wish:'negative'},notes:{}}};
 const bundle={...source,sessions:[{...source.sessions[3],id:sessionId,patient_id:patientId,status:'draft',version:0,closure_draft:notes,closure_version:1}],sections:[],risks:[],appointments:[record.appointment]};
 const options={inCall:false,confirmed:true,reviewedRevision:visitRevision(record,mse,risk),now:'2026-10-18T15:00:00Z'};
 return {record,mse,risk,bundle,options};
}
test('only explicit post-call confirmation promotes reviewed draft into the same patient visit',()=>{
 const {record,mse,risk,bundle,options}=setup();
 assert.equal(bundle.sessions[0].status,'draft');
 assert.throws(()=>completeFixtureVisit(bundle,record,mse,risk,{...options,inCall:true}),/κλήση/);
 assert.throws(()=>completeFixtureVisit(bundle,record,mse,risk,{...options,confirmed:false}),/Ελέγξτε/);
 const completed=completeFixtureVisit(bundle,record,mse,risk,options);
 assert.equal(completed.sessions[0].status,'completed');assert.equal(bundle.sessions[0].status,'draft');
 assert.deepEqual(completed.sessions[0].continuity,{...record.notes,session_id:record.sessionId,approved_at:options.now,approved_by:bundle.sessions[0].tester_id});
 assert.equal(completed.appointments[0].status,'completed');
 assert.equal(completed.sections[0].session_id,record.sessionId);
 assert.equal(completed.risks[0].patient_id,record.patientId);
 assert.equal(completeFixtureVisit(completed,record,mse,risk,options),completed);
});
test('optional clinical fields retain foreign-record and stale-review protection',()=>{
 const {record,mse,risk,bundle,options}=setup();
 assert.deepEqual(reviewFixtureVisit({...record,notes:emptyContinuity},undefined,undefined),[]);
 assert.throws(()=>completeFixtureVisit(bundle,{...record,version:2},mse,risk,options),/άλλαξε/);
 assert.throws(()=>completeFixtureVisit(bundle,record,{...mse,version:2},risk,options),/άλλαξε/);
 assert.throws(()=>completeFixtureVisit(bundle,record,mse,{...risk,version:2},options),/άλλαξε/);
 assert.throws(()=>reviewFixtureVisit(record,{...mse,session_id:'other'},risk),/διαφορετική/);
 assert.throws(()=>completeFixtureVisit({...bundle,patient:{...bundle.patient,id:'other'}},record,mse,risk,options),/Διαφορετικός/);
 const incomplete={...record,notes:{...record.notes,treatment_decision:''}};
 assert.throws(()=>completeFixtureVisit(bundle,incomplete,mse,risk,options),/άλλαξε/);
 const optional=completeFixtureVisit(bundle,incomplete,undefined,undefined,{...options,reviewedRevision:visitRevision(incomplete)});
 assert.equal(optional.sessions[0].status,'completed');assert.deepEqual(optional.risks,[]);assert.deepEqual(optional.sections,[]);
});
test('post-call edits, failure, retry and refresh use the existing verified completion contract',async()=>{
 const {record,mse,risk,bundle,options}=setup();let canonical=bundle,writes=0,fail=true;
 const edited={...record,version:2,notes:{...record.notes,transcript:'Διορθωμένη τελική σημείωση'}};
 const finish=()=>finalizeAndVerify({patientId:record.patientId,sessionId:record.sessionId,closure:true,closureVersion:2,read:async()=>canonical,write:async body=>{
  writes++;assert.equal(body.action,'finalize_closure');assert.equal(body.expected_closure_version,2);
  if(fail)throw new Error('Συνθετική αποτυχία');
  canonical=completeFixtureVisit(canonical,edited,mse,risk,{...options,reviewedRevision:visitRevision(edited,mse,risk)});
  return {session:canonical.sessions[0]};
 },onCommitted:()=>{},onVerified:()=>{}});
 await assert.rejects(finish,/Συνθετική αποτυχία/);assert.equal(canonical.sessions[0].status,'draft');
 fail=false;await finish();assert.equal(canonical.sessions[0].continuity.transcript,edited.notes.transcript);
 await finish();assert.equal(writes,2);assert.equal(canonical.sessions.length,1);
 edited.notes.transcript='Μεταγενέστερη αλλαγή';mse.document.fields[0].text='Άλλο';
 assert.equal(canonical.sessions[0].continuity.transcript,'Διορθωμένη τελική σημείωση');assert.equal(canonical.sections[0].document.fields[0].text,'Σημερινή παρατήρηση');
});

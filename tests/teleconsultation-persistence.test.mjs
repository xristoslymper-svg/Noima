import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {recordConnection,recordForVisit,assertReviewedRecord} from '../lib/teleconsultations/record-connection.ts';
import {persistentVisitEnabled} from '../lib/teleconsultations/policy.ts';
import {emptyContinuity} from '../lib/clinical/continuity.ts';
const source=JSON.parse(readFileSync('lib/clinical/treatment-preview.json','utf8'));
const sid='40000000-0000-4000-8000-000000000126',pid=source.patient.id;
function fixture(){return {...structuredClone(source),sessions:[{id:sid,patient_id:pid,tester_id:source.patient.tester_id,session_type:'follow_up',status:'draft',version:0,closure_version:0,closure_draft:{...emptyContinuity},started_at:'2026-10-18T10:00:00Z',updated_at:'2026-10-18T10:00:00Z',completed_at:null}],sections:[],risks:[],appointments:[],medications:[],medicationEvents:[],medicationSideEffects:[],assessments:[],corrections:[],addenda:[],proposals:[]}}
test('persistent editing is restricted to the new branch preview, never production or other previews',()=>{
 assert.equal(persistentVisitEnabled({VERCEL_ENV:'preview',VERCEL_GIT_COMMIT_REF:'codex/teleconsultation-visit-persistence'}),true);
 for(const env of [{},{VERCEL_ENV:'production',VERCEL_GIT_COMMIT_REF:'codex/teleconsultation-visit-persistence'},{VERCEL_ENV:'preview',VERCEL_GIT_COMMIT_REF:'main'}])assert.equal(persistentVisitEnabled(env),false);
});
test('notes save to the exact visit and reload from canonical draft without creating another session',async()=>{
 let db=fixture(),writes=[];
 const post=async body=>{writes.push(body);const session=db.sessions[0];assert.equal(body.action,'save_closure');assert.equal(body.session_id,sid);assert.equal(body.expected_version,session.closure_version);const saved={...session,closure_version:session.closure_version+1,closure_draft:structuredClone(body.value)};db.sessions=[saved];return {session:saved}};
 const connection=recordConnection(db,pid,sid,async()=>structuredClone(db),post);
 await connection.saveClosure({...emptyContinuity,transcript:'Σημειώσεις που παραμένουν μετά το refresh'},0);
 const fresh=recordForVisit(await connection.read(),pid,sid);
 assert.equal(fresh.notes.transcript,'Σημειώσεις που παραμένουν μετά το refresh');assert.equal(fresh.version,1);assert.equal(db.sessions.length,1);
 assert.equal(db.sessions[0].status,'draft');assert.equal(writes.length,1);
});
test('wrong patient/visit acknowledgements and stale writes are rejected, never silently retargeted',async()=>{
 const bundle=fixture();
 assert.throws(()=>recordForVisit(bundle,'another',sid));
 assert.throws(()=>recordForVisit(bundle,pid,'another'));
 assert.throws(()=>recordForVisit({...bundle,sessions:[{...bundle.sessions[0],session_type:'initial_assessment'}]},pid,sid),/αρχική/);
 const wrong=recordConnection(bundle,pid,sid,async()=>bundle,async()=>({session:{...bundle.sessions[0],patient_id:'another',closure_version:1,closure_draft:{...emptyContinuity}}}));
 await assert.rejects(wrong.saveClosure({...emptyContinuity},0),/επιλεγμένη/);
 const stale=recordConnection(bundle,pid,sid,async()=>bundle,async()=>{throw new Error('Η καταγραφή άλλαξε σε άλλη καρτέλα.')});
 await assert.rejects(stale.saveClosure({...emptyContinuity,transcript:'keep'},0),/άλλαξε/);
 assert.equal(bundle.sessions[0].closure_draft.transcript,'');
});
test('MSE and risk stay on the same visit with optimistic versions',async()=>{
 const bundle=fixture(),seen=[];
 const c=recordConnection(bundle,pid,sid,async()=>bundle,async body=>{seen.push(body);return body.action==='save_document'?{section:{id:'section',patient_id:pid,session_id:sid,section_key:'mse',document:body.document,content:'MSE',version:2}}:{risk:{...body.risk,patient_id:pid,session_id:sid,version:3}}});
 assert.equal((await c.saveMse({kind:'mse',fields:[]},1)).version,2);
 assert.equal((await c.saveRisk({suicidal_ideation:'negative'},2)).version,3);
 assert.deepEqual(seen.map(s=>[s.session_id,s.expected_version]),[[sid,1],[sid,2]]);
 const bad=recordConnection(bundle,pid,sid,async()=>bundle,async()=>({section:{patient_id:pid,session_id:'another',version:2}}));
 await assert.rejects(bad.saveMse({kind:'mse',fields:[]},1),/επιλεγμένη/);
});
test('registration requires explicit closure confirmation and a fresh reviewed version',async()=>{
 const bundle=fixture(),c=recordConnection(bundle,pid,sid,async()=>bundle,async()=>{assert.fail('no unconfirmed write')});
 assert.throws(()=>c.write({action:'start_session',session_id:sid}));
 assert.throws(()=>c.write({action:'finalize_closure',session_id:'another',confirmed:true}));
 const record=recordForVisit(bundle,pid,sid);bundle.sessions[0].closure_version=1;
 assert.throws(()=>assertReviewedRecord(bundle,record),/άλλαξε μετά/);
});
test('connected entry only opens existing canonical visits, never starts sessions or calls Daily',()=>{
 const ui=readFileSync('components/teleconsultations/TeleconsultationsConnected.tsx','utf8');
 assert.doesNotMatch(ui,/action:\s*['"]start_session|newDemoVisit|createDailyRoom|getUserMedia/);
 assert.match(ui,/session=/);assert.match(ui,/patient=/);
 const route=readFileSync('app/api/teleconsultations/route.ts','utf8');assert.match(route,/withPilot/);assert.match(route,/tester_id=eq/);assert.doesNotMatch(route,/bootstrap|INSERT|UPDATE|DELETE|method:'POST'/);
});

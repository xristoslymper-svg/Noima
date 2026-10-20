import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {simulateVisitWrite} from '../lib/patients/visit-simulation.ts';
import {followupCompletionIssues,finalizationIssues} from '../lib/clinical/visit-workspace-state.ts';
import {journeyReview} from '../lib/clinical/patient-journey.ts';
const fixture=()=>JSON.parse(readFileSync('browser-tests/fixtures/warm-patient.json','utf8'));
test('synthetic new visit preserves old records through refresh and notes-only registration',()=>{
 const b=fixture(),old=JSON.stringify(b.sessions),oldSections=JSON.stringify(b.sections),id='63140000-0000-4000-8000-000000000001',now='2026-10-20T12:00:00Z';
 const body={action:'start_session',patient_id:b.patient.id,session_type:'follow_up',request_id:id};
 simulateVisitWrite(b,body,now);simulateVisitWrite(b,body,now);
 assert.equal(b.sessions.filter(s=>s.id===id).length,1);assert.equal(JSON.stringify(b.sessions.filter(s=>s.id!==id)),old);
 const value={transcript:'Synthetic clinician notes only',clinical_state_summary:'',treatment_decision:'',next_review_focus:'',adherence:'',pinned_context:'',source:'manual'};
 simulateVisitWrite(b,{action:'save_closure',session_id:id,value,expected_version:0},now);
 const refreshed=JSON.parse(JSON.stringify(b)),s=refreshed.sessions.find(s=>s.id===id);
 assert.equal(s.closure_draft.transcript,value.transcript);assert.equal(journeyReview(refreshed,s).clinical,value.transcript);
 simulateVisitWrite(refreshed,{action:'finalize_closure',session_id:id,expected_version:s.version,confirmed:true,expected_closure_version:1},now);
 assert.equal(s.status,'completed');assert.equal(JSON.stringify(refreshed.sessions.filter(s=>s.id!==id)),old);
 assert.equal(JSON.stringify(refreshed.sections.filter(s=>s.session_id!==id)),oldSections);
 assert.equal(refreshed.risks.some(r=>r.session_id===id),false);
 assert.deepEqual(refreshed.sections.filter(s=>s.session_id===id).map(s=>[s.section_key,s.content]),[['interview',value.transcript]]);
});
test('optional fields do not remove save/version/ownership failures or infer unassessed clinical findings',()=>{
 assert.deepEqual(finalizationIssues([]),[]);
 assert.deepEqual(followupCompletionIssues({clinical_state_summary:'',treatment_decision:'',next_review_focus:'',adherence:''},[]),[]);
 const b=fixture(),s=b.sessions.find(s=>s.status==='draft'),snapshot=JSON.stringify(s);
 assert.throws(()=>simulateVisitWrite(b,{action:'finalize_session',session_id:s.id,expected_version:s.version+1},'2026-10-20'),/stale_session/);
 assert.equal(JSON.stringify(s),snapshot);
 assert.throws(()=>simulateVisitWrite(b,{action:'save_closure',session_id:'other',value:{}},'2026-10-20'),/session_unavailable/);
});
test('synthetic browser route is disabled in production and never forwards clinical writes',()=>{
 const page=readFileSync('app/patients/demo/independent-visits-preview/page.tsx','utf8'),component=readFileSync('components/patients/IndependentVisitPreview.tsx','utf8');
 assert.match(page,/VERCEL_ENV==='production'\)notFound\(\)/);
 assert.match(component,/window.fetch=localFetch/);assert.match(component,/window.fetch===localFetch/);
 assert.match(component,/sessionStorage.setItem\(storageKey/);assert.match(component,/simulateVisitWrite\(next/);
});

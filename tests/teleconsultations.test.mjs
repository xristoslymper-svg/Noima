import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {previewEnabled,appointmentContext,roomPolicy,reservationCost,withinFreeBudget,reserveCall} from '../lib/teleconsultations/policy.ts';
import {saveFixtureNotes,assignFixture} from '../lib/teleconsultations/preview.ts';
import {createDailyRoom} from '../lib/teleconsultations/daily.ts';
const appointment={id:'appointment-a',patient_id:'patient-a',session_id:'session-a',status:'scheduled',scheduled_start:'2026-10-18T14:00:00Z',scheduled_end:'2026-10-18T14:50:00Z'};
const notes={clinical_state_summary:'',treatment_decision:'',next_review_focus:'',adherence:'',pinned_context:'',transcript:'Original',source:'manual'};
const record={appointment,patientId:'patient-a',sessionId:'session-a',version:0,notes,assignments:[]};
test('memory-only teleconsultation simulation is available in production and its designated previews',()=>{
 assert.equal(previewEnabled({VERCEL_ENV:'production',VERCEL_GIT_COMMIT_REF:'main'}),true);
 assert.equal(previewEnabled({VERCEL_ENV:'production'}),true);
 assert.equal(previewEnabled({VERCEL_ENV:'preview',VERCEL_GIT_COMMIT_REF:'codex/teleconsultations-production-demo'}),true);
 assert.equal(previewEnabled({}),false);
 assert.equal(previewEnabled({VERCEL_ENV:'development',VERCEL_GIT_COMMIT_REF:'main'}),false);
 assert.equal(previewEnabled({VERCEL_ENV:'preview',VERCEL_GIT_COMMIT_REF:'main'}),false);
 assert.equal(previewEnabled({VERCEL_ENV:'preview',VERCEL_GIT_COMMIT_REF:'codex/daily-teleconsultations'}),true);
});
test('wrong patient or visit and cancelled appointments fail closed',()=>{
 assert.throws(()=>appointmentContext(appointment,'patient-b','session-a'));
 assert.throws(()=>appointmentContext(appointment,'patient-a','session-b'));
 assert.throws(()=>appointmentContext({...appointment,status:'cancelled'},'patient-a','session-a'));
 assert.throws(()=>appointmentContext({...appointment,scheduled_end:'bad'},'patient-a','session-a'));
});
test('same visit notes version saved once and conflicting save preserves canonical record',()=>{
 const saved=saveFixtureNotes(record,'patient-a','session-a',0,{...notes,transcript:'New'});
 assert.equal(saved.notes.transcript,'New');assert.equal(saved.version,1);
 assert.equal(saved.appointment,record.appointment);assert.equal(record.notes.transcript,'Original');
 assert.throws(()=>saveFixtureNotes(saved,'patient-a','session-a',0,notes));
 assert.throws(()=>saveFixtureNotes(saved,'patient-b','session-a',1,notes));
});
test('test and history assignments retain appointment context and avoid duplicates',()=>{
 const assigned=assignFixture(assignFixture(record,'PHQ-9'),'history');
 assert.deepEqual(assigned.assignments,['PHQ-9','history']);
 assert.equal(assignFixture(assigned,'PHQ-9'),assigned);
 assert.equal(assigned.sessionId,record.sessionId);assert.equal(assigned.appointment,record.appointment);
});
test('private two-person room has provider-enforced absolute expiry and no recording',()=>{
 const policy=roomPolicy(1000,50);assert.equal(policy.privacy,'private');assert.equal(policy.properties.exp,4000);
 assert.equal(policy.properties.eject_at_room_exp,true);assert.equal(policy.properties.max_participants,2);
 assert.equal(policy.properties.enable_recording,false);assert.equal(policy.properties.enable_transcription,false);
 for(const minutes of [0,-1,61,1.5,NaN])assert.throws(()=>roomPolicy(1000,minutes));
});
test('free allowance includes active reservations and rounding margin',()=>{
 assert.equal(reservationCost(50),102);assert.equal(withinFreeBudget(8898,0,50),true);
 assert.equal(withinFreeBudget(8899,0,50),false);assert.equal(withinFreeBudget(8800,100,50),false);
 assert.equal(withinFreeBudget(NaN,0,50),false);
});
test('reservation contract handles concurrent calls and repeated request keys without overbooking',async()=>{
 let reserved=8898;const rows=new Map();
 const ledger={reserve:async input=>{if(rows.has(input.key))return rows.get(input.key);if(reserved+input.cost>input.cap)return null;reserved+=input.cost;const row={id:input.key,expires:input.expires};rows.set(input.key,row);return row}};
 const args={month:'2026-10',minutes:50,now:1000};
 const results=await Promise.allSettled([reserveCall(ledger,{...args,key:'request-one'}),reserveCall(ledger,{...args,key:'request-two'})]);
 assert.equal(results.filter(x=>x.status==='fulfilled').length,1);assert.equal(reserved,9000);
 await reserveCall(ledger,{...args,key:'request-one'});assert.equal(reserved,9000);
});
test('Daily adapter never calls provider without valid bounded reservation',async()=>{
 let calls=0;const fetcher=async()=>{calls++;return new Response('{}')};
 await assert.rejects(()=>createDailyRoom({apiKey:'',name:'unsafe',now:1000,minutes:50,reservation:{id:'',expires:4000},fetcher}));
 assert.equal(calls,0);
});
test('Daily adapter sends no patient identifiers, rejects ambiguous provider responses',async()=>{
 let sent;const name='noima-'+ 'a'.repeat(32);
 const input={apiKey:'synthetic-key',name,now:1000,minutes:50,reservation:{id:'reserved',expires:4000}};
 const result=await createDailyRoom({...input,fetcher:async(_url,options)=>{sent=JSON.parse(options.body);return Response.json({name,url:'https://synthetic.daily.co/'+name})}});
 assert.equal(result.expires,4000);assert.equal(sent.properties.max_participants,2);
 assert.equal(JSON.stringify(sent).includes('patient'),false);
 await assert.rejects(()=>createDailyRoom({...input,fetcher:async()=>new Response('',{status:409})}));
});
test('preview reuses existing visit draft fields and disables real network tools',async()=>{
 const ui=await readFile('components/teleconsultations/TeleconsultationsPreview.tsx','utf8');
 assert.match(ui,/FollowupDraftProvider/);assert.match(ui,/<FollowupField field="transcript"/);
 assert.match(ui,/saveFixtureNotes/);assert.doesNotMatch(ui,/fetch\(/);
 assert.match(ui,/SyntheticChartContext.Provider value=\{true\}/);
 const field=await readFile('components/dictation/ClinicalTextField.tsx','utf8');assert.match(field,/disabled=\{synthetic\|\|busy/);
});

test('call and notes modes keep one mounted editor and independent scroll',async()=>{
 const ui=await readFile('components/teleconsultations/TeleconsultationsPreview.tsx','utf8');
 assert.equal((ui.match(/<FollowupField field="transcript"/g)||[]).length,1);
 assert.match(ui,/hidden=\{view!=='notes'\}/);
 assert.match(ui,/setSelectionRange/);assert.match(ui,/notesPanel.current\?\.scrollTop/);
 const css=await readFile('components/teleconsultations/Teleconsultations.module.css','utf8');
 assert.match(css,/position:sticky/);assert.match(css,/overscroll-behavior:contain/);
});

test('polished workspace has one note source and optional scoped read-only references',async()=>{
 const ui=await readFile('components/teleconsultations/TeleconsultationsPreview.tsx','utf8');
 assert.doesNotMatch(ui,/Αποθηκευμένο συνθετικό προσχέδιο/);
 assert.match(ui,/Αναφορά φακέλου ασθενή/);
 assert.match(ui,/row.patient_id===patientId/);
 assert.match(ui,/role="dialog"/);
});

test('teleconsultation uses existing MSE and risk editors with isolated persistence',async()=>{
 const ui=await readFile('components/teleconsultations/TeleconsultationsPreview.tsx','utf8');
 assert.match(ui,/<StructuredVisitEditor[^>]*kind="mse"/);
 assert.match(ui,/<RiskTreeEditor/);
 assert.match(ui,/saveDocument=\{saveMse\}/);
 assert.match(ui,/saveRisk=\{saveRisk\}/);
 assert.match(ui,/reviewFixtureVisit\(/);
 assert.doesNotMatch(ui,/<StructuredVisitEditor[^>]*baseline=/);
 for(const path of ['StructuredVisitEditor','RiskTreeEditor']){
  const editor=await readFile('components/patients/'+path+'.tsx','utf8');
  assert.match(editor,/if\(save(?:Document|Risk)\)return save(?:Document|Risk)\(/);
 }
});

test('production simulation retains explicit notices and no live network persistence',async()=>{
 for(const path of ['TeleconsultationsLobby','TeleconsultationsPreview']){
  const ui=await readFile('components/teleconsultations/'+path+'.tsx','utf8');
  assert.match(ui,/Προσομοίωση τηλεσυνεδρίας/);
  assert.match(ui,/χάνονται με ανανέωση/);
  assert.doesNotMatch(ui,/fetch\(|createDailyRoom\(|getUserMedia\(/);
 }
});

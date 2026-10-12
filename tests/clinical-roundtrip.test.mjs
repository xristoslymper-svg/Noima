import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
import {finalizeAndVerify} from '../lib/clinical/finalization.ts';
import {buildSummaryContext,summaryContextKey,clinicDay} from '../lib/clinical/summary-context.ts';
import {patientRecord} from '../lib/clinical/patient-record.ts';
import {assessmentLink} from '../lib/clinical/assessment-link.ts';

// Actual repository migrations/RPCs in disposable PostgreSQL. JSON serialization
// represents the HTTP boundary; hosted data, auth credentials and email are absent.
const db=new PGlite();
const tenant='79000000-0000-4000-8000-000000000001',otherTenant='79000000-0000-4000-8000-000000000002';
const query=async(text,args=[])=> (await db.query(text,args)).rows;
const wire=value=>JSON.parse(JSON.stringify(value));
before(async()=>{
 await db.exec(`create role anon nologin;create role authenticated nologin;create schema auth;
 create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz,deleted_at timestamptz,banned_until timestamptz);
 create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
 grant usage on schema auth,public to anon,authenticated;grant execute on function auth.uid() to anon,authenticated;`);
 for(const file of (await readdir('supabase/migrations')).filter(name=>name.endsWith('.sql')).sort())await db.exec(await readFile('supabase/migrations/'+file,'utf8'));
 for(const id of [tenant,otherTenant])await query('select demo_tester_bootstrap($1)',[id]);
});
after(async()=>{await db.close()});
async function patient(){return (await query("select * from demo_patient_create_v2($1,'QA SYNTHETIC roundtrip')",[tenant]))[0]}
async function session(patientId){return (await query("select * from demo_session_start($1,$2,'initial_assessment')",[tenant,patientId]))[0]}
async function snapshot(patientId){
 const table=async name=>query('select * from '+name+' where tester_id=$1 and patient_id=$2',[tenant,patientId]);
 const [p]=await query('select * from demo_patients where id=$1 and tester_id=$2',[patientId,tenant]);
 const [history]=await table('demo_patient_history');
 const [{result:assessments}]=await query('select demo_assessment_list($1,$2) result',[tenant,patientId]);
 return wire({patient:p,clinical_day:clinicDay(),sessions:await table('demo_sessions'),sections:await table('demo_session_sections'),risks:await table('demo_risk_assessments'),history:history||null,medications:await query('select * from demo_medications_at($1,$2,current_date)',[tenant,patientId]),medicationEvents:await table('demo_medication_events'),medicationSideEffects:await table('demo_medication_side_effects'),medicationRevisions:[],proposals:[],addenda:[],corrections:[],contextRevisions:[],assessments,appointments:await table('demo_calendar_events')});
}
async function ready(id){
 for(const [key,text] of Object.entries({interview:'QA SYNTHETIC: recorded today; no previous notes copied.',mse:'QA SYNTHETIC: observed assessment, not inherited.',assessment:'QA SYNTHETIC: diagnostic assessment remains under investigation.',plan:'QA SYNTHETIC: agreed reassessment and next steps.',review:'QA SYNTHETIC: follow-up in two weeks.'}))await query('select * from demo_session_save_section($1,$2,$3,$4,$5,null)',[tenant,id,key,text,'manual']);
 await query('select demo_session_save_risk_tree($1,$2,$3,null)',[tenant,id,JSON.stringify({suicidal_ideation:'negative',intent:'negative',plan:'negative',self_harm:'negative',attempt_history:'unknown',harm_to_others:'negative',protective_factors:'QA SYNTHETIC supports',clinical_note:'QA SYNTHETIC assessment of this visit.'})]);
}

test('RPC completion preserves failed drafts and updates timeline and grounded summary only after commit',async()=>{
 const p=await patient(),s=await session(p.id);
 const before=await snapshot(p.id);assert.equal(patientRecord(before).completed.length,0);
 await assert.rejects(query('select demo_session_finalize($1,$2,$3)',[tenant,s.id,s.version]),/missing|required|risk/i);
 assert.equal((await snapshot(p.id)).sessions.find(row=>row.id===s.id).status,'draft');
 await ready(s.id);
 const draft=await snapshot(p.id),v=draft.sessions.find(row=>row.id===s.id).version;
 assert.ok(!buildSummaryContext(draft).sources.some(source=>source.kind==='session_section'&&source.session_id===s.id));
 await assert.rejects(query('select demo_session_finalize($1,$2,$3)',[tenant,s.id,v-1]),/stale_session/);
 assert.equal((await snapshot(p.id)).sections.length,draft.sections.length);
 const order=[];let calls=0,verified;
 await finalizeAndVerify({patientId:p.id,sessionId:s.id,read:()=>snapshot(p.id),write:async body=>{calls++;assert.equal(body.expected_version,v);const [value]=await query('select * from demo_session_finalize($1,$2,$3)',[tenant,s.id,body.expected_version]);return wire({session:value})},onCommitted:()=>order.push('committed'),onVerified:(completed,bundle)=>{order.push('verified');verified={completed,bundle}}});
 // Projection assertions are outside the UI error boundary so their exact cause
 // is visible in CI instead of becoming a generic refresh-error message.
 assert.deepEqual(order,['committed','verified']);assert.equal(calls,1);assert.ok(verified);
 assert.equal(verified.completed.status,'completed');
 assert.ok(patientRecord(verified.bundle).events.some(event=>event.kind==='visits'&&event.sessionId===s.id),'completed encounter must enter the timeline');
 assert.ok(buildSummaryContext(verified.bundle).sources.some(source=>source.kind==='session_section'&&source.session_id===s.id),'completed narrative must enter grounded source context');
 assert.notEqual(summaryContextKey(verified.bundle),summaryContextKey(draft),'completion must invalidate the draft summary key');
 await finalizeAndVerify({patientId:p.id,sessionId:s.id,read:()=>snapshot(p.id),write:async()=>{throw Error('duplicate completion RPC')},onCommitted:()=>{},onVerified:()=>{}});
 await assert.rejects(query("select demo_session_save_section($1,$2,'interview','overwrite completed','manual',1)",[tenant,s.id]),/session_unavailable|completed/);
});

test('server-scored submission retains exact identity and changes the summary key without implicit clinical review',async()=>{
 const p=await patient(),other=await patient(),s=await session(p.id);
 const id='79000000-0000-4000-8000-000000000010',token='79'.repeat(32);
 await query("select demo_assessment_assign_to_session($1,$2,$3,$4,'PHQ-9',$5)",[tenant,p.id,s.id,id,token]);
 const before=await snapshot(p.id),answers=[0,1,2,3,0,1,2,3,1];
 await query('select demo_assessment_submit($1,$2)',[token,JSON.stringify(answers)]);
 await query('select demo_assessment_submit($1,$2)',[token,JSON.stringify(answers)]);
 const after=await snapshot(p.id),row=after.assessments.find(item=>item.id===id);
 assert.ok(row);assert.equal(row.score,13);assert.deepEqual(row.answers,answers);assert.equal(row.patient_id,p.id);assert.equal(row.session_id,s.id);assert.ok(row.completed_at);assert.equal(row.reviewed_at,null);assert.equal(row.item9_reviewed_at,null);
 assert.equal(assessmentLink(after,row).session.id,s.id);
 assert.equal((await snapshot(other.id)).assessments.some(item=>item.id===id),false);
 assert.ok(patientRecord(after).events.some(event=>event.kind==='measurements'&&event.assessmentId===id));
 assert.notEqual(summaryContextKey(before),summaryContextKey(after));assert.ok(buildSummaryContext(after).sources.some(source=>source.record_id===id));
 assert.equal(after.risks.length,0,'questionnaire score must not create a clinical risk assessment');assert.equal(after.sections.length,0,'questionnaire score must not generate a diagnosis or note');
 await snapshot(p.id);const [unreviewed]=await query('select reviewed_at,item9_reviewed_at from private.demo_assessments where id=$1',[id]);assert.equal(unreviewed.reviewed_at,null);assert.equal(unreviewed.item9_reviewed_at,null);
 await query('select demo_assessment_review($1,$2)',[tenant,id]);
 const [reviewed]=await query('select reviewed_at,item9_reviewed_at from private.demo_assessments where id=$1',[id]);assert.ok(reviewed.reviewed_at);assert.equal(reviewed.item9_reviewed_at,null,'general review does not silently complete item-9 review');
 await assert.rejects(query('select demo_assessment_review($1,$2)',[otherTenant,id]),/not_found|unavailable|not_authorized/);
});

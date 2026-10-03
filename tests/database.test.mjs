import { PGlite } from '@electric-sql/pglite';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { after, before, test } from 'node:test';

// Real PostgreSQL in-process. Only the Supabase-owned auth schema/JWT role context
// is emulated; the exact production migration, RLS, grants and triggers run here.
const db = new PGlite();
const a = '10000000-0000-4000-8000-000000000001';
const b = '10000000-0000-4000-8000-000000000002';
const colleague = '10000000-0000-4000-8000-000000000003';
const pa = '20000000-0000-4000-8000-000000000001';
const pb = '20000000-0000-4000-8000-000000000002';
const patientA = '30000000-0000-4000-8000-000000000001';
const patientB = '30000000-0000-4000-8000-000000000002';
const session = '40000000-0000-4000-8000-000000000001';

async function sql(query, params = []) {
  try { return (await db.query(query, params)).rows; }
  catch (error) { throw new Error(`${error.message} (${error.code}) ${error.where ?? ''}`); }
}
async function asUser(id, fn) {
  await db.exec('begin; set local role authenticated;');
  await sql("select set_config('request.jwt.claim.sub', $1, true)", [id]);
  try { const result = await fn(); await db.exec('commit'); return result; }
  catch (error) { await db.exec('rollback'); throw error; }
}
async function rejected(id, query, params = [], pattern = /permission denied|row-level security|Not authorized|immutable|clinician|unavailable|completed|draft|Stale|missing|Required|foreign key|violates/i) {
  await assert.rejects(asUser(id, () => sql(query, params)), pattern);
}

before(async () => {
  await db.exec(`
    create role anon nologin; create role authenticated nologin;
    create schema auth; create table auth.users(id uuid primary key, email text);
    create function auth.uid() returns uuid language sql stable as
    $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    grant usage on schema auth, public to anon, authenticated;
    grant execute on function auth.uid() to anon, authenticated;
  `);
  for (const name of (await readdir('supabase/migrations')).filter(x => x.endsWith('.sql')).sort()) {
    try { await db.exec(await readFile(`supabase/migrations/${name}`, 'utf8')); }
    catch (error) { throw new Error(`${name}: ${error.message} ${error.where ?? ''}`); }
  }
  await sql('insert into auth.users(id) values ($1),($2),($3)', [a, b, colleague]);
  await sql('insert into public.profiles(id,full_name) values ($1,\'A\'),($2,\'B\'),($3,\'Colleague\')', [a,b,colleague]);
  await sql("insert into practices(id,name) values ($1,'A'),($2,'B')", [pa,pb]);
  await sql("insert into practice_members(practice_id,user_id,role) values ($1,$2,'owner'),($3,$4,'owner'),($1,$5,'clinician')", [pa,a,pb,b,colleague]);
  await asUser(a, () => sql("insert into patients(id,practice_id,first_name) values($1,$2,'A patient')", [patientA,pa]));
  await asUser(b, () => sql("insert into patients(id,practice_id,first_name) values($1,$2,'B patient')", [patientB,pb]));
  await asUser(a, () => sql("insert into clinical_sessions(id,patient_id,practice_id,session_type,scheduled_at) values($1,$2,$3,'initial_assessment',now())", [session,patientA,pa]));
});
after(async () => { await db.close(); });

test('visit documents reload as one canonical section, reject stale writes and remain immutable after finalization', async()=>{
 const t='90000000-0000-4000-8000-000000000001';await sql('select demo_tester_bootstrap($1)',[t]);const [p]=await sql('select id from demo_patients where tester_id=$1 limit 1',[t]);const [s]=await sql("select * from demo_session_start($1,$2,'initial_assessment')",[t,p.id]);
 const doc={kind:'mse',fields:[{key:'mood',label:'Mood',text:'Denies low mood; uncertain reliability.'}]};
 const [saved]=await sql("select * from demo_session_save_document($1,$2,'mse',$3,null)",[t,s.id,JSON.stringify(doc)]);
 const [loaded]=await sql("select * from demo_session_sections where id=$1",[saved.id]);assert.deepEqual(loaded.document,doc);assert.equal(loaded.content,'Mood: Denies low mood; uncertain reliability.');
 await assert.rejects(sql("select demo_session_save_document($1,$2,'mse',$3,null)",[t,s.id,JSON.stringify(doc)]),/stale_section/);
 for(const invalid of [null,{}, {kind:'mse',fields:null},{kind:'mse',fields:[{key:'invented',label:'X',text:'X'}]}])await assert.rejects(sql("select demo_session_save_document($1,$2,'mse',$3,1)",[t,s.id,JSON.stringify(invalid)]),/invalid_document/);
 const assessment={kind:'assessment',fields:[{key:'differential-1',label:'Differential Diagnosis',text:'Requires reassessment.',status:'under_investigation',codes:[{code:'F32.9',label:'Depressive episode, unspecified',system:'WHO ICD-10',edition:'2019'}]},{key:'formulation',label:'Formulation',text:'Stress associated symptoms.'}]};
 const [a]=await sql("select * from demo_session_save_document($1,$2,'assessment',$3,null)",[t,s.id,JSON.stringify(assessment)]);assert.match(a.content,/υπό διερεύνηση/);assert.match(a.content,/F32.9/);assert.match(a.content,/Formulation/);
 await sql("select demo_session_save_section($1,$2,'assessment','Reviewed narrative replaces structure','manual',1)",[t,s.id]);assert.equal((await sql('select document from demo_session_sections where id=$1',[a.id]))[0].document,null);
 for(const k of ['interview','plan','review'])await sql("select demo_session_save_section($1,$2,$3,'Documented','manual',null)",[t,s.id,k]);
 await sql('select demo_session_save_risk($1,$2,$3,null)',[t,s.id,JSON.stringify({suicidal_ideation:'negative',harm_to_others:'positive'})]);
 await sql('select demo_session_save_risk($1,$2,$3,1)',[t,s.id,JSON.stringify({suicidal_ideation:'negative'})]);assert.equal((await sql('select harm_to_others from demo_risk_assessments where session_id=$1',[s.id]))[0].harm_to_others,'positive');
 const [{version}]=await sql('select version from demo_sessions where id=$1',[s.id]);await sql('select demo_session_finalize($1,$2,$3)',[t,s.id,version]);
 await assert.rejects(sql("select demo_session_save_document($1,$2,'mse',$3,1)",[t,s.id,JSON.stringify(doc)]),/session_unavailable/);
 await assert.rejects(sql("update demo_session_sections set document=null where id=$1",[saved.id]),/immutable_record/);
 const [follow]=await sql("select * from demo_session_start($1,$2,'follow_up')",[t,p.id]);assert.notEqual(follow.id,s.id);assert.equal((await sql('select count(*)::int n from demo_session_sections where session_id=$1',[follow.id]))[0].n,0);
 assert.deepEqual((await sql('select document from demo_session_sections where id=$1',[saved.id]))[0].document,doc);
});

test('blank structured headings cannot satisfy finalization and previous medications are atomic temporal events', async()=>{
 const t='90000000-0000-4000-8000-000000000002';await sql('select demo_tester_bootstrap($1)',[t]);const [p]=await sql('select id from demo_patients where tester_id=$1 limit 1',[t]);const [s]=await sql("select * from demo_session_start($1,$2,'initial_assessment')",[t,p.id]);
 const [blank]=await sql("select * from demo_session_save_document($1,$2,'mse',$3,null)",[t,s.id,JSON.stringify({kind:'mse',fields:[{key:'mood',label:'Mood',text:''}]})]);assert.equal(blank.content,'');
 const [{version}]=await sql('select version from demo_sessions where id=$1',[s.id]);await assert.rejects(sql('select demo_session_finalize($1,$2,$3)',[t,s.id,version]),/missing_sections/);
 const [med]=await sql("select * from demo_medication_record_history($1,$2,$3,'Fictional old med',25,'mg','daily',current_date-20,current_date-10,'Historical exposure')",[t,p.id,s.id]);
 const [{state}]=await sql('select demo_medication_state($1,current_date) state',[med.id]);assert.equal(state.status,'stopped');assert.equal((await sql('select count(*)::int n from demo_medication_events where medication_id=$1',[med.id]))[0].n,2);
 await assert.rejects(sql("select demo_medication_record_history($1,$2,$3,'Invalid history',25,'mg','daily',current_date-5,current_date-10,'bad dates')",[t,p.id,s.id]),/invalid_medication_history/);
 assert.equal((await sql("select count(*)::int n from demo_medications where patient_id=$1 and medication_name='Invalid history'",[p.id]))[0].n,0);
});

test('every table has RLS; anonymous reads are limited to fictional demo tables', async () => {
  const tables = await sql("select c.relname,c.relrowsecurity from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname in ('public','private') and c.relkind='r'");
  assert.ok(tables.length >= 20);
  for (const table of tables) assert.equal(table.relrowsecurity, true, table.relname);
  await db.exec('begin; set local role anon;');
  await assert.rejects(sql('select * from patients'), /permission denied/);
  await db.exec('rollback');
  const allowed = await sql("select table_name, privilege_type from information_schema.role_table_grants where grantee = 'anon' and table_schema in ('public','private') order by table_name, privilege_type");
  const demoReadable = [
    'demo_calendar_events',
    'demo_clinical_entries',
    'demo_medication_events',
    'demo_medication_side_effects',
    'demo_session_addenda',
    'demo_medication_event_revisions',
    'demo_medications',
    'demo_patient_history',
    'demo_patients',
    'demo_risk_assessments',
    'demo_session_sections',
    'demo_sessions',
  ];
  assert.deepEqual(allowed, demoReadable.sort().map(table_name => ({ table_name, privilege_type: 'SELECT' })));
});

test('practice membership isolates patient reads and writes, including direct API-shaped access', async () => {
  assert.deepEqual(await asUser(a, () => sql('select id from patients')), [{id:patientA}]);
  assert.deepEqual(await asUser(b, () => sql('select id from patients')), [{id:patientB}]);
  assert.deepEqual(await asUser(a, () => sql('update patients set first_name = \'Hacked\' where id=$1 returning id', [patientB])), []);
  await rejected(a, 'insert into patients(practice_id,first_name) values($1,\'Hacked\')', [pb]);
  await rejected(a, 'update patients set practice_id=$1 where id=$2', [pb,patientA]);
  await rejected(a, "insert into practice_members(practice_id,user_id,role) values($1,$2,'owner')", [pb,a]);
  await rejected(a, 'delete from patients where id=$1', [patientA]);
});

test('composite keys reject mismatched patient/practice and session/patient links', async () => {
  await rejected(a, "insert into patient_history(patient_id,practice_id) values($1,$2)", [patientB,pa]);
  await rejected(a, "insert into session_sections(session_id,patient_id,practice_id,section_type,content) values($1,$2,$3,'mse','test')", [session,patientB,pa]);
});

test('only assigned clinician writes a session; colleagues can read it', async () => {
  assert.equal((await asUser(colleague, () => sql('select id from clinical_sessions'))).length, 1);
  await rejected(colleague, "update clinical_sessions set started_at=now() where id=$1", [session]);
  await rejected(colleague, "insert into session_sections(session_id,patient_id,practice_id,section_type,content) values($1,$2,$3,'mse','test')", [session,patientA,pa]);
  await rejected(b, 'select complete_clinical_session($1,1)', [session]);
});

test('raw input, proposal and draft are distinct; approval is explicit and version checked', async () => {
  const [{id:input}] = await asUser(a, () => sql("insert into clinical_inputs(session_id,patient_id,practice_id,transcript,origin) values($1,$2,$3,'Fictional raw input','local_transcript') returning id", [session,patientA,pa]));
  const [{id:proposal}] = await asUser(a, () => sql("insert into clinical_proposals(input_id,session_id,patient_id,practice_id,section_type,content,provider) values($1,$2,$3,$4,'mse','Fictional proposal','mock') returning id", [input,session,patientA,pa]));
  assert.equal((await sql('select * from session_sections')).length,0);
  const [{id:section}] = await asUser(a, () => sql("insert into session_sections(session_id,patient_id,practice_id,section_type,content,source,proposal_id) values($1,$2,$3,'mse','Reviewed draft','ai_proposal',$4) returning id", [session,patientA,pa,proposal]));
  assert.equal((await sql('select status from session_sections where id=$1',[section]))[0].status,'draft');
  await asUser(a, () => sql("update session_sections set content='Edited reviewed draft' where id=$1",[section]));
  await rejected(a,'select approve_clinical_section($1,1)',[section]);
  await rejected(a,'select approve_clinical_section($1,null)',[section],/expected version/);
  await rejected(a,"update session_sections set status='approved',approved_by=$1,approved_at=now() where id=$2",[a,section]);
  await rejected(b,'select approve_clinical_section($1,2)',[section]);
  await asUser(a, () => sql('select approve_clinical_section($1,2)',[section]));
  await rejected(a,"update session_sections set content='Replacement' where id=$1",[section]);
  assert.equal((await sql('select transcript from clinical_inputs where id=$1',[input]))[0].transcript,'Fictional raw input');
});

test('unknown risk stays NULL, separately from assessed false', async () => {
  await asUser(a, () => sql('insert into risk_assessments(session_id,patient_id,practice_id,suicidal_ideation) values($1,$2,$3,false)',[session,patientA,pa]));
  const [risk] = await asUser(a, () => sql('select suicidal_ideation,intent,plan,assessed_by from risk_assessments'));
  assert.equal(risk.suicidal_ideation,false); assert.equal(risk.intent,null); assert.equal(risk.plan,null); assert.equal(risk.assessed_by,a);
});

test('failed session completion rolls back; approved required sections complete atomically', async () => {
  const events = (await sql("select * from audit_events where event_type='session_completed'")).length;
  await rejected(a,'select complete_clinical_session($1,null)',[session],/expected version/);
  await rejected(a,'select complete_clinical_session($1,1)',[session]);
  assert.equal((await sql('select status from clinical_sessions where id=$1',[session]))[0].status,'draft');
  assert.equal((await sql("select * from audit_events where event_type='session_completed'")).length,events);
  for (const type of ['psychiatric_interview','risk_assessment','clinical_assessment','treatment_plan','next_review']) {
    const [{id}] = await asUser(a, () => sql('insert into session_sections(session_id,patient_id,practice_id,section_type,content) values($1,$2,$3,$4,\'Reviewed fictional content\') returning id',[session,patientA,pa,type]));
    await asUser(a, () => sql('select approve_clinical_section($1,1)',[id]));
  }
  await asUser(a, () => sql("insert into appointments(practice_id,patient_id,clinician_id,session_id,scheduled_start,scheduled_end,appointment_type) values($1,$2,$3,$4,now(),now()+interval '50 minutes','initial_assessment')",[pa,patientA,a,session]));
  // Inject a failure AFTER the session UPDATE to prove transaction rollback, not just prevalidation.
  await db.exec("create function private.test_fail() returns trigger language plpgsql as $$ begin raise exception 'Injected appointment failure'; end $$; create trigger test_fail before update on appointments for each row execute function private.test_fail();");
  await rejected(a,'select complete_clinical_session($1,1)',[session],/Injected appointment failure/);
  assert.equal((await sql('select status from clinical_sessions where id=$1',[session]))[0].status,'draft');
  assert.equal((await sql("select * from audit_events where event_type='session_completed'")).length,events);
  await db.exec('drop trigger test_fail on appointments; drop function private.test_fail();');
  await asUser(a, () => sql('select complete_clinical_session($1,1)',[session]));
  assert.equal((await sql('select status from clinical_sessions where id=$1',[session]))[0].status,'completed');
  assert.equal((await sql('select status from appointments where session_id=$1',[session]))[0].status,'completed');
  assert.equal((await sql("select * from audit_events where event_type='session_completed'")).length,events+1);
});

test('completed session and child records cannot be silently replaced or extended', async () => {
  await rejected(a,'update clinical_sessions set started_at=now() where id=$1',[session]);
  await rejected(a,"update risk_assessments set suicidal_ideation=true where session_id=$1",[session]);
  await rejected(a,"insert into session_sections(session_id,patient_id,practice_id,section_type,content) values($1,$2,$3,'symptoms','late overwrite')",[session,patientA,pa]);
  await rejected(a,'select complete_clinical_session($1,2)',[session]);
});

test('medication changes retain original doses and cannot be forged or deleted', async () => {
  const [{id}] = await asUser(a, () => sql("insert into patient_medications(patient_id,practice_id,medication_name,dose,unit,frequency,started_at) values($1,$2,'Sertraline',50,'mg','morning','2026-06-13') returning id",[patientA,pa]));
  await asUser(a, () => sql('update patient_medications set dose=100 where id=$1',[id]));
  const events = await sql('select previous_state,new_state from medication_events where medication_id=$1 order by occurred_at',[id]);
  assert.equal(events.length,2); assert.equal(events[0].new_state.dose,50);
  assert.equal(events[1].previous_state.dose,50); assert.equal(events[1].new_state.dose,100);
  await rejected(a,'delete from medication_events where medication_id=$1',[id]);
  assert.deepEqual(await asUser(b, () => sql('select * from medication_events')),[]);
});

test('audit records carry actor and IDs, are tenant-scoped, append-only, and omit clinical text', async () => {
  const rows = await asUser(a, () => sql('select actor_user_id,practice_id,metadata from audit_events'));
  assert.ok(rows.length > 5);
  for (const row of rows) { assert.equal(row.actor_user_id,a); assert.equal(row.practice_id,pa); assert.deepEqual(row.metadata,{}); }
  await rejected(a,"insert into audit_events(practice_id,event_type,entity_type,entity_id) values($1,'fake','patients',$2)",[pa,patientA]);
  await rejected(a,'delete from audit_events');
});

test('invitations are inaccessible even to clinicians; no anonymous RPC or private schema access', async () => {
  await rejected(a,'select * from private.assessment_invitations');
  const grants = await sql("select routine_name from information_schema.role_routine_grants where grantee in ('PUBLIC','anon') and routine_schema='private'");
  assert.equal(grants.length,0);
  await db.exec('begin; set local role anon;');
  await assert.rejects(sql('select complete_clinical_session($1,1)',[session]),/permission denied/);
  await db.exec('rollback');
});

test('cross-practice reads are denied on every patient-bearing table', async () => {
  const tables = await sql("select table_name from information_schema.columns where table_schema='public' and column_name='patient_id'");
  for (const {table_name} of tables) {
    assert.deepEqual(await asUser(b, () => sql(`select * from public.${table_name} where patient_id=$1`,[patientA])),[],table_name);
  }
});

test('insert cannot bypass session or section approval; creator identity cannot be forged', async () => {
  await rejected(a,"insert into clinical_sessions(patient_id,practice_id,session_type,scheduled_at,status,completed_at) values($1,$2,'follow_up',now(),'completed',now())",[patientA,pa]);
  const [{id}] = await asUser(a, () => sql("insert into clinical_sessions(patient_id,practice_id,session_type,scheduled_at) values($1,$2,'follow_up',now()) returning id",[patientA,pa]));
  await rejected(a,"insert into session_sections(session_id,patient_id,practice_id,section_type,content,status,approved_by,approved_at) values($1,$2,$3,'mse','skip review','approved',$4,now())",[id,patientA,pa,a]);
  await rejected(a,"insert into patients(practice_id,first_name,created_by) values($1,'Forged',$2)",[pa,b]);
  await asUser(a, () => sql('update clinical_sessions set started_at=now() where id=$1',[id]));
  assert.equal((await sql('select version from clinical_sessions where id=$1',[id]))[0].version,2);
});

test('development seed requires opt-in, uses fictional isolated tenancy and keeps unknowns unknown', async () => {
  const seed = await readFile('supabase/seed.sql','utf8');
  await assert.rejects(db.exec(seed),/explicit opt-in/);
  const demoUser = '10000000-0000-4000-8000-000000000004';
  await sql('insert into auth.users(id) values($1)',[demoUser]);
  await db.exec('begin');
  await sql("select set_config('noima.allow_demo','yes',true),set_config('noima.demo_user_id',$1,true)",[demoUser]);
  try { await db.exec(seed); await db.exec('commit'); }
  catch (error) { await db.exec('rollback'); throw new Error(`${error.message} ${error.where ?? ''}`); }
  const patients = await asUser(demoUser, () => sql('select id,first_name,date_of_birth from patients'));
  assert.equal(patients.length,4); assert.ok(patients.every(p=>p.date_of_birth===null));
  const maria = patients.find(p=>p.first_name==='Μαρία').id;
  const kostas = patients.find(p=>p.first_name==='Κώστας').id;
  assert.equal((await asUser(demoUser, () => sql('select * from clinical_sessions where patient_id=$1',[maria]))).length,3);
  assert.equal((await asUser(demoUser, () => sql('select * from clinical_sessions where patient_id=$1',[kostas]))).length,0);
  assert.equal((await asUser(demoUser, () => sql('select * from risk_assessments where patient_id=$1',[kostas]))).length,0);
  const scores = await asUser(demoUser, () => sql('select total_score from psychometric_assessments order by total_score'));
  assert.deepEqual(scores.map(x=>Number(x.total_score)),[5,7,8,11,11,14,14,17]);
  assert.equal((await asUser(demoUser, () => sql('select * from psychometric_responses'))).length,0);
  const doses = await asUser(demoUser, () => sql("select me.new_state->>'dose' dose from medication_events me join patient_medications m on m.id=me.medication_id where m.medication_name='Sertraline' order by me.effective_on"));
  assert.deepEqual(doses.map(x=>Number(x.dose)),[25,50,100]);
  assert.equal((await asUser(a, () => sql('select * from patients where id=$1',[maria]))).length,0);
});

test('section dictation cannot produce a proposal for another section', async () => {
  const [{id:s}] = await asUser(a, () => sql("insert into clinical_sessions(patient_id,practice_id,session_type,scheduled_at) values($1,$2,'follow_up',now()) returning id",[patientA,pa]));
  const [{id:input}] = await asUser(a, () => sql("insert into clinical_inputs(session_id,patient_id,practice_id,section_type,transcript,origin) values($1,$2,$3,'mse','Scoped transcript','local_transcript') returning id",[s,patientA,pa]));
  await rejected(a,"insert into clinical_proposals(input_id,session_id,patient_id,practice_id,section_type,content,provider) values($1,$2,$3,$4,'treatment_plan','Wrong section','mock')",[input,s,patientA,pa],/scope mismatch/);
  await asUser(a, () => sql("insert into clinical_proposals(input_id,session_id,patient_id,practice_id,section_type,content,provider) values($1,$2,$3,$4,'mse','Correct section','mock')",[input,s,patientA,pa]));
});


test('fictional tester calendar links to patient IDs and future medication changes do not apply early', async () => {
  const tester = '50000000-0000-4000-8000-000000000001';
  await sql('select demo_tester_bootstrap($1)', [tester]);
  await sql('select demo_seed_maria_record($1)', [tester]);
  const [{count:patients}] = await sql('select count(*)::int count from demo_patients where tester_id=$1', [tester]);
  const [{count:events}] = await sql('select count(*)::int count from demo_calendar_events where tester_id=$1 and patient_id is not null', [tester]);
  const [{count:completed}] = await sql("select count(*)::int count from demo_sessions where tester_id=$1 and status='completed'", [tester]);
  assert.equal(patients,4);
  assert.equal(events,4);
  assert.equal(completed,1);

  const [{id:medication,dose:before}] = await sql("select id,dose from demo_medications where tester_id=$1 and medication_name='Sertraline' limit 1",[tester]);
  await sql("select demo_medication_change($1,$2,null,150,'mg','1× πρωί',current_date+1,'future test')",[tester,medication]);
  const [{dose:after}] = await sql('select dose from demo_medications where id=$1',[medication]);
  const [{dose:future}] = await sql("select (new_state->>'dose')::numeric dose from demo_medication_events where medication_id=$1 and event_type='changed' order by created_at desc limit 1",[medication]);
  assert.equal(Number(after),Number(before));
  assert.equal(Number(future),150);
});

test('canonical proposal requires explicit approval, preserves provenance and rejects stale/new-section races', async () => {
 const t='60000000-0000-4000-8000-000000000001';await sql('select demo_tester_bootstrap($1)',[t]);
 const [p]=await sql('select id from demo_patients where tester_id=$1 limit 1',[t]);
 const [s]=await sql("select * from demo_session_start($1,$2,'initial_assessment')",[t,p.id]);
 const [entry]=await sql("select * from demo_proposal_create($1,$2,'assessment',$3,$4,'test-model')",[t,s.id,'Δεν ρώτησα για αυτοκτονικό ιδεασμό',JSON.stringify({clinical_text:'Δεν διερευνήθηκε αυτοκτονικός ιδεασμός.',facts:[]})]);
 assert.equal((await sql('select * from demo_session_sections where session_id=$1',[s.id])).length,0);
 const [section]=await sql("select * from demo_proposal_approve($1,$2,$3,'replace',null)",[t,entry.id,'Δεν διερευνήθηκε αυτοκτονικός ιδεασμός.']);
 assert.equal(section.source,'ai_proposal');
 const [retry]=await sql("select * from demo_proposal_approve($1,$2,$3,'replace',null)",[t,entry.id,'Δεν διερευνήθηκε αυτοκτονικός ιδεασμός.']);assert.equal(retry.version,section.version);
 await assert.rejects(sql("select demo_session_save_section($1,$2,'assessment','stale','manual',null)",[t,s.id]),/stale_section/);
 const [e]=await sql('select * from demo_clinical_entries where id=$1',[entry.id]);assert.equal(e.approved_by,t);assert.equal(e.transcript,'Δεν ρώτησα για αυτοκτονικό ιδεασμό');assert.equal(e.section_version,section.version);
 await assert.rejects(sql('select demo_clinical_approve($1,$2)',[entry.id,'bad']),/proposal_not_found/);
 await assert.rejects(sql("update demo_clinical_entries set approved_text='rewritten' where id=$1",[entry.id]),/immutable_record/);
 await assert.rejects(sql("select demo_proposal_create($1,$2,'assessment','raw',null,'test')",[t,s.id]),/invalid_proposal/);
 await assert.rejects(sql("select demo_proposal_approve($1,$2,'different','replace',1)",[t,entry.id]),/already_approved/);
});

test('finalization is idempotent, immutable and supports append-only idempotent addenda', async () => {
 const t='60000000-0000-4000-8000-000000000002';await sql('select demo_tester_bootstrap($1)',[t]);const [p]=await sql('select id from demo_patients where tester_id=$1 limit 1',[t]);const [s]=await sql("select * from demo_session_start($1,$2,'initial_assessment')",[t,p.id]);
 await assert.rejects(sql('select demo_session_finalize($1,$2,1)',[t,s.id]),/missing_sections/);
 for(const k of ['interview','mse','assessment','plan','review'])await sql("select demo_session_save_section($1,$2,$3,'Documented','manual',null)",[t,s.id,k]);
 await sql('select demo_session_save_risk($1,$2,$3,null)',[t,s.id,JSON.stringify({suicidal_ideation:'unknown'})]);
 const [current]=await sql('select version from demo_sessions where id=$1',[s.id]);
 await assert.rejects(sql('select demo_session_finalize($1,$2,1)',[t,s.id]),/stale_session/);
 const [done]=await sql('select * from demo_session_finalize($1,$2,$3)',[t,s.id,current.version]);
 const [retry]=await sql('select * from demo_session_finalize($1,$2,$3)',[t,s.id,current.version]);assert.equal(done.completed_at.toISOString(),retry.completed_at.toISOString());assert.equal(done.version,retry.version);
 await assert.rejects(sql("select demo_session_save_section($1,$2,'assessment','changed','manual',1)",[t,s.id]),/session_unavailable/);
 await assert.rejects(sql("update demo_session_sections set content='bad' where session_id=$1",[s.id]),/immutable_record/);
 const args=[t,s.id,'60000000-0000-4000-8000-000000000003','correction','Typo','Corrected spelling'];
 const [a]=await sql('select * from demo_addendum_create($1,$2,$3,$4,$5,$6)',args);const [b]=await sql('select * from demo_addendum_create($1,$2,$3,$4,$5,$6)',args);assert.equal(a.id,b.id);
 await assert.rejects(sql("update demo_session_addenda set content='bad' where id=$1",[a.id]),/immutable_record/);
});

test('psychometric links isolate the response surface, score server-side and preserve longitudinal assignments', async () => {
 const t='70000000-0000-4000-8000-000000000001';await sql('select demo_tester_bootstrap($1)',[t]);const [p]=await sql('select id from demo_patients where tester_id=$1 limit 1',[t]);const token='a'.repeat(64),id='70000000-0000-4000-8000-000000000002';
 await sql("select demo_assessment_assign($1,$2,null,$3,'PHQ-9',$4)",[t,p.id,id,token]);
 const [{demo_assessment_open:opened}]=await sql('select demo_assessment_open($1)',[token]);assert.equal(opened.status,'opened');assert.equal(opened.patient_id,undefined);assert.equal(opened.tester_id,undefined);
 await assert.rejects(sql('select demo_assessment_submit($1,$2)',[token,JSON.stringify([3,3])]),/invalid_answers/);
 await assert.rejects(sql('select demo_assessment_submit($1,null)',[token]),/invalid_answers/);
 await assert.rejects(sql('select demo_assessment_submit($1,$2)',[token,'{}']),/invalid_answers/);
 await assert.rejects(sql('select demo_assessment_submit($1,$2)',[token,JSON.stringify([3,3,3,3,3,3,3,3,4])]),/invalid_answers/);
 const answers=[0,1,2,3,0,1,2,3,1];await sql('select demo_assessment_submit($1,$2)',[token,JSON.stringify(answers)]);await sql('select demo_assessment_submit($1,$2)',[token,JSON.stringify(answers)]);
 await assert.rejects(sql('select demo_assessment_submit($1,$2)',[token,JSON.stringify(Array(9).fill(0))]),/already_completed/);
 const [{demo_assessment_list:list}]=await sql('select demo_assessment_list($1,$2)',[t,p.id]);assert.equal(list[0].score,13);assert.equal(list[0].item9_review,true);assert.equal(list[0].token_hash,undefined);
 assert.equal((await sql('select * from demo_risk_assessments where patient_id=$1',[p.id])).length,0);
 const token2='b'.repeat(64),id2='70000000-0000-4000-8000-000000000003';await sql("select demo_assessment_assign($1,$2,null,$3,'PHQ-9',$4)",[t,p.id,id2,token2]);await sql('select demo_assessment_revoke($1,$2)',[t,id2]);await assert.rejects(sql('select demo_assessment_open($1)',[token2]),/link_unavailable/);
 const token3='c'.repeat(64),id3='70000000-0000-4000-8000-000000000004';await sql("select demo_assessment_assign($1,$2,null,$3,'GAD-7',$4)",[t,p.id,id3,token3]);await sql("update private.demo_assessments set expires_at=now()-interval '1 day' where id=$1",[id3]);await assert.rejects(sql('select demo_assessment_submit($1,$2)',[token3,JSON.stringify(Array(7).fill(0))]),/link_expired/);
 await db.exec('begin; set local role anon;');await assert.rejects(sql('select * from private.demo_assessments'),/permission denied/);await db.exec('rollback');
 const token4='d'.repeat(64),id4='70000000-0000-4000-8000-000000000005';
 await sql("select demo_assessment_assign($1,$2,null,$3,'GAD-7',$4)",[t,p.id,id4,token4]);
 await sql('select demo_assessment_submit($1,$2)',[token4,JSON.stringify(Array(7).fill(2))]);
 const [{score,item9_review}]=await sql('select score,item9_review from private.demo_assessments where id=$1',[id4]);assert.equal(score,14);assert.equal(item9_review,false);
});

test('medication timeline derives current/future state without bootstrap and preserves cancellations and backdated corrections', async () => {
 const t='80000000-0000-4000-8000-000000000001';await sql('select demo_tester_bootstrap($1)',[t]);const [p]=await sql('select id from demo_patients where tester_id=$1 limit 1',[t]);
 const [m]=await sql("select * from demo_medication_start($1,$2,null,'Fictional med',100,'mg','daily',current_date-10,'baseline')",[t,p.id]);
 await sql("select demo_medication_event_write($1,$2,null,'changed',150,'mg','daily',current_date+2,'Monday',2,null,false)",[t,m.id]);
 await assert.rejects(sql("select demo_medication_event_write($1,$2,null,'stopped',null,null,null,current_date+4,'Wednesday',2,null,false)",[t,m.id]),/stale_medication/);
 await sql("select demo_medication_event_write($1,$2,null,'stopped',null,null,null,current_date+4,'Wednesday',3,null,false)",[t,m.id]);
 const state=async offset=>(await sql('select demo_medication_state($1,current_date+$2::int) state',[m.id,offset]))[0].state;
 assert.equal((await state(0)).dose,100);assert.equal((await state(3)).dose,150);assert.equal((await state(5)).status,'stopped');
 const [e]=await sql("select * from demo_medication_events where medication_id=$1 and event_type='changed'",[m.id]);
 await sql("select demo_medication_event_write($1,$2,null,'changed',125,'mg','daily',current_date+2,'revised plan',4,$3,false)",[t,m.id,e.id]);
 assert.equal((await state(0)).dose,100);assert.equal((await state(3)).dose,125);assert.equal((await state(5)).status,'stopped');
 const [stop]=await sql("select * from demo_medication_events where medication_id=$1 and event_type='stopped'",[m.id]);
 await sql("select demo_medication_event_write($1,$2,null,'stopped',null,null,null,current_date+4,'cancel stop',5,$3,true)",[t,m.id,stop.id]);assert.equal((await state(5)).status,'active');
 await sql("select demo_medication_event_write($1,$2,null,'changed',75,'mg','daily',current_date-2,'backdated correction',6,null,false)",[t,m.id]);assert.equal((await state(0)).dose,75);assert.equal((await state(3)).dose,125);
 assert.equal((await sql('select * from demo_medication_event_revisions where event_id=$1',[e.id])).length,1);
 await assert.rejects(sql("update demo_medication_events set reason='rewrite' where id=$1",[e.id]),/immutable_record/);
 const [future]=await sql("select * from demo_medication_start($1,$2,null,'Future med',50,'mg','daily',current_date+10,'planned')",[t,p.id]);const [{state:futureState}]=await sql('select demo_medication_state($1,current_date) state',[future.id]);assert.equal(futureState.status,'planned');
 const [start]=await sql("select id from demo_medication_events where medication_id=$1",[future.id]);
 await sql("select demo_medication_event_write($1,$2,null,'started',50,'mg','daily',current_date+10,'cancel future start',2,$3,true)",[t,future.id,start.id]);
 assert.equal((await sql('select demo_medication_state($1,current_date+20) state',[future.id]))[0].state.status,'cancelled');
 await assert.rejects(sql("select demo_medication_event_write($1,$2,null,'changed',90,'mg','daily',current_date+2,'same day',7,null,false)",[t,m.id]),/event_date_conflict/);
 assert.equal((await state(3)).dose,125);
});

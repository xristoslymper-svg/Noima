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

test('every table has RLS; anonymous reads are limited to the three fictional demo tables', async () => {
  const tables = await sql("select c.relname,c.relrowsecurity from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname in ('public','private') and c.relkind='r'");
  assert.ok(tables.length >= 20);
  for (const table of tables) assert.equal(table.relrowsecurity, true, table.relname);
  await db.exec('begin; set local role anon;');
  await assert.rejects(sql('select * from patients'), /permission denied/);
  await db.exec('rollback');
  const allowed = await sql("select table_name, privilege_type from information_schema.role_table_grants where grantee = 'anon' and table_schema in ('public','private') order by table_name, privilege_type");
  assert.deepEqual(allowed, ['demo_calendar_events', 'demo_clinical_entries', 'demo_patients'].map(table_name => ({ table_name, privilege_type: 'SELECT' })));
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

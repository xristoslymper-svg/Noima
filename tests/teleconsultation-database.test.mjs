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
    create schema auth; create table auth.users(id uuid primary key, email text, email_confirmed_at timestamptz, deleted_at timestamptz, banned_until timestamptz);
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

test('teleconsultation notes persist in the same canonical visit across reload and registration, with stale and foreign writes rejected',async()=>{
 const owner='61600000-0000-4000-8000-000000000126';
 await sql('insert into auth.users(id) values($1)',[owner]);
 await sql("insert into private.pilot_members(user_id,full_name) values($1,'Tele notes fixture')",[owner]);
 const [{identity}]=await asUser(owner,()=>sql('select pilot_identity() identity'));const t=identity.workspace_id;
 await asUser(owner,()=>sql('select demo_tester_bootstrap($1)',[t]));
 const [patient]=await asUser(owner,()=>sql("select * from demo_patient_create_v2($1,'TEST Tele notes')",[t]));
 const [visit]=await asUser(owner,()=>sql("select * from demo_session_start($1,$2,'follow_up')",[t,patient.id]));
 const value={transcript:'Σημειώσεις τηλεσυνεδρίας',clinical_state_summary:'Κλινική εικόνα',treatment_decision:'Απόφαση',next_review_focus:'Επανέλεγχος',pinned_context:'',adherence:'',source:'manual'};
 const [saved]=await asUser(owner,()=>sql('select * from demo_closure_save($1,$2,$3,0)',[t,visit.id,JSON.stringify(value)]));
 assert.equal(saved.id,visit.id);assert.equal(saved.patient_id,patient.id);assert.equal(saved.status,'draft');
 const [reloaded]=await asUser(owner,()=>sql('select * from demo_sessions where id=$1',[visit.id]));
 assert.equal(reloaded.closure_draft.transcript,value.transcript);assert.equal(reloaded.closure_version,saved.closure_version);
 await rejected(owner,'select demo_closure_save($1,$2,$3,0)',[t,visit.id,JSON.stringify({...value,transcript:'Stale overwrite'})],/stale_closure/);
 await rejected(b,'select demo_closure_save($1,$2,$3,$4)',[t,visit.id,JSON.stringify(value),saved.closure_version],/pilot_not_authorized/);
 assert.equal((await sql('select count(*)::int n from demo_sessions where patient_id=$1',[patient.id]))[0].n,1);
 await asUser(owner,()=>sql("select demo_session_save_section($1,$2,'mse','Σημερινή παρατήρηση','manual',null)",[t,visit.id]));
 await asUser(owner,()=>sql('select demo_session_save_risk($1,$2,$3,null)',[t,visit.id,JSON.stringify({suicidal_ideation:'negative'})]));
 const [fresh]=await asUser(owner,()=>sql('select * from demo_sessions where id=$1',[visit.id]));
 const [completed]=await asUser(owner,()=>sql('select * from demo_closure_finalize($1,$2,$3,true,$4)',[t,visit.id,fresh.version,saved.closure_version]));
 assert.equal(completed.id,visit.id);assert.equal(completed.status,'completed');assert.equal(completed.continuity.transcript,value.transcript);
 const [folder]=await asUser(owner,()=>sql('select * from demo_sessions where id=$1',[visit.id]));
 assert.equal(folder.continuity.transcript,value.transcript);assert.equal(folder.closure_draft,null);
 await rejected(owner,'select demo_closure_save($1,$2,$3,$4)',[t,visit.id,JSON.stringify(value),saved.closure_version],/session_unavailable/);
});

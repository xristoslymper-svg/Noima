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

test('pilot invitations require confirmed identity, are single-user, and never grant access from metadata',async()=>{
 const code='fixture-invitation-A';
 await sql("update auth.users set email='a@example.invalid',email_confirmed_at=now() where id=$1",[a]);
 await sql("insert into private.pilot_invitations(token_hash,email) values(encode(sha256(convert_to($1,'UTF8')),'hex'),'a@example.invalid')",[code]);
 await rejected(b,'select pilot_redeem_invitation($1,$2)',[code,'Dr B'],/verified_email_required|invalid_invitation/);
 const [{identity}]=await asUser(a,()=>sql('select pilot_redeem_invitation($1,$2) identity',[code,'Dr A']));
 assert.ok(identity.workspace_id);assert.equal(identity.full_name,'Dr A');
 await sql("update auth.users set email='b@example.invalid',email_confirmed_at=now() where id=$1",[b]);
 await rejected(b,'select pilot_redeem_invitation($1,$2)',[code,'Dr B'],/invalid_invitation/);
 assert.deepEqual((await asUser(b,()=>sql('select pilot_identity() identity')))[0],{identity:null});
});

test('pilot table RLS and every public tester RPC deny another owner and anonymous callers',async()=>{
 const [{identity:ia}]=await asUser(a,()=>sql('select pilot_identity() identity'));
 await sql("insert into private.pilot_members(user_id,full_name) values($1,'Dr B')",[b]);
 const [{identity:ib}]=await asUser(b,()=>sql('select pilot_identity() identity'));
 await asUser(a,()=>sql('select demo_tester_bootstrap($1)',[ia.workspace_id]));
 await asUser(b,()=>sql('select demo_tester_bootstrap($1)',[ib.workspace_id]));
 assert.deepEqual(await asUser(a,()=>sql('select id from demo_patients')),[]);
 await asUser(a,()=>sql("select demo_patient_create_v2($1,'TEST A','Manual entry')",[ia.workspace_id]));
 await asUser(b,()=>sql("select demo_patient_create_v2($1,'TEST B','Manual entry')",[ib.workspace_id]));
 const patients=await asUser(a,()=>sql('select id,tester_id from demo_patients'));
 assert.ok(patients.length>0);assert.ok(patients.every(p=>p.tester_id===ia.workspace_id));
 assert.deepEqual(await asUser(b,()=>sql('select id from demo_patients where tester_id=$1',[ia.workspace_id])),[]);
 await rejected(b,'select demo_tester_bootstrap($1)',[ia.workspace_id],/pilot_not_authorized/);
 await rejected(b,'select demo_assessment_list($1,$2)',[ia.workspace_id,patients[0].id],/pilot_not_authorized/);
 await rejected(b,'select demo_calendar_reminders($1)',[ia.workspace_id],/pilot_not_authorized/);
 await rejected(b,'select demo_history_save($1,$2,$3::jsonb,null)',[ia.workspace_id,patients[0].id,'{}'],/pilot_not_authorized/);
 await db.exec('begin;set local role anon;');
 try{await assert.rejects(sql('select demo_tester_bootstrap($1)',[ia.workspace_id]),/permission denied/)}finally{await db.exec('rollback')}
 const unsafe=await sql("select p.proname from pg_proc p where p.pronamespace='public'::regnamespace and p.proname like 'demo_%' and 'p_tester'=any(p.proargnames) and (has_function_privilege('anon',p.oid,'EXECUTE') or not has_function_privilege('authenticated',p.oid,'EXECUTE'))");
 assert.deepEqual(unsafe,[]);
 const exposed=await sql("select routine_name from information_schema.role_routine_grants where routine_schema='private' and routine_name like 'pilot_impl_%' and grantee in ('PUBLIC','anon','authenticated')");assert.deepEqual(exposed,[]);
});

test('pilot reset archives rather than deletes and restore recovers the original workspace',async()=>{
 const [{identity:old}]=await asUser(a,()=>sql('select pilot_identity() identity'));
 const [p]=await asUser(a,()=>sql("select (demo_patient_create_v2($1,'TEST Durable',$2)).id id",[old.workspace_id,'Fixture']));
 const id=p.id;
 const [{identity:newSpace}]=await asUser(a,()=>sql('select pilot_reset_workspace(false) identity'));
 assert.notEqual(old.workspace_id,newSpace.workspace_id);assert.equal(newSpace.can_restore,true);
 assert.deepEqual(await asUser(a,()=>sql('select id from demo_patients where id=$1',[id])),[]);
 assert.equal((await sql('select id from demo_patients where id=$1',[id])).length,1);
 await rejected(a,'select demo_assessment_list($1,$2)',[old.workspace_id,id],/pilot_not_authorized/);
 const [{identity:restored}]=await asUser(a,()=>sql('select pilot_reset_workspace(true) identity'));
 assert.equal(restored.workspace_id,old.workspace_id);assert.equal((await asUser(a,()=>sql('select id from demo_patients where id=$1',[id]))).length,1);
});

test('pilot feedback records verified actor and stays private',async()=>{
 await asUser(a,()=>sql("select pilot_feedback_submit('bug','TEST fictional report','/calendar')"));
 const [row]=await sql("select user_id,message from private.pilot_feedback where user_id=$1",[a]);assert.equal(row.user_id,a);assert.equal(row.message,'TEST fictional report');
 await rejected(b,'select * from private.pilot_feedback',[],/permission denied/);
 await rejected(colleague,"select pilot_feedback_submit('bug','TEST unauthorized report','/calendar')",[],/pilot_not_authorized/);
});

test('owner can issue open invitations; testers cannot issue invites, reused/revoked invitations fail',async()=>{
 await sql('update private.pilot_members set can_invite=true where user_id=$1',[a]);
 const [{invite}]=await asUser(a,()=>sql('select pilot_invite_create(null) invite'));assert.match(invite.code,/^[a-f0-9]{64}$/);
 await rejected(b,'select pilot_invite_create(null)',[],/owner_required/);
 await sql("update auth.users set email='colleague@example.invalid',email_confirmed_at=now() where id=$1",[colleague]);
 const [{identity}]=await asUser(colleague,()=>sql('select pilot_redeem_invitation($1,$2) identity',[invite.code,'Tester C']));assert.equal(identity.can_invite,false);
 await rejected(b,'select pilot_redeem_invitation($1,$2)',[invite.code,'Tester B'],/invalid_invitation/);
 const [{invite:revocable}]=await asUser(a,()=>sql('select pilot_invite_create(null) invite'));
 const [{list}]=await asUser(a,()=>sql('select pilot_invite_list() list'));
 const pending=list.find(i=>!i.redeemed_at&&!i.revoked_at);assert.ok(pending);
 await asUser(a,()=>sql('select pilot_invite_revoke($1)',[pending.id]));
 await rejected(b,'select pilot_redeem_invitation($1,$2)',[revocable.code,'Tester B'],/invalid_invitation/);
 await rejected(colleague,'select pilot_invite_list()',[],/owner_required/);
});

test('self registration needs a verified email, creates an empty private workspace and cannot reactivate a suspended account',async()=>{
 const uid='10000000-0000-4000-8000-000000000099';
 await sql("insert into auth.users(id,email) values($1,'self@example.invalid')",[uid]);
 await rejected(uid,"select pilot_join('Self Tester')",[],/verified_email_required/);
 await sql('update auth.users set email_confirmed_at=now() where id=$1',[uid]);
 const [{identity}]=await asUser(uid,()=>sql("select pilot_join('Self Tester') identity"));assert.ok(identity.workspace_id);
 await asUser(uid,()=>sql('select demo_tester_bootstrap($1)',[identity.workspace_id]));
 assert.deepEqual(await asUser(uid,()=>sql('select id from demo_patients')),[]);
 await sql('update private.pilot_members set active=false where user_id=$1',[uid]);
 assert.deepEqual((await asUser(uid,()=>sql("select pilot_join('Self Tester') identity")))[0],{identity:null});
});

test('three self-registered doctors retain isolated empty spaces, stable identity and no administrative privileges',async()=>{
 const doctors=['10000000-0000-4000-8000-000000000091','10000000-0000-4000-8000-000000000092','10000000-0000-4000-8000-000000000093'];
 const spaces=[],patients=[];
 for(const [index,doctor] of doctors.entries()){
  await sql('insert into auth.users(id,email,email_confirmed_at) values($1,$2,now())',[doctor,`fictional-doctor-${index}@example.invalid`]);
  const [{identity}]=await asUser(doctor,()=>sql('select pilot_join($1) identity',[`Fictional Doctor ${index}`]));
  spaces.push(identity.workspace_id);assert.equal(identity.can_invite,false);
  assert.deepEqual(await asUser(doctor,()=>sql('select id from demo_patients')),[]);
  const [{identity:again}]=await asUser(doctor,()=>sql('select pilot_join($1) identity',['Changed label']));
  assert.equal(again.workspace_id,identity.workspace_id);assert.equal(again.full_name,identity.full_name);
  const [patient]=await asUser(doctor,()=>sql("select (demo_patient_create_v2($1,$2,'Fictional fixture')).id id",[identity.workspace_id,`TEST Doctor ${index} Patient`]));
  patients.push(patient.id);
 }
 assert.equal(new Set(spaces).size,3);
 for(const [index,doctor] of doctors.entries()){
  const visible=await asUser(doctor,()=>sql('select id from demo_patients'));
  assert.deepEqual(visible.map(row=>row.id),[patients[index]]);
  for(const [other,space] of spaces.entries())if(other!==index){
   await rejected(doctor,'select demo_assessment_list($1,$2)',[space,patients[other]],/pilot_not_authorized/);
   await rejected(doctor,"select demo_history_save($1,$2,'{}'::jsonb,null)",[space,patients[other]],/pilot_not_authorized/);
  }
  await rejected(doctor,'select pilot_invite_create(null)',[],/owner_required/);
 }
 await sql('update private.pilot_members set active=false where user_id=$1',[doctors[0]]);
 assert.deepEqual(await asUser(doctors[0],()=>sql('select id from demo_patients')),[]);
 await rejected(doctors[0],'select demo_assessment_list($1,$2)',[spaces[0],patients[0]],/pilot_not_authorized/);
});

test('recurring appointments retain Athens wall time across DST, are canonical and reject a conflicting series atomically',async()=>{
 const t='80000000-0000-4000-8000-000000000001';await sql('select demo_tester_bootstrap($1)',[t]);
 const [patient]=await sql('select id from demo_patients where tester_id=$1 limit 1',[t]);
 const [row]=await sql("select demo_calendar_create_recurring($1,$2,'2099-10-01 09:00 Europe/Athens','2099-10-01 09:50 Europe/Athens','follow_up',1,8) as series",[t,patient.id]);
 assert.equal(row.series.events.length,8);assert.ok(row.series.events.every(e=>e.series_id===row.series.series_id&&e.patient_id===patient.id));
 const times=await sql("select to_char(scheduled_start at time zone 'Europe/Athens','HH24:MI') as time from demo_calendar_events where series_id=$1",[row.series.series_id]);assert.ok(times.every(e=>e.time==='09:00'));
 const [{count:before}]=await sql('select count(*)::int count from demo_calendar_events where tester_id=$1',[t]);
 await assert.rejects(sql("select demo_calendar_create_recurring($1,$2,'2099-09-24 09:00 Europe/Athens','2099-09-24 09:50 Europe/Athens','follow_up',1,8)",[t,patient.id]),/calendar_conflict:01\/10\/2099/);
 assert.equal((await sql('select count(*)::int count from demo_calendar_events where tester_id=$1',[t]))[0].count,before);
 await assert.rejects(sql("select demo_calendar_create_recurring($1,$2,now()+interval '1 year',now()+interval '1 year 50 minutes','follow_up',null,6)",[t,patient.id]),/invalid_recurrence/);
});

test('calendar edits reject stale workspaces, scope future changes, and cancellation can be restored safely',async()=>{
 const t='80000000-0000-4000-8000-000000000002';await sql('select demo_tester_bootstrap($1)',[t]);const [p]=await sql('select id from demo_patients where tester_id=$1 limit 1',[t]);
 const [{series}]=await sql("select demo_calendar_create_recurring($1,$2,'2099-10-01 12:00 Europe/Athens','2099-10-01 12:50 Europe/Athens','follow_up',1,4) as series",[t,p.id]);
 const anchor=series.events[1];const [{revision}]=await sql('select max(updated_at)::text revision from demo_calendar_events where series_id=$1',[series.series_id]);
 const [{event:moved}]=await sql("select demo_calendar_edit($1,'move',$2,$3,'2099-10-08 13:00 Europe/Athens','2099-10-08 13:50 Europe/Athens','future',$4) as event",[t,anchor.id,anchor.updated_at,revision]);
 const members=await sql("select to_char(scheduled_start at time zone 'Europe/Athens','HH24:MI') time from demo_calendar_events where series_id=$1 order by scheduled_start",[series.series_id]);assert.deepEqual(members.map(e=>e.time),['12:00','13:00','13:00','13:00']);
 await assert.rejects(sql("select demo_calendar_edit($1,'cancel',$2,$3) as event",[t,anchor.id,anchor.updated_at]),/stale_calendar/);
 const [{event:cancelled}]=await sql("select demo_calendar_edit($1,'cancel',$2,$3) as event",[t,moved.id,moved.updated_at]);assert.equal(cancelled.status,'cancelled');
 const [{event:restored}]=await sql("select demo_calendar_edit($1,'restore',$2,$3) as event",[t,cancelled.id,cancelled.updated_at]);assert.equal(restored.status,'scheduled');assert.equal(restored.series_id,series.series_id);
 const [{event:cancelAgain}]=await sql("select demo_calendar_edit($1,'cancel',$2,$3) as event",[t,restored.id,restored.updated_at]);
 await sql("select demo_calendar_apply_v2($1,'create',null,$2,null,$3,$4)",[t,p.id,restored.scheduled_start,restored.scheduled_end]);
 await assert.rejects(sql("select demo_calendar_edit($1,'restore',$2,$3) as event",[t,cancelAgain.id,cancelAgain.updated_at]),/calendar_conflict/);
 assert.equal((await sql('select status from demo_calendar_events where id=$1',[cancelAgain.id]))[0].status,'cancelled');
});

test('historical appointments stay valid, cancelled slots are reusable, and active overlaps remain blocked',async()=>{
 const t='80000000-0000-4000-8000-000000000005';await sql('select demo_tester_bootstrap($1)',[t]);const [p]=await sql('select id from demo_patients where tester_id=$1 limit 1',[t]);
 const start=new Date(Date.now()-30*24*60*60*1000).toISOString(),end=new Date(Date.now()-30*24*60*60*1000+60*60*1000).toISOString();
 const [{event:historical}]=await sql("select demo_calendar_apply_v2($1,'create',null,$2,null,$3,$4,'other') event",[t,p.id,start,end]);
 assert.equal(historical.status,'scheduled');assert.equal(historical.appointment_type,'other');
 const [{event:cancelled}]=await sql("select demo_calendar_edit($1,'cancel',$2,$3) event",[t,historical.id,historical.updated_at]);
 const [{event:replacement}]=await sql("select demo_calendar_apply_v2($1,'create',null,$2,null,$3,$4,'follow_up') event",[t,p.id,start,end]);
 assert.equal(cancelled.status,'cancelled');assert.equal(replacement.status,'scheduled');
 await assert.rejects(sql("select demo_calendar_edit($1,'restore',$2,$3)",[t,cancelled.id,cancelled.updated_at]),/calendar_conflict/);
 const adjacentStart=end,adjacentEnd=new Date(Date.parse(end)+30*60*1000).toISOString();
 const [{event:adjacent}]=await sql("select demo_calendar_apply_v2($1,'create',null,$2,null,$3,$4,'other') event",[t,p.id,adjacentStart,adjacentEnd]);
 assert.equal(adjacent.status,'scheduled');
 await assert.rejects(sql("select demo_calendar_apply_v2($1,'create',null,$2,null,$3,$4,'follow_up')",[t,p.id,new Date(Date.parse(start)+15*60*1000).toISOString(),new Date(Date.parse(end)+15*60*1000).toISOString()]),/calendar_conflict/);
});

test('historical recurring appointments keep Athens wall time through DST',async()=>{
 const t='80000000-0000-4000-8000-000000000006';await sql('select demo_tester_bootstrap($1)',[t]);const [p]=await sql('select id from demo_patients where tester_id=$1 limit 1',[t]);
 const [{series}]=await sql("select demo_calendar_create_recurring($1,$2,'2026-09-20 09:00 Europe/Athens','2026-09-20 09:50 Europe/Athens','follow_up',1,8) series",[t,p.id]);
 const times=await sql("select to_char(scheduled_start at time zone 'Europe/Athens','HH24:MI') time from demo_calendar_events where series_id=$1 order by scheduled_start",[series.series_id]);
 assert.equal(times.length,8);assert.ok(times.every(row=>row.time==='09:00'));
});

test('restoring a cancelled series fails atomically when one slot has been rebooked',async()=>{
 const t='80000000-0000-4000-8000-000000000007';await sql('select demo_tester_bootstrap($1)',[t]);const [p]=await sql('select id from demo_patients where tester_id=$1 limit 1',[t]);
 const [{series}]=await sql("select demo_calendar_create_recurring($1,$2,'2099-08-01 10:00 Europe/Athens','2099-08-01 10:50 Europe/Athens','follow_up',1,3) series",[t,p.id]);
 let [{revision}]=await sql('select max(updated_at)::text revision from demo_calendar_events where series_id=$1',[series.series_id]);
 await sql("select demo_calendar_edit($1,'cancel',$2,$3,null,null,'series',$4)",[t,series.events[0].id,series.events[0].updated_at,revision]);
 const [first]=await sql('select updated_at from demo_calendar_events where id=$1',[series.events[0].id]);
 [{revision}]=await sql('select max(updated_at)::text revision from demo_calendar_events where series_id=$1',[series.series_id]);
 await sql("select demo_calendar_apply_v2($1,'create',null,$2,null,$3,$4,'other')",[t,p.id,series.events[1].scheduled_start,series.events[1].scheduled_end]);
 await assert.rejects(sql("select demo_calendar_edit($1,'restore',$2,$3,null,null,'series',$4)",[t,series.events[0].id,first.updated_at,revision]),/calendar_conflict/);
 assert.equal((await sql("select count(*)::int n from demo_calendar_events where series_id=$1 and status='cancelled'",[series.series_id]))[0].n,3);
});

test('non-linear calendar starts never steal an already-linked draft and can attach an unlinked draft',async()=>{
 const t='80000000-0000-4000-8000-000000000004';await sql('select demo_tester_bootstrap($1)',[t]);
 const [{id:p1}]=await sql("select (demo_patient_create_v2($1,'TEST Flow A')).id id",[t]);
 const [{event:e1}]=await sql("select demo_calendar_apply_v2($1,'create',null,$2,null,'2099-12-01 09:00 Europe/Athens','2099-12-01 09:50 Europe/Athens','initial_assessment') event",[t,p1]);
 const [{event:e2}]=await sql("select demo_calendar_apply_v2($1,'create',null,$2,null,'2099-12-01 11:00 Europe/Athens','2099-12-01 11:50 Europe/Athens','follow_up') event",[t,p1]);
 const [started]=await sql('select * from demo_calendar_start_session($1,$2)',[t,e1.id]);
 assert.equal((await sql('select session_id from demo_calendar_events where id=$1',[e1.id]))[0].session_id,started.id);
 await assert.rejects(sql('select * from demo_calendar_start_session($1,$2)',[t,e2.id]),/draft_linked_elsewhere/);
 const [untouched]=await sql('select session_id,status from demo_calendar_events where id=$1',[e2.id]);assert.equal(untouched.session_id,null);assert.equal(untouched.status,'scheduled');

 const [{id:p2}]=await sql("select (demo_patient_create_v2($1,'TEST Flow B')).id id",[t]);
 const [draft]=await sql("select * from demo_session_start($1,$2,'initial_assessment')",[t,p2]);
 const [{event:e3}]=await sql("select demo_calendar_apply_v2($1,'create',null,$2,null,'2099-12-02 09:00 Europe/Athens','2099-12-02 09:50 Europe/Athens','initial_assessment') event",[t,p2]);
 const [linked]=await sql('select * from demo_calendar_start_session($1,$2)',[t,e3.id]);
 assert.equal(linked.id,draft.id);
 assert.equal((await sql('select session_id from demo_calendar_events where id=$1',[e3.id]))[0].session_id,draft.id);

 const [{id:p3}]=await sql("select (demo_patient_create_v2($1,'TEST Flow C')).id id",[t]);
 await sql("select * from demo_session_start($1,$2,'initial_assessment')",[t,p3]);
 const [{event:e4}]=await sql("select demo_calendar_apply_v2($1,'create',null,$2,null,'2099-12-03 09:00 Europe/Athens','2099-12-03 09:50 Europe/Athens','follow_up') event",[t,p3]);
 await assert.rejects(sql('select * from demo_calendar_start_session($1,$2)',[t,e4.id]),/open_draft_conflict/);
 assert.equal((await sql('select session_id from demo_calendar_events where id=$1',[e4.id]))[0].session_id,null);
});

test('a series editor rejects changes to another instance and rolls back conflicts without altering any member',async()=>{
 const t='80000000-0000-4000-8000-000000000003';await sql('select demo_tester_bootstrap($1)',[t]);const [p]=await sql('select id from demo_patients where tester_id=$1 limit 1',[t]);
 const [{series}]=await sql("select demo_calendar_create_recurring($1,$2,'2099-11-01 12:00 Europe/Athens','2099-11-01 12:50 Europe/Athens','follow_up',1,3) as series",[t,p.id]);
 const [{revision:old}]=await sql('select max(updated_at)::text revision from demo_calendar_events where series_id=$1',[series.series_id]);
 await sql("select demo_calendar_edit($1,'move',$2,$3,'2099-11-08 13:00 Europe/Athens','2099-11-08 13:50 Europe/Athens')",[t,series.events[1].id,series.events[1].updated_at]);
 await assert.rejects(sql("select demo_calendar_edit($1,'cancel',$2,$3,null,null,'series',$4)",[t,series.events[0].id,series.events[0].updated_at,old]),/stale_calendar/);
 await sql("select demo_calendar_apply_v2($1,'create',null,$2,null,'2099-11-15 14:00 Europe/Athens','2099-11-15 14:50 Europe/Athens')",[t,p.id]);
 const [{revision}]=await sql('select max(updated_at)::text revision from demo_calendar_events where series_id=$1',[series.series_id]);
 await assert.rejects(sql("select demo_calendar_edit($1,'move',$2,$3,'2099-11-01 14:00 Europe/Athens','2099-11-01 14:50 Europe/Athens','series',$4)",[t,series.events[0].id,series.events[0].updated_at,revision]),/calendar_conflict:15\/11\/2099/);
 assert.equal((await sql("select to_char(scheduled_start at time zone 'Europe/Athens','HH24:MI') time from demo_calendar_events where id=$1",[series.events[0].id]))[0].time,'12:00');
});

test('risk tree saves atomically with canonical fields, retains hidden notes and rejects stale or invalid writes',async()=>{
 const t='90000000-0000-4000-8000-000000000010';await sql('select demo_tester_bootstrap($1)',[t]);const [p]=await sql('select id from demo_patients where tester_id=$1 limit 1',[t]);const [s]=await sql("select * from demo_session_start($1,$2,'follow_up')",[t,p.id]);
 const risk={suicidal_ideation:'positive',intent:'unknown',plan:'positive',harm_to_others:'not_assessed',tree:{version:1,answers:{wish:'positive',acted:'negative',ideation:'active',intent:'unknown',plan:'positive'},notes:{plan:'Test explanation'}}};
 const query='select * from demo_session_save_risk_tree($1,$2,$3,$4)';
 const [saved]=await sql(query,[t,s.id,JSON.stringify(risk),null]);assert.deepEqual(saved.tree.notes,risk.tree.notes);assert.equal(saved.plan,'positive');
 await assert.rejects(sql(query,[t,s.id,JSON.stringify(risk),null]),/stale_risk/);
 await assert.rejects(sql(query,[a,s.id,JSON.stringify(risk),1]),/session_unavailable/);
 await assert.rejects(sql(query,[t,s.id,JSON.stringify({...risk,tree:{version:1,answers:{invented:'positive'},notes:{}}}),1]),/invalid_risk_tree/);
 await assert.rejects(sql(query,[t,s.id,JSON.stringify({...risk,suicidal_ideation:'negative'}),1]),/inconsistent_risk_tree/);
 risk.suicidal_ideation='negative';risk.tree.answers.wish='negative';const [changed]=await sql(query,[t,s.id,JSON.stringify(risk),1]);assert.equal(changed.tree.answers.plan,'positive');assert.equal(changed.tree.notes.plan,'Test explanation');
 // Legacy writes keep the shared answers in sync and retain narrative evidence.
 await sql('select demo_session_save_risk($1,$2,$3,2)',[t,s.id,JSON.stringify({...risk,plan:'unknown'})]);const [legacy]=await sql('select * from demo_risk_assessments where session_id=$1',[s.id]);assert.equal(legacy.tree.answers.plan,'unknown');assert.equal(legacy.tree.notes.plan,'Test explanation');
});

test('visit questionnaire assignment is scoped, idempotent and cannot move between visits',async()=>{
 const t='90000000-0000-4000-8000-000000000009';await sql('select demo_tester_bootstrap($1)',[t]);
 const [p]=await sql('select id from demo_patients where tester_id=$1 limit 1',[t]);
 const [s]=await sql("select * from demo_session_start($1,$2,'follow_up')",[t,p.id]);
 const id='91000000-0000-4000-8000-000000000009',token='9'.repeat(64);
 const args=[t,p.id,s.id,id,'PHQ-9',token];
 const query='select demo_assessment_assign_to_session($1,$2,$3,$4,$5,$6) result';
 const [first]=await sql(query,args);assert.equal(first.result.session_id,s.id);assert.equal(first.result.token_hash,undefined);
 const [retry]=await sql(query,args);assert.deepEqual(first.result,retry.result);
 await assert.rejects(sql(query,[a,...args.slice(1)]),/session_unavailable/);
 await assert.rejects(sql(query,[t,patientA,...args.slice(2)]),/session_unavailable/);
 await assert.rejects(sql(query,[t,p.id,null,...args.slice(3)]),/session_unavailable/);
 // Existing assignment must never be reassigned, even with an identical request token.
 const [otherPatient]=await sql('select id from demo_patients where tester_id=$1 and id<>$2 limit 1',[t,p.id]);
 const [other]=await sql("select * from demo_session_start($1,$2,'follow_up')",[t,otherPatient.id]);
 await sql("update private.demo_assessments set session_id=$1 where id=$2",[other.id,id]);
 await assert.rejects(sql(query,args),/request_conflict/);
 assert.equal((await sql('select session_id from private.demo_assessments where id=$1',[id]))[0].session_id,other.id);
});

test('visit documents reload as one canonical section, reject stale writes and remain immutable after finalization', async()=>{
 const t='90000000-0000-4000-8000-000000000001';await sql('select demo_tester_bootstrap($1)',[t]);const [p]=await sql('select id from demo_patients where tester_id=$1 limit 1',[t]);const [s]=await sql("select * from demo_session_start($1,$2,'initial_assessment')",[t,p.id]);
 const doc={kind:'mse',fields:[{key:'mood',label:'Mood',text:'Denies low mood; uncertain reliability.',review:'unchanged'},{key:'speech',label:'Speech',text:'',review:'not_assessed'}]};
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

test('every table has RLS; the private pilot exposes no anonymous table reads', async () => {
  const tables = await sql("select c.relname,c.relrowsecurity from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname in ('public','private') and c.relkind='r'");
  assert.ok(tables.length >= 20);
  for (const table of tables) assert.equal(table.relrowsecurity, true, table.relname);
  await db.exec('begin; set local role anon;');
  await assert.rejects(sql('select * from patients'), /permission denied/);
  await db.exec('rollback');
  const allowed = await sql("select table_name, privilege_type from information_schema.role_table_grants where grantee = 'anon' and table_schema in ('public','private') order by table_name, privilege_type");
  assert.deepEqual(allowed, []);
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

test('same-day dose correction preserves the original event, requires a reason and rejects stale retries',async()=>{
 const t='80000000-0000-4000-8000-000000000009';await sql('select demo_tester_bootstrap($1)',[t]);
 const [p]=await sql('select id from demo_patients where tester_id=$1 limit 1',[t]);
 const [m]=await sql("select * from demo_medication_start($1,$2,null,'Same-day test',5,'mg','daily',current_date,'test')",[t,p.id]);
 const [event]=await sql('select id from demo_medication_events where medication_id=$1',[m.id]);
 await assert.rejects(sql("select demo_medication_event_write($1,$2,null,'started',10,'mg','daily',current_date,'',2,$3,false)",[t,m.id,event.id]),/reason_required/);
 await sql("select demo_medication_event_write($1,$2,null,'started',10,'mg','daily',current_date,'Correct initial dose',2,$3,false)",[t,m.id,event.id]);
 assert.equal((await sql('select demo_medication_state($1,current_date) state',[m.id]))[0].state.dose,10);
 const [revision]=await sql('select * from demo_medication_event_revisions where event_id=$1',[event.id]);
 assert.ok(revision.replacement_id);assert.equal(revision.reason,'Correct initial dose');
 assert.equal((await sql('select new_state from demo_medication_events where id=$1',[event.id]))[0].new_state.dose,5);
 await assert.rejects(sql("select demo_medication_event_write($1,$2,null,'started',20,'mg','daily',current_date,'Retry',2,$3,false)",[t,m.id,event.id]),/stale_medication/);
});

test('patient folders receive only their own medication correction revisions',async()=>{
 const t='80000000-0000-4000-8000-000000000014';await sql('select demo_tester_bootstrap($1)',[t]);
 const [{id:p1}]=await sql("select (demo_patient_create_v2($1,'TEST Revision A')).id id",[t]);
 const [{id:p2}]=await sql("select (demo_patient_create_v2($1,'TEST Revision B')).id id",[t]);
 const [m1]=await sql("select * from demo_medication_start($1,$2,null,'Med A',5,'mg','daily',current_date,'baseline')",[t,p1]);
 const [m2]=await sql("select * from demo_medication_start($1,$2,null,'Med B',10,'mg','daily',current_date,'baseline')",[t,p2]);
 const [e1]=await sql("select id from demo_medication_events where medication_id=$1 and event_type='started'",[m1.id]);
 const [e2]=await sql("select id from demo_medication_events where medication_id=$1 and event_type='started'",[m2.id]);
 await sql("select demo_medication_event_write($1,$2,null,'started',6,'mg','daily',current_date,'Correct A',2,$3,false)",[t,m1.id,e1.id]);
 await sql("select demo_medication_event_write($1,$2,null,'started',11,'mg','daily',current_date,'Correct B',2,$3,false)",[t,m2.id,e2.id]);
 const r1=await sql('select * from demo_medication_revisions_for_patient($1,$2)',[t,p1]);
 const r2=await sql('select * from demo_medication_revisions_for_patient($1,$2)',[t,p2]);
 assert.equal(r1.length,1);assert.equal(r1[0].event_id,e1.id);assert.equal(r1[0].reason,'Correct A');
 assert.equal(r2.length,1);assert.equal(r2[0].event_id,e2.id);assert.equal(r2[0].reason,'Correct B');
});

test('SMS simulation queues atomically, reschedules, cancels, revalidates phone and processes only once',async()=>{
 const tester='71000000-0000-4000-8000-000000000001';await sql('select public.demo_tester_bootstrap($1)',[tester]);
 const patient=(await sql('select id from public.demo_patients where tester_id=$1 limit 1',[tester]))[0];
 await sql("update public.demo_patients set phone='+306900000000' where id=$1",[patient.id]);
 async function write(payload,sms=true){return (await sql('select public.demo_calendar_write_sms($1,$2::jsonb,$3) as event',[tester,JSON.stringify(payload),sms]))[0].event;}
 const event=await write({action:'create',patient_id:patient.id,scheduled_start:'2098-10-10T09:00Z',scheduled_end:'2098-10-10T09:50Z'});
 let job=(await sql('select * from private.demo_sms_reminders where event_id=$1',[event.id]))[0];assert.equal(job.status,'queued');assert.equal(new Date(job.due_at).toISOString(),'2098-10-09T09:00:00.000Z');
 let moved=await write({action:'move',event_id:event.id,expected_updated_at:event.updated_at,scheduled_start:'2098-10-11T09:00Z',scheduled_end:'2098-10-11T09:50Z'});
 job=(await sql('select * from private.demo_sms_reminders where event_id=$1',[event.id]))[0];assert.equal(new Date(job.due_at).toISOString(),'2098-10-10T09:00:00.000Z');
 await sql("select private.process_demo_sms_reminders('2098-10-09T12:00Z')");assert.equal((await sql('select status from private.demo_sms_reminders where event_id=$1',[event.id]))[0].status,'queued');
 await sql("select private.process_demo_sms_reminders('2098-10-10T09:01Z')");job=(await sql('select * from private.demo_sms_reminders where event_id=$1',[event.id]))[0];assert.equal(job.status,'simulated');const processed=job.processed_at;
 await sql("select private.process_demo_sms_reminders('2098-10-10T09:02Z')");assert.deepEqual((await sql('select processed_at from private.demo_sms_reminders where event_id=$1',[event.id]))[0].processed_at,processed);
 moved=await write({action:'cancel',event_id:event.id,expected_updated_at:moved.updated_at});assert.equal((await sql('select status from private.demo_sms_reminders where event_id=$1',[event.id]))[0].status,'cancelled');
 moved=await write({action:'restore',event_id:event.id,expected_updated_at:moved.updated_at});assert.equal((await sql('select status from private.demo_sms_reminders where event_id=$1',[event.id]))[0].status,'queued');
 await sql("update public.demo_patients set phone='' where id=$1",[patient.id]);assert.equal((await sql('select status from private.demo_sms_reminders where event_id=$1',[event.id]))[0].status,'missing_phone');
 await sql("update public.demo_patients set phone='6900000000' where id=$1",[patient.id]);assert.equal((await sql('select status from private.demo_sms_reminders where event_id=$1',[event.id]))[0].status,'queued');
 moved=await write({action:'move',event_id:event.id,expected_updated_at:moved.updated_at,scheduled_start:'2098-10-12T09:00Z',scheduled_end:'2098-10-12T09:50Z'},false);assert.equal(moved.sms_reminder_enabled,false);assert.equal((await sql('select status from private.demo_sms_reminders where event_id=$1',[event.id]))[0].status,'cancelled');
 assert.equal((await sql('select public.demo_calendar_reminders($1) as jobs',[b]))[0].jobs.length,0);
 await db.exec('begin;set local role anon;');try{await assert.rejects(sql('select private.process_demo_sms_reminders()'),/permission denied/);}finally{await db.exec('rollback');}
});

test('mailboxes and questionnaire deliveries isolate owners and prevent duplicate or ambiguous sends',async()=>{
 const [{identity}]=await asUser(a,()=>sql('select pilot_identity() identity'));
 await asUser(a,()=>sql("select pilot_mailbox_save('google','a@example.com',$1)",['ciphertext'.repeat(5)]));
 assert.equal((await asUser(a,()=>sql('select pilot_mailbox_get() mailbox')))[0].mailbox.email,'a@example.com');
 assert.equal((await asUser(b,()=>sql('select pilot_mailbox_get() mailbox')))[0].mailbox,null);
 await rejected(b,'select * from private.pilot_mailboxes',[],/permission denied/);
 const [p]=await asUser(a,()=>sql('select id from demo_patients limit 1'));
 const id='99000000-0000-4000-8000-000000000001',token='f'.repeat(64);
 await asUser(a,()=>sql("select demo_assessment_assign($1,$2,null,$3,'PHQ-9',$4)",[identity.workspace_id,p.id,id,token]));
 await rejected(b,'select pilot_mail_claim($1,$2,$3)',[id,token,'tester@example.com'],/assessment_unavailable/);
 await rejected(a,'select pilot_mail_claim($1,$2,$3)',[id,'wrong','tester@example.com'],/assessment_unavailable/);
 assert.equal((await asUser(a,()=>sql('select pilot_mail_claim($1,$2,$3) status',[id,token,'tester@example.com'])))[0].status,'new');
 assert.equal((await asUser(a,()=>sql('select pilot_mail_claim($1,$2,$3) status',[id,token,'tester@example.com'])))[0].status,'claimed');
 await asUser(a,()=>sql("select pilot_mail_finish($1,'unknown')",[id]));
 assert.equal((await asUser(a,()=>sql('select pilot_mail_claim($1,$2,$3) status',[id,token,'tester@example.com'])))[0].status,'unknown');
 await rejected(b,"select pilot_mail_finish($1,'accepted')",[id],/delivery_unavailable/);
 await asUser(a,()=>sql('select pilot_mailbox_disconnect()'));
 assert.equal((await asUser(a,()=>sql('select pilot_mailbox_get() mailbox')))[0].mailbox,null);
});

test('Dokimos seed repair restores timeline without changing the projector or cancelled-event semantics',async()=>{
 const t='0e11a456-79ac-4540-975e-59656ed6c588',p='5e944898-edd9-40da-b6b8-5967016173dd',m='76d1ca3e-e520-4043-82a8-3a85cdd356ca';
 await sql("insert into demo_patients(id,tester_id,first_name,last_name) values($1,$2,'Δόκιμος','Α')",[p,t]);
 await sql("insert into demo_medications(id,tester_id,patient_id,medication_name,dose,unit,frequency,status,started_at,effective_from) values($1,$2,$3,'Escitalopram',10,'mg','1 φορά το πρωί','active','2026-09-24','2026-10-01')",[m,t,p]);
 assert.equal((await sql("select demo_medication_state($1,'2026-10-05') s",[m]))[0].s.status,'cancelled');
 const repair=await readFile('docs/repair-dokimos-medication.sql','utf8');await db.exec(repair);await db.exec(repair);
 const state=async d=>(await sql('select demo_medication_state($1,$2::date) s',[m,d]))[0].s;
 assert.equal((await state('2026-09-23')).status,'planned');assert.equal((await state('2026-09-24')).dose,5);assert.equal((await state('2026-10-01')).dose,10);assert.equal((await state('2026-10-05')).status,'active');
 assert.equal((await sql('select count(*)::int n from demo_medication_events where medication_id=$1',[m]))[0].n,2);assert.equal((await sql('select plan_version from demo_medications where id=$1',[m]))[0].plan_version,2);
});


test('finish-later creates one session-linked task and finalization closes only that task', async()=>{
 const t='61000000-0000-4000-8000-000000000010';
 await sql('select demo_tester_bootstrap($1)',[t]);
 const [{id:p}]=await sql("select (demo_patient_create_v2($1,'TEST Pending Record')).id id",[t]);
 const [draft]=await sql("select * from demo_session_start($1,$2,'follow_up')",[t,p]);
 const [firstTask]=await sql('select * from demo_task_for_session($1,$2)',[t,draft.id]);
 const [retryTask]=await sql('select * from demo_task_for_session($1,$2)',[t,draft.id]);
 assert.equal(firstTask.id,retryTask.id);
 assert.equal(firstTask.source_session_id,draft.id);
 assert.equal(firstTask.status,'open');
 await assert.rejects(sql("select demo_task_set_status($1,$2,'completed')",[t,firstTask.id]),/task_managed_by_record/);
 assert.equal((await sql("select count(*)::int n from demo_tasks where tester_id=$1 and source_session_id=$2 and status='open'",[t,draft.id]))[0].n,1);
 const [manual]=await sql("select * from demo_task_create($1,'Ολοκλήρωση καταγραφής · άσχετη εργασία',$2,null)",[t,p]);
 for(const k of ['interview','mse','assessment','plan','review'])await sql("select demo_session_save_section($1,$2,$3,'Documented','manual',null)",[t,draft.id,k]);
 await sql('select demo_session_save_risk($1,$2,$3,null)',[t,draft.id,JSON.stringify({suicidal_ideation:'negative'})]);
 const [{version}]=await sql('select version from demo_sessions where id=$1',[draft.id]);
 const [done]=await sql('select * from demo_session_finalize($1,$2,$3)',[t,draft.id,version]);
 assert.equal(done.status,'completed');
 assert.equal((await sql('select status from demo_tasks where id=$1',[firstTask.id]))[0].status,'completed');
 assert.equal((await sql('select status from demo_tasks where id=$1',[manual.id]))[0].status,'open');
 await assert.rejects(sql('select demo_task_for_session($1,$2)',[t,draft.id]),/session_unavailable/);
});


test('creating a patient creates only the patient entity and same-name patients stay UUID-isolated',async()=>{
 const t='61400000-0000-4000-8000-000000000010';await sql('select demo_tester_bootstrap($1)',[t]);
 const [p1]=await sql("select * from demo_patient_create_v3($1,'Μαρία','Ίδια',30,'','','','','','','')",[t]);
 const [p2]=await sql("select * from demo_patient_create_v3($1,'Μαρία','Ίδια',31,'','','','','','','')",[t]);
 assert.notEqual(p1.id,p2.id);
 assert.equal((await sql('select count(*)::int n from demo_sessions where tester_id=$1 and patient_id in ($2,$3)',[t,p1.id,p2.id]))[0].n,0);
 const [draft]=await sql("select * from demo_session_start($1,$2,'initial_assessment')",[t,p1.id]);
 assert.equal(draft.patient_id,p1.id);
 assert.equal((await sql('select count(*)::int n from demo_sessions where patient_id=$1',[p2.id]))[0].n,0);
 await sql("select demo_patient_update_v2($1,$2,'Μαρία','Ενημερωμένη',30,'','','','','','','',null)",[t,p1.id]);
 assert.equal((await sql('select id from demo_patients where id=$1',[p1.id]))[0].id,p1.id);
 assert.equal((await sql('select patient_id from demo_sessions where id=$1',[draft.id]))[0].patient_id,p1.id);
});

test('patient details and longitudinal history reject stale-tab overwrites and allow explicit retry',async()=>{
 const t='80000000-0000-4000-8000-000000000008';await sql('select demo_tester_bootstrap($1)',[t]);
 const [{id:p,updated_at:revision}]=await sql("select (demo_patient_create_v3($1,'TEST','Concurrency',null,'','','','','','','')).*",[t]);
 const [first]=await sql("select * from demo_patient_update_v2($1,$2,'TEST','First',null,'','','','','','','',$3)",[t,p,revision]);
 await assert.rejects(sql("select * from demo_patient_update_v2($1,$2,'TEST','Stale',null,'','','','','','','',$3)",[t,p,revision]),/stale_patient/);
 assert.equal((await sql('select last_name from demo_patients where id=$1',[p]))[0].last_name,'First');
 const [retry]=await sql("select * from demo_patient_update_v2($1,$2,'TEST','Retry',null,'','','','','','','',$3)",[t,p,first.updated_at]);
 assert.equal(retry.last_name,'Retry');

 const [h1]=await sql("select * from demo_history_save($1,$2,$3::jsonb,$4)",[t,p,JSON.stringify({psychiatric_history:'first'}),0]);
 await assert.rejects(sql("select * from demo_history_save($1,$2,$3::jsonb,$4)",[t,p,JSON.stringify({psychiatric_history:'stale'}),0]),/stale_history/);
 assert.equal((await sql('select psychiatric_history from demo_patient_history where patient_id=$1',[p]))[0].psychiatric_history,'first');
 const [h2]=await sql("select * from demo_history_save($1,$2,$3::jsonb,$4)",[t,p,JSON.stringify({psychiatric_history:'retry'}),h1.version]);
 assert.equal(h2.psychiatric_history,'retry');assert.equal(h2.version,h1.version+1);
});

test('direct patient-folder starts resume only compatible drafts',async()=>{
 const t='61500000-0000-4000-8000-000000000010';await sql('select demo_tester_bootstrap($1)',[t]);
 const [{id:p}]=await sql("select (demo_patient_create_v2($1,'TEST Direct Draft')).id id",[t]);
 const [first]=await sql("select * from demo_session_start($1,$2,'initial_assessment')",[t,p]);
 const [retry]=await sql("select * from demo_session_start($1,$2,'initial_assessment')",[t,p]);
 assert.equal(retry.id,first.id);
 await assert.rejects(sql("select * from demo_session_start($1,$2,'follow_up')",[t,p]),/open_draft_conflict/);
 assert.equal((await sql('select count(*)::int n from demo_sessions where tester_id=$1 and patient_id=$2 and status=\'draft\'',[t,p]))[0].n,1);
});

test('patient demographic updates keep calendar and pending record To-do names aligned',async()=>{
 const t='61600000-0000-4000-8000-000000000010';await sql('select demo_tester_bootstrap($1)',[t]);
 const [{id:p}]=await sql("select (demo_patient_create_v2($1,'TEST Old Name')).id id",[t]);
 const [draft]=await sql("select * from demo_session_start($1,$2,'follow_up')",[t,p]);
 const [task]=await sql('select * from demo_task_for_session($1,$2)',[t,draft.id]);
 const [{event}]=await sql("select demo_calendar_apply_v2($1,'create',null,$2,null,'2099-12-20 10:00 Europe/Athens','2099-12-20 10:50 Europe/Athens','follow_up') event",[t,p]);
 const [patient]=await sql("select * from demo_patient_update_v2($1,$2,'TEST Renamed','Patient',null,'','','','','','','',null)",[t,p]);
 assert.equal(patient.id,p);
 assert.equal((await sql('select patient_name from demo_calendar_events where id=$1',[event.id]))[0].patient_name,'TEST Renamed Patient');
 assert.equal((await sql('select title from demo_tasks where id=$1',[task.id]))[0].title,'Ολοκλήρωση καταγραφής · TEST Renamed Patient');
});

test('structured corrections are append-only and belong to completed sessions', async()=>{
 const t='62000000-0000-4000-8000-000000000010';await sql('select demo_tester_bootstrap($1)',[t]);
 const [{id:p}]=await sql("select (demo_patient_create_v2($1,'TEST Corrected Record')).id id",[t]);
 const [session]=await sql("select * from demo_session_start($1,$2,'follow_up')",[t,p]);
 const request='62000000-0000-4000-8000-000000000011';
 const patch={mse:{before:{kind:'mse',fields:[]},after:{kind:'mse',fields:[{key:'mood',label:'Mood',text:'Υποκειμενικό συναίσθημα: Αγχώδες'}]}}};
 await assert.rejects(sql('select demo_session_correction_create($1,$2,$3,$4,$5)',[t,session.id,request,'Correction',JSON.stringify(patch)]),/completed_session_required/);
 for(const k of ['interview','mse','assessment','plan','review'])await sql("select demo_session_save_section($1,$2,$3,'Documented','manual',null)",[t,session.id,k]);
 await sql('select demo_session_save_risk($1,$2,$3,null)',[t,session.id,JSON.stringify({suicidal_ideation:'negative'})]);
 const [{version}]=await sql('select version from demo_sessions where id=$1',[session.id]);
 await sql('select demo_session_finalize($1,$2,$3)',[t,session.id,version]);
 const [correction]=await sql('select * from demo_session_correction_create($1,$2,$3,$4,$5)',[t,session.id,request,'Correction',JSON.stringify(patch)]);
 assert.equal(correction.session_id,session.id);assert.deepEqual(correction.patch,patch);
 const [retry]=await sql('select * from demo_session_correction_create($1,$2,$3,$4,$5)',[t,session.id,request,'Correction',JSON.stringify(patch)]);assert.equal(retry.id,correction.id);
 await assert.rejects(sql("update demo_session_corrections set reason='changed' where id=$1",[correction.id]),/immutable_record/);
 await assert.rejects(sql('select demo_session_correction_create($1,$2,$3,$4,$5)',[t,session.id,'62000000-0000-4000-8000-000000000012','',JSON.stringify(patch)]),/correction_reason_required/);
});

test('structured correction retries are idempotent and stale tabs cannot append over newer corrections',async()=>{
 const t='62100000-0000-4000-8000-000000000010';await sql('select demo_tester_bootstrap($1)',[t]);
 const [{id:p}]=await sql("select (demo_patient_create_v2($1,'TEST Correction Concurrency')).id id",[t]);
 const [session]=await sql("select * from demo_session_start($1,$2,'follow_up')",[t,p]);
 for(const k of ['interview','mse','assessment','plan','review'])await sql("select demo_session_save_section($1,$2,$3,'Documented','manual',null)",[t,session.id,k]);
 await sql('select demo_session_save_risk($1,$2,$3,null)',[t,session.id,JSON.stringify({suicidal_ideation:'negative'})]);
 const [{version}]=await sql('select version from demo_sessions where id=$1',[session.id]);
 await sql('select demo_session_finalize($1,$2,$3)',[t,session.id,version]);
 const request='62100000-0000-4000-8000-000000000011';
 const patch={plan:{before:'Documented',after:'Updated plan'}};
 const [first]=await sql('select * from demo_session_correction_create_v2($1,$2,$3,$4,$5,$6)',[t,session.id,request,'Plan correction',JSON.stringify(patch),0]);
 const [retry]=await sql('select * from demo_session_correction_create_v2($1,$2,$3,$4,$5,$6)',[t,session.id,request,'Plan correction',JSON.stringify(patch),0]);
 assert.equal(retry.id,first.id,'same request id must survive a lost response/retry');
 await assert.rejects(sql('select demo_session_correction_create_v2($1,$2,$3,$4,$5,$6)',[t,session.id,'62100000-0000-4000-8000-000000000012','Stale tab',JSON.stringify({review:{before:'Documented',after:'Changed'}}),0]),/stale_correction/);
 const [second]=await sql('select * from demo_session_correction_create_v2($1,$2,$3,$4,$5,$6)',[t,session.id,'62100000-0000-4000-8000-000000000013','Fresh correction',JSON.stringify({review:{before:'Documented',after:'Changed'}}),1]);
 assert.notEqual(second.id,first.id);
 assert.equal((await sql('select count(*)::int n from demo_session_corrections where session_id=$1',[session.id]))[0].n,2);
});


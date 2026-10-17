import {PGlite} from '@electric-sql/pglite';
import {before,after,test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';
import {randomUUID,randomBytes} from 'node:crypto';
const db=new PGlite();const user=randomUUID(),other=randomUUID();let workspace,otherWorkspace,patient,otherPatient;
const sql=async(query,args=[])=>{try{return (await db.query(query,args)).rows}catch(e){throw new Error(e.message)}};
async function asUser(id,fn){await db.exec('begin;set local role authenticated;');await sql("select set_config('request.jwt.claim.sub',$1,true)",[id]);try{const value=await fn();await db.exec('commit');return value}catch(e){await db.exec('rollback');throw e}}
async function anonymous(fn){await db.exec('begin;set local role anon;');try{const value=await fn();await db.exec('commit');return value}catch(e){await db.exec('rollback');throw e}}
before(async()=>{
 await db.exec("create role anon nologin;create role authenticated nologin;create schema auth;create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz,deleted_at timestamptz,banned_until timestamptz);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema auth,public to anon,authenticated;grant execute on function auth.uid() to anon,authenticated;");
 for(const name of (await readdir('supabase/migrations')).filter(v=>v.endsWith('.sql')).sort())await db.exec(await readFile('supabase/migrations/'+name,'utf8'));
 await sql('insert into auth.users(id) values($1),($2)',[user,other]);
 await sql("insert into private.pilot_members(user_id,full_name) values($1,'Synthetic Port A'),($2,'Synthetic Port B')",[user,other]);
 workspace=(await asUser(user,()=>sql('select pilot_identity() value')))[0].value.workspace_id;
 otherWorkspace=(await asUser(other,()=>sql('select pilot_identity() value')))[0].value.workspace_id;
 await asUser(user,()=>sql('select demo_tester_bootstrap($1)',[workspace]));await asUser(other,()=>sql('select demo_tester_bootstrap($1)',[otherWorkspace]));
 patient=(await asUser(user,()=>sql("select * from demo_patient_create_v2($1,'Synthetic Prior Course')",[workspace])))[0];
 otherPatient=(await asUser(other,()=>sql("select * from demo_patient_create_v2($1,'Synthetic Other Course')",[otherWorkspace])))[0];
});
after(()=>db.close());
test('prior-course SQL is retry-safe, append-only, versioned and isolated without fabricated visits',async()=>{
 const beforeSessions=await sql('select id,status from demo_sessions where patient_id=$1',[patient.id]);
 const beforeMeds=await sql('select id from demo_medications where patient_id=$1',[patient.id]);
 const request=randomUUID(),text='Synthetic previous course: stable follow-up for approximately two years.';
 const write='select to_jsonb(demo_prior_course_save($1,$2,$3,$4,$5,$6)) value';
 const params=[workspace,patient.id,request,0,'approximately 2 years',text];
 const first=(await asUser(user,()=>sql(write,params)))[0].value;
 const retry=(await asUser(user,()=>sql(write,params)))[0].value;
 assert.equal(first.id,retry.id);assert.equal(first.version,1);assert.equal(first.patient_id,patient.id);
 await assert.rejects(asUser(user,()=>sql(write,[workspace,patient.id,randomUUID(),0,'',text])),/stale_prior_course/);
 const second=(await asUser(user,()=>sql(write,[workspace,patient.id,randomUUID(),1,'approximately 2 years',text+' Clinician clarification.'])))[0].value;
 assert.equal(second.version,2);
 await assert.rejects(asUser(other,()=>sql('select demo_prior_course_get($1,$2)',[workspace,patient.id])),/pilot_not_authorized/);
 await assert.rejects(asUser(user,()=>sql(write,[workspace,otherPatient.id,randomUUID(),0,'',text])),/patient_not_found/);
 await assert.rejects(anonymous(()=>sql('select demo_prior_course_get($1,$2)',[workspace,patient.id])),/permission denied/);
 assert.deepEqual(await sql('select id,status from demo_sessions where patient_id=$1',[patient.id]),beforeSessions);
 assert.deepEqual(await sql('select id from demo_medications where patient_id=$1',[patient.id]),beforeMeds);
});
test('new questionnaire-only intake creates exactly one folder on submission and no appointment or visit',async()=>{
 const id=randomUUID(),token=randomBytes(32).toString('hex'),identity={first_name:'Synthetic',last_name:'Library Intake',age:'36',phone:'+302101234567',email:'synthetic-port@example.invalid',amka:'',address:'Synthetic street',contact_phone:''};
 const beforePatients=(await sql('select count(*)::int n from demo_patients where tester_id=$1',[workspace]))[0].n;
 await asUser(user,()=>sql("select demo_intake_assign_unattached($1,$2,$3,$4,jsonb_build_array('GAD-7'),'email',null)",[workspace,id,token,JSON.stringify(identity)]));
 assert.equal((await sql('select count(*)::int n from demo_patients where tester_id=$1',[workspace]))[0].n,beforePatients);
 const result=(await anonymous(()=>sql('select demo_intake_submit($1,$2,null,$3) value',[token,JSON.stringify(identity),JSON.stringify({'GAD-7':[1,1,1,1,1,1,1]})])))[0].value;
 assert.equal(result.status,'submitted');assert.ok(result.patient_id);
 const row=(await sql('select * from demo_patients where id=$1',[result.patient_id]))[0];assert.equal(row.first_name,identity.first_name);assert.equal(row.last_name,identity.last_name);assert.equal(row.email,identity.email);assert.equal(row.address,identity.address);
 assert.equal((await sql('select count(*)::int n from demo_patients where tester_id=$1',[workspace]))[0].n,beforePatients+1);
 assert.deepEqual(await sql('select id from demo_sessions where patient_id=$1',[row.id]),[]);
 assert.deepEqual(await sql('select id from demo_calendar_events where patient_id=$1',[row.id]),[]);
 try{await anonymous(()=>sql('select demo_intake_submit($1,$2,null,$3)',[token,JSON.stringify(identity),JSON.stringify({'GAD-7':[1,1,1,1,1,1,1]})]))}catch{/* A completed token may reject retry; it must never duplicate the folder. */}
 assert.equal((await sql('select count(*)::int n from demo_patients where tester_id=$1',[workspace]))[0].n,beforePatients+1);
 const measurements=await asUser(user,()=>sql('select * from demo_assessment_list($1,$2)',[workspace,row.id]));assert.ok(JSON.stringify(measurements).includes('GAD-7'));
});

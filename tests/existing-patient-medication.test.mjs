import test,{before,after} from 'node:test';
import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
import {storageSchemaSql} from './support/storage-schema.mjs';
import {medicationRegistration,confirmedMedicationRegistration} from '../lib/clinical/medication-registration.ts';

const owner='71000000-0000-4000-8000-000000000001',other='71000000-0000-4000-8000-000000000002';
const request='72000000-0000-4000-8000-000000000001';
const db=new PGlite();
let workspace,otherWorkspace,patient,otherPatient,secondPatient,today;
const rows=async(query,params=[])=> (await db.query(query,params)).rows;
async function asUser(id,fn){
 await db.exec('begin;set local role authenticated');
 await rows("select set_config('request.jwt.claim.sub',$1,true)",[id]);
 try{const result=await fn();await db.exec('commit');return result}catch(error){await db.exec('rollback');throw error}
}
const registerSql='select to_jsonb(public.demo_medication_register($1,$2,$3,$4,$5,$6::numeric,$7,$8,$9::date,$10::date,$11::uuid)) medication';
const register=(id,{requestId=request,patientId=patient,workspaceId=workspace,mode='existing',name='Synthetic medication',dose=50,start=null,stop=null,session=null}={})=>asUser(id,async()=>(await rows(registerSql,[workspaceId,patientId,requestId,mode,name,dose,'mg','once daily',start,stop,session])).map(row=>row.medication));

before(async()=>{
 await db.exec(`create role anon nologin;create role authenticated nologin;
 create schema auth;create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz,deleted_at timestamptz,banned_until timestamptz);
 create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
 grant usage on schema auth,public to anon,authenticated;grant execute on function auth.uid() to anon,authenticated;`);
 await db.exec(storageSchemaSql);
 for(const file of (await readdir('supabase/migrations')).filter(f=>f.endsWith('.sql')).sort()){
  try{await db.exec(await readFile('supabase/migrations/'+file,'utf8'))}catch(error){throw new Error(file+': '+error.message+' '+(error.where||''))}
 }
 await rows('insert into auth.users(id) values($1),($2)',[owner,other]);
 await rows("insert into private.pilot_members(user_id,full_name) values($1,'Synthetic owner'),($2,'Synthetic other')",[owner,other]);
 workspace=(await asUser(owner,()=>rows('select pilot_identity() identity')))[0].identity.workspace_id;
 otherWorkspace=(await asUser(other,()=>rows('select pilot_identity() identity')))[0].identity.workspace_id;
 patient=(await asUser(owner,()=>rows("select * from demo_patient_create_v2($1,'Synthetic established patient')",[workspace])))[0].id;
 secondPatient=(await asUser(owner,()=>rows("select * from demo_patient_create_v2($1,'Synthetic second patient')",[workspace])))[0].id;
 otherPatient=(await asUser(other,()=>rows("select * from demo_patient_create_v2($1,'Synthetic isolated patient')",[otherWorkspace])))[0].id;
 today=(await rows("select (now() at time zone 'Europe/Athens')::date::text today"))[0].today;
});
after(()=>db.close());

test('client registration keeps optional dates unknown and never adopts an unrelated draft',()=>{
 const input={patient_id:patient,request_id:request,mode:'existing',name:' Synthetic ',dose:50,unit:'mg',frequency:' once daily ',started_on:'',stopped_on:null,session_id:'73000000-0000-4000-8000-000000000001'};
 const payload=medicationRegistration(input,today);
 assert.equal(payload.started_on,null);assert.equal(payload.stopped_on,null);assert.equal(payload.session_id,null);
 assert.equal(payload.name,'Synthetic');assert.equal(payload.frequency,'once daily');
 assert.throws(()=>medicationRegistration({...input,mode:'prescribed'},today),/invalid_medication_dates/);
 assert.throws(()=>medicationRegistration({...input,started_on:'2026-02-30'},today),/invalid_medication_dates/);
 assert.throws(()=>medicationRegistration({...input,dose:Infinity},today),/invalid_medication_registration/);
 assert.throws(()=>medicationRegistration({...input,dose:[50]},today),/invalid_medication_registration/);
 assert.throws(()=>medicationRegistration({...input,name:{text:'Synthetic'}},today),/invalid_medication_registration/);
 assert.throws(()=>medicationRegistration({...input,started_on:['2020-01-01']},today),/invalid_medication_dates/);
 for(const day of [false,0,[],{}]){
  assert.throws(()=>medicationRegistration({...input,started_on:day},today),/invalid_medication_dates/);
  assert.throws(()=>medicationRegistration({...input,stopped_on:day},today),/invalid_medication_dates/);
 }
 const prescription=medicationRegistration({...input,mode:'prescribed',started_on:today},today);
 assert.equal(prescription.session_id,input.session_id);
});

test('existing treatment persists once with actor, nullable dates and zero visits or start events',async()=>{
 const [first]=await register(owner);const [retry]=await register(owner);
 assert.equal(retry.id,first.id);assert.equal(first.started_at,null);assert.equal(first.effective_from,null);
 assert.equal(first.ended_at,null);assert.equal(first.record_source,'existing');assert.equal(first.recorded_by,owner);
 assert.equal(first.status,'active');assert.ok(first.created_at);assert.equal(first.registration_request_id,request);
 const [{medications}]=await asUser(owner,()=>rows('select demo_medications_at($1,$2,$3::date) medications',[workspace,patient,today]));
 assert.equal(medications.length,1);assert.equal(medications[0].status,'active');assert.equal(medications[0].started_at,null);
 assert.equal((await rows('select count(*)::int count from demo_sessions where patient_id=$1',[patient]))[0].count,0);
 assert.equal((await rows('select count(*)::int count from demo_medication_events where medication_id=$1',[first.id]))[0].count,0);
 confirmedMedicationRegistration(first,medicationRegistration({patient_id:patient,request_id:request,mode:'existing',name:'Synthetic medication',dose:50,unit:'mg',frequency:'once daily',started_on:null,stopped_on:null,session_id:null},today));
 await assert.rejects(register(owner,{name:'Different content'}),/medication_request_conflict/);
 await assert.rejects(register(owner,{patientId:secondPatient}),/medication_request_conflict/);
});

test('real changes and stops preserve imported baseline and existing optimistic concurrency',async()=>{
 const [med]=await register(owner,{requestId:'72000000-0000-4000-8000-000000000002'});
 const yesterday=(await rows("select ((now() at time zone 'Europe/Athens')::date-1)::text as clinical_date"))[0].clinical_date;
 const eventSql="select * from demo_medication_event_write($1,$2,null,$3,$4::numeric,'mg','once daily',$5::date,'Synthetic change',$6,null,false)";
 const [changed]=await asUser(owner,()=>rows(eventSql,[workspace,med.id,'changed',75,yesterday,med.plan_version]));
 await assert.rejects(asUser(owner,()=>rows(eventSql,[workspace,med.id,'changed',100,today,med.plan_version])),/stale_medication/);
 await asUser(owner,()=>rows(eventSql,[workspace,med.id,'stopped',null,today,changed.plan_version]));
 const [{medications}]=await asUser(owner,()=>rows('select demo_medications_at($1,$2,$3::date) medications',[workspace,patient,today]));
 const result=medications.find(m=>m.id===med.id);assert.equal(result.status,'stopped');assert.equal(result.started_at,null);assert.equal(result.ended_at,today);assert.equal(result.dose,75);
 const events=await rows('select event_type,session_id from demo_medication_events where medication_id=$1 order by effective_on',[med.id]);
 assert.deepEqual(events.map(e=>e.event_type),['changed','stopped']);assert.ok(events.every(e=>e.session_id===null));
 await assert.rejects(rows('update demo_medications set started_at=$1::date where id=$2',[today,med.id]),/medication_registration_immutable/);
});

test('discontinued historical treatment accepts unknown and same-day known dates without invented events',async()=>{
 for(const [i,start,stop] of [[3,null,null],[4,'2020-05-01',null],[5,'2020-05-01','2020-05-01']]){
  const [med]=await register(owner,{requestId:'72000000-0000-4000-8000-'+String(i).padStart(12,'0'),mode:'historical',start,stop});
  assert.equal(med.started_at,start);assert.equal(med.ended_at,stop);assert.equal(med.status,'stopped');
  const [{state}]=await rows('select demo_medication_state($1,$2::date) state',[med.id,today]);assert.equal(state.status,'stopped');
  assert.equal((await rows('select count(*)::int count from demo_medication_events where medication_id=$1',[med.id]))[0].count,0);
 }
 await assert.rejects(register(owner,{requestId:'72000000-0000-4000-8000-000000000006',mode:'historical',start:'2020-05-02',stop:'2020-05-01'}),/invalid_medication_history/);
 await assert.rejects(register(owner,{requestId:'72000000-0000-4000-8000-000000000007',start:'2099-01-01'}),/invalid_medication_history/);
});

test('new treatment retains the existing prescription-event workflow with only explicit visit linkage',async()=>{
 const [med]=await register(owner,{requestId:'72000000-0000-4000-8000-000000000008',mode:'prescribed',start:today});
 assert.equal(med.record_source,'prescribed');assert.equal(med.started_at,today);
 const events=await rows('select event_type,session_id from demo_medication_events where medication_id=$1',[med.id]);
 assert.deepEqual(events,[{event_type:'started',session_id:null}]);
 const [visit]=await asUser(owner,()=>rows("select * from demo_session_start($1,$2,'follow_up')",[workspace,secondPatient]));
 await assert.rejects(register(owner,{requestId:'72000000-0000-4000-8000-000000000009',mode:'prescribed',start:today,session:visit.id}),/session_unavailable/);
 await assert.rejects(register(owner,{requestId:'72000000-0000-4000-8000-000000000010',mode:'existing',session:visit.id}),/invalid_medication_history/);
});

test('workspace ownership, private helpers, malformed doses and retry identity fail closed',async()=>{
 await assert.rejects(register(other),/pilot_not_authorized/);
 await assert.rejects(register(owner,{patientId:otherPatient}),/patient_not_found/);
 await assert.rejects(register(other,{workspaceId:otherWorkspace,patientId:otherPatient}),/medication_request_conflict/);
 for(const dose of [0,-1,'NaN','Infinity'])await assert.rejects(register(owner,{requestId:'72000000-0000-4000-8000-000000000011',dose}),/invalid_medication_registration/);
 await db.exec('begin;set local role anon');
 try{await assert.rejects(rows(registerSql,[workspace,patient,request,'existing','Synthetic',50,'mg','daily',null,null,null]),/permission denied/)}finally{await db.exec('rollback')}
 await assert.rejects(asUser(owner,()=>rows('select demo_medication_state($1,$2::date)',[request,today])),/permission denied/);
 const [med]=await register(owner);
 assert.deepEqual(await asUser(other,()=>rows('select * from demo_medications where id=$1',[med.id])),[]);
});

test('a new prescription remains editable within its explicit initial assessment using audited same-day replacement',async()=>{
 const [visit]=await asUser(owner,()=>rows("select * from demo_session_start($1,$2,'initial_assessment')",[workspace,patient]));
 const [med]=await register(owner,{requestId:'72000000-0000-4000-8000-000000000012',mode:'prescribed',start:today,session:visit.id});
 const [event]=await rows('select id from demo_medication_events where medication_id=$1',[med.id]);
 const [edited]=await asUser(owner,()=>rows("select * from demo_medication_event_write($1,$2,$3,'started',75,'mg','once daily',$4::date,'Synthetic same-day correction',$5,$6,false)",[workspace,med.id,visit.id,today,med.plan_version,event.id]));
 assert.equal(edited.plan_version,med.plan_version+1);
 const [{medications}]=await asUser(owner,()=>rows('select demo_medications_at($1,$2,$3::date) medications',[workspace,patient,today]));
 assert.equal(medications.find(m=>m.id===med.id).dose,75);
 const audit=await rows('select reason,replacement_id from demo_medication_event_revisions where event_id=$1',[event.id]);
 assert.equal(audit.length,1);assert.ok(audit[0].replacement_id);assert.equal(audit[0].reason,'Synthetic same-day correction');
 const visible=await rows('select session_id from demo_medication_events e where medication_id=$1 and not exists(select 1 from demo_medication_event_revisions r where r.event_id=e.id)',[med.id]);
 assert.deepEqual(visible,[{session_id:visit.id}]);
});

test('historical stopped treatment may restart on a real documented date and correct that event',async()=>{
 const [med]=await register(owner,{requestId:'72000000-0000-4000-8000-000000000013',mode:'historical',start:'2019-03-01',stop:'2020-05-01'});
 const [restarted]=await asUser(owner,()=>rows("select * from demo_medication_event_write($1,$2,null,'started',25,'mg','once daily',$3::date,'Synthetic restart',$4,null,false)",[workspace,med.id,today,med.plan_version]));
 const [event]=await rows('select id from demo_medication_events where medication_id=$1',[med.id]);
 await asUser(owner,()=>rows("select * from demo_medication_event_write($1,$2,null,'started',50,'mg','once daily',$3::date,'Synthetic correction',$4,$5,false)",[workspace,med.id,today,restarted.plan_version,event.id]));
 const [{medications}]=await asUser(owner,()=>rows('select demo_medications_at($1,$2,$3::date) medications',[workspace,patient,today]));
 const current=medications.find(m=>m.id===med.id);assert.equal(current.status,'active');assert.equal(current.dose,50);assert.equal(current.started_at,'2019-03-01');
 assert.equal((await rows('select count(*)::int count from demo_medication_event_revisions where event_id=$1',[event.id]))[0].count,1);
});

// Opt-in real multi-connection PostgreSQL gate. Never accepts a hosted DB URL.
import {before,after,test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID,createHash} from 'node:crypto';
import {readFile,writeFile} from 'node:fs/promises';
import {Client} from 'pg';
import {databaseRuntime,localDatabaseUrl,migrateTestDatabase} from '../helpers/database-runtime.mjs';

const url=localDatabaseUrl();if(!url)throw Error('Set NOIMA_NATIVE_TEST_URL to a fresh dedicated local database');
const db=await databaseRuntime(),user=randomUUID(),otherUser=randomUUID();let tester,otherTester;
const migration='20261008125342_audit_intake_and_medication_integrity.sql';
const legacyTester=randomUUID(),legacyIds=[randomUUID(),randomUUID()];let legacyBefore,baseline;
const q=async(text,params=[])=>(await db.query(text,params)).rows;
const audit=async()=>({
 functions:await q(`select n.nspname,p.proname,p.prosecdef,p.provolatile,p.proconfig,
 has_function_privilege('anon',p.oid,'EXECUTE') anon_execute,has_function_privilege('authenticated',p.oid,'EXECUTE') authenticated_execute
 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname in ('public','private') and p.prosecdef order by n.nspname,p.proname,p.oid`),
 publicCreate:await q("select has_schema_privilege('anon','public','CREATE') anon_create,has_schema_privilege('authenticated','public','CREATE') authenticated_create"),
 rls:await q("select relname,relrowsecurity from pg_class where relnamespace='public'::regnamespace and relkind='r' and relname like 'demo_%' order by relname"),
 indexes:await q("select indexname,indexdef from pg_indexes where schemaname='public' and tablename='demo_patients' order by indexname")
});
before(async()=>{
 await migrateTestDatabase(db,{beforeMigration:async name=>{if(name!==migration)return;
  await q("insert into demo_patients(id,tester_id,first_name,amka) values($1,$3,'TEST legacy A','99999999999'),($2,$3,'TEST legacy B','99999999999')",[...legacyIds,legacyTester]);
  legacyBefore=await q('select to_jsonb(p) value from demo_patients p where tester_id=$1 order by id',[legacyTester]);baseline=await audit();
 }});
 assert.deepEqual(await q('select to_jsonb(p) value from demo_patients p where tester_id=$1 order by id',[legacyTester]),legacyBefore);
 await q('insert into auth.users(id) values($1),($2)',[user,otherUser]);
 await q("insert into private.pilot_members(user_id,full_name) values($1,'TEST gate owner'),($2,'TEST gate other')",[user,otherUser]);
 tester=(await asUser(user,'select pilot_identity() value'))[0].value.workspace_id;
 otherTester=(await asUser(otherUser,'select pilot_identity() value'))[0].value.workspace_id;
 await writeFile('../native-security-comparison.json',JSON.stringify({server:(await q('select version()'))[0],migration,sha256:createHash('sha256').update(await readFile('supabase/migrations/'+migration)).digest('hex'),baseline,after:await audit()},null,2));
});
after(async()=>db.close());
async function connect(actor=user){const c=new Client({connectionString:url});await c.connect();await c.query('begin');await c.query("set local statement_timeout='5s';set local lock_timeout='4s';set local role authenticated");await c.query("select set_config('request.jwt.claim.sub',$1,true)",[actor]);return c}
async function asUser(actor,text,params=[]){const c=await connect(actor);try{const rows=(await c.query(text,params)).rows;await c.query('commit');return rows}catch(e){await c.query('rollback');throw e}finally{await c.end()}}
async function race(first,second,{sameActor=true}={}){
 const a=await connect(),b=await connect(sameActor?user:otherUser);
 try{
  const winner=(await a.query(first[0],first[1])).rows;
  const pid=(await b.query('select pg_backend_pid() pid')).rows[0].pid;
  let done=false;const pending=b.query(second[0],second[1]).then(r=>({rows:r.rows}),error=>({error})).finally(()=>{done=true});
  let blocked=false;
  for(let n=0;n<100&&!done;n++){blocked=(await q('select cardinality(pg_blocking_pids($1))>0 blocked',[pid]))[0].blocked;if(blocked)break;await new Promise(r=>setTimeout(r,20))}
  assert.equal(blocked,true,'second transaction must actually wait on the first');
  await a.query('commit');const result=await pending;
  await b.query(result.error?'rollback':'commit');
  if(result.error)assert.notEqual(result.error.code,'40P01','no deadlock');
  return {winner,...result};
 }finally{await a.query('rollback').catch(()=>{});await b.query('rollback').catch(()=>{});await a.end();await b.end()}
}
const create=(amka,name='TEST Native')=>["select * from demo_patient_create_v3($1,$2,'',null,'','','',$3)",[tester,name,amka]];
async function patient(amka='',name='TEST Native'){return(await asUser(user,...create(amka,name)))[0]}
async function intake(identity,tools=['history','PHQ-9','GAD-7']){const id=randomUUID(),token=randomUUID().replaceAll('-','')+randomUUID().replaceAll('-','');await asUser(user,'select demo_intake_assign_unattached($1,$2,$3,$4::jsonb,$5::jsonb,$6)',[tester,id,token,JSON.stringify(identity),JSON.stringify(tools),'print']);return {id,token,identity}}
const psych={'PHQ-9':[0,0,0,0,0,0,0,0,1],'GAD-7':[0,1,2,3,0,1,2]};
const submit=f=>['select demo_intake_submit($1,$2::jsonb,$3::jsonb,$4::jsonb) value',[f.token,JSON.stringify(f.identity),JSON.stringify({other_note:'TEST reported history'}),JSON.stringify(psych)]];
const resolve=(f,p=null)=>['select demo_intake_resolve($1,$2,$3,$4) value',[tester,f.id,p,p===null]];
async function conflict(amka){const match=await patient(amka);const f=await intake({first_name:'TEST conflict',amka});assert.equal((await q(...submit(f)))[0].value.status,'conflict');return {match,f}}

test('migration preserves legacy duplicate rows; private grants, wrappers, RLS and trigger are correct',async()=>{
 assert.equal((await q("select count(*)::int n from pg_trigger where tgname='demo_patient_amka_guard' and not tgisinternal"))[0].n,1);
 const funcs=await q("select p.oid,p.proname,has_function_privilege('anon',p.oid,'EXECUTE') anon,has_function_privilege('authenticated',p.oid,'EXECUTE') authenticated from pg_proc p where proname in ('demo_intake_resolve','demo_patient_amka_guard','pilot_impl_demo_medication_event_write','demo_medication_event_write')");
 for(const f of funcs){assert.equal(f.anon,false);assert.equal(f.authenticated,['demo_intake_resolve','demo_medication_event_write'].includes(f.proname))}
 const modified=(await audit()).functions.filter(f=>['demo_intake_resolve','demo_patient_amka_guard','pilot_impl_demo_medication_event_write'].includes(f.proname));
 assert.equal(modified.length,3);assert.ok(modified.every(f=>f.proconfig.includes('search_path=""')&&f.provolatile==='v'));
 assert.ok((await audit()).rls.every(r=>r.relrowsecurity));
 assert.deepEqual((await audit()).publicCreate,[{anon_create:false,authenticated_create:false}]);
 await assert.rejects(asUser(user,"select demo_patient_create_v3($1,'TEST forbidden legacy duplicate','',null,'','','','99999999999')",[legacyTester]),/pilot_not_authorized/);
 await q("update demo_patients set first_name='TEST legacy edited' where id=$1",[legacyIds[0]]);
 await assert.rejects(q("insert into demo_patients(tester_id,first_name,amka) values($1,'TEST legacy third','99999999999')",[legacyTester]),/amka_conflict/);
});
test('two simultaneous manual creations yield one AMKA winner with no partial history',async()=>{
 const r=await race(create('11100000001'),create('11100000001'));assert.match(r.error?.message||'',/amka_conflict/);
 assert.equal((await q("select count(*)::int n from demo_patients where tester_id=$1 and amka='11100000001'",[tester]))[0].n,1);
});
test('two simultaneous demographic updates cannot assign one AMKA to two folders',async()=>{
 const a=await patient(),b=await patient();
 const update=p=>["select demo_patient_update_v2($1,$2,'TEST concurrent update','',null,'','','','11100000011')",[tester,p.id]];
 const r=await race(update(a),update(b));assert.match(r.error?.message||'',/amka_conflict/);
 assert.equal((await q("select count(*)::int n from demo_patients where tester_id=$1 and amka='11100000011'",[tester]))[0].n,1);
});
test('two simultaneous resolutions materialize one clinical submission',async()=>{
 const {match,f}=await conflict('11100000002');const r=await race(resolve(f,match.id),resolve(f,match.id));assert.match(r.error?.message||'',/intake_conflict_unavailable/);
 assert.equal((await q('select count(*)::int n from private.demo_patient_reported_history where intake_id=$1',[f.id]))[0].n,1);
 assert.equal((await q('select count(*)::int n from private.demo_assessments where intake_id=$1',[f.id]))[0].n,2);
});
test('manual creation versus new-person conflict resolution rechecks after the lock wait',async()=>{
 await asUser(user,"select demo_patient_create_v3($1,'TEST phone peer','',null,'6901111111')",[tester]);
 const f=await intake({first_name:'TEST late',phone:'6901111111',amka:'11100000003'});await q(...submit(f));
 const r=await race(create('11100000003'),resolve(f));assert.match(r.error?.message||'',/amka_conflict/);
 assert.equal((await q('select status from private.demo_intakes where id=$1',[f.id]))[0].status,'conflict');
 assert.equal((await q('select count(*)::int n from private.demo_assessments where intake_id=$1',[f.id]))[0].n,0);
});
test('resolution versus manual creation yields one winner without duplicate identity',async()=>{
 await asUser(user,"select demo_patient_create_v3($1,'TEST email peer','',null,'','','','','','gate@example.invalid')",[tester]);
 const f=await intake({first_name:'TEST new',email:'gate@example.invalid',amka:'11100000004'});await q(...submit(f));
 const r=await race(resolve(f),create('11100000004'));assert.match(r.error?.message||'',/amka_conflict/);
 assert.equal((await q("select count(*)::int n from demo_patients where tester_id=$1 and amka='11100000004'",[tester]))[0].n,1);
 assert.equal((await q('select status from private.demo_intakes where id=$1',[f.id]))[0].status,'submitted');
});
test('a possible-match classification cannot route a later exact AMKA into the original phone candidate',async()=>{
 const original=(await asUser(user,"select * from demo_patient_create_v3($1,'TEST original contact','',null,'6902222222')",[tester]))[0];
 const f=await intake({first_name:'TEST later exact',phone:'6902222222',amka:'11100000010'});await q(...submit(f));
 const exact=await patient('11100000010');
 await assert.rejects(asUser(user,...resolve(f,original.id)),/amka_conflict_requires_matching_patient/);
 assert.equal((await q('select status from private.demo_intakes where id=$1',[f.id]))[0].status,'conflict');
 assert.equal((await q('select count(*)::int n from private.demo_assessments where intake_id=$1',[f.id]))[0].n,0);
 assert.equal((await asUser(user,...resolve(f,exact.id)))[0].value.patient_id,exact.id);
});
test('finalize versus resolution serializes on the intake without partial materialization',async()=>{
 const {match,f}=await conflict('11100000005');const r=await race(resolve(f,match.id),submit(f));assert.equal(r.error,undefined);assert.equal(r.rows[0].value.status,'submitted');
 assert.equal((await q('select count(*)::int n from private.demo_assessments where intake_id=$1',[f.id]))[0].n,2);
});
test('two simultaneous token finalizations create one folder and one set of clinical records',async()=>{
 const f=await intake({first_name:'TEST double submit',amka:'11100000012'});const r=await race(submit(f),submit(f));assert.equal(r.error,undefined);assert.equal(r.rows[0].value.status,'submitted');
 assert.equal((await q("select count(*)::int n from demo_patients where tester_id=$1 and amka='11100000012'",[tester]))[0].n,1);
 assert.equal((await q('select count(*)::int n from private.demo_assessments where intake_id=$1',[f.id]))[0].n,2);
});
test('different simultaneous conflict resolutions in one workspace complete without deadlock',async()=>{
 const x=await conflict('11100000006'),y=await conflict('11100000007');const r=await race(resolve(x.f,x.match.id),resolve(y.f,y.match.id));assert.equal(r.error,undefined);assert.equal(r.rows[0].value.patient_id,y.match.id);
});
test('concurrent medication edit and stale stop have one plan-version winner',async()=>{
 const p=await patient();const m=(await asUser(user,"select * from demo_medication_start($1,$2,null,'TEST race medication',5,'mg','daily',current_date-2,'')",[tester,p.id]))[0];
 const r=await race(["select demo_medication_event_write($1,$2,null,'changed',10,'mg','twice',current_date-1,'',2)",[tester,m.id]],["select demo_medication_event_write($1,$2,null,'stopped',null,null,null,current_date,'',2)",[tester,m.id]]);assert.match(r.error?.message||'',/stale_medication/);
 assert.equal((await q('select plan_version from demo_medications where id=$1',[m.id]))[0].plan_version,3);
 assert.equal((await q('select count(*)::int n from demo_medication_events where medication_id=$1',[m.id]))[0].n,2);
});
test('native medication chronology, scheduled projection, history, side effects and stale edits remain intact',async()=>{
 const p=await patient();const m=(await asUser(user,"select * from demo_medication_start($1,$2,null,'TEST chronology',5,'mg','daily',current_date-4,'')",[tester,p.id]))[0];
 await asUser(user,"select demo_medication_event_write($1,$2,null,'changed',7.5,'mg','daily',current_date-3,'',2)",[tester,m.id]);
 await asUser(user,"select demo_medication_event_write($1,$2,null,'changed',7.5,'mg','twice',current_date-2,'',3)",[tester,m.id]);
 await assert.rejects(asUser(user,"select demo_medication_event_write($1,$2,null,'changed',20,'mg','daily',current_date-1,'',2)",[tester,m.id]),/stale_medication/);
 await assert.rejects(asUser(user,"select demo_medication_event_write($1,$2,null,'changed',20,'mg','daily',current_date-5,'',4)",[tester,m.id]),/event_after_stop_or_before_start/);
 await asUser(user,"select demo_medication_event_write($1,$2,null,'changed',10,'mg','twice',current_date+1,'',4)",[tester,m.id]);
 const state=async day=>(await q('select demo_medication_state($1,current_date+$2::integer) value',[m.id,day]))[0].value;
 assert.equal((await state(0)).dose,7.5);assert.equal((await state(1)).dose,10);
 await asUser(user,"select demo_medication_event_write($1,$2,null,'stopped',null,null,null,current_date+2,'',5)",[tester,m.id]);
 assert.equal((await state(2)).status,'stopped');
 await assert.rejects(asUser(user,"select demo_medication_event_write($1,$2,null,'stopped',null,null,null,current_date+3,'',6)",[tester,m.id]),/event_after_stop_or_before_start/);
 await assert.rejects(asUser(user,"select demo_medication_event_write($1,$2,null,'changed',15,'mg','daily',current_date+3,'',6)",[tester,m.id]),/event_after_stop_or_before_start/);
 const historical=(await asUser(user,"select * from demo_medication_record_history($1,$2,null,'TEST same-day historical',5,'mg','daily',current_date-6,current_date-6,'')",[tester,p.id]))[0];
 assert.equal((await q('select demo_medication_state($1,current_date) value',[historical.id]))[0].value.status,'stopped');
 await asUser(user,"select demo_medication_side_effect_add($1,$2,null,'TEST fictional effect','mild','',current_date)",[tester,historical.id]);
 assert.equal((await q('select count(*)::int n from demo_medication_side_effects where medication_id=$1',[historical.id]))[0].n,1);
});
test('cross-workspace same AMKA is allowed and hidden from the other owner; blank AMKA is unrestricted',async()=>{
 const p=await patient('11100000008');await asUser(otherUser,"select demo_patient_create_v3($1,'TEST other owner','',null,'','','','11100000008')",[otherTester]);
 assert.deepEqual(await asUser(otherUser,'select id from demo_patients where id=$1',[p.id]),[]);
 await patient();await patient();await assert.rejects(asUser(otherUser,...resolve((await conflict('11100000009')).f,p.id)),/pilot_not_authorized/);
});
test('native fictional smoke flow keeps item-9 pending, reviews history, edits/stops and reloads complete timeline',async()=>{
 const f=await intake({first_name:'TEST smoke'});await q(...submit(f));const [row]=await q('select patient_id from private.demo_intakes where id=$1',[f.id]);const p=row.patient_id;
 const [assessment]=await q("select id from private.demo_assessments where intake_id=$1 and instrument='PHQ-9'",[f.id]);
 const overview=async()=>(await asUser(user,'select demo_overview_state($1) value',[tester]))[0].value;
 assert.ok((await overview()).intakes.some(i=>i.id===f.id));await asUser(user,'select demo_assessment_review($1,$2)',[tester,assessment.id]);
 await asUser(user,"select demo_intake_review($1,$2,'{}'::jsonb,1)",[tester,f.id]);assert.ok((await overview()).psychometrics.some(i=>i.id===assessment.id));
 const m=(await asUser(user,"select * from demo_medication_start($1,$2,null,'TEST smoke medicine',5,'mg','daily',current_date-2,'')",[tester,p]))[0];
 await asUser(user,"select demo_medication_event_write($1,$2,null,'changed',7.5,'mg','twice',current_date-1,'',2)",[tester,m.id]);
 await asUser(user,"select demo_medication_event_write($1,$2,null,'stopped',null,null,null,current_date,'',3)",[tester,m.id]);
 const meds=(await asUser(user,'select demo_medications_at($1,$2,current_date) value',[tester,p]))[0].value;assert.equal(meds[0].status,'stopped');assert.equal(meds[0].dose,7.5);
 assert.equal((await q('select count(*)::int n from demo_medication_events where medication_id=$1',[m.id]))[0].n,3);
 await asUser(user,'select demo_assessment_item9_review($1,$2)',[tester,assessment.id]);assert.ok(!(await overview()).psychometrics.some(i=>i.id===assessment.id));
});

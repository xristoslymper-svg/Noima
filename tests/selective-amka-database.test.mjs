import {PGlite} from '@electric-sql/pglite';
import {before,after,test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';
import {randomUUID,randomBytes} from 'node:crypto';

const nativeUrl=process.env.NOIMA_IDENTITY_TEST_URL;
const native=Boolean(nativeUrl);
let Client,db;
if(native){
 const url=new URL(nativeUrl);
 if(!['127.0.0.1','localhost','[::1]'].includes(url.hostname)||url.pathname!=='/noima_identity_test')
   throw Error('Identity tests accept only a disposable loopback noima_identity_test database');
 ({Client}=await import('pg'));
 db=new Client({connectionString:nativeUrl});await db.connect();
}else db=new PGlite();
const q=async(text,params=[])=>(await db.query(text,params)).rows;
const exec=text=>native?db.query(text):db.exec(text);
const owner=randomUUID(),other=randomUUID(),legacyWorkspace=randomUUID(),legacyIds=[randomUUID(),randomUUID()];
const migration='20261017232527_intake_amka_resolution_guard.sql';
let workspace,otherWorkspace,counter=0;
const amka=()=>String(81000000000+(++counter));
async function asUser(user,fn){
 await exec('begin;set local role authenticated');
 await q("select set_config('request.jwt.claim.sub',$1,true)",[user]);
 try{const r=await fn();await exec('commit');return r}catch(e){await exec('rollback');throw e}
}
const patient=(identity='',phone='',email='',scope=workspace)=>
 asUser(owner,async()=>(await q("select * from demo_patient_create_v3($1,'Synthetic AMKA','Audit',null,$2,'','',$3,'',$4)",[scope,phone,identity,email]))[0]);
async function intake(identity){
 const id=randomUUID(),token=randomBytes(32).toString('hex');
 await asUser(owner,()=>q("select demo_intake_assign_unattached($1,$2,$3,$4,jsonb_build_array('GAD-7'),'print',null)",[workspace,id,token,JSON.stringify({first_name:'Synthetic',last_name:'AMKA Audit',...identity})]));
 const result=(await q('select demo_intake_submit($1,$2,null,$3) value',[token,JSON.stringify({first_name:'Synthetic',last_name:'AMKA Audit',...identity}),JSON.stringify({'GAD-7':[1,0,0,0,0,0,0]})]))[0].value;
 assert.equal(result.status,'conflict');return {id,token};
}
const resolveArgs=(i,p=null)=>[workspace,i.id,p,p===null];
const resolveSql='select demo_intake_resolve($1,$2,$3,$4) value';
const resolve=(i,p=null)=>asUser(owner,()=>q(resolveSql,resolveArgs(i,p)));
const matchingCount=async code=>(await q('select count(*)::int n from demo_patients where tester_id=$1 and amka=$2',[workspace,code]))[0].n;
async function unchanged(i){
 const row=(await q('select status,patient_id from private.demo_intakes where id=$1',[i.id]))[0];
 assert.equal(row.status,'conflict');assert.equal(row.patient_id,null);
 assert.equal((await q('select count(*)::int n from private.demo_assessments where intake_id=$1',[i.id]))[0].n,0);
}
before(async()=>{
 await exec("create role anon nologin;create role authenticated nologin;create schema auth;create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz,deleted_at timestamptz,banned_until timestamptz);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema auth,public to anon,authenticated;grant execute on function auth.uid() to anon,authenticated;");
 for(const file of (await readdir('supabase/migrations')).filter(x=>x.endsWith('.sql')).sort()){
  if(file===migration){
   await q("insert into demo_patients(id,tester_id,first_name,amka) values($1,$3,'Synthetic legacy A','99999999999'),($2,$3,'Synthetic legacy B','99999999999')",[...legacyIds,legacyWorkspace]);
   if(process.env.NOIMA_AMKA_SKIP_FIX==='1')continue;
  }
  await exec(await readFile('supabase/migrations/'+file,'utf8'));
 }
 await q('insert into auth.users(id) values($1),($2)',[owner,other]);
 await q("insert into private.pilot_members(user_id,full_name) values($1,'Synthetic AMKA owner'),($2,'Synthetic AMKA other')",[owner,other]);
 workspace=(await asUser(owner,()=>q('select pilot_identity() value')))[0].value.workspace_id;
 otherWorkspace=(await asUser(other,()=>q('select pilot_identity() value')))[0].value.workspace_id;
});
after(async()=>{if(native)await db.end();else await db.close()});

test('later exact AMKA rejects the original phone candidate and a new duplicate',async()=>{
 const code=amka(),phone='6900000001',original=await patient('',phone);
 const i=await intake({phone,amka:code});const exact=await patient(code);
 await assert.rejects(resolve(i,original.id),/amka_conflict_requires_matching_patient/);await unchanged(i);
 await assert.rejects(resolve(i),/amka_conflict_requires_existing_patient/);await unchanged(i);
assert.equal(await matchingCount(code),1);
 const result=(await resolve(i,exact.id))[0].value;assert.equal(result.patient_id,exact.id);
 await assert.rejects(resolve(i,exact.id),/intake_conflict_unavailable/);
 assert.equal((await q('select count(*)::int n from private.demo_assessments where intake_id=$1 and patient_id=$2',[i.id,exact.id]))[0].n,1);
 for(const table of ['demo_sessions','demo_calendar_events','demo_medications'])
  assert.equal((await q('select count(*)::int n from '+table+' where patient_id=$1',[exact.id]))[0].n,0);
});
test('an existing exact AMKA cannot be resolved to an unrelated folder',async()=>{
 const code=amka(),exact=await patient(code),wrong=await patient();
 const i=await intake({amka:code});
 await assert.rejects(resolve(i,wrong.id),/amka_conflict_requires_matching_patient/);await unchanged(i);
 assert.equal((await resolve(i,exact.id))[0].value.patient_id,exact.id);
});
test('email possible-match is rechecked when an exact AMKA appears later',async()=>{
 const code=amka(),email='synthetic-amka@example.invalid',wrong=await patient('','',email);
 const i=await intake({email,amka:code});const exact=await patient(code);
 await assert.rejects(resolve(i,wrong.id),/amka_conflict_requires_matching_patient/);
 assert.equal((await resolve(i,exact.id))[0].value.patient_id,exact.id);
});
test('manual create and demographic update cannot introduce duplicate AMKA',async()=>{
 const code=amka(),existing=await patient(code),blank=await patient();
 await assert.rejects(patient(code),/amka_conflict/);
 await assert.rejects(asUser(owner,()=>q("select demo_patient_update_v2($1,$2,'Synthetic update','Audit',null,'','','',$3)",[workspace,blank.id,code])),/amka_conflict/);
 assert.equal(await matchingCount(code),1);
 assert.equal((await q('select amka from demo_patients where id=$1',[blank.id]))[0].amka,'');
 assert.ok(existing.id);
});
test('blank AMKAs, same AMKA in another workspace, and unchanged legacy duplicates remain valid',async()=>{
 await patient();await patient();const code=amka();await patient(code);
 const otherPatient=(await asUser(other,()=>q("select * from demo_patient_create_v3($1,'Synthetic other','',null,'','','',$2)",[otherWorkspace,code])))[0];
 assert.ok(otherPatient.id);assert.equal(await matchingCount(code),1);
 await q("update demo_patients set first_name='Synthetic legacy edited',amka=amka where id=$1",[legacyIds[0]]);
 assert.equal((await q('select count(*)::int n from demo_patients where tester_id=$1',[legacyWorkspace]))[0].n,2);
 await assert.rejects(q("insert into demo_patients(tester_id,first_name,amka) values($1,'Synthetic forbidden','99999999999')",[legacyWorkspace]),/amka_conflict/);
});
test('resolver preserves authorization and private trigger execution grants',async()=>{
 const code=amka(),p=await patient(code),i=await intake({amka:code});
 await assert.rejects(asUser(other,()=>q(resolveSql,resolveArgs(i,p.id))),/pilot_not_authorized/);
 await unchanged(i);
 const grants=await q("select has_function_privilege('anon','public.demo_intake_resolve(uuid,uuid,uuid,boolean)','EXECUTE') anon,has_function_privilege('authenticated','public.demo_intake_resolve(uuid,uuid,uuid,boolean)','EXECUTE') member,has_function_privilege('authenticated','private.demo_patient_amka_guard()','EXECUTE') direct_guard");
 assert.equal(grants[0].anon,false);assert.equal(grants[0].member,true);assert.equal(grants[0].direct_guard,false);
});

// Native-only: two independent connections must actually block on the shared lock.
async function transactionClient(){
 const c=new Client({connectionString:nativeUrl});await c.connect();
 await c.query("begin;set local statement_timeout='8s';set local lock_timeout='6s';set local role authenticated");
 await c.query("select set_config('request.jwt.claim.sub',$1,true)",[owner]);return c;
}
async function race(first,second){
 const a=await transactionClient(),b=await transactionClient();
 try{
  const winner=(await a.query(first.text,first.args)).rows;
  const pid=(await b.query('select pg_backend_pid() pid')).rows[0].pid;
  let done=false;const pending=b.query(second.text,second.args).then(r=>({rows:r.rows}),error=>({error})).finally(()=>{done=true});
  let blocked=false;
  for(let attempt=0;attempt<100&&!done;attempt++){
   blocked=(await q('select cardinality(pg_blocking_pids($1))>0 blocked',[pid]))[0].blocked;
   if(blocked)break;await new Promise(r=>setTimeout(r,20));
  }
  assert.equal(blocked,true,'second transaction must wait on the first identity lock');
  await a.query('commit');const result=await pending;
  await b.query(result.error?'rollback':'commit');
  assert.notEqual(result.error?.code,'40P01','no deadlock');return {winner,...result};
 }finally{await a.query('rollback').catch(()=>{});await b.query('rollback').catch(()=>{});await a.end();await b.end()}
}
const createStatement=code=>({text:"select * from demo_patient_create_v3($1,'Synthetic concurrent','',null,'','','',$2)",args:[workspace,code]});
test('native: concurrent manual creations produce exactly one AMKA folder',{skip:!native},async()=>{
 const code=amka(),r=await race(createStatement(code),createStatement(code));
 assert.match(r.error?.message||'',/amka_conflict/);assert.equal(await matchingCount(code),1);
});
test('native: manual creation wins before resolution and prevents a duplicate',{skip:!native},async()=>{
 const code=amka(),phone='6900000002';await patient('',phone);const i=await intake({phone,amka:code});
 const r=await race(createStatement(code),{text:resolveSql,args:resolveArgs(i)});
 assert.match(r.error?.message||'',/amka_conflict_requires_existing_patient/);await unchanged(i);assert.equal(await matchingCount(code),1);
});
test('native: resolution wins before manual creation and prevents a duplicate',{skip:!native},async()=>{
 const code=amka(),phone='6900000003';await patient('',phone);const i=await intake({phone,amka:code});
 const r=await race({text:resolveSql,args:resolveArgs(i)},createStatement(code));
 assert.match(r.error?.message||'',/amka_conflict/);assert.equal(await matchingCount(code),1);
 assert.equal((await q('select count(*)::int n from private.demo_assessments where intake_id=$1',[i.id]))[0].n,1);
});
test('native: simultaneous resolutions materialize clinical answers only once',{skip:!native},async()=>{
 const code=amka(),p=await patient(code),i=await intake({amka:code});
 const statement={text:resolveSql,args:resolveArgs(i,p.id)},r=await race(statement,statement);
 assert.match(r.error?.message||'',/intake_conflict_unavailable/);
 assert.equal((await q('select count(*)::int n from private.demo_assessments where intake_id=$1',[i.id]))[0].n,1);
});
test('native: concurrent demographic updates cannot assign one AMKA twice',{skip:!native},async()=>{
 const code=amka(),a=await patient(),b=await patient();
 const update=p=>({text:"select demo_patient_update_v2($1,$2,'Synthetic updated','',null,'','','',$3)",args:[workspace,p.id,code]});
 const r=await race(update(a),update(b));assert.match(r.error?.message||'',/amka_conflict/);assert.equal(await matchingCount(code),1);
});

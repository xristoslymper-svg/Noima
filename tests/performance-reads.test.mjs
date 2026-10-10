import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import ts from 'typescript';
import {readFileSync} from 'node:fs';
const compiled=path=>ts.transpileModule(readFileSync(path,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
const runtime=compiled('lib/patients/demo-runtime.ts'),summary=compiled('app/api/clinical/summary/route.ts');
function load(source,mocks,globals={}){const m={exports:{}};vm.runInNewContext(source,{module:m,exports:m.exports,require:id=>{if(!(id in mocks))throw Error(id);return mocks[id]},process:{env:{}},URL,Response,Request,Date,Intl,JSON,...globals});return m.exports}
const plain=value=>JSON.parse(JSON.stringify(value));
const deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b});return {promise,resolve,reject}};
const diagnosis=code=>({kind:'assessment',fields:[{key:'diagnosis',codes:code?[{code}]:[]}]});
function registry(fetch){return load(runtime,{'@/lib/pilot/request-scope':{pilotAuthorization:()=>({Authorization:'Bearer synthetic'})},'@/lib/clinical/identity':{isClinicalId:()=>true}},{fetch}).listPatientRows}
const response=data=>({ok:true,text:async()=>JSON.stringify(data)});
test('registry waits for bootstrap, then starts all five reads without waiting for patients',async()=>{
 const bootstrap=deferred(),patients=deferred(),paths=[];
 const read=registry(async(url,init)=>{const u=new URL(url);paths.push(u.pathname);assert.equal(init.cache,'no-store');assert.equal(init.headers.Authorization,'Bearer synthetic');if(u.pathname.endsWith('demo_tester_bootstrap')){await bootstrap.promise;return response([])}assert.equal(u.searchParams.get('tester_id'),'eq.owned');if(u.pathname.endsWith('demo_patients'))await patients.promise;return response([])});
 const pending=read('owned');assert.equal(paths.length,1);bootstrap.resolve();await new Promise(setImmediate);assert.equal(paths.length,6);patients.resolve();assert.deepEqual(plain(await pending),[]);
});
test('bootstrap failure does not start downstream reads and read errors are not converted to empty success',async()=>{
 let calls=0;await assert.rejects(registry(async()=>{calls++;throw Error('bootstrap')})('a'),/bootstrap/);assert.equal(calls,1);
 await assert.rejects(registry(async url=>{if(url.includes('demo_sessions?'))throw Error('read failed');return response([])})('a'),/read failed/);
});
test('registry retains input order, stable dates, first matches, corrected diagnosis and older diagnosis fallback',async()=>{
 const patients=[{id:'b',created_at:'2026-01-01'},{id:'a',created_at:'2026-01-01'},{id:'empty',created_at:'2026-01-02'}];
 const sessions=[{id:'draft1',patient_id:'a',status:'draft',started_at:'2026-01-05'},{id:'draft2',patient_id:'a',status:'draft',started_at:'2026-01-04'},{id:'new',patient_id:'a',status:'completed',started_at:'2026-01-03'},{id:'old',patient_id:'a',status:'completed',started_at:'2026-01-02'},{id:'b1',patient_id:'b',status:'completed',started_at:'2026-01-03'},{id:'b2',patient_id:'b',status:'completed',started_at:'2026-01-03'}];
 const sections=[{patient_id:'a',session_id:'new',document:diagnosis('NEW')},{patient_id:'a',session_id:'old',document:diagnosis('OLD')},{patient_id:'a',session_id:'old',document:diagnosis('DUPLICATE')},{patient_id:'b',session_id:'b1',document:diagnosis('B')}];
 const corrections=[{session_id:'new',patch:{assessment:{after:diagnosis(null)}}},{session_id:'old',patch:{assessment:{after:diagnosis('CORRECTED')}}},{session_id:'old',patch:{assessment:{after:diagnosis('LATEST')}}},{session_id:'old',patch:{assessment:{after:{kind:'mse'}}}}];
 const appointments=[{id:'cancelled',patient_id:'a',status:'cancelled',scheduled_end:'2099-01-01'},{id:'past',patient_id:'a',status:'scheduled',scheduled_end:'2000-01-01'},{id:'next',patient_id:'a',status:'scheduled',scheduled_end:'2099-01-01'},{id:'later',patient_id:'a',status:'scheduled',scheduled_end:'2099-02-01'}];
 const tables={demo_patients:patients,demo_sessions:sessions,demo_session_sections:sections,demo_session_corrections:corrections,demo_calendar_events:appointments};
 const snapshot=JSON.stringify(tables);const read=registry(async url=>response(tables[new URL(url).pathname.split('/').at(-1)]||[]));
 const result=plain(await read('a'));assert.deepEqual(result.map(r=>r.id),['b','a','empty']);assert.deepEqual(result.map(r=>r.registry_number),[2,1,3]);assert.equal(result[0].last_session.id,'b1');assert.equal(result[1].last_session.id,'new');assert.equal(result[1].draft.id,'draft1');assert.equal(result[1].diagnosis.code,'LATEST');assert.equal(result[1].next_appointment.id,'next');assert.equal(result[2].diagnosis,null);assert.equal(result[2].last_session,null);assert.equal(JSON.stringify(tables),snapshot);
 corrections.push({session_id:'old',patch:{assessment:{after:diagnosis('UPDATED')}}});assert.equal((await read('a'))[1].diagnosis.code,'UPDATED');
});
function summaryHandler({bundle=async()=>({hash:'fresh'}),cache=async()=>[{context_hash:'fresh',policy_version:7,findings:['verified']}]}={}){
 return load(summary,{'@/lib/pilot/route':{withPilot:f=>f},'@/lib/patients/demo-runtime':{patientBundle:bundle,request:cache},'@/lib/clinical/identity':{isClinicalId:id=>Boolean(id)},'@/lib/clinical/clinical-card':{buildClinicalCard:(b,c,f)=>({hash:b.hash,findings:f})},'@/lib/clinical/summary-context':{buildSummaryContext:()=>({day:'2026-10-09'}),summaryContextHash:async b=>b.hash,SUMMARY_POLICY_VERSION:7}}).GET;
}
const summaryRequest=()=>new Request('https://qa.test/api/clinical/summary?tester=owned&patient_id=patient');
test('summary reads overlap but never returns before fresh bundle validation',async()=>{
 const b=deferred(),c=deferred();let bundleStarted=false,cacheStarted=false,finished=false;
 const handler=summaryHandler({bundle:async(t,p)=>{assert.equal(t,'owned');assert.equal(p,'patient');bundleStarted=true;return b.promise},cache:async path=>{assert.match(path,/tester_id=eq.owned&patient_id=eq.patient/);cacheStarted=true;return c.promise}});
 const pending=handler(summaryRequest()).then(r=>{finished=true;return r});assert.ok(bundleStarted&&cacheStarted);c.resolve([{context_hash:'fresh',policy_version:7,findings:['verified']}]);await new Promise(setImmediate);assert.equal(finished,false);b.resolve({hash:'fresh'});const r=await pending;assert.equal(r.status,200);assert.equal(r.headers.get('cache-control'),'no-store');assert.deepEqual((await r.json()).card,{hash:'fresh',findings:['verified']});
});
test('missing, stale, or old-policy cache never serves a card; either read failure fails closed',async()=>{
 for(const rows of [[],[{context_hash:'old',policy_version:7}],[{context_hash:'fresh',policy_version:6}]]){const r=await summaryHandler({cache:async()=>rows})(summaryRequest());assert.equal(r.status,404);assert.equal((await r.json()).card,undefined)}
 for(const options of [{bundle:async()=>{throw Error('missing patient')}},{cache:async()=>{throw Error('unavailable')}}])assert.equal((await summaryHandler(options)(summaryRequest())).status,503);
});
test('concurrent patient reads retain their own bundle and cache',async()=>{
 const handler=summaryHandler({bundle:async(t,p)=>({hash:p}),cache:async path=>[{context_hash:new URL('https://qa.test/'+path).searchParams.get('patient_id').slice(3),policy_version:7,findings:[]}]});
 const result=await Promise.all(['a','b'].map(async p=>(await handler(new Request('https://qa.test/api/clinical/summary?tester=owned&patient_id='+p))).json()));assert.deepEqual(result.map(r=>r.card.hash),['a','b']);
});

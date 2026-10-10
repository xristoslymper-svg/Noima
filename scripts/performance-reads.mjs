import ts from 'typescript';
import {execFileSync} from 'node:child_process';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
import {performance} from 'node:perf_hooks';
const mode=process.argv[2]||'current';
const root=new URL('../',import.meta.url);
const sourceAt=async path=>mode==='current'?readFile(new URL(path,root),'utf8'):execFileSync('git',['show',mode+':'+path],{cwd:root,encoding:'utf8'});
const source=await sourceAt('lib/patients/demo-runtime.ts');
const summary=await sourceAt('app/api/clinical/summary/route.ts');
const compile=(s,mocks,extra={})=>{const m={exports:{}};vm.runInNewContext(ts.transpileModule(s,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{module:m,exports:m.exports,require:n=>{if(n in mocks)return mocks[n];throw Error(n)},process:{env:{}},Request,Response,URL,Date,Intl,console,JSON,...extra});return m.exports};
const wait=ms=>new Promise(r=>setTimeout(r,ms));
const fixtures=n=>{const patients=Array.from({length:n},(_,i)=>({id:'p'+i,created_at:new Date(1700000000000+i).toISOString()}));const sessions=patients.flatMap(p=>Array.from({length:20},(_,j)=>({id:p.id+'s'+j,patient_id:p.id,status:j===0?'draft':'completed',started_at:new Date(1700000000000+j*86400000).toISOString()})));return {patients,sessions,sections:sessions.map(s=>({patient_id:s.patient_id,session_id:s.id,document:{kind:'assessment',fields:[{key:'diagnosis',codes:[{code:'QA'}]}]}})),appointments:patients.map(p=>({patient_id:p.id,status:'scheduled',scheduled_end:'2099-01-01'})),corrections:[]}};
async function registry(n,delay){const f=fixtures(n);let calls=0;const paths=[];const mod=compile(source,{'@/lib/pilot/request-scope':{pilotAuthorization:()=>({})},'@/lib/clinical/identity':{isClinicalId:()=>true}},{fetch:async url=>{calls++;const path=new URL(url).pathname;paths.push(path);await wait(delay);const data=path.endsWith('demo_patients')?f.patients:path.endsWith('demo_sessions')?f.sessions:path.endsWith('demo_calendar_events')?f.appointments:path.endsWith('demo_session_sections')?f.sections:[];return {ok:true,text:async()=>JSON.stringify(data)}}});const t=performance.now();const value=await mod.listPatientRows('synthetic-workspace');return {ms:performance.now()-t,calls,rows:value.length,paths};}
async function briefing(){let calls=0;const mod=compile(summary,{'@/lib/pilot/route':{withPilot:f=>f},'@/lib/patients/demo-runtime':{patientBundle:async()=>{calls++;await wait(80);return {}},request:async()=>{calls++;await wait(40);return [{context_hash:'same',policy_version:1,findings:[]}]},rpc:async()=>{}},'@/lib/clinical/identity':{isClinicalId:()=>true},'@/lib/clinical/clinical-card':{buildClinicalCard:()=>({})},'@/lib/clinical/summary-context':{buildSummaryContext:()=>({day:'2026-10-09'}),summaryContextHash:async()=> 'same',SUMMARY_POLICY_VERSION:1}});const t=performance.now();const r=await mod.GET(new Request('https://synthetic.test/api/clinical/summary?patient_id=qa&tester=qa'));return {ms:performance.now()-t,calls,status:r.status};}
const results=[];for(const [name,run] of [['registry-small-40ms',()=>registry(10,40)],['registry-large-0ms',()=>registry(1000,0)],['briefing-cache-40ms',briefing]]){const cold=await run();const samples=[];for(let i=0;i<7;i++)samples.push(await run());const times=samples.map(s=>s.ms).sort((a,b)=>a-b);results.push({name,firstRunMs:cold.ms,medianMs:times[3],minMs:times[0],maxMs:times.at(-1),calls:cold.calls,samples});}
console.log(JSON.stringify({revision:mode,node:process.version,environment:'Node function harness; synthetic dependencies, NOT browser E2E',results},null,2));



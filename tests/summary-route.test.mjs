import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import ts from 'typescript';
import * as context from '../lib/clinical/summary-context.ts';
import {isClinicalId} from '../lib/clinical/identity.ts';
const code=ts.transpileModule(await readFile('app/api/clinical/summary/route.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
const fixture=()=>({patient:{id:'61dd44b6-bd6f-cd2a-c3ac-b0092d267eb1',chief_complaint:'Fictional'},sessions:[{id:'s',status:'completed',completed_at:'2026-10-03T09:00:00Z'}],sections:[{id:'n',session_id:'s',section_key:'plan',content:'Continue old medication.'}],risks:[{session_id:'s',suicidal_ideation:'unknown',intent:'not_assessed',plan:'not_assessed',self_harm:'unknown',attempt_history:'positive'}],history:null,medications:[],medicationEvents:[],medicationSideEffects:[],medicationRevisions:[],proposals:[],addenda:[{id:'a',session_id:'s',kind:'correction',content:'The old continuation plan is withdrawn.',created_at:'2026-10-03'}],assessments:[{id:'p',instrument:'PHQ-9',status:'completed',score:9,item9_review:true,item9_reviewed_at:null,created_at:'2026-10-03'}],appointments:[]});
function route(bundle,fetcher,env={OPENAI_API_KEY:'local-fixture'},db={}){
 const cacheRows=async()=>db.cache?[db.cache]:[];
 const apiRequest=async(path)=>path.startsWith('demo_clinical_summary_cache?')?cacheRows():[];
 const apiRpc=async(name,args)=>{
  db.calls??=[];
  db.calls.push({name,args});
  if(name==='demo_clinical_summary_request'){db.requestedHash=args.p_context_hash;return null}
  if(name==='demo_clinical_summary_commit'){
   if(db.commitResult===false||db.requestedHash!==args.p_context_hash)return false;
   db.cache={tester_id:args.p_tester,patient_id:args.p_patient,context_hash:args.p_context_hash,findings:args.p_findings,sources:args.p_sources,generated_at:args.p_generated_at,model:args.p_model,policy_version:args.p_policy_version,updated_at:args.p_generated_at};
   return true;
  }
  throw new Error('unexpected_rpc:'+name);
 };
 const module={exports:{}};const sandbox={module,exports:module.exports,console:{error(){}},Error,Response,URL,AbortSignal,process:{env},fetch:fetcher,require:id=>id.includes('pilot/route')?{withPilot:handler=>handler}:id.includes('demo-runtime')?{patientBundle:async()=>{if(bundle instanceof Error)throw bundle;return bundle},request:apiRequest,rpc:apiRpc}:id.includes('identity')?{isClinicalId}:context};vm.runInNewContext(code,sandbox);return module.exports;
}
const request=(body={})=>new Request('http://localhost/api/clinical/summary',{method:'POST',body:JSON.stringify({tester:'668a6cc0-1692-4c17-a807-c84d09e9f02e',patient_id:'61dd44b6-bd6f-cd2a-c3ac-b0092d267eb1',...body})});
const response=data=>Response.json({status:'completed',output:[{content:[{type:'output_text',text:JSON.stringify(data)}]}]});
test('provider failure and unsupported claims return canonical facts, never obsolete narrative',async()=>{
 for(const f of [async()=>{throw Error('network')},async()=>new Response('',{status:503}),async()=>Response.json({output:[{content:[{type:'output_text',text:'invalid JSON'}]}]}),async()=>Response.json({output:[{content:[{type:'output_text',text:JSON.stringify({findings:[{label:'Ψυχομετρικά',text:'Item 9 reviewed',source_ids:['assessment:p'],attention:false}]})}]}]})]){
  const r=await route(fixture(),f).POST(request());assert.equal(r.status,200);const d=await r.json();assert.equal(d.mode,'canonical');assert.ok(d.findings.some(x=>x.key==='review:p'&&x.attention));assert.ok(!d.findings.some(x=>x.text.includes('Continue old medication.')));assert.ok(d.findings.some(x=>x.text.includes('withdrawn')));
 }
});
test('one unsupported finding rejects entire synthesis, not silent filtering',async()=>{
 const b=fixture();b.addenda=[];b.sections[0].content='Sleep is better.';const f=async()=>Response.json({output:[{content:[{type:'output_text',text:JSON.stringify({findings:[{text:'Sleep is better.',source_ids:['section:n']},{text:'Unsupported recommendation.',source_ids:['bogus']}]})}]}]});
 const d=await (await route(b,f).POST(request())).json();assert.equal(d.mode,'canonical');assert.ok(!d.findings.some(x=>x.origin==='synthesis'));
});
test('stale hash conflicts before provider call; database errors fail closed',async()=>{
 let calls=0;const handler=route(fixture(),async()=>{calls++;throw Error('should not call')});assert.equal((await handler.POST(request({context_hash:'outdated'}))).status,409);assert.equal(calls,0);assert.equal((await route(Error('database offline')).POST(request())).status,503);assert.equal((await route(Error('patient_not_found')).POST(request())).status,404);
});
test('seeded ID succeeds without configured provider and real-data mode is denied',async()=>{
 const r=await route(fixture(),null,{}).POST(request());assert.equal(r.status,200);assert.equal((await r.json()).mode,'canonical');assert.equal((await route(fixture(),null,{CLINICAL_DATA_MODE:'real'}).POST(request())).status,403);
});
test('stale generation claims cannot commit over a newer requested context',async()=>{
 const b=fixture();b.addenda=[];b.sections[0].content='Sleep is better.';const db={commitResult:false};let calls=0;
 const handler=route(b,async()=>{calls++;return response(calls%2===1?{findings:[{text:'Sleep is better.',source_ids:['section:n']}]}:{checks:[{key:'briefing:0',supported:true,issue:'none'}]})},{OPENAI_API_KEY:'local-fixture'},db);
 const r=await handler.POST(request());const d=await r.json();assert.equal(r.status,409,JSON.stringify(d));assert.equal(d.code,'stale_context');
 assert.deepEqual(db.calls.map(x=>x.name),['demo_clinical_summary_request','demo_clinical_summary_commit']);assert.equal(db.cache,undefined);
});

test('supported synthesis is cached only by exact canonical context and never writes clinical state',async()=>{
 const b=fixture();b.addenda=[];b.sections[0].content='Sleep is better.';const before=JSON.stringify(b);let calls=0;const db={};const handler=route(b,async()=>{calls++;return Response.json({output:[{content:[{type:'output_text',text:JSON.stringify(calls%2===0?{checks:[{key:'briefing:0',supported:true,issue:'none'}]}:{findings:[{text:'Sleep is better.',source_ids:['section:n']}]})}]}]})},{OPENAI_API_KEY:'local-fixture'},db);
 const first=await (await handler.POST(request())).json();assert.equal(first.mode,'synthesis',JSON.stringify({first,calls,dbCalls:db.calls}));assert.ok(first.findings.some(f=>f.origin==='synthesis'));
 const cached=await (await handler.GET(new Request('http://localhost/api/clinical/summary?tester=668a6cc0-1692-4c17-a807-c84d09e9f02e&patient_id=61dd44b6-bd6f-cd2a-c3ac-b0092d267eb1'))).json();assert.equal(calls,2);assert.equal(cached.context_hash,first.context_hash);assert.equal(JSON.stringify(b),before);
 b.history={allergies:'New allergy'};const changed=await (await handler.POST(request())).json();assert.equal(calls,4);assert.notEqual(changed.context_hash,first.context_hash);
});

test('valid IDs alone never establish grounding: verifier rejection, missing and duplicated verdicts fail closed',async()=>{
 const b=fixture();b.addenda=[];
 for(const checks of [[{key:'briefing:0',supported:false,issue:'uncertainty'}],[],[{key:'wrong',supported:true,issue:'none'}],[{key:'briefing:0',supported:true,issue:'none'},{key:'briefing:0',supported:true,issue:'none'}]]){
 let calls=0;const handler=route(b,async()=>++calls===1?response({findings:[{text:'Confirmed bipolar diagnosis without uncertainty.',source_ids:['section:n']}]}):response({checks}));
 const d=await (await handler.POST(request())).json();assert.equal(d.mode,'canonical');assert.equal(d.reason,'grounding_not_verified');assert.ok(!d.findings.some(f=>f.origin==='synthesis'));
 }
});
test('provider receives the full source contract; verification sees only cited evidence plus canonical/correction safeguards',async()=>{
 const b=fixture();b.addenda=[];b.sections[0].content='Sleep is better.';let calls=0;const handler=route(b,async(u,o)=>{
 const input=JSON.parse(JSON.parse(o.body).input);if(++calls===1){assert.ok(input.sources.some(s=>s.id==='section:n'));assert.ok(input.sources.some(s=>s.id==='assessment:p'));return response({findings:[{text:'Sleep is better.',source_ids:['section:n']}]});}
 assert.deepEqual(input.findings[0].sources.map(s=>s.id),['section:n']);assert.ok(input.canonical.some(s=>s.id==='assessment:p'));return response({checks:[{key:'briefing:0',supported:true,issue:'none'}]});
 });assert.equal((await (await handler.POST(request())).json()).mode,'synthesis');
});
test('successful synthesis appends only genuine safety warnings, without canonical medication/effect/chart dump',async()=>{
 const b=fixture();b.addenda=[];b.risks=[{session_id:'s',suicidal_ideation:'negative',intent:'not_assessed',plan:'not_assessed',self_harm:'negative',attempt_history:'negative',harm_to_others:'negative'}];b.assessments=[];b.medications=[{id:'m',status:'active',medication_name:'Escitalopram',dose:10}];b.sections[0].content='Mild nausea nearly resolved.';
 let calls=0;const d=await(await route(b,async()=>++calls===1?response({findings:[{text:'Reports mild nausea nearly resolved.',source_ids:['section:n']}]}):response({checks:[{key:'briefing:0',supported:true,issue:'none'}]})).POST(request())).json();assert.equal(d.mode,'synthesis');assert.equal(d.findings.length,1);assert.ok(d.findings.every(f=>f.origin==='synthesis'));
});
test('incomplete or empty output cannot be cached as successful synthesis',async()=>{
 for(const payload of [{status:'incomplete',output:[{content:[{type:'output_text',text:JSON.stringify({findings:[]})}]}]},{output:[{content:[{type:'output_text',text:JSON.stringify({findings:[]})}]}]}]){
 const d=await(await route(fixture(),async()=>Response.json(payload)).POST(request())).json();assert.equal(d.mode,'canonical');assert.ok(['incomplete_output','invalid_count'].includes(d.reason));
 }
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import ts from 'typescript';
import * as context from '../lib/clinical/summary-context.ts';
import {isClinicalId} from '../lib/clinical/identity.ts';
const code=ts.transpileModule(await readFile('app/api/clinical/summary/route.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
const fixture=()=>({patient:{id:'61dd44b6-bd6f-cd2a-c3ac-b0092d267eb1',chief_complaint:'Fictional'},sessions:[{id:'s',status:'completed',completed_at:'2026-10-03T09:00:00Z'}],sections:[{id:'n',session_id:'s',section_key:'plan',content:'Continue old medication.'}],risks:[{session_id:'s',suicidal_ideation:'unknown',intent:'not_assessed',plan:'not_assessed',self_harm:'unknown',attempt_history:'positive'}],history:null,medications:[],medicationEvents:[],medicationSideEffects:[],medicationRevisions:[],proposals:[],addenda:[{id:'a',session_id:'s',kind:'correction',content:'The old continuation plan is withdrawn.',created_at:'2026-10-03'}],assessments:[{id:'p',instrument:'PHQ-9',status:'completed',score:9,item9_review:true,item9_reviewed_at:null,created_at:'2026-10-03'}],appointments:[]});
function route(bundle,fetcher,env={OPENAI_API_KEY:'local-fixture'}){
 const module={exports:{}};const sandbox={module,exports:module.exports,Error,Response,AbortSignal,process:{env},fetch:fetcher,require:id=>id.includes('demo-runtime')?{patientBundle:async()=>{if(bundle instanceof Error)throw bundle;return bundle}}:id.includes('identity')?{isClinicalId}:context};vm.runInNewContext(code,sandbox);return module.exports;
}
const request=(body={})=>new Request('http://localhost/api/clinical/summary',{method:'POST',body:JSON.stringify({tester:'668a6cc0-1692-4c17-a807-c84d09e9f02e',patient_id:'61dd44b6-bd6f-cd2a-c3ac-b0092d267eb1',...body})});
test('provider failure and unsupported claims return canonical facts, never obsolete narrative',async()=>{
 for(const f of [async()=>{throw Error('network')},async()=>new Response('',{status:503}),async()=>Response.json({output:[{content:[{type:'output_text',text:'invalid JSON'}]}]}),async()=>Response.json({output:[{content:[{type:'output_text',text:JSON.stringify({findings:[{label:'Ψυχομετρικά',text:'Item 9 reviewed',source_ids:['assessment:p'],attention:false}]})}]}]})]){
  const r=await route(fixture(),f).POST(request());assert.equal(r.status,200);const d=await r.json();assert.equal(d.mode,'canonical');assert.ok(d.findings.some(x=>x.key==='review:p'&&x.attention));assert.ok(!d.findings.some(x=>x.text.includes('Continue old medication.')));assert.ok(d.findings.some(x=>x.text.includes('withdrawn')));
 }
});
test('one unsupported finding rejects entire synthesis, not silent filtering',async()=>{
 const b=fixture();b.addenda=[];b.sections[0].content='Sleep is better.';const f=async()=>Response.json({output:[{content:[{type:'output_text',text:JSON.stringify({findings:[{label:'Τρέχουσα εικόνα',quotes:[{source_id:'section:n',quote:'Sleep is better.'}]},{label:'Πλάνο',quotes:[{source_id:'bogus',quote:'Unsupported recommendation.'}]}]})}]}]});
 const d=await (await route(b,f).POST(request())).json();assert.equal(d.mode,'canonical');assert.ok(!d.findings.some(x=>x.origin==='synthesis'));
});
test('stale hash conflicts before provider call; database errors fail closed',async()=>{
 let calls=0;const handler=route(fixture(),async()=>{calls++;throw Error('should not call')});assert.equal((await handler.POST(request({context_hash:'outdated'}))).status,409);assert.equal(calls,0);assert.equal((await route(Error('database offline')).POST(request())).status,503);assert.equal((await route(Error('patient_not_found')).POST(request())).status,404);
});
test('seeded ID succeeds without configured provider and real-data mode is denied',async()=>{
 const r=await route(fixture(),null,{}).POST(request());assert.equal(r.status,200);assert.equal((await r.json()).mode,'canonical');assert.equal((await route(fixture(),null,{CLINICAL_DATA_MODE:'real'}).POST(request())).status,403);
});
test('supported synthesis is cached only by exact canonical context and never writes clinical state',async()=>{
 const b=fixture();b.addenda=[];b.sections[0].content='Sleep is better.';const before=JSON.stringify(b);let calls=0;const handler=route(b,async()=>{calls++;return Response.json({output:[{content:[{type:'output_text',text:JSON.stringify({findings:[{label:'Τρέχουσα εικόνα',quotes:[{source_id:'section:n',quote:'Sleep is better.'}]}]})}]}]})});
 const first=await (await handler.POST(request())).json();assert.equal(first.mode,'synthesis');assert.ok(first.findings.some(f=>f.origin==='synthesis'));await handler.POST(request());assert.equal(calls,1);assert.equal(JSON.stringify(b),before);b.history={allergies:'New allergy'};const changed=await (await handler.POST(request())).json();assert.equal(calls,2);assert.notEqual(changed.context_hash,first.context_hash);
});

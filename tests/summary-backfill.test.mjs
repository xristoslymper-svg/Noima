import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import ts from 'typescript';
import {isClinicalId} from '../lib/clinical/identity.ts';

const code=ts.transpileModule(
  await readFile('app/api/clinical/summary/backfill/route.ts','utf8'),
  {compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}
).outputText;

function route({patients=[],cached=[]}={},fetcher=async()=>new Response(null,{status:200})){
 let afterTask=null;
 const module={exports:{}};
 const sandbox={
  module,exports:module.exports,Request,Response,URL,console,fetch:fetcher,
  require:id=>{
   if(id==='next/server')return {after:fn=>{afterTask=fn}};
   if(id.includes('pilot/route'))return {withPilot:handler=>handler};
   if(id.includes('demo-runtime'))return {
    listPatientRows:async()=>patients,
    request:async path=>{
     if(path.startsWith('demo_clinical_summary_cache?'))return cached.map(patient_id=>({patient_id}));
     throw new Error('unexpected_request:'+path);
    },
   };
   if(id.includes('identity'))return {isClinicalId};
   throw new Error('unexpected_require:'+id);
  },
 };
 vm.runInNewContext(code,sandbox);
 return {handler:module.exports,runAfter:async()=>{if(afterTask)await afterTask()},hasAfter:()=>Boolean(afterTask)};
}

const tester='668a6cc0-1692-4c17-a807-c84d09e9f02e';
const patient=id=>({id,last_session:{id:'session-'+id}});

test('summary backfill queues at most two completed patients missing cache',async()=>{
 const calls=[];
 const patients=[patient('11111111-1111-4111-8111-111111111111'),patient('22222222-2222-4222-8222-222222222222'),patient('33333333-3333-4333-8333-333333333333'),{id:'44444444-4444-4444-8444-444444444444',last_session:null}];
 const cached=['22222222-2222-4222-8222-222222222222'];
 const {handler,runAfter}=route({patients,cached},async(url,options)=>{calls.push({url:String(url),options});return new Response(null,{status:200})});
 const req=new Request('https://noima.test/api/clinical/summary/backfill',{method:'POST',headers:{'Content-Type':'application/json','Cookie':'session=abc'},body:JSON.stringify({tester})});
 const res=await handler.POST(req);
 assert.equal(res.status,200);
 assert.deepEqual(await res.json(),{queued:2});
 await runAfter();
 assert.equal(calls.length,2);
 assert.deepEqual(calls.map(call=>JSON.parse(call.options.body).patient_id),['11111111-1111-4111-8111-111111111111','33333333-3333-4333-8333-333333333333']);
 assert.ok(calls.every(call=>call.url==='https://noima.test/api/clinical/summary'));
 assert.ok(calls.every(call=>call.options.headers.Cookie==='session=abc'));
 assert.ok(calls.every(call=>Object.keys(JSON.parse(call.options.body)).join(',')==='patient_id'));
});

test('summary backfill is a no-op when every completed patient is already cached',async()=>{
 const id='11111111-1111-4111-8111-111111111111';
 const {handler,hasAfter}=route({patients:[patient(id)],cached:[id]});
 const req=new Request('https://noima.test/api/clinical/summary/backfill',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({tester})});
 const res=await handler.POST(req);
 assert.equal(res.status,200);
 assert.deepEqual(await res.json(),{queued:0});
 assert.equal(hasAfter(),false);
});

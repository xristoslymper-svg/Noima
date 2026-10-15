import test from 'node:test';
import * as upcoming from '../lib/calendar/upcoming.ts';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
const compile=path=>ts.transpileModule(readFileSync(path,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
const pure={exports:{}};new Function('require','module','exports',compile('lib/overview/record-search.ts'))(()=>upcoming,pure,pure.exports);
const {matchPatients,recordAnswer}=pure.exports;
const patient={id:'11111111-1111-4111-8111-111111111111',first_name:'Μαρία',last_name:'Παπαδοπούλου'};
const other={...patient,id:'22222222-2222-4222-8222-222222222222'};
test('names ignore accents and support Greek genitive without selecting a namesake',()=>{
 assert.equal(matchPatients([patient,other],'Μαρίας Παπαδοπούλου').length,2);
 assert.equal(matchPatients([patient],'μαρια παπαδοπουλου')[0].id,patient.id);
 assert.deepEqual(matchPatients([patient],''),[]);
});
const bundle={patient:{...patient,amka:'SECRET'},medications:[],sessions:[],appointments:[]};
test('medication answers exclude stopped/future plans and never expose patient identifiers',()=>{
 const answer=recordAnswer({...bundle,medications:[{status:'active',medication_name:'ACTIVE',dose:10,unit:'mg',frequency:'Πρωί',started_at:'2026-01-01',effective_from:'2026-10-01'},{status:'stopped',medication_name:'STOPPED'},{status:'planned',medication_name:'FUTURE'}]},'medications');
 assert.match(answer.answer,/ACTIVE/);assert.doesNotMatch(answer.answer,/STOPPED|FUTURE/);assert.equal(answer.patient.amka,undefined);assert.match(answer.sources[0].href,/tab=medications/);
 assert.match(recordAnswer(bundle,'medications').answer,/δεν επιβεβαιώνει/);
});
test('last visit excludes newer drafts and links to exact completed session',()=>{
 const answer=recordAnswer({...bundle,sessions:[{id:'draft',status:'draft',started_at:'2026-10-14'},{id:'complete',status:'completed',session_type:'follow_up',started_at:'2026-10-12'}]},'last_visit');
 assert.match(answer.sources[0].href,/session=complete/);assert.doesNotMatch(answer.answer,/14 Οκτωβρίου/);
});
test('next appointment excludes past and cancelled appointments',()=>{
 const answer=recordAnswer({...bundle,appointments:[{id:'past',status:'scheduled',scheduled_start:'2026-10-01'},{id:'cancel',status:'cancelled',scheduled_start:'2026-10-15'},{id:'next',status:'scheduled',scheduled_start:'2026-10-16'}]},'next_appointment',Date.parse('2026-10-14'));
 assert.match(answer.sources[0].href,/appointment=next/);
});
function route(intent,options={}){
 let bundleReads=0,rosterReads=0,providerBody;
 const module={exports:{}};
 const runtime={request:async()=>{rosterReads++;return options.roster||[patient]},patientBundle:async()=>{bundleReads++;return bundle},rpc:async()=>options.tasks||[]};
 const process={env:{OPENAI_API_KEY:'test'}};
 const fetch=async(url,init)=>{providerBody=JSON.parse(init.body);return {ok:true,json:async()=>({output:[{content:[{type:'output_text',text:JSON.stringify(intent)}]}]})}};
 new Function('require','module','exports','process','fetch','Response','AbortSignal',compile('app/api/records/search/route.ts'))(id=>id.endsWith('pilot/route')?{withPilot:fn=>async req=>{const b=await req.json();return fn(new Request(req.url,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...b,tester:'workspace'})}))}}:id.endsWith('demo-runtime')?runtime:id.endsWith('identity')?{isClinicalId:value=>typeof value==='string'&&/^[a-f0-9-]{36}$/.test(value)}:pure.exports,module,module.exports,process,fetch,Response,AbortSignal);
 return {post:body=>module.exports.POST(new Request('https://noima.test/api/records/search',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({query:'Τι αγωγή παίρνει η Μαρία Παπαδοπούλου;',...body})})),stats:()=>({bundleReads,rosterReads,providerBody})};
}
test('ambiguous names require selection before clinical data is fetched',async()=>{
 const api=route({patient_name:'Μαρία Παπαδοπούλου',topic:'medications'},{roster:[patient,other]});const response=await api.post({});const data=await response.json();assert.equal(data.choices.length,2);assert.equal(api.stats().bundleReads,0);
});
test('forged patient choice cannot escape roster or match',async()=>{
 const api=route({patient_name:'Μαρία Παπαδοπούλου',topic:'medications'});assert.equal((await api.post({choice_id:other.id})).status,400);assert.equal(api.stats().bundleReads,0);
});
test('unsupported questions never retrieve clinical records; provider receives only question',async()=>{
 const api=route({patient_name:'',topic:'unsupported'});await api.post({});assert.equal(api.stats().rosterReads,0);assert.equal(api.stats().bundleReads,0);assert.equal(typeof api.stats().providerBody.input,'string');assert.equal(api.stats().providerBody.store,false);
});
test('task answers contain only this patient open tasks',async()=>{
 const api=route({patient_name:'Μαρία Παπαδοπούλου',topic:'tasks'},{tasks:[{patient_id:patient.id,status:'open',title:'OPEN',source_session_id:'draft'},{patient_id:patient.id,status:'completed',title:'CLOSED'},{patient_id:other.id,status:'open',title:'OTHER'}]});const data=await (await api.post({})).json();assert.match(data.answer,/OPEN/);assert.doesNotMatch(data.answer,/CLOSED|OTHER/);assert.match(data.sources[0].href,/session=draft/);
});

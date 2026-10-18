import test from 'node:test';
import assert from 'node:assert/strict';
import {fastAnswer,syntheticAnswer,answerStream} from '../lib/copilot/fast.ts';
import {sseData} from '../lib/copilot/stream.ts';
import {copilotPatients} from './fixtures/copilot.mjs';
const env={...process.env},originalFetch=globalThis.fetch;
test.afterEach(()=>{process.env={...env};globalThis.fetch=originalFetch});
const encoder=new TextEncoder();
function stream(events,bytewise=false){
 const bytes=encoder.encode(events.map(e=>'data: '+JSON.stringify(e)+'\r\n\r\n').join(''));
 return new ReadableStream({start(c){if(bytewise)for(const b of bytes)c.enqueue(Uint8Array.of(b));else c.enqueue(bytes);c.close()}});
}
function setup(events){Object.assign(process.env,{CLINICAL_DATA_MODE:'synthetic',COPILOT_SYNTHETIC_APPROVED:'true',EXTERNAL_AI_ENABLED:'true',OPENAI_API_KEY:'test',OPENAI_COPILOT_MODEL:'judge',OPENAI_COPILOT_FAST_MODEL:'fast'});
 const calls=[];globalThis.fetch=async(_,init)=>{calls.push(JSON.parse(init.body));return new Response(stream(events,true))};return calls;}
const delta={type:'response.output_text.delta',delta:'Αϋπνία.'};
const complete={type:'response.completed',response:{status:'completed',usage:{input_tokens:10,output_tokens:3}}};
test('SSE decoder preserves Greek UTF-8 split across byte and CRLF boundaries',async()=>{
 const out=[];for await(const value of sseData(stream([delta,complete],true)))out.push(JSON.parse(value));
 assert.deepEqual(out,[delta,complete]);
});
test('one provider call streams before completion and carries usage',async()=>{
 const calls=setup([delta,complete]),out=[];
 const controller=new AbortController();
 const response=answerStream(fastAnswer(copilotPatients()[0],'Πώς είναι;',null),{patient:{id:'one'}},()=>({conversation:'sealed'}),controller);
 for await(const value of sseData(response.body))out.push(JSON.parse(value));
 assert.equal(calls.length,1);assert.equal(calls[0].stream,true);assert.equal(calls[0].reasoning.effort,'none');
 assert.equal(out[0].type,'meta');assert.equal(out[1].text,'Αϋπνία.');assert.equal(out[2].type,'done');
 assert.equal(out[2].conversation,'sealed');assert.equal(out[2].usage.calls,1);
 assert.doesNotMatch(calls[0].input,/UNAPPROVED_DRAFT|SYNTHETIC_IDENTIFIER|example.invalid/);
});
test('truncated and incomplete provider streams never emit a successful completion',async()=>{
 for(const events of [[delta],[delta,{type:'response.incomplete'}]]){
  setup(events);const out=[];
  for await(const value of sseData(answerStream(fastAnswer(copilotPatients()[0],'Πώς είναι;',null),{},()=>{throw new Error('must not seal')},new AbortController()).body))out.push(JSON.parse(value));
  assert.equal(out.at(-1).type,'error');assert.ok(!out.some(e=>e.type==='done'));
 }
});
test('foreign patient history is not sent; oversized charts do not add retrieval calls',async()=>{
 const calls=setup([delta,complete]),b=copilotPatients()[0];
 for await(const event of fastAnswer(b,'ύπνος',{patient_id:'foreign',answer:'FOREIGN_SECRET',question:'old',expires:1}))void event;
 assert.doesNotMatch(calls[0].input,/FOREIGN_SECRET/);
 b.sections[0].content='x'.repeat(150000);
 await assert.rejects(async()=>{for await(const event of fastAnswer(b,'πορεία',null))void event},/context_limit/);
 assert.equal(calls.length,1);
});
test('browser cancellation aborts upstream generation',async()=>{
 const abort=new AbortController();
 async function* slow(){await new Promise(resolve=>abort.signal.addEventListener('abort',resolve,{once:true}));}
 const response=answerStream(slow(),{},()=>({}),abort);
 await response.body.cancel();assert.equal(abort.signal.aborted,true);
});

test('application consumer receives a delta while provider completion is still pending',async()=>{
 setup([]);
 let finish;
 const gate=new Promise(resolve=>{finish=resolve});
 globalThis.fetch=async()=>new Response(new ReadableStream({async start(c){
  c.enqueue(encoder.encode('data: '+JSON.stringify(delta)+'\n\n'));
  await gate;
  c.enqueue(encoder.encode('data: '+JSON.stringify(complete)+'\n\n'));c.close();
 }}));
 const events=fastAnswer(copilotPatients()[0],'Πώς είναι;',null);
 const first=await events.next();assert.equal(first.value.type,'delta');
 finish();
 const final=await events.next();assert.equal(final.value.type,'done');
 await events.return();
});

test('fast configuration is independent of the legacy model and exposes unambiguous temporal anchors',async()=>{
 const calls=setup([delta,complete]);delete process.env.OPENAI_COPILOT_MODEL;delete process.env.OPENAI_CLINICAL_MODEL;
 for await(const event of fastAnswer(copilotPatients()[0],'πορεία',null))void event;
 const input=JSON.parse(calls[0].input);
 assert.equal(input.encounter_dates.latest_completed,'2026-09-10T09:00:00Z');
 assert.equal(input.encounter_dates.previous_completed,'2026-08-10T09:00:00Z');
 assert.equal(input.medication_timeline[0].dated_events[0].state.dose,10);
 assert.equal(input.medication_timeline[0].dated_events[1].date,'2026-05-10');
 assert.equal(input.medication_timeline[0].listing.dose,20);
 assert.equal(calls.length,1);
});

test('interactive preview uses fixed synthetic context and one streaming call',async()=>{
 const calls=setup([delta,complete]);
 Object.assign(process.env,{VERCEL_ENV:'preview',VERCEL_GIT_COMMIT_REF:'codex/clinical-copilot-agent',COPILOT_INTERACTIVE_SYNTHETIC:'true',COPILOT_SYNTHETIC_APPROVED:'false'});
 for await(const event of syntheticAnswer('Τι άλλαξε;',null)){}
 assert.equal(calls.length,1);
 assert.match(calls[0].input,/Fictional A/);
 await assert.rejects(async()=>{for await(const event of fastAnswer(copilotPatients()[0],'Τι άλλαξε;',null)){}});
});
test('synthetic permission cannot enable an unapproved production ref or unrelated preview',async()=>{
 const calls=setup([delta,complete]);
 for(const [environment,branch,enabled] of [['production','codex/clinical-copilot-agent','true'],['preview','main','true'],['preview','codex/clinical-copilot-agent','false']]){
 Object.assign(process.env,{VERCEL_ENV:environment,VERCEL_GIT_COMMIT_REF:branch,COPILOT_INTERACTIVE_SYNTHETIC:enabled});
 await assert.rejects(async()=>{for await(const event of syntheticAnswer('Τι άλλαξε;',null)){}},/synthetic_preview_disabled/);
 }
 assert.equal(calls.length,0);
});

test('released synthetic chart runs only on explicitly enabled production main in demo mode',async()=>{
 const calls=setup([delta,complete]);
 Object.assign(process.env,{VERCEL_ENV:'production',VERCEL_GIT_COMMIT_REF:'main',CLINICAL_DATA_MODE:'demo',COPILOT_INTERACTIVE_SYNTHETIC:'true'});
 for await(const event of syntheticAnswer('Τι άλλαξε;',null)){}
 assert.equal(calls.length,1);
 assert.match(calls[0].input,/Fictional A/);
 process.env.CLINICAL_DATA_MODE='real';
 await assert.rejects(async()=>{for await(const event of syntheticAnswer('Τι άλλαξε;',null)){}},/synthetic_preview_disabled/);
 assert.equal(calls.length,1);
});

test('actual single provider request masks chart notes, question and prior conversation',async()=>{
 const calls=setup([delta,complete]),b=copilotPatients()[0];
 b.patient.first_name='Νεφέλη';b.patient.last_name='Δειγματοπούλου';
 b.sections[0].content+=' Εργοδότης: Εργοστάσιο Δείγμα Άλφα; μητέρα: Άννα Κανελλοπούλου; mask-canary@example.invalid; +30 210 999 8888; ΑΜΚΑ 12345678901.';
 const previous={patient_id:b.patient.id,question:'Η Νεφέλη Δειγματοπούλου στο Εργοστάσιο Δείγμα Άλφα;',answer:'Η Άννα Κανελλοπούλου, mask-canary@example.invalid.',expires:Date.now()+10000};
 for await(const event of fastAnswer(b,'Τι άλλαξε για τη Νεφέλη Δειγματοπούλου στο Εργοστάσιο Δείγμα Άλφα;',previous)){}
 assert.equal(calls.length,1);
 assert.doesNotMatch(calls[0].input,/Νεφέλη|Δειγματοπούλου|Εργοστάσιο|Κανελλοπούλου|mask-canary@|999 8888|12345678901/);
 const payload=JSON.parse(calls[0].input);
 assert.match(payload.current_question,/ΑΣΘΕΝΗΣ/);
 assert.match(payload.previous.answer,/EMAIL/);
 assert.match(calls[0].input,/2026-09-10|Fictional A/);
});

test('treatment preview sends its own fixed chart and excludes foreign conversation',async()=>{
 const calls=setup([delta,complete]);
 Object.assign(process.env,{VERCEL_ENV:'preview',VERCEL_GIT_COMMIT_REF:'codex/copilot-preview-scope',COPILOT_INTERACTIVE_SYNTHETIC:'true'});
 for await(const event of syntheticAnswer('Ποια είναι η αγωγή;', {patient_id:'foreign',question:'FOREIGN_CHART_SECRET',answer:'FOREIGN_ANSWER',expires:Date.now()+1000},undefined,'treatment')){}
 assert.equal(calls.length,1);assert.match(calls[0].input,/Σερτραλίνη|σερτραλίν/);
 assert.doesNotMatch(calls[0].input,/FOREIGN_CHART_SECRET|FOREIGN_ANSWER|Fictional A/);
 assert.match(calls[0].instructions,/διοικητική ένδειξη/);
 assert.match(calls[0].instructions,/Δεν υπάρχει καταγεγραμμένη ολοκλήρωση επίσκεψης/);
 await assert.rejects(async()=>{for await(const event of syntheticAnswer('Πορεία;',null,undefined,'arbitrary')){}},/synthetic_chart_invalid/);
 assert.equal(calls.length,1);
});

test('new chart preview is branch-scoped, synthetic-only and respects AI off switch',async()=>{
 const calls=setup([delta,complete]);
 Object.assign(process.env,{VERCEL_ENV:'preview',VERCEL_GIT_COMMIT_REF:'codex/copilot-preview-scope',COPILOT_INTERACTIVE_SYNTHETIC:'false'});
 for await(const event of syntheticAnswer('Αγωγή;',null,undefined,'treatment')){}
 assert.equal(calls.length,1);
 for(const patch of [{CLINICAL_DATA_MODE:'real'},{EXTERNAL_AI_ENABLED:'false'},{VERCEL_GIT_COMMIT_REF:'other-branch'}]){
  Object.assign(process.env,{CLINICAL_DATA_MODE:'synthetic',EXTERNAL_AI_ENABLED:'true',VERCEL_GIT_COMMIT_REF:'codex/copilot-preview-scope'},patch);
  await assert.rejects(async()=>{for await(const event of syntheticAnswer('Αγωγή;',null,undefined,'treatment')){}},/synthetic_preview_disabled/);
 }
 assert.equal(calls.length,1);
});

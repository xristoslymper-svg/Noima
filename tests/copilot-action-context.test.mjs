import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
import {isClinicalId} from '../lib/clinical/identity.ts';
import {matchPatients,normalizedName} from '../lib/overview/record-search.ts';
const first={id:'10000000-0000-4000-8000-000000000001',first_name:'Same',last_name:'Name'};
const duplicate={...first,id:'10000000-0000-4000-8000-000000000002'};
const other={id:'10000000-0000-4000-8000-000000000003',first_name:'Other',last_name:'Person'};
const compiled=ts.transpileModule(readFileSync('app/api/copilot/route.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText;
function app(intent,prepare){
 const seen={understood:[],prepared:[],loaded:[]};const module={exports:{}};
 const mocks={
 '@/lib/pilot/route':{withPilot:f=>f},
 '@/lib/patients/demo-runtime':{request:async()=>[first,duplicate,other],patientBundle:async(w,id)=>{seen.loaded.push(id);return {patient:[first,duplicate,other].find(p=>p.id===id)};}},
 '@/lib/clinical/identity':{isClinicalId},
 '@/lib/overview/record-search':{matchPatients,normalizedName},
 '@/lib/mail/crypto':{seal:JSON.stringify,unseal:JSON.parse},
 '@/lib/copilot/provider':{assertCopilotPrivacy(){}},
 '@/lib/copilot/clinical':{understand:async(q,m)=>{seen.understood.push(structuredClone(m));return {tool:'calendar',patient_name:'',use_current_patient:true,question:q,...(typeof intent==='function'?intent(q,m):intent)}}},
 '@/lib/copilot/actions':{prepareAction:async(w,b,q,k,u,pending)=>{seen.prepared.push(b.patient.id);return prepare?prepare(q,k,pending):{proposal:{id:'proposal'},answer:'Confirm first'};}},
 '@/lib/clinical/summary-context':{}
 };
 new Function('require','module','exports',compiled)(name=>mocks[name],module,module.exports);
 return {seen,post:async(body)=>{const r=await module.exports.POST(new Request('https://fixture.invalid',{method:'POST',body:JSON.stringify({query:'Create appointment',tester:'workspace',...body})}));return {status:r.status,body:await r.json()};}};
}
test('open chart initializes action scope and bypasses duplicate-name guessing',async()=>{
 const a=app({patient_name:'Same Name'}),r=await a.post({patient_id:duplicate.id,query:'Create appointment for Same Name'});
 assert.equal(r.status,200);assert.equal(r.body.patient.id,duplicate.id);
 assert.deepEqual(a.seen.prepared,[duplicate.id]);assert.equal(a.seen.understood[0].patient_id,duplicate.id);
 assert.ok(r.body.proposal);assert.equal(r.body.status,undefined);
});
test('first action without a repeated name uses the authenticated open patient',async()=>{
 const a=app({use_current_patient:false});await a.post({patient_id:first.id});
 assert.deepEqual(a.seen.prepared,[first.id]);
});
test('chart switches clear old medication context before understanding',async()=>{
 const a=app({});await a.post({patient_id:other.id,conversation:JSON.stringify({patient_id:first.id,question:'OLD',medication_ids:['OLD'],expires:Date.now()+10000})});
 assert.equal(a.seen.understood[0].patient_id,other.id);assert.deepEqual(a.seen.understood[0].medication_ids,[]);assert.equal(a.seen.understood[0].question,'');
});
test('explicit other-patient commands and forged choice cannot escape open chart',async()=>{
 const a=app({patient_name:'Other Person'}),r=await a.post({patient_id:first.id,query:'Create appointment for Other Person',choice_id:other.id});
 assert.match(r.body.answer,/διαφορετικό ασθενή/);assert.deepEqual(a.seen.prepared,[]);
 const b=app({patient_name:'Same Name'});assert.equal((await b.post({patient_id:first.id,query:'Same Name',choice_id:duplicate.id})).status,400);
 assert.deepEqual(b.seen.prepared,[]);
});
test('invalid or inaccessible patient IDs fail before model or action',async()=>{
 for(const [id,status] of [['treatment-preview',400],['10000000-0000-4000-8000-000000000099',404]]){
  const a=app({});assert.equal((await a.post({patient_id:id})).status,status);assert.deepEqual(a.seen.understood,[]);assert.deepEqual(a.seen.prepared,[]);
 }
});
test('global assistant still asks when no chart or patient context exists',async()=>{
 const a=app({use_current_patient:false}),r=await a.post({});
 assert.match(r.body.answer,/Για ποιον ασθενή/);assert.deepEqual(a.seen.prepared,[]);
});

test('route carries pending state through αύριο / στις 4 / ναι and clears it at proposal',async()=>{
 let count=0;
 const a=app({},(q,k,pending)=>{
  if(count++===0)return {answer:'Ποια ημερομηνία;',pending_action:{kind:k,turns:[{query:q,answer:'Ποια ημερομηνία;'}],slots:{time:'17:00'},expires:Date.now()+60000}};
  assert.equal(pending.slots.time,'17:00');return {proposal:{id:'proposal'},answer:'Confirm first'};
 });
 const first=await a.post({patient_id:firstPatientId(),query:'κλείσε ραντεβού στις 5'});
 assert.ok(JSON.parse(first.body.conversation).pending_action);
 const second=await a.post({patient_id:firstPatientId(),query:'αύριο',conversation:first.body.conversation});
 assert.ok(second.body.proposal);assert.equal(JSON.parse(second.body.conversation).pending_action,undefined);
});
function firstPatientId(){return first.id}
test('chart switch drops pending action and expiry removes it before model call',async()=>{
 const pending={kind:'calendar',turns:[],slots:{time:'17:00'},expires:Date.now()+10000};
 const memory={patient_id:first.id,medication_ids:[],question:'old',pending_action:pending,expires:Date.now()+10000};
 const a=app({});await a.post({patient_id:other.id,conversation:JSON.stringify(memory)});
 assert.equal(a.seen.understood[0].pending_action,undefined);
 const b=app({});await b.post({patient_id:first.id,conversation:JSON.stringify({...memory,pending_action:{...pending,expires:0}})});
 assert.equal(b.seen.understood[0].pending_action,undefined);
});

test('ναι after a clarification retains pending context and still requires the execution button',async()=>{
 const pending={kind:'calendar',turns:[{query:'στις 4',answer:'Εννοείς 16:00;'}],slots:{target_time:'16:00'},expires:Date.now()+60000};
 const a=app({tool:'clarify',clarification:'Ποια ημερομηνία;'});
 const r=await a.post({patient_id:first.id,query:'ναι',conversation:JSON.stringify({patient_id:first.id,medication_ids:[],question:'ακύρωσε το αυριανό',pending_action:pending,expires:Date.now()+60000})});
 assert.equal(r.status,200);assert.equal(JSON.parse(r.body.conversation).pending_action.slots.target_time,'16:00');
 assert.equal(JSON.parse(r.body.conversation).pending_action.turns.at(-1).query,'ναι');
 assert.deepEqual(a.seen.prepared,[]);assert.equal(r.body.proposal,undefined);
});

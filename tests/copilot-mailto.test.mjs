import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import ts from 'typescript';
import {manualQuestionnaireEmail,manualMailtoHref} from '../lib/mail/manual-compose.ts';

const patientId='79000000-0000-4000-8000-000000000001';
const proposalId='79000000-0000-4000-8000-000000000002';
const to='synthetic.recipient@example.test';
const uuid=n=>'79000000-0000-4000-8000-'+String(n).padStart(12,'0');
const invitations=[
 {id:uuid(3),token:'a'.repeat(64),instrument:'PHQ-9'},
 {id:uuid(4),token:'b'.repeat(64),instrument:'GAD-7'}
];
const env={CLINICAL_DATA_MODE:'synthetic',NOIMA_APP_ORIGIN:'https://noima.example'};
const isClinicalId=x=>typeof x==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(x);
const validEmail=x=>typeof x==='string'&&/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(x);

async function load(path,dependencies){
 const source=await readFile(path,'utf8');
 const code=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
 const module={exports:{}};
 vm.runInNewContext(code,{module,exports:module.exports,require:name=>{
  if(!(name in dependencies))throw new Error('Unexpected dependency '+name);
  return dependencies[name];
 },Request,Response,Headers,URL,Date,JSON,process:{env},console},{filename:path});
 return module.exports;
}
async function routeWith(send,receipt={kind:'questionnaires',recipient:to,invitations}){
 const calls={rpc:[],send:[],bundle:0};
 const exports=await load('app/api/copilot/confirm/route.ts',{
  '@/lib/pilot/route':{withPilot:fn=>fn},
  '@/lib/patients/demo-runtime':{
   rpc:async(name)=>{calls.rpc.push(name);return name==='copilot_action_get'?{patient:patientId,kind:receipt.kind}:receipt},
   patientBundle:async()=>{calls.bundle++;return {patient:{id:patientId,email:to}}}
  },
  '@/app/api/mailbox/send/route':{POST:async request=>{
   const input=await request.json();calls.send.push(input);
   return send(input,calls.send.length);
  }},
  '@/lib/clinical/identity':{isClinicalId},
  '@/lib/mail/providers':{validEmail},
  '@/lib/mail/manual-compose':{manualQuestionnaireEmail}
 });
 const confirm=()=>exports.POST(new Request('https://noima.example/api/copilot/confirm',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({tester:uuid(5),proposal_id:proposalId,confirm:true})}));
 return {confirm,calls};
}
const noMailbox=()=>Response.json({error:'Συνδέστε το mailbox',code:'connect'},{status:409});
const accepted=()=>Response.json({ok:true,status:'accepted'});

test('mail composer matches Library mailto encoding and never exposes instruments in the subject/body',()=>{
 const links=['https://noima.example/assessment#'+'a'.repeat(64),'https://noima.example/assessment#'+'b'.repeat(64)];
 const compose=manualQuestionnaireEmail(to,links);
 const href=manualMailtoHref(compose);
 assert.equal(decodeURIComponent(href.split('?')[0].slice(7)),to);
 const params=new URLSearchParams(href.split('?')[1]);
 assert.equal(params.get('subject'),'Συμπλήρωση φόρμας');
 assert.equal(params.get('body'),compose.body);
 assert.ok(compose.body.includes(links[0])&&compose.body.includes(links[1]));
 assert.match(compose.body,/14 ημέρες/);
 assert.doesNotMatch(compose.subject+' '+compose.body,/PHQ-9|GAD-7|ψυχιατρ|διάγνωσ|synthetic\.recipient/iu);
 assert.throws(()=>manualQuestionnaireEmail(to,[]),/invalid_manual_invitation/);
});

test('a copilot questionnaire proposal is prepared without a mailbox or new OAuth dependency',async()=>{
 const calls=[];const {prepareAction}=await load('lib/copilot/actions.ts',{
  'node:crypto':{randomUUID:()=>uuid(6),randomBytes:()=>({toString:()=>('c'.repeat(64))})},
  '../patients/demo-runtime':{rpc:async(name,args)=>{calls.push(name);return {id:uuid(6),expires_at:'2099-01-01T12:00:00Z'}},request:()=>{throw Error('not a calendar command')}},
  '../clinic-time.ts':{clinicLocalToIso(){},formatClinicDateTime(){}},
  './provider.ts':{modelJSON:async()=>({instruments:['PHQ-9'],before_next:false,clarification:''}),objectSchema:x=>x,stringSchema:{}},
  '../mail/providers':{validEmail}
 });
 const usage={calls:0,input_tokens:0,output_tokens:0};
 const r=await prepareAction(uuid(5),{patient:{id:patientId,first_name:'Συνθετικός',last_name:'Ασθενής',email:to},assessments:[],appointments:[]},'Στείλε PHQ-9 στον ασθενή','questionnaires',usage);
 assert.equal(r.proposal.id,uuid(6));assert.deepEqual(calls,['copilot_propose']);
 assert.match(r.proposal.summary,/έτοιμο email/);
});

test('missing mailbox returns one ready-to-send manual email and never reports delivery',async()=>{
 const {confirm,calls}=await routeWith(noMailbox);
 const response=await confirm(),data=await response.json();
 assert.equal(response.status,200);assert.equal(data.status,'manual');
 assert.equal(calls.send.length,1,'stop mailbox attempts after first explicit connect failure');
 assert.deepEqual(data.deliveries.map(d=>d.status),['manual','manual']);
 assert.equal(data.compose.to,to);assert.equal(data.compose.subject,'Συμπλήρωση φόρμας');
 assert.match(data.answer,/δεν έχει σταλεί email/);
 assert.ok(data.compose.body.includes('#'+'a'.repeat(64)));assert.ok(data.compose.body.includes('#'+'b'.repeat(64)));
 assert.deepEqual(calls.rpc,['copilot_action_get','copilot_execute']);
 assert.doesNotMatch(data.compose.body,/PHQ-9|GAD-7/);
});

test('retrying the same confirmed proposal produces the same draft, never a sent status',async()=>{
 const {confirm,calls}=await routeWith(noMailbox);
 const first=await (await confirm()).json();const second=await (await confirm()).json();
 assert.equal(first.status,'manual');assert.equal(second.status,'manual');
 assert.equal(first.compose.body,second.compose.body);
 assert.equal(calls.send.length,2,'one mailbox check per explicit confirmation, no provider send');
});

test('connected mailbox still sends normally and does not offer manual links',async()=>{
 const {confirm,calls}=await routeWith(accepted);
 const data=await (await confirm()).json();
 assert.equal(data.status,'accepted');assert.equal(data.compose,undefined);
 assert.deepEqual(data.deliveries.map(d=>d.status),['accepted','accepted']);
 assert.equal(calls.send.length,2);
});

test('unknown delivery is never converted into a manual retry that might duplicate an email',async()=>{
 const {confirm,calls}=await routeWith(()=>Response.json({code:'unknown'},{status:502}));
 const data=await (await confirm()).json();
 assert.equal(data.status,'attention');assert.equal(data.compose,undefined);
 assert.deepEqual(data.deliveries.map(d=>d.status),['unknown','unknown']);
 assert.equal(calls.send.length,2);
});

test('partial provider acceptance opens a manual draft only for unsent instruments',async()=>{
 const {confirm}=await routeWith((_input,n)=>n===1?accepted():noMailbox());
 const data=await (await confirm()).json();
 assert.equal(data.status,'manual');assert.deepEqual(data.deliveries.map(d=>d.status),['accepted','manual']);
 assert.ok(!data.compose.body.includes('#'+'a'.repeat(64)),'do not resend an accepted link');
 assert.ok(data.compose.body.includes('#'+'b'.repeat(64)));
});

test('calendar confirmations remain unchanged and questionnaire recipient mismatch fails closed',async()=>{
 const cal=await routeWith(()=>{throw Error('should not send')},{kind:'calendar',event_id:uuid(10)});
 const out=await (await cal.confirm()).json();assert.equal(out.status,'verified');assert.equal(cal.calls.send.length,0);
 const mismatch=await routeWith(noMailbox,{kind:'questionnaires',recipient:'elsewhere@example.test',invitations});
 const resp=await mismatch.confirm();assert.equal(resp.status,409);assert.equal(mismatch.calls.send.length,0);
});

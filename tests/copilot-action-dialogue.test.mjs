import {pilotScope} from '../lib/pilot/request-scope.ts';
import {intlTestModule} from './helpers/i18n.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
import {appointmentWallTime,selectAppointment} from '../lib/copilot/appointment-selection.ts';
const events=[{id:'four',patient_id:'patient',scheduled_start:'2030-10-19T13:00:00Z',scheduled_end:'2030-10-19T13:45:00Z',status:'scheduled',session_id:null,updated_at:'x'},{id:'five',patient_id:'patient',scheduled_start:'2030-10-19T14:00:00Z',scheduled_end:'2030-10-19T14:45:00Z',status:'scheduled',session_id:null,updated_at:'x'}];
function app(replies){
 const seen={inputs:[],writes:[],mailbox:0};const module={exports:{}};
 const mocks={
 'node:crypto':{randomUUID:()=> 'proposal',randomBytes:()=>({toString:()=> 'synthetic-token'})},
 '../patients/demo-runtime':{request:async()=>events,rpc:async(name,args)=>{seen.writes.push({name,args});return {id:'proposal'}}},
 '../clinic-time.ts':{clinicLocalToIso:(d,t)=>new Date(d+'T'+t+':00+03:00').toISOString(),formatClinicDateTime:s=>s},
 './appointment-selection.ts':{appointmentWallTime,selectAppointment},
 './provider.ts':{objectSchema:x=>x,stringSchema:{},modelJSON:async(prompt,input)=>{seen.inputs.push({prompt,input});assert.ok(replies.length);return replies.shift()}},
 '../mail/providers':{validEmail:s=>s?.endsWith('@example.invalid')},
 '../pilot/server':{pilotClient:async()=>({rpc:async()=>{seen.mailbox++;return {data:{id:'mailbox'}}}})}
 };
 const compiled=ts.transpileModule(readFileSync('lib/copilot/actions.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText;
 new Function('require','module','exports',compiled)(n=>intlTestModule(n)??mocks[n],module,module.exports);
 const bundle={patient:{id:'patient',first_name:'QA',last_name:'Synthetic',email:'qa@example.invalid'},assessments:[],appointments:events};
 return {seen,bundle,prepare:(q,k='calendar',pending)=>module.exports.prepareAction('workspace',bundle,q,k,{},pending)};
}
const calendar=(extra={})=>({action:'create',event_id:'',date:'2030-10-20',time:'17:00',duration:45,target_date:'',target_time:'',clarification:'',...extra});
test('κλείσε στις 5 → αύριο preserves pending action, slots and clarification',async()=>{
 const a=app([calendar({action:'clarify',date:'',clarification:'Ποια ημερομηνία;'}),calendar()]);
 const first=await a.prepare('κλείσε ραντεβού 5 το απόγευμα');
 assert.equal(a.seen.writes.length,0);assert.equal(first.pending_action.slots.time,'17:00');
 const second=await a.prepare('αύριο','calendar',first.pending_action);
 assert.equal(a.seen.inputs[1].input.dialogue[0].answer,'Ποια ημερομηνία;');
 assert.equal(a.seen.inputs[1].input.pending_slots.time,'17:00');
 assert.ok(second.proposal);assert.equal(a.seen.writes[0].name,'copilot_propose');
});
test('ακύρωσε το αυριανό → στις 4 selects 16:00 despite wrong model ID',async()=>{
 const a=app([calendar({action:'cancel',event_id:'five',target_date:'2030-10-19',target_time:''}),calendar({action:'cancel',event_id:'five',target_date:'2030-10-19',target_time:'16:00'})]);
 const first=await a.prepare('ακύρωσε το αυριανό');assert.match(first.answer,/Ποιο/);assert.equal(a.seen.writes.length,0);
 await a.prepare('στις 4','calendar',first.pending_action);
 assert.equal(a.seen.writes[0].args.p_payload.event_id,'four');
});
test('explicit afternoon time overrides wrong model time and ID',()=>{
 assert.equal(selectAppointment(events,{event_id:'five',target_date:'2030-10-19',target_time:'17:00'},'ακύρωσε το αυριανό στις 4 το απόγευμα').event.id,'four');
 assert.equal(selectAppointment(events,{event_id:'five',target_date:'2030-10-19',target_time:'18:00'},'').event,undefined);
});
test('two same-hour morning/evening appointments require a real choice',()=>{
 const both=[...events,{...events[0],id:'morning',scheduled_start:'2030-10-19T01:00:00Z'}];
 assert.equal(selectAppointment(both,{event_id:'four',target_date:'2030-10-19',target_time:'16:00'},'στις 4').event,undefined);
});
test('στείλε ψυχομετρικό → κατάθλιψη retains context, prepares PHQ-9 only',async()=>{
 const a=app([{instruments:[],before_next:false,clarification:'Για κατάθλιψη ή άγχος;'},{instruments:['PHQ-9'],before_next:false,clarification:''}]);
 const first=await a.prepare('στείλε ψυχομετρικό','questionnaires');assert.equal(a.seen.mailbox,0);assert.equal(a.seen.writes.length,0);
 await a.prepare('κατάθλιψη','questionnaires',first.pending_action);
 assert.equal(a.seen.inputs[1].input.dialogue[0].query,'στείλε ψυχομετρικό');
 assert.deepEqual(a.seen.writes[0].args.p_payload.invitations.map(i=>i.instrument),['PHQ-9']);
 assert.equal(a.seen.writes[0].args.p_payload.recipient,'qa@example.invalid');
});
test('questionnaire missing email and pending duplicate never produce proposals',async()=>{
 const reply={instruments:['GAD-7'],before_next:false,clarification:''};
 const a=app([reply]);a.bundle.patient.email='';
 await assert.rejects(a.prepare('στείλε για άγχος','questionnaires'),/recipient_missing/);assert.equal(a.seen.writes.length,0);
 const b=app([reply]);b.bundle.assessments=[{instrument:'GAD-7',status:'assigned',expires_at:'2099-01-01'}];
 await assert.rejects(b.prepare('στείλε για άγχος','questionnaires'),/invitation_pending/);assert.equal(b.seen.writes.length,0);
});
test('expired or different-kind pending state is excluded and no action executes',async()=>{
 const a=app([{instruments:[],before_next:false,clarification:'Ποιο;'}]);
 await a.prepare('στείλε ψυχομετρικό','questionnaires',{kind:'calendar',turns:[{query:'OLD',answer:'OLD'}],slots:{event_id:'OLD'},expires:0});
 assert.deepEqual(a.seen.inputs[0].input.dialogue,[]);assert.equal(a.seen.writes.length,0);
});

test('English proposals change presentation only, preserving the appointment mutation payload',async()=>{
 const greek=app([calendar()]),english=app([calendar()]);
 const original=await greek.prepare('κλείσε αύριο στις 5');
 const localized=await pilotScope.run({outputLocale:'en'},()=>english.prepare('book tomorrow at 5'));
 assert.match(localized.proposal.summary,/New appointment/);assert.match(localized.proposal.summary,/QA Synthetic/);
 assert.match(original.proposal.summary,/Νέο ραντεβού/);
 assert.deepEqual(english.seen.writes[0].args.p_payload,greek.seen.writes[0].args.p_payload);
 assert.match(localized.answer,/Review the proposal/);
});
test('appointment choice translation never changes which existing appointment is selected',()=>{
 const input={event_id:'five',target_date:'2030-10-19',target_time:'16:00'};
 const original=selectAppointment(events,input,'');
 const localized=selectAppointment(events,input,'',{label:s=>'Translated '+s,date:s=>s});
 assert.equal(localized.event.id,original.event.id);
 const ambiguous=selectAppointment(events,{...input,target_time:''},'',{label:()=> 'Choose an appointment:',date:s=>s});
 assert.match(ambiguous.answer,/Choose an appointment:/);assert.equal(ambiguous.event,undefined);
});

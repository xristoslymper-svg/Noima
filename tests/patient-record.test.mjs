import {test} from 'node:test';
import assert from 'node:assert/strict';
import {patientRecord} from '../lib/clinical/patient-record.ts';

const now=new Date('2026-10-08T09:00:00Z');
function bundle(overrides={}){return {clinical_day:'2026-10-08',patient:{id:'p'},sessions:[],appointments:[],medications:[],medicationEvents:[],medicationSideEffects:[],medicationRevisions:[],assessments:[],risks:[],history:null,...overrides}}
test('empty record stays empty without synthesizing clinical statuses',()=>{
 const result=patientRecord(bundle(),now);
 assert.equal(result.latestVisit,undefined);assert.equal(result.risk,null);assert.equal(result.nextAppointment,null);
 for(const key of ['latestScores','activeEffects','events','sinceLatest','pendingSafety'])assert.deepEqual(result[key],[]);
 assert.equal('adherence' in result,false);assert.equal('functioning' in result,false);assert.equal('goal' in result,false);
});
test('chronology uses encounter dates; drafts and superseded mutations are not clinical events',()=>{
 const input=bundle({sessions:[{id:'late',status:'completed',started_at:'2026-10-07',completed_at:'2026-10-08'},{id:'latest',status:'completed',started_at:'2026-10-06'},{id:'draft',status:'draft',started_at:'2026-10-08'}],appointments:[{session_id:'late',scheduled_start:'2026-10-01T10:00:00Z'}],medicationEvents:[{id:'replaced',event_type:'changed',effective_on:'2026-10-07'},{id:'valid',event_type:'changed',effective_on:'2026-10-07',new_state:{medication_name:'Medication',dose:10,unit:'mg'}},{id:'irrelevant',event_type:'edited',effective_on:'2026-10-08'}],medicationRevisions:[{event_id:'replaced'}]});
 const original=JSON.stringify(input);const result=patientRecord(input,now);
 assert.equal(result.latestVisit.id,'late');assert.deepEqual(result.events.map(e=>e.id),['med-valid','visit-late','visit-latest']);assert.equal(JSON.stringify(input),original);
});
test('same-day date-only changes are not claimed as after the encounter; timestamped measurements retain actual ordering',()=>{
 const result=patientRecord(bundle({sessions:[{id:'visit',status:'completed',started_at:'2026-10-07T09:00:00Z'}],medicationEvents:[{id:'linked',event_type:'started',effective_on:'2026-10-07',session_id:'visit'},{id:'ambiguous',event_type:'changed',effective_on:'2026-10-07'},{id:'later',event_type:'stopped',effective_on:'2026-10-08'},{id:'future',event_type:'changed',effective_on:'2026-10-09'}],assessments:[{id:'score',instrument:'PHQ-9',status:'completed',score:12,completed_at:'2026-10-07T12:00:00Z'}]}),now);
 assert.deepEqual(new Set(result.sinceLatest.map(e=>e.id)),new Set(['med-later','measurement-score']));
 assert.equal(result.events.find(e=>e.id==='med-future').scheduled,true);
});
test('safety is taken from the latest completed encounter, never from a draft or older negative assessment',()=>{
 const result=patientRecord(bundle({sessions:[{id:'old',status:'completed',started_at:'2026-10-01'},{id:'latest',status:'completed',started_at:'2026-10-07'},{id:'draft',status:'draft',started_at:'2026-10-08'}],risks:[{session_id:'old',suicidal_ideation:'negative'},{session_id:'draft',suicidal_ideation:'positive'}]}),now);
 assert.equal(result.risk,null);
});
test('current scores use Athens clinical day and pending safety remains independent of total-score trend',()=>{
 const result=patientRecord(bundle({assessments:[{id:'old',status:'completed',instrument:'PHQ-9',completed_at:'2026-10-01T12:00:00Z',score:15},{id:'current',status:'completed',instrument:'PHQ-9',completed_at:'2026-10-07T22:00:00Z',score:10,item9_review:true,item9_reviewed_at:null},{id:'future',status:'completed',instrument:'PHQ-9',completed_at:'2026-10-08T22:00:00Z',score:2},{id:'assigned',status:'assigned',instrument:'GAD-7',completed_at:null,score:null}]}),now);
 assert.equal(result.latestScores[0].current.id,'current');assert.equal(result.latestScores[0].previous.id,'old');assert.equal(result.pendingSafety[0].id,'current');
});
test('future resolution does not suppress active effects; expired and cancelled appointments are not upcoming',()=>{
 const result=patientRecord(bundle({medicationSideEffects:[{id:'active',noted_on:'2026-10-01',resolved_on:'2026-10-09'},{id:'ended',noted_on:'2026-10-01',resolved_on:'2026-10-07'},{id:'future',noted_on:'2026-10-09',resolved_on:null}],appointments:[{id:'past',status:'scheduled',scheduled_start:'2026-10-01',scheduled_end:'2026-10-01'},{id:'cancelled',status:'cancelled',scheduled_start:'2026-10-08',scheduled_end:'2026-10-09'},{id:'next',status:'scheduled',scheduled_start:'2026-10-09',scheduled_end:'2026-10-09'}]}),now);
 assert.deepEqual(result.activeEffects.map(e=>e.id),['active']);assert.equal(result.nextAppointment.id,'next');
});

test('important structured safety signals are retained even when ideation is negative',()=>{
 const result=patientRecord(bundle({sessions:[{id:'latest',status:'completed',started_at:'2026-10-07'}],risks:[{session_id:'latest',suicidal_ideation:'negative',self_harm:'positive',harm_to_others:'positive'}]}),now);
 assert.deepEqual(result.safetyAlerts,['Αυτοτραυματισμός','Κίνδυνος προς τρίτους']);
});

test('encounter linkage does not move earlier clinical events into changes since the latest visit',()=>{
 const result=patientRecord(bundle({sessions:[{id:'latest',status:'completed',started_at:'2026-10-07T09:00:00Z'}],medicationEvents:[{id:'historical',event_type:'started',effective_on:'2026-09-01',session_id:'latest'}],assessments:[{id:'earlier',instrument:'PHQ-9',status:'completed',score:10,completed_at:'2026-10-07T08:00:00Z',session_id:'latest'}]}),now);
 assert.deepEqual(result.sinceLatest,[]);
 assert.ok(result.events.some(e=>e.id==='med-historical'));
 assert.ok(result.events.some(e=>e.id==='measurement-earlier'));
});

test('future timestamps today cannot become current scores, safety flags, trends, or completed measurement events',()=>{
 const result=patientRecord(bundle({assessments:[{id:'future',instrument:'PHQ-9',status:'completed',score:12,completed_at:'2026-10-08T18:00:00Z',item9_review:true},{id:'now',instrument:'PHQ-9',status:'completed',score:6,completed_at:now.toISOString()},{id:'past',instrument:'PHQ-9',status:'completed',score:9,completed_at:'2026-10-07T12:00:00Z'}]}),now);
 assert.equal(result.latestScores[0].current.id,'now');
 assert.equal(result.latestScores[0].previous.id,'past');
 assert.deepEqual(result.pendingSafety,[]);
 assert.ok(!result.events.some(e=>e.assessmentId==='future'));
});

test('start-today overrides an old or future appointment and since-then excludes events within the encounter',()=>{
 const input=bundle({sessions:[{id:'visit',status:'completed',started_at:'2026-10-07T09:00:00Z',completed_at:'2026-10-07T10:00:00Z'}],appointments:[{session_id:'visit',scheduled_start:'2026-10-15T09:00:00Z'}],assessments:[{id:'during',instrument:'GAD-7',status:'completed',score:8,completed_at:'2026-10-07T09:30:00Z'},{id:'after',instrument:'GAD-7',status:'completed',score:7,completed_at:'2026-10-07T11:00:00Z'}]});
 const result=patientRecord(input,now);assert.equal(result.events.find(e=>e.kind==='visits').date,'2026-10-07T09:00:00Z');assert.deepEqual(result.sinceLatest.map(e=>e.id),['measurement-after']);
});

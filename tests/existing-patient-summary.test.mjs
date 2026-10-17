import test from 'node:test';
import assert from 'node:assert/strict';
import {historicalMeasurementProjection} from '../lib/clinical/historical-measurements.ts';
import {buildSummaryContext,summaryReadiness,summaryNeedsSynthesis,summaryContextHash,canonicalSummaryFindings} from '../lib/clinical/summary-context.ts';
import {buildClinicalCard} from '../lib/clinical/clinical-card.ts';
import {medicationTiming} from '../lib/clinical/summary-orientation.ts';
import {providerEvidence} from '../lib/clinical/provider-evidence.ts';
import {clinicalInput,sourceLink} from '../lib/copilot/clinical.ts';

const patient='81000000-0000-4000-8000-000000000001',workspace='81000000-0000-4000-8000-000000000002',actor='81000000-0000-4000-8000-000000000003';
const day='2026-10-17';
const chart=()=>({patient:{id:patient,tester_id:workspace,chief_complaint:'',note:'',created_at:day},sessions:[],sections:[],risks:[],history:null,historyImports:[],priorCourse:null,medications:[],medicationEvents:[],medicationSideEffects:[],medicationRevisions:[],proposals:[],addenda:[],corrections:[],assessments:[],appointments:[],historicalMeasurementsAvailable:true});
const historical=(id,score,date,extra={})=>historicalMeasurementProjection({id,patient_id:patient,tester_id:workspace,instrument:'PHQ-9',instrument_version:'not_recorded',source:'historical_manual',score,administered_on:date,answers:null,note:'',document_ids:[],actor_id:actor,created_at:day+'T09:00:00Z',confirmed_at:day+'T09:00:00Z',supersedes_id:null,correction_reason:'',...extra});

test('historical totals join later measurements in clinical-date order without fabricated visits, answers or item 9',()=>{
 const b=chart();b.assessments=[historical('middle',14,'2020-06-01'),historical('oldest',20,'2019-09-01'),historical('recent',8,'2024-01-31')];
 // Even a malformed client projection cannot supply answers for a manual total.
 b.assessments[0].answers=[1,1,1,1,1,3,3,1,2];b.assessments[0].item9_review=true;b.assessments[0].session_id='unrelated-draft';
 b.assessments.push({id:'later-questionnaire',patient_id:patient,instrument:'PHQ-9',instrument_version:'el-v1',score:5,status:'completed',completed_at:'2026-09-04T09:00:00Z',created_at:'2026-08-31',answers:[1,0,1,0,1,0,1,1,0],item9_review:false,session_id:null});
 const before=structuredClone(b),c=buildSummaryContext(b,day),trajectory=c.findings.find(f=>f.key==='psych:PHQ-9');
 assert.deepEqual(trajectory.source_ids,['assessment:oldest','assessment:middle','assessment:recent','assessment:later-questionnaire']);
 assert.equal(trajectory.text,'PHQ-9: 20 (2019-09-01) → 14 (2020-06-01) → 8 (2024-01-31) → 5 (2026-09-04).');
 const sources=c.sources.filter(s=>s.kind==='historical_measurement');assert.equal(sources.length,3);
 for(const s of sources){assert.equal(s.session_id,undefined);assert.equal(s.content.answers,null);assert.equal(s.content.item9_available,false);assert.equal(s.content.item9_response,null);assert.equal(s.content.total_score_only,true);assert.equal(s.content.recorded_at,day+'T09:00:00Z');assert.notEqual(s.date,day);}
 assert.ok(!c.findings.some(f=>f.key.startsWith('review:')||f.key.startsWith('historical-review:')));
 assert.deepEqual(b,before);assert.equal(b.sessions.length,0);assert.equal(summaryReadiness(b,c),null);assert.equal(summaryNeedsSynthesis(b,c),false);
 const card=buildClinicalCard(b,c);assert.equal(card.date,null);assert.equal(card.briefing.ideation.value,'missing');assert.equal(card.diagnoses.length,0);assert.equal(card.mse.length,0);assert.equal(card.alerts.length,0);
 assert.ok(card.orientation.find(r=>r.label==='Πορεία').items.some(i=>i.text===trajectory.text));
});

test('an explicitly reviewed historical item-9 answer stays historical and cannot change a later current risk assessment',()=>{
 const b=chart();b.assessments=[historical('scan',10,'2020-01-01',{source:'historical_scan',answers:[1,1,1,1,1,1,1,1,2],document_ids:['original-document']})];
 b.sessions=[{id:'current',status:'completed',started_at:'2026-10-16T09:00:00Z'}];
 b.risks=[{session_id:'current',suicidal_ideation:'negative',intent:'negative',plan:'negative',self_harm:'negative',attempt_history:'unknown',harm_to_others:'negative'}];
 const c=buildSummaryContext(b,day),source=c.sources.find(s=>s.kind==='historical_measurement');
 assert.equal(source.content.item9_response,2);assert.equal(source.content.item9_available,true);assert.equal(source.content.total_score_only,false);assert.deepEqual(source.content.document_ids,['original-document']);
 const historicalFlag=c.findings.find(f=>f.key==='historical-review:scan');assert.equal(historicalFlag.attention,false);assert.equal(historicalFlag.label,'Σημαντικό ιστορικό');assert.match(historicalFlag.text,/2020-01-01.*Δεν αποτελεί τρέχουσα/);
 const card=buildClinicalCard(b,c);assert.equal(card.briefing.ideation.value,'no');assert.ok(!card.alerts.some(f=>f.key===historicalFlag.key));
 assert.ok(card.orientation.find(r=>r.label==='Σημαντικό πλαίσιο').history.some(f=>f.source_ids.includes(source.id)));
 b.assessments[0].answers[0]=3;const invalid=buildSummaryContext(b,day).sources.find(s=>s.kind==='historical_measurement');
 assert.equal(invalid.content.answers,null);assert.equal(invalid.content.item9_response,null);
});

test('unapproved, malformed and wrong-patient historical projections are excluded from evidence',()=>{
 const b=chart();
 b.assessments=[
  {...historical('unreviewed',5,'2020-01-01'),reviewed_at:null},
  {...historical('no-actor',5,'2020-01-01'),entered_by:undefined},
  {...historical('wrong-patient',5,'2020-01-01'),patient_id:'other'},
  {...historical('wrong-workspace',5,'2020-01-01'),tester_id:'other'},
  {...historical('bad-score',5,'2020-01-01'),score:28},
  {...historical('bad-date',5,'2020-01-01'),administered_on:'2020-02-30'},
  {...historical('future',5,'2020-01-01'),administered_on:'2099-01-01'},
 ];
 const c=buildSummaryContext(b,day);assert.ok(!c.sources.some(s=>s.kind==='historical_measurement'));assert.ok(!c.findings.some(f=>f.key.startsWith('psych:')));assert.equal(summaryReadiness(b,c),'no_completed_visit');
});

test('approved history keeps import attribution and current canonical history; raw documents never become clinical facts',()=>{
 const b=chart();
 b.history={patient_id:patient,version:4,psychiatric_history:'Current clinician-confirmed psychiatric history.',allergies:'Confirmed synthetic allergy.',hospitalizations:'Patient reports a past admission in 2019.'};
 b.historyImports=[{id:'approved-import',patient_id:patient,tester_id:workspace,actor_id:actor,scan_id:'scan',document_ids:['original'],created_at:day+'T09:00:00Z',history_version:3,before_history:{psychiatric_history:'OBSOLETE HISTORY SNAPSHOT'},additions:[{field:'psychiatric_history',text:'Older imported description.',attribution:'document'},{field:'hospitalizations',text:'Past admission reported by the patient.',attribution:'patient_reported'}]}];
 b.documents=[{text:'UNREVIEWED DOCUMENT CLAIM'}];b.scanDrafts=[{result:{diagnosis:'UNREVIEWED SCAN CLAIM'}}];
 const before=structuredClone(b),c=buildSummaryContext(b,day),source=c.sources.find(s=>s.kind==='imported_history');
 assert.ok(source);assert.equal(source.date,undefined);assert.equal(source.content.current_history_version,4);assert.equal(source.content.recorded_at,day+'T09:00:00Z');
 assert.deepEqual(source.content.additions.map(a=>a.attribution),['document','patient_reported']);assert.ok(c.layers.durable.some(s=>s.id===source.id));
 assert.ok(!JSON.stringify(c.sources).includes('UNREVIEWED'));assert.ok(!JSON.stringify(c.sources).includes('OBSOLETE HISTORY SNAPSHOT'));assert.ok(!JSON.stringify(canonicalSummaryFindings(c)).includes('Older imported description.'));
 const card=buildClinicalCard(b,c);assert.equal(card.diagnoses.length,0);assert.equal(card.mse.length,0);assert.equal(card.briefing.ideation.value,'missing');
 assert.ok(card.briefing.history.some(i=>i.text.includes('Current clinician-confirmed')));assert.ok(card.alerts.some(f=>f.key==='history:allergies'));assert.deepEqual(b,before);
 const minimized=providerEvidence(source);assert.equal(minimized.content.actor_id,undefined);assert.equal(source.content.actor_id,actor);assert.deepEqual(minimized.content.document_ids,['original']);
 b.historyImports.push({...b.historyImports[0],id:'wrong-patient-import',patient_id:'other'});assert.ok(!buildSummaryContext(b,day).sources.some(s=>s.record_id==='wrong-patient-import'));
});

test('prior-course entry timestamp remains provenance and does not become a fictional encounter date',()=>{
 const b=chart();b.priorCourse={id:'prior',tester_id:workspace,patient_id:patient,period_label:'2018–2024',content:'Synthetic course over several years.',created_at:day+'T10:00:00Z'};
 const c=buildSummaryContext(b,day),source=c.sources.find(s=>s.kind==='prior_course');assert.equal(source.date,undefined);assert.equal(source.content.period,'2018–2024');assert.equal(source.content.recorded_at,day+'T10:00:00Z');
 assert.equal(summaryReadiness(b,c),null);assert.equal(summaryNeedsSynthesis(b,c),true);assert.equal(buildClinicalCard(b,c).date,null);assert.equal(b.sessions.length,0);
});

test('known treatment and discontinued history render with unknown dates preserved',()=>{
 const b=chart();b.medications=[{id:'ongoing',patient_id:patient,tester_id:workspace,medication_name:'Synthetic ongoing medicine',dose:50,unit:'mg',frequency:'daily',status:'active',started_at:null,effective_from:null,ended_at:null,record_source:'existing',recorded_by:actor,created_at:day},{id:'stopped',patient_id:patient,tester_id:workspace,medication_name:'Synthetic past medicine',dose:20,unit:'mg',frequency:'daily',status:'stopped',started_at:null,effective_from:null,ended_at:null,record_source:'historical',recorded_by:actor,created_at:day}];
 const c=buildSummaryContext(b,day),card=buildClinicalCard(b,c),treatment=card.orientation.find(r=>r.label==='Θεραπεία & ανταπόκριση');
 assert.equal(summaryReadiness(b,c),null);assert.equal(summaryNeedsSynthesis(b,c),false);assert.equal(b.sessions.length,0);assert.equal(b.medicationEvents.length,0);assert.equal(medicationTiming(null,null,day),'');
 assert.ok(treatment.items.some(i=>i.text.includes('Synthetic ongoing medicine')));assert.ok(treatment.history.some(i=>i.text.includes('Synthetic past medicine')));
 assert.ok(!JSON.stringify(treatment).includes(day));assert.ok(!JSON.stringify(treatment).includes('έναρξη'));assert.ok(!JSON.stringify(treatment).includes('null'));
 assert.equal(providerEvidence(c.sources.find(s=>s.kind==='structured_medication')).content.recorded_by,undefined);
});

test('environment availability does not invalidate clinical-summary cache; approved corrections do',async()=>{
 const b=chart();b.assessments=[historical('total',14,'2020-01-01')];const original=await summaryContextHash(b,day);
 b.historicalMeasurementsAvailable=false;assert.equal(await summaryContextHash(b,day),original);
 b.assessments[0].score=13;assert.notEqual(await summaryContextHash(b,day),original);
 b.assessments[0].score=14;b.assessments[0].administered_on='2019-12-31';assert.notEqual(await summaryContextHash(b,day),original);
});

test('shared copilot context keeps the historical evidence contract and original measurement navigation',async()=>{
 const b=chart();b.assessments=[historical('copilot-total',14,'2020-01-01')];
 const usage={calls:0,input_tokens:0,output_tokens:0},input=await clinicalInput(b,'Historical scores',null,null,usage);
 assert.equal(usage.calls,0);const record=input.input.records.find(r=>r.kind==='historical_measurement');
 assert.equal(record.date,'2020-01-01');assert.equal(record.content.answers,null);assert.equal(record.content.item9_response,null);assert.equal(record.content.total_score_only,true);assert.equal(record.content.entered_by,undefined);
 const source=buildSummaryContext(b,day).sources.find(s=>s.kind==='historical_measurement');
 assert.match(sourceLink(patient,source).href,/tab=psychometrics&assessment=copilot-total$/);
});

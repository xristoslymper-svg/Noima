import test from 'node:test';
import assert from 'node:assert/strict';
import {buildClinicalCard,clinicalCardPreview} from '../lib/clinical/clinical-card.ts';
import {buildSummaryContext} from '../lib/clinical/summary-context.ts';
const fixture=()=>({patient:{id:'p'},sessions:[{id:'s',status:'completed',started_at:'2026-10-07'},{id:'d',status:'draft',started_at:'2026-10-08'}],sections:[{id:'a',session_id:'s',section_key:'assessment',content:'Diagnosis',document:{kind:'assessment',fields:[{key:'diagnosis',label:'Diagnosis',text:'',status:'provisional',codes:[{code:'F41.1',label:'Fictional anxiety'}]}]}},{id:'m',session_id:'s',section_key:'mse',content:'Recorded',document:{kind:'mse',fields:[{key:'mood',label:'Mood',text:'Αγχώδες',review:'changed'},{key:'speech',label:'Speech',text:'Κενό',review:'not_assessed'}]}},{id:'i',session_id:'s',section_key:'interview',content:'Ο ασθενής αναφέρει καλύτερο ύπνο.'},{id:'draft',session_id:'d',section_key:'interview',content:'SECRET DRAFT'}],risks:[],history:null,medications:[{id:'active',medication_name:'Sertraline',status:'active',dose:50,unit:'mg',frequency:'πρωί'},{id:'future',medication_name:'Future',status:'planned',dose:100}],medicationEvents:[],medicationSideEffects:[],medicationRevisions:[],proposals:[],addenda:[],corrections:[],assessments:[],appointments:[]});
test('one card uses completed structured diagnoses, current medication and actual MSE only',()=>{
 const b=fixture(),card=buildClinicalCard(b,buildSummaryContext(b));
 assert.match(card.diagnoses[0].text,/F41.1.*προσωρινή/);
 assert.equal(card.medications.length,1);assert.match(card.medications[0].text,/50 mg/);
 assert.equal(card.mse.length,1);assert.match(card.mse[0].text,/Αγχώδες/);
 assert.ok(!JSON.stringify(card.notes).includes('SECRET DRAFT'));assert.equal(card.date,'2026-10-07');
});
test('effective corrections replace structured facts and retain exact evidence',()=>{
 const b=fixture();b.corrections=[{id:'fix',session_id:'s',created_at:'2026-10-08',patch:{mse:{after:{kind:'mse',fields:[{key:'mood',label:'Mood',text:'Ευθυμικό'}]}},assessment:{after:{kind:'assessment',fields:[{key:'diagnosis',label:'Diagnosis',text:'Διάγνωση υπό διερεύνηση',status:'under_investigation'}]}}}}];
 const card=buildClinicalCard(b,buildSummaryContext(b));assert.match(card.mse[0].text,/Ευθυμικό/);assert.ok(card.mse[0].source_ids.includes('structured_correction:fix'));assert.match(card.diagnoses[0].text,/υπό διερεύνηση/);assert.ok(!card.diagnoses[0].text.includes('F41.1'));
});
test('narrative correction and stale medication date never promote obsolete facts',()=>{
 const b=fixture();b.addenda=[{id:'fix',session_id:'s',kind:'correction',content:'Withdraw previous assessment',created_at:'2026-10-08'}];b.clinical_day='2026-10-06';
 const card=buildClinicalCard(b,buildSummaryContext(b,'2026-10-07'));assert.deepEqual(card.diagnoses,[]);assert.deepEqual(card.mse,[]);assert.deepEqual(card.notes,[]);assert.deepEqual(card.medications,[]);assert.ok(card.alerts.some(f=>f.key==='medication-refresh'));
});
test('synthesis only supplies notes; it cannot replace diagnosis, dose or MSE',()=>{
 const b=fixture();const findings=[{origin:'synthesis',text:'Ο ασθενής αναφέρει καλύτερο ύπνο.',source_ids:['section:i']},{origin:'canonical',text:'Dump',source_ids:[]}];
 const card=buildClinicalCard(b,buildSummaryContext(b),findings,true);assert.equal(card.notes.length,1);assert.equal(card.synthesized,true);assert.match(card.medications[0].text,/50 mg/);assert.match(card.mse[0].text,/Αγχώδες/);
});


test('an older diagnostic entry stays explicitly dated when the follow-up has no diagnosis',()=>{
 const b=fixture();b.sessions.push({id:'next',status:'completed',started_at:'2026-10-09'});b.sections.push({id:'empty',session_id:'next',section_key:'assessment',content:'Review',document:{kind:'assessment',fields:[{key:'diagnosis',text:'',codes:[]}]}});
 const card=buildClinicalCard(b,buildSummaryContext(b));assert.match(card.diagnoses[0].text,/τελευταία καταγραφή 2026-10-07/);assert.equal(card.date,'2026-10-09');assert.deepEqual(card.mse,[]);
});

test('MSE change labels reflect corrected previous observations, never missing domains',()=>{
 const b=fixture();b.sessions.push({id:'old',status:'completed',started_at:'2026-09-01'});b.sections.push({id:'oldm',session_id:'old',section_key:'mse',content:'Previous',document:{kind:'mse',fields:[{key:'mood',label:'Mood',text:'Ευθυμικό'}]}});
 const card=buildClinicalCard(b,buildSummaryContext(b));assert.deepEqual(card.changeLabels,['Συναίσθημα']);assert.equal(card.changes.length,1);
 b.sections[0].document.fields=[];b.sections.find(s=>s.id==='oldm').document.fields[0].text='';assert.deepEqual(buildClinicalCard(b,buildSummaryContext(b)).changeLabels,[]);
});

test('compact card keeps the primary diagnosis and course plus complete next step visible',()=>{
 const b=fixture();b.sections[0].document.fields.unshift({key:'differential_1',text:'Πανικός',status:'under_investigation'});
 b.sections.unshift({id:'plan',session_id:'s',section_key:'plan',content:'Επικοινωνία σε μία εβδομάδα.'},{id:'review',session_id:'s',section_key:'review',content:'Επανεξέταση σε δύο εβδομάδες.'});
 b.sections.find(s=>s.id==='i').content='Ο ασθενής αναφέρει καλύτερο ύπνο. '+ 'Μία πλήρης μακρά καταγραφή '.repeat(20)+'.';
 const card=buildClinicalCard(b,buildSummaryContext(b));
 assert.match(card.diagnoses[0].text,/F41.1/);assert.match(card.diagnoses[1].text,/Διαφορική/);
 const visible=clinicalCardPreview(card.notes,30).preview;
 assert.match(visible[0].text,/καλύτερο ύπνο/);
 assert.ok(visible.some(i=>i.text.includes('μία εβδομάδα')&&i.text.includes('δύο εβδομάδες')));
 assert.equal(clinicalCardPreview([{text:'Long '.repeat(40),source_ids:['x']}],18).preview.length,1);
});

test('synthesis cannot silently omit the recorded review or leave resolved corrections as warnings',()=>{
 const b=fixture();b.sections.push({id:'review',session_id:'s',section_key:'review',content:'Επανεξέταση σε δύο εβδομάδες.'});
 b.corrections=[{id:'fix',session_id:'s',created_at:'2026-10-08',reason:'MSE corrected',patch:{mse:{after:{kind:'mse',fields:[{key:'mood',text:'Ευθυμικό'}]}}}}];
 const card=buildClinicalCard(b,buildSummaryContext(b),[{origin:'synthesis',theme:'course',text:'Ο ασθενής αναφέρει καλύτερο ύπνο.',source_ids:['section:i']}],true);
 assert.ok(card.notes.some(i=>i.text.includes('δύο εβδομάδες')));
 assert.equal(card.corrections.length,1);assert.ok(!card.alerts.some(f=>f.key.startsWith('correction:')));
});

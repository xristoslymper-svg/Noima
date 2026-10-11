import test from 'node:test';
import assert from 'node:assert/strict';
import {previsitFixture} from './fixtures/previsit-briefing.ts';
import {buildClinicalCard} from '../lib/clinical/clinical-card.ts';
import {buildSummaryContext} from '../lib/clinical/summary-context.ts';
const card=(b,findings=[],synthesis=false)=>buildClinicalCard(b,buildSummaryContext(b,'2026-10-11'),findings,synthesis);

test('briefing splits recorded diagnosis and differential and lists only authoritative active medication',()=>{
 const b=previsitFixture(),snapshot=JSON.stringify(b),v=card(b).briefing;
 assert.match(v.diagnoses[0].text,/^F41\.1.*προσωρινή/);assert.equal(v.diagnoses.length,1);assert.match(v.differential[0].text,/Διαταραχή προσαρμογής.*υπό διερεύνηση/);
 assert.equal(v.medications.length,1);assert.match(v.medications[0].text,/Sertraline.*50 mg/);
 assert.ok(!JSON.stringify(v).includes('SECRET_DRAFT'));assert.equal(JSON.stringify(b),snapshot);
});
test('ideation reports explicit yes/no only; unknown unassessed and absent remain distinct',()=>{
 for(const [scenario,status] of [['negative','no'],['positive','yes'],['unknown','unknown'],['not_assessed','not_assessed'],['missing','missing']]){
  const v=card(previsitFixture(scenario)).briefing;assert.equal(v.ideation.value,status,scenario);assert.equal(v.ideation.date,'2026-10-10T09:00:00Z');
 }
 const yes=card(previsitFixture('positive')).briefing;assert.ok(yes.safetyFlags.some(f=>f.text==='Πρόθεση: Ναι'));
});
test('narrative disagreement is review, not a negative checkbox; screening does not imply ideation',()=>{
 const b=previsitFixture('conflict'),v=card(b).briefing;assert.equal(v.ideation.value,'review');assert.ok(v.ideation.source_ids.includes('section:report'));
 assert.equal(v.narrative.length,0); // full risk text remains in the card/source disclosure
 const empty=previsitFixture('missing');empty.assessments=[{id:'q',instrument:'PHQ-9',status:'completed',item9_review:true,score:9,completed_at:'2026-10-10',created_at:'2026-10-10'}];
 const c=card(empty);assert.equal(c.briefing.ideation.value,'missing');assert.ok(c.alerts.some(f=>f.key==='review:q'));
});
test('draft risk and an older denial are not current assessments',()=>{
 const b=previsitFixture('missing'),old=b.sessions[1],draft=b.sessions[2];b.risks=[{session_id:old.id,suicidal_ideation:'negative'},{session_id:draft.id,suicidal_ideation:'positive'}];
 assert.equal(card(b).briefing.ideation.value,'missing');
});
test('structured risk/diagnosis corrections replace values with exact correction provenance',()=>{
 const b=previsitFixture('positive');b.corrections=[{id:'fix',session_id:b.sessions[0].id,created_at:'2026-10-11',reason:'Synthetic correction',patch:{risk:{after:{...b.risks[0],suicidal_ideation:'negative',intent:'negative'}},assessment:{after:{kind:'assessment',fields:[{key:'diagnosis',label:'Diagnosis',text:'Υπό διερεύνηση',status:'under_investigation'}]}}}}];
 const v=card(b).briefing;assert.equal(v.ideation.value,'no');assert.ok(v.ideation.source_ids.includes('structured_correction:fix'));assert.doesNotMatch(v.diagnoses[0].text,/F41/);assert.ok(v.diagnoses[0].source_ids.includes('structured_correction:fix'));
});
test('narrative correction suppresses obsolete prose and prevents unqualified negative risk',()=>{
 const b=previsitFixture();b.addenda=[{id:'fix',session_id:b.sessions[0].id,kind:'correction',content:'Η αρχική σημείωση ανακλήθηκε.',created_at:'2026-10-11'}];
 const v=card(b).briefing;assert.equal(v.ideation.value,'review');assert.ok(v.ideation.source_ids.includes('addendum:fix'));assert.ok(!v.narrative.some(i=>i.text.includes('λιγότερο άγχος')));
});
test('MSE uses one last recorded encounter with a date; missing domains never imply normal or inherit older findings',()=>{
 const b=previsitFixture(),v=card(b).briefing;assert.equal(v.mseDate,'2026-10-10T09:00:00Z');assert.equal(v.mse.length,2);assert.ok(!v.mse.some(i=>i.text.includes('Παλαιότερη καταγραφή αντίληψης')));
 const old=card(previsitFixture('old-mse')).briefing;assert.equal(old.mseDate,'2026-09-25T09:00:00Z');assert.ok(old.mse.every(i=>i.source_ids.includes('section:old-mse')));
 b.sections.find(s=>s.id==='mse').document.fields.forEach(f=>{f.text='';f.review='not_assessed'});assert.equal(card(b).briefing.mseDate,'2026-09-25T09:00:00Z');
});
test('empty records do not synthesize patient information from administrative notes or fabricate MSE',()=>{
 const b=previsitFixture('empty'),v=card(b).briefing;assert.deepEqual(v.narrative,[]);assert.deepEqual(v.history,[]);assert.deepEqual(v.mse,[]);assert.deepEqual(v.diagnoses,[]);assert.equal(v.ideation.date,null);assert.equal(v.ideation.value,'missing');assert.doesNotMatch(JSON.stringify(v),/ADMINISTRATIVE|SECRET_DRAFT/);
});
test('history is evidence-only; active longitudinal context persists, explicit resolution removes it',()=>{
 const b=previsitFixture();b.history={patient_id:b.patient.id,social_functioning:'Εργάζεται σε γραφείο.',allergies:'',version:1};
 b.sessions[1].continuity={approved_at:'2026-09-25T12:00:00Z',approved_by:'doctor',pinned_context:'Σημαντική εργασιακή παρουσίαση.'};
 b.contextRevisions=[{id:'revision',patient_id:b.patient.id,source_session_id:b.sessions[1].id,revision:1,action:'updated',content:'Παρουσίαση στις 20 Οκτωβρίου.',created_at:'2026-10-01T09:00:00Z'}];
 const v=card(b).briefing;assert.equal(v.history.length,1);assert.match(v.history[0].text,/Εργάζεται σε γραφείο/);assert.match(v.context[0].text,/20 Οκτωβρίου/);
 b.contextRevisions.push({id:'resolved',patient_id:b.patient.id,source_session_id:b.sessions[1].id,revision:2,action:'resolved',content:'Ολοκληρώθηκε.',created_at:'2026-10-10T09:00:00Z'});assert.deepEqual(card(b).briefing.context,[]);
});
test('verified narrative cannot replace canonical facts and dates reflect its actual evidence',()=>{
 const b=previsitFixture();const f=[{origin:'synthesis',theme:'course',text:'Ο ασθενής ανέφερε δυσκολία στην έναρξη του ύπνου.',source_ids:['section:old-report']}];
 const v=card(b,f,true).briefing;assert.equal(v.narrativeSynthesized,true);assert.equal(v.narrative[0].date,'2026-09-25T09:00:00Z');assert.equal(v.ideation.value,'no');
 const disallowed=card(b,[{...f[0],text:'F99 Unverified diagnosis',source_ids:['section:diagnosis']}],true).briefing;assert.equal(disallowed.narrativeSynthesized,false);assert.ok(!disallowed.narrative.some(i=>i.text.includes('F99')));
});
test('stale medication day remains suppressed and the underlying plan and alerts remain intact',()=>{
 const b=previsitFixture();b.clinical_day='2026-10-09';const c=card(b);assert.deepEqual(c.briefing.medications,[]);assert.ok(c.alerts.some(f=>f.key==='medication-refresh'));assert.ok(c.notes.some(f=>f.role==='plan'&&f.text.includes('δύο εβδομάδες')));
});

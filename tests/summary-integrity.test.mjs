import test from 'node:test';
import assert from 'node:assert/strict';
import {buildSummaryContext,summaryContextHash,summaryContextKey,validateNarrative,assertCriticalCoverage} from '../lib/clinical/summary-context.ts';
import {isClinicalId} from '../lib/clinical/identity.ts';
const fixture=()=>({patient:{id:'61dd44b6-bd6f-cd2a-c3ac-b0092d267eb1',chief_complaint:'Incomplete',note:''},sessions:[],sections:[],risks:[],history:null,medications:[],medicationEvents:[],medicationSideEffects:[],medicationRevisions:[],proposals:[],addenda:[],assessments:[],appointments:[]});
const visit=(b,id,text)=>{b.sessions.push({id,status:'completed',completed_at:`2026-10-0${id}T09:00:00Z`,started_at:`2026-10-0${id}T08:00:00Z`});b.sections.push({id:'s'+id,session_id:id,section_key:'interview',content:text});};
test('durable safety facts and old corrections survive six visits without canonical promotion',()=>{
 const b=fixture();visit(b,1,'Προηγούμενη απόπειρα. Αλλεργία στη Lamotrigine.');b.risks.push({session_id:1,attempt_history:'positive'});for(let i=2;i<=6;i++)visit(b,i,'Σταθερή εικόνα.');b.addenda.push({id:'a',session_id:1,kind:'correction',content:'Αλλεργία στην Carbamazepine, όχι Lamotrigine.',created_at:'2026-10-02'});
 const before=JSON.stringify(b);const c=buildSummaryContext(b,'2026-10-03');assert.equal(JSON.stringify(b),before);assert.ok(c.layers.durable.some(s=>s.id==='section:s1'));assert.ok(c.layers.corrections.some(s=>s.id==='addendum:a'));assert.ok(c.findings.some(f=>f.text.includes('Carbamazepine')));assert.ok(c.findings.some(f=>f.key==='past-attempt:1'));assert.ok(!c.findings.some(f=>f.text.includes('Αλλεργία στη Lamotrigine')));
});
test('pending item-9 review cannot become reviewed; completing review changes context and wording',async()=>{
 const b=fixture();b.assessments.push({id:'phq',instrument:'PHQ-9',score:9,status:'completed',created_at:'2026-10-03',item9_review:true,item9_reviewed_at:null,answers:Array(9).fill(1)});
 const before=await summaryContextHash(b,'2026-10-03');const pending=buildSummaryContext(b).findings.find(f=>f.key==='review:phq');assert.ok(pending.attention);assert.match(pending.text,/προς έλεγχο.*δεν έχει/);
 b.assessments[0].item9_reviewed_at='2026-10-03T10:00:00Z';assert.notEqual(await summaryContextHash(b,'2026-10-03'),before);assert.match(buildSummaryContext(b).findings.find(f=>f.key==='review:phq').text,/καταγράφηκε στις/);
});
test('severe effects are compulsory, including delayed effects after stop',()=>{
 const b=fixture();b.medications.push({id:'m',medication_name:'Sertraline',status:'stopped',dose:50,unit:'mg',frequency:'daily',started_at:'2026-09-01',ended_at:'2026-10-01'});b.medicationSideEffects.push({id:'e',medication_id:'m',effect_text:'Confusion',severity:'severe',impact:'Cannot work',note:'Delayed',noted_on:'2026-10-03',resolved_on:null});
 const c=buildSummaryContext(b);assertCriticalCoverage(c.findings,c);assert.throws(()=>assertCriticalCoverage(c.findings.filter(f=>f.key!=='effect:e'),c));assert.ok(c.findings.find(f=>f.key==='effect:e').text.includes('Cannot work'));assert.ok(c.findings.find(f=>f.key==='effect:e').attention);
});
test('risk uncertainty and cross-section review cues are not negative',()=>{
 const b=fixture();visit(b,1,'Αναφέρει παθητικές σκέψεις θανάτου χθες.');b.risks.push({session_id:1,suicidal_ideation:'negative',intent:'unknown',plan:'not_assessed',self_harm:'unknown',attempt_history:'unknown'});const c=buildSummaryContext(b);assert.ok(c.findings.some(f=>f.label==='Χρειάζεται επιβεβαίωση'));assert.match(c.findings.find(f=>f.key==='risk').text,/Πρόθεση: άγνωστο.*Σχέδιο: δεν διερευνήθηκε/);
});
test('medication context retains current, history, future, revisions and effects; future is not active',()=>{
 const b=fixture();b.medications.push({id:'m',medication_name:'Sertraline',status:'active',dose:50,unit:'mg',frequency:'daily',started_at:'2026-09-01'});b.medicationEvents.push({id:'e',medication_id:'m',effective_on:'2026-10-10',event_type:'changed',new_state:{dose:100,unit:'mg'},reason:'planned'});const c=buildSummaryContext(b,'2026-10-03');assert.match(c.findings.find(f=>f.key==='med:m').text,/50 mg/);assert.match(c.findings.find(f=>f.key==='future:e').text,/100 mg.*Δεν είναι/);assert.ok(c.sources.some(s=>s.kind==='medication_event'));
});
test('complete canonical hash changes for every relevant mutation and date; preserves answer order',async()=>{
 const b=fixture();const base=summaryContextKey(b,'2026-10-03');for(const key of ['sections','risks','medicationEvents','medicationRevisions','medicationSideEffects','addenda','assessments','appointments']){const v=structuredClone(b);v[key].push({id:'new',updated_at:'now'});assert.notEqual(summaryContextKey(v,'2026-10-03'),base,key);}assert.notEqual(summaryContextKey({...b,history:{allergies:'yes'}},'2026-10-03'),base);assert.notEqual(summaryContextKey(b,'2026-10-04'),base);
 const x=structuredClone(b);x.assessments=[{answers:[0,1,2]}];const y=structuredClone(x);y.assessments[0].answers=[2,1,0];assert.notEqual(await summaryContextHash(x),await summaryContextHash(y));
});
test('narrative accepts exact complete clauses in any section; rejects altered negation, bogus evidence and mislabeled structured states',()=>{
 const b=fixture();visit(b,1,'Δεν αναφέρει πλήρη ύφεση. Ο ύπνος βελτιώθηκε.');const c=buildSummaryContext(b);
 const output=(label,quote,id='section:s1')=>({findings:[{label,quotes:[{source_id:id,quote}]}]});assert.match(validateNarrative(output('Πορεία','Ο ύπνος βελτιώθηκε.'),c)[0].text,/Καταγεγραμμένη/);
 for(const bad of [output('Πορεία','αναφέρει πλήρη ύφεση.'),output('Ψυχομετρικά','Ο ύπνος βελτιώθηκε.'),output('Πορεία','Ο ύπνος βελτιώθηκε.','bogus')])assert.throws(()=>validateNarrative(bad,c));
 assert.throws(()=>validateNarrative({findings:[...output('Πορεία','Ο ύπνος βελτιώθηκε.').findings,...output('Πορεία','Ο ύπνος βελτιώθηκε.').findings]},c));
});
test('one invalid narrative invalidates all; corrected parent and item-9 review assertions are never reused',()=>{
 const b=fixture();visit(b,1,'Συνέχεια Sertraline 100 mg.');b.addenda.push({id:'a',kind:'correction',session_id:1,content:'Η οδηγία είναι λανθασμένη.',created_at:'2026-10-03'});assert.throws(()=>validateNarrative({findings:[{label:'Πλάνο',quotes:[{source_id:'section:s1',quote:'Συνέχεια Sertraline 100 mg.'}]}]},buildSummaryContext(b)));
 const d=fixture();visit(d,1,'Το λήμμα 9 ελέγχθηκε.');assert.throws(()=>validateNarrative({findings:[{label:'Πλάνο',quotes:[{source_id:'section:s1',quote:'Το λήμμα 9 ελέγχθηκε.'}]}]},buildSummaryContext(d)));
});
test('seeded and created UUIDs share one identity contract; SQL injection strings rejected',()=>{
 assert.ok(isClinicalId('61dd44b6-bd6f-cd2a-c3ac-b0092d267eb1'));assert.ok(isClinicalId('f052ba1f-64b1-4fbd-a2a9-6323f896bbf0'));assert.ok(!isClinicalId("x' or true"));
});
test('wrong-section medication, adverse effect and trajectory remain documented, not silently promoted',()=>{
 const b=fixture();visit(b,1,'Συνεχίζει Sertraline 100 mg. Αναφέρει ναυτία αλλά το άγχος είναι αισθητά καλύτερο.');const before=JSON.stringify(b);const c=buildSummaryContext(b);assert.equal(JSON.stringify(b),before);assert.equal(b.medications.length,0);assert.ok(c.findings.some(f=>f.key.startsWith('unstructured-med:')));assert.ok(c.findings.some(f=>f.key.startsWith('narrative-effect:')&&f.source_ids.includes('section:s1')));assert.ok(c.layers.trajectory.some(s=>String(s.content).includes('αισθητά καλύτερο')));
});
test('date rollover with an old medication snapshot withholds the old current-state claim',()=>{
 const b=fixture();b.clinical_day='2026-10-03';b.medications.push({id:'m',status:'active',medication_name:'Sertraline',dose:50});const c=buildSummaryContext(b,'2026-10-04');assert.ok(c.findings.some(f=>f.key==='medication-refresh'&&f.attention));assert.ok(!c.findings.some(f=>f.key==='med:m'));
});

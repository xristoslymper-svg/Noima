import test from 'node:test';
import assert from 'node:assert/strict';
import {buildSummaryContext,canonicalSummaryFindings,summaryContextHash,summaryContextKey,validateNarrative,assertCriticalCoverage,narrativeRiskRequiresReview} from '../lib/clinical/summary-context.ts';
import {isClinicalId} from '../lib/clinical/identity.ts';
const fixture=()=>({patient:{id:'61dd44b6-bd6f-cd2a-c3ac-b0092d267eb1',chief_complaint:'Incomplete',note:''},sessions:[],sections:[],risks:[],history:null,medications:[],medicationEvents:[],medicationSideEffects:[],medicationRevisions:[],proposals:[],addenda:[],assessments:[],appointments:[]});
const visit=(b,id,text)=>{b.sessions.push({id,status:'completed',completed_at:`2026-10-0${id}T09:00:00Z`,started_at:`2026-10-0${id}T08:00:00Z`});b.sections.push({id:'s'+id,session_id:id,section_key:'interview',content:text});};

test('structured correction is required only for its patched source, narrative correction remains encounter-wide',()=>{
 const b=fixture();visit(b,1,'Ο ασθενής αναφέρει καλύτερο ύπνο.');
 b.sections.push({id:'m',session_id:1,section_key:'mse',content:'Αγχώδες.'});
 b.corrections=[{id:'c',session_id:1,created_at:'2026-10-05',reason:'MSE correction',patch:{mse:{after:'Ευθυμικό.'}}}];
 const c=buildSummaryContext(b);
 assert.doesNotThrow(()=>validateNarrative({findings:[{text:'Ο ασθενής αναφέρει καλύτερο ύπνο.',source_ids:['section:s1']}]},c));
 assert.throws(()=>validateNarrative({findings:[{text:'Καταγράφηκε ευθυμικό συναίσθημα.',source_ids:['section:m']}]},c),/corrected_parent/);
 assert.doesNotThrow(()=>validateNarrative({findings:[{text:'Καταγράφηκε ευθυμικό συναίσθημα.',source_ids:['section:m','structured_correction:c']}]},c));
 b.addenda.push({id:'a',session_id:1,kind:'correction',content:'Διόρθωση συνέντευξης.',created_at:'2026-10-06'});
 assert.throws(()=>validateNarrative({findings:[{text:'Ο ασθενής αναφέρει καλύτερο ύπνο.',source_ids:['section:s1']}]},buildSummaryContext(b)),/corrected_parent/);
});

test('risk preview states passive ideation and explicit intent/plan, uncertainty precedes reassuring negatives',()=>{
 const b=fixture();visit(b,1,'Καταγραφή εκτίμησης.');
 b.risks=[{session_id:1,suicidal_ideation:'positive',intent:'negative',plan:'negative',self_harm:'negative',attempt_history:'negative',harm_to_others:'negative',tree:{version:1,answers:{wish:'positive',ideation:'passive'},notes:{}}}];
 const risk=buildSummaryContext(b).findings.find(f=>f.key==='risk');
 assert.match(risk.text,/παθητικές σκέψεις.*Πρόθεση: αρνητικό.*Σχέδιο: αρνητικό/);assert.match(risk.text,/Δεν υποκαθιστά σημερινή/);
 b.risks[0].suicidal_ideation='negative';b.risks[0].attempt_history='unknown';
 const text=buildSummaryContext(b).findings.find(f=>f.key==='risk').text;
 assert.ok(text.indexOf('Δεν έχουν αποσαφηνιστεί')<text.indexOf('Δεν καταγράφηκαν'));
});
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
 const b=fixture();visit(b,1,'Αναφέρει παθητικές σκέψεις θανάτου χθες.');b.risks.push({session_id:1,suicidal_ideation:'negative',intent:'unknown',plan:'not_assessed',self_harm:'unknown',attempt_history:'unknown'});const c=buildSummaryContext(b);assert.ok(c.findings.some(f=>f.label==='Χρειάζεται επιβεβαίωση'));assert.match(c.findings.find(f=>f.key==='risk').text,/Πρόθεση παραμένει άγνωστο.*Σχέδιο δεν διερευνήθηκε/);
});
test('medication context retains current, history, future, revisions and effects; future is not active',()=>{
 const b=fixture();b.medications.push({id:'m',medication_name:'Sertraline',status:'active',dose:50,unit:'mg',frequency:'daily',started_at:'2026-09-01'});b.medicationEvents.push({id:'e',medication_id:'m',effective_on:'2026-10-10',event_type:'changed',new_state:{dose:100,unit:'mg'},reason:'planned'});const c=buildSummaryContext(b,'2026-10-03');assert.match(c.findings.find(f=>f.key==='med:m').text,/50 mg/);assert.match(c.findings.find(f=>f.key==='future:e').text,/100 mg.*Δεν είναι/);assert.ok(c.sources.some(s=>s.kind==='medication_event'));
});
test('complete canonical hash changes for every relevant mutation and date; preserves answer order',async()=>{
 const b=fixture();const base=summaryContextKey(b,'2026-10-03');for(const key of ['sections','risks','medicationEvents','medicationRevisions','medicationSideEffects','addenda','assessments','appointments']){const v=structuredClone(b);v[key].push({id:'new',updated_at:'now'});assert.notEqual(summaryContextKey(v,'2026-10-03'),base,key);}assert.notEqual(summaryContextKey({...b,history:{allergies:'yes'}},'2026-10-03'),base);assert.notEqual(summaryContextKey(b,'2026-10-04'),base);
 const x=structuredClone(b);x.assessments=[{answers:[0,1,2]}];const y=structuredClone(x);y.assessments[0].answers=[2,1,0];assert.notEqual(await summaryContextHash(x),await summaryContextHash(y));
});
test('flexible briefing accepts structured and older sources, but rejects unknown, duplicate and corrected evidence',()=>{
 const b=fixture();visit(b,1,'Αναφέρει παλαιότερο επεισόδιο θυμού.');visit(b,2,'Δεν αναφέρει νέο επεισόδιο.');b.medications.push({id:'m',status:'active',medication_name:'Escitalopram',dose:10});
 const output=(text,source_ids)=>({findings:[{text,source_ids}]});const c=buildSummaryContext(b);
 assert.equal(validateNarrative(output('Αναφέρει επεισόδιο θυμού, χωρίς αναφερόμενη υποτροπή στη νεότερη επίσκεψη.',['section:s1','section:s2']),c).length,1);
 assert.equal(validateNarrative(output('Καταγεγραμμένη ενεργή Escitalopram 10 mg.',['medication:m']),c).length,1);
 for(const ids of [['bogus'],['section:s1','section:s1'],[null]])assert.throws(()=>validateNarrative(output('Υποστηριζόμενο κείμενο.',ids),c),/unsupported_source/);
 b.addenda.push({id:'a',kind:'correction',session_id:1,content:'Διόρθωση επεισοδίου',created_at:'2026-10-04'});
 assert.throws(()=>validateNarrative(output('Αναφορά στο παλαιότερο επεισόδιο.',['section:s1']),buildSummaryContext(b)),/corrected_parent/);
 assert.equal(validateNarrative(output('Αναφορά με συνεκτίμηση διόρθωσης.',['section:s1','addendum:a']),buildSummaryContext(b)).length,1);
 assert.throws(()=>validateNarrative({findings:[]},c),/invalid_count/);
});

test('every corrected session requires its own correction; an addendum is not a correction',()=>{
 const b=fixture();visit(b,1,'Πρώτη καταγραφή.');visit(b,2,'Δεύτερη καταγραφή.');
 b.addenda=[{id:'a',kind:'correction',session_id:1,content:'Διόρθωση 1'},{id:'b',kind:'correction',session_id:2,content:'Διόρθωση 2'}];
 assert.throws(()=>validateNarrative({findings:[{text:'Σύνθεση και των δύο επισκέψεων.',source_ids:['section:s1','section:s2','addendum:a']}]},buildSummaryContext(b)),/corrected_parent/);
 b.addenda=[{id:'a',kind:'addition',session_id:1,content:'Πρόσθετη πληροφορία'}];assert.equal(buildSummaryContext(b).layers.corrections.length,0);
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
test('clear risk denial and concordant medication are not false contradictions',()=>{
 assert.equal(narrativeRiskRequiresReview('Επανέλεγχος αυτοκτονικού ιδεασμού και ανοχής αγωγής.'),false);assert.equal(narrativeRiskRequiresReview('Αναφέρει αυτοκτονικό ιδεασμό. Επανέλεγχος σε δύο εβδομάδες.'),true);
 assert.equal(narrativeRiskRequiresReview('Αναφέρει αυτοκτονικό ιδεασμό χωρίς σχέδιο.'),true);assert.equal(narrativeRiskRequiresReview('Δεν αναφέρει αυτοκτονικό ιδεασμό, αλλά είχε σκέψεις θανάτου χθες.'),true);assert.equal(narrativeRiskRequiresReview('Χωρίς αυτοκτονικό ιδεασμό.'),false);
 assert.equal(narrativeRiskRequiresReview('Αρνείται αυτοκτονικό ιδεασμό, πρόθεση ή σχέδιο.'),false);assert.equal(narrativeRiskRequiresReview('Δεν αποκλείεται παλαιότερος αυτοκτονικός ιδεασμός.'),true);assert.equal(narrativeRiskRequiresReview('Αναφέρει παθητικές σκέψεις θανάτου χθες.'),true);
 const b=fixture();visit(b,1,'Συνεχίζει Sertraline 100 mg.');b.medications.push({id:'m',medication_name:'Sertraline',dose:100,status:'active'});assert.ok(!buildSummaryContext(b).findings.some(f=>f.key.startsWith('med-review:')));b.medications[0].status='stopped';assert.ok(buildSummaryContext(b).findings.some(f=>f.key.startsWith('med-review:')));b.sections[0].content='Έλαβε Sertraline 100 mg ως προηγούμενη θεραπεία.';assert.ok(!buildSummaryContext(b).findings.some(f=>f.key.startsWith('med-review:')));
});

test('fallback keeps dated latest evidence, excluding draft and corrected parents',()=>{
 const b=fixture();visit(b,1,'Παλαιότερη εικόνα.');visit(b,2,'Νεότερη εικόνα.');const c=buildSummaryContext(b);assert.ok(canonicalSummaryFindings(c).some(f=>f.key==='record:section:s2'));assert.ok(!canonicalSummaryFindings(c).some(f=>f.key==='record:section:s1'));
 b.addenda.push({id:'x',session_id:2,kind:'correction',content:'Διόρθωση',created_at:'2026-10-04'});assert.ok(!canonicalSummaryFindings(buildSummaryContext(b)).some(f=>f.key==='record:section:s2'));
});

test('routine adverse-effect mention, resolved mild effects, denied allergy and conditional risk fields do not force chart dumps',()=>{
 const b=fixture();visit(b,1,'Συζητήθηκαν παρενέργειες. Η ναυτία σχεδόν υποχώρησε.');
 b.risks=[{session_id:1,suicidal_ideation:'negative',intent:'not_assessed',plan:'not_assessed',self_harm:'negative',attempt_history:'negative',harm_to_others:'negative'}];
 b.history={allergies:'Δεν αναφέρει γνωστές φαρμακευτικές αλλεργίες.'};b.medicationSideEffects=[{id:'e',severity:'mild',resolved_on:'2026-10-03'}];
 const c=buildSummaryContext(b);assert.equal(c.findings.filter(f=>f.attention).length,0);assert.ok(c.findings.some(f=>f.key.startsWith('narrative-effect:')));
 b.risks[0].suicidal_ideation='positive';assert.ok(buildSummaryContext(b).findings.find(f=>f.key==='risk').attention);
 b.history.allergies='Αλλεργία στη Lamotrigine.';assert.ok(buildSummaryContext(b).findings.find(f=>f.key==='history:allergies').attention);
});

test('rich longitudinal records need a useful briefing and complete sentences; sparse charts may have fewer bullets',()=>{
 const b=fixture();for(let i=1;i<=3;i++){visit(b,i,'Πλήρης περιγραφή της επίσκεψης.');for(let j=0;j<3;j++)b.sections.push({id:'extra'+i+j,session_id:i,section_key:'functioning',content:'Πλήρης καταγραφή λειτουργικότητας.'});}
 assert.throws(()=>validateNarrative({findings:[{text:'Μόνο μία σύντομη πλήρης πρόταση.',source_ids:['section:s1']}]},buildSummaryContext(b)),/invalid_count/);
 const sparse=fixture();visit(sparse,1,'Ο ύπνος βελτιώθηκε.');assert.throws(()=>validateNarrative({findings:[{text:'Ο ύπνος βελτιώθηκε, αλλά δεν τε',source_ids:['section:s1']}]},buildSummaryContext(sparse)),/invalid_finding/);
});
test('explicit unresolved severe narrative effects remain mandatory; routine monitoring and denied/resolved effects do not',()=>{
 const b=fixture();visit(b,1,'Αναφέρει σοβαρή ανεπιθύμητη ενέργεια με σύγχυση.');assert.ok(buildSummaryContext(b).findings.find(f=>f.key==='narrative-effect:section:s1').attention);
 for(const text of ['Αρνείται σοβαρές παρενέργειες.','Η σοβαρή ανεπιθύμητη ενέργεια υποχώρησε.','Παρακολούθηση ανεπιθύμητων ενεργειών.']){b.sections[0].content=text;assert.equal(buildSummaryContext(b).findings.find(f=>f.key==='narrative-effect:section:s1').attention,false);}
});


test('clinical overview uses encounter chronology and effective structured risk corrections',()=>{
 const b=fixture();b.corrections=[];
 b.sessions.push(
  {id:'older',status:'completed',started_at:'2026-10-06T12:00:00Z',completed_at:'2026-10-06T20:00:00Z'},
  {id:'newer',status:'completed',started_at:'2026-10-06T13:00:00Z',completed_at:'2026-10-06T14:00:00Z'},
 );
 b.appointments.push(
  {id:'a-old',session_id:'older',scheduled_start:'2026-10-05T09:00:00Z',scheduled_end:'2026-10-05T09:50:00Z',status:'completed'},
  {id:'a-new',session_id:'newer',scheduled_start:'2026-10-06T09:00:00Z',scheduled_end:'2026-10-06T09:50:00Z',status:'completed'},
 );
 b.sections.push(
  {id:'old-text',session_id:'older',section_key:'interview',content:'Older clinical picture.'},
  {id:'new-text',session_id:'newer',section_key:'interview',content:'Newer clinical picture.'},
 );
 b.risks.push(
  {session_id:'older',suicidal_ideation:'negative',intent:'negative',plan:'negative',self_harm:'negative',attempt_history:'negative',harm_to_others:'negative',clinical_note:''},
  {session_id:'newer',suicidal_ideation:'negative',intent:'negative',plan:'negative',self_harm:'negative',attempt_history:'negative',harm_to_others:'negative',clinical_note:'',tree:{version:1,answers:{wish:'negative',intent:'negative',plan:'negative',others:'negative'},notes:{}}},
 );
 b.corrections.push({id:'risk-correction',session_id:'newer',created_at:'2026-10-06T15:00:00Z',reason:'Corrected risk',patch:{risk:{before:{suicidal_ideation:'negative'},after:{suicidal_ideation:'positive',intent:'unknown',plan:'unknown',self_harm:'negative',attempt_history:'negative',harm_to_others:'negative',protective_factors:'',clinical_note:'Corrected note',tree:{version:1,answers:{wish:'negative',intent:'negative',plan:'negative',others:'negative'},notes:{}}}}}});
 const c=buildSummaryContext(b,'2026-10-06');
 assert.equal(c.sources.find(s=>s.id==='section:new-text').date,'2026-10-06T09:00:00Z');
 assert.match(c.findings.find(x=>x.key==='risk').text,/Θετικά ευρήματα: Ιδεασμός/);
 assert.match(c.findings.find(x=>x.key==='risk').text,/Πρόθεση παραμένει άγνωστο/);
 assert.ok(c.findings.some(x=>x.key==='risk-note'&&x.text.includes('Corrected note')));
 const riskSource=c.sources.find(s=>s.id==='risk:newer').content;
 assert.equal(riskSource.tree.answers.wish,'positive');
 assert.equal(riskSource.tree.answers.intent,'unknown');
});

test('structured section correction becomes effective evidence without mutating the original section',()=>{
 const b=fixture();b.corrections=[];visit(b,1,'Original interview.');
 b.corrections.push({id:'c',session_id:1,created_at:'2026-10-02T10:00:00Z',reason:'Correction',patch:{interview:{before:'Original interview.',after:'Corrected interview.'}}});
 const original=JSON.stringify(b.sections[0]);
 const c=buildSummaryContext(b);
 assert.equal(c.sources.find(s=>s.id==='section:s1').content,'Corrected interview.');
 assert.equal(JSON.stringify(b.sections[0]),original);
});

test('fallback retains effective MSE and unchanged plan after a structured correction',()=>{
 const b=fixture();visit(b,1,'Earlier picture.');visit(b,2,'Latest picture.');
 b.sections.push({id:'mse2',session_id:2,section_key:'mse',content:'Original mood.'},{id:'plan2',session_id:2,section_key:'plan',content:'Continue the agreed plan.'});
 b.corrections=[{id:'c2',session_id:2,created_at:'2026-10-03',reason:'Clarified mood',patch:{mse:{before:'Original mood.',after:{kind:'mse',fields:[{key:'mood',label:'Mood',text:'Corrected mood.'}]}}}}];
 const original=JSON.stringify(b.sections);
 const findings=canonicalSummaryFindings(buildSummaryContext(b));
 assert.match(findings.find(f=>f.key==='record:section:mse2').text,/Corrected mood/);
 assert.match(findings.find(f=>f.key==='record:section:plan2').text,/Continue the agreed plan/);
 assert.ok(findings.find(f=>f.key==='record:section:mse2').source_ids.includes('structured_correction:c2'));
 assert.ok(findings.some(f=>f.key==='record:section:s2'));
 assert.ok(!findings.some(f=>f.key==='record:section:s1'));
 assert.equal(JSON.stringify(b.sections),original);
});

test('MSE trajectory compares encounter dates and both corrected snapshots; missing domains are not improvement',()=>{
 const b=fixture();visit(b,1,'Initial.');visit(b,2,'Follow-up.');
 b.sections.push({id:'m1',session_id:1,section_key:'mse',content:'Mood: anxious',document:{kind:'mse',fields:[{key:'mood',label:'Mood',text:'Anxious'},{key:'speech',label:'Speech',text:'Slow'}]}},{id:'m2',session_id:2,section_key:'mse',content:'Mood: euthymic',document:{kind:'mse',fields:[{key:'mood',label:'Mood',text:'Euthymic',review:'changed'},{key:'speech',label:'Speech',text:'',review:'not_assessed'}]}});
 b.corrections=[{id:'c1',session_id:1,created_at:'2026-10-05',reason:'Corrected observation',patch:{mse:{after:{kind:'mse',fields:[{key:'mood',label:'Mood',text:'Depressed'},{key:'speech',label:'Speech',text:'Slow'}]}}}}];
 const before=JSON.stringify(b);const finding=buildSummaryContext(b).findings.find(f=>f.key==='mse-change:m2');
 assert.ok(finding.text.includes('Depressed'));assert.ok(finding.text.includes('Euthymic'));assert.ok(!finding.text.includes('Anxious'));assert.ok(!finding.text.includes('Speech'));
 assert.deepEqual(finding.source_ids,['section:m1','section:m2','structured_correction:c1']);assert.equal(JSON.stringify(b),before);
 b.sessions[1].status='draft';assert.ok(!buildSummaryContext(b).findings.some(f=>f.key==='mse-change:m2'));
});

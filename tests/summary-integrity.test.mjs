import test from 'node:test';
import assert from 'node:assert/strict';
import {buildSummaryContext,canonicalSummaryFindings,summaryContextHash,summaryContextKey,validateNarrative,assertCriticalCoverage,narrativeRiskRequiresReview} from '../lib/clinical/summary-context.ts';
import {isClinicalId} from '../lib/clinical/identity.ts';
import {summaryDisplayState} from '../lib/clinical/summary-display.ts';
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


test('stale verified summaries keep prior synthesis but surface fresh canonical critical state',()=>{
 const cachedFindings=[
  {key:'briefing:0',label:'Πορεία',text:'Παλαιότερη επαληθευμένη σύνοψη.',source_ids:['old'],attention:false,origin:'synthesis'},
  {key:'old-risk',label:'Κίνδυνος',text:'Παλιό critical state.',source_ids:['old-risk-source'],attention:true,origin:'canonical'},
 ];
 const cachedSources=[{id:'old',label:'Παλαιά πηγή'},{id:'old-risk-source',label:'Παλαιός κίνδυνος'}];
 const canonicalFindings=[
  {key:'risk',label:'Κίνδυνος',text:'Τρέχον critical state.',source_ids:['fresh-risk'],attention:true,origin:'canonical'},
  {key:'record',label:'Τρέχουσα εικόνα',text:'Νέα μη κρίσιμη καταγραφή.',source_ids:['fresh'],attention:false,origin:'canonical'},
 ];
 const currentSources=[{id:'fresh-risk',label:'Τρέχων κίνδυνος'},{id:'fresh',label:'Τρέχουσα επίσκεψη'}];
 const display=summaryDisplayState(cachedFindings,cachedSources,canonicalFindings,currentSources,true);
 assert.deepEqual(display.findings.map(f=>f.key),['briefing:0']);
 assert.deepEqual(display.freshCritical.map(f=>f.key),['risk']);
 assert.equal(display.sources[0].id,'fresh-risk');
 assert.ok(display.sources.some(s=>s.id==='old'));
});

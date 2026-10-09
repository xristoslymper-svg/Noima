import test from 'node:test';
import assert from 'node:assert/strict';
import {recordDocumentation} from '../lib/clinical/record-documentation.ts';
import {recordRisk} from '../lib/clinical/record-risk.ts';
const initial={id:'initial',status:'completed',session_type:'initial_assessment',started_at:'2026-10-01',completed_at:'2026-10-01T10:00:00Z'};
const bundle={sections:[{session_id:'initial',section_key:'assessment',content:'Άγχος υπό διερεύνηση'},{session_id:'initial',section_key:'review',content:'Ύπνος και λειτουργικότητα'},{session_id:'initial',section_key:'plan',content:'Ψυχοεκπαίδευση'}],corrections:[]};
test('completed initial without continuity exposes authored impression, review and plan with encounter source',()=>{
 const r=recordDocumentation(bundle,initial);assert.equal(r.clinicalState,'Άγχος υπό διερεύνηση');assert.equal(r.reviewFocus,'Ύπνος και λειτουργικότητα');assert.equal(r.treatment,'Ψυχοεκπαίδευση');assert.equal(r.source,'initial');assert.equal(r.date,initial.completed_at);assert.equal('approved_at' in r,false);
});
test('draft, missing fields and follow-up without approval cannot create initial clinical facts',()=>{
 assert.equal(recordDocumentation(bundle,{...initial,status:'draft'}),null);assert.equal(recordDocumentation(bundle,{...initial,session_type:'follow_up'}),null);
 const r=recordDocumentation({sections:[],corrections:[]},initial);assert.equal(r.clinicalState,'');assert.equal(r.treatment,'');assert.equal(r.reviewFocus,'');
});
test('approved follow-up remains authoritative and never borrows earlier initial fields',()=>{
 const r=recordDocumentation(bundle,{...initial,id:'follow',session_type:'follow_up',continuity:{approved_at:'2026-10-08',clinical_state_summary:'Σημερινή εικόνα',next_review_focus:'Ανοχή',treatment_decision:'Αλλαγή'}});assert.equal(r.clinicalState,'Σημερινή εικόνα');assert.equal(r.source,'continuity');assert.equal(r.reviewFocus,'Ανοχή');
});
test('structured initial preserves uncertainty, reference date and corrections',()=>{
 const r=recordDocumentation({...bundle,sections:[{session_id:'initial',section_key:'assessment',content:'old',document:{kind:'assessment',fields:[{key:'impression',label:'Impression',text:'Ιστορικό εύρημα',status:'under_investigation',reference:{date:'2026-09-01',session_id:'old'}}]}}]},initial);
 assert.match(r.clinicalState,/Υπό διερεύνηση/);assert.match(r.clinicalState,/2026-09-01/);
 assert.equal(recordDocumentation({...bundle,corrections:[{session_id:'initial',id:'fix',created_at:'2026-10-02',patch:{review:{after:'Διορθωμένος στόχος'}}}]},initial).reviewFocus,'Διορθωμένος στόχος');
});
const risk={suicidal_ideation:'negative',intent:'not_assessed',plan:'not_assessed',self_harm:'not_assessed',attempt_history:'unknown',harm_to_others:'not_assessed',clinical_note:'Ιστορικό προς διευκρίνιση',protective_factors:'',tree:{version:1,answers:{wish:'negative',selfthoughts:'not_assessed',others:'unknown'},notes:{}}};
test('negative death wish cannot become negative ideation; unassessed and unknown stay distinct',()=>{
 const r=recordRisk(risk);assert.match(r.primary,/επιθυμία θανάτου/);assert.match(r.primary,/Όχι/);assert.doesNotMatch(r.primary,/Δεν αναφέρθηκε αυτοκτονικός ιδεασμός/);
 assert.ok(r.unassessed.includes('Αυτοκτονικές σκέψεις: Δεν διερευνήθηκε'));assert.ok(r.domains.some(f=>f.text==='Ιστορικό απόπειρας: Άγνωστο'));assert.ok(r.domains.some(f=>f.text.includes('άλλους')&&f.text.includes('Άγνωστο')));assert.equal(r.note,risk.clinical_note);
});
test('positive historical attempt never implies positive current suicidal intent',()=>{
 const r=recordRisk({...risk,suicidal_ideation:'unknown',attempt_history:'positive',tree:{...risk.tree,answers:{wish:'unknown',others:'not_assessed'}}});assert.match(r.primary,/Άγνωστο/);assert.ok(r.domains.some(f=>f.text==='Ιστορικό απόπειρας: Θετικό'));assert.ok(r.unassessed.includes('Πρόθεση: Δεν διερευνήθηκε'));
});
test('previous branch remains labelled and missing risk never becomes reassurance',()=>{
 assert.equal(recordRisk(null),null);const r=recordRisk({...risk,tree:{...risk.tree,answers:{wish:'negative',plan:'positive'},notes:{plan:'Παλαιά διαδρομή'}}});assert.ok(r.domains.some(f=>f.text.startsWith('Προηγούμενη διαδρομή')&&f.note==='Παλαιά διαδρομή'));assert.ok(r.unassessed.includes('Σχέδιο: Δεν διερευνήθηκε'));
});
test('legacy risk retains legacy question wording rather than pretending it was a tree answer',()=>{
 const r=recordRisk({...risk,tree:undefined});assert.equal(r.primary,'Αυτοκτονικός ιδεασμός Αρνητικό');assert.ok(r.domains.some(f=>f.text==='Πρόθεση: Δεν διερευνήθηκε'));
});
test('narrative correction supersedes an older structured assessment without resurrecting its wording',()=>{
 const input={sections:[{session_id:'initial',section_key:'assessment',content:'Παλιά εικόνα',document:{kind:'assessment',fields:[{key:'impression',label:'Impression',text:'Παλαιά δομημένη εικόνα'}]}}],corrections:[{session_id:'initial',id:'fix',created_at:'2026-10-02',patch:{assessment:{after:'Νεότερη κλινική διόρθωση'}}}]};
 assert.equal(recordDocumentation(input,initial).clinicalState,'Νεότερη κλινική διόρθωση');
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {draftSaveStatus} from '../lib/clinical/draft-save-status.ts';
import {finalizationIssues,finalizationBlocker,followupCompletionIssues} from '../lib/clinical/visit-workspace-state.ts';
test('save status distinguishes failure, in-flight, pending and clean navigation',()=>{
 assert.match(draftSaveStatus({saving:false,dirty:false}),/Οι σημειώσεις αποθηκεύτηκαν/);
 assert.match(draftSaveStatus({saving:true,dirty:true}),/Αποθήκευση αλλαγών/);
 assert.match(draftSaveStatus({saving:false,dirty:true}),/αναμονή/);
 assert.match(draftSaveStatus({saving:false,dirty:true,error:'offline'}),/κείμενό σας διατηρείται/);
 assert.equal(draftSaveStatus({saving:false,dirty:false,recorded:false}),'Δεν έχει καταγραφεί');
});
test('readiness shows every requirement without changing the first finalization blocker',()=>{
 const issues=finalizationIssues([],undefined,null,true);
 assert.equal(issues[0].anchor,'risk');assert.equal(issues.length,5);
 assert.deepEqual(finalizationBlocker([],undefined,null,true),issues[0]);
 assert.ok(!issues.some(i=>i.message.includes('Επανεκτίμηση')));
 const sections=['interview','mse','assessment','plan'].map(section_key=>({section_key,content:'recorded'}));
 assert.deepEqual(finalizationIssues(sections,{suicidal_ideation:'negative'},null,true),[]);
});
test('readiness retains positive-risk and MSE review requirements',()=>{
 const risk={suicidal_ideation:'positive',intent:'not_assessed',plan:'negative',self_harm:'negative',attempt_history:'negative'};
 const previous={kind:'mse',fields:[{key:'speech',text:'baseline',label:'Speech'}]};
 const current=[{section_key:'mse',content:'other',document:{kind:'mse',fields:[]}}];
 const issues=finalizationIssues(current,risk,previous,true);
 assert.match(issues[0].message,/θετικό ιδεασμό/);
 assert.ok(issues.some(i=>i.anchor==='mse'&&i.message.includes('δεν ελέγχθηκαν')));
});

test('follow-up readiness includes the four fields already required by server completion',()=>{
 const sections=[{section_key:'mse',content:'today'}],risk={suicidal_ideation:'negative'};
 const blank={clinical_state_summary:'',treatment_decision:'',next_review_focus:'',adherence:''};
 const issues=followupCompletionIssues(blank,sections,risk);
 assert.equal(issues.length,4);assert.ok(issues.some(i=>i.anchor==='medication'));
 assert.deepEqual(followupCompletionIssues(Object.fromEntries(Object.keys(blank).map(k=>[k,'recorded'])),sections,risk),[]);
});

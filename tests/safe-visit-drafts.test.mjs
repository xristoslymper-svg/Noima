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
test('empty clinical content has no mandatory completion requirements',()=>{
 assert.deepEqual(finalizationIssues([],undefined,null,true),[]);
 assert.equal(finalizationBlocker([],undefined,null,true),null);
});
test('optional risk and MSE fields preserve the unanswered values without filling them',()=>{
 const risk={suicidal_ideation:'positive',intent:'not_assessed',plan:'negative',self_harm:'negative',attempt_history:'negative'};
 const previous={kind:'mse',fields:[{key:'speech',text:'baseline',label:'Speech'}]};
 const current=[{section_key:'mse',content:'other',document:{kind:'mse',fields:[]}}];
 const before=JSON.stringify({risk,previous,current});
 assert.deepEqual(finalizationIssues(current,risk,previous,true),[]);
 assert.equal(JSON.stringify({risk,previous,current}),before);
});
test('follow-up clinical memory fields are all optional',()=>{
 const blank={clinical_state_summary:'',treatment_decision:'',next_review_focus:'',adherence:''};
 assert.deepEqual(followupCompletionIssues(blank,[]),[]);
 assert.deepEqual(followupCompletionIssues({...blank,clinical_state_summary:'Only the chosen field'},[]),[]);
});

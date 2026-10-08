import test from 'node:test';
import assert from 'node:assert/strict';
import {initialDocument} from '../lib/clinical/visit-document.ts';
import {visibleMseField,recordMseField,mseReviewCounts,mseDeltas} from '../lib/clinical/mse-review.ts';
import {finalizationBlocker} from '../lib/clinical/visit-workspace-state.ts';

test('previous choices are visible without becoming a current saved observation',()=>{
 const previous={key:'mood',label:'Mood',text:'Αγχώδες'},current={...previous,text:''};
 const snapshot=JSON.stringify(current);
 assert.equal(visibleMseField(current,previous).text,previous.text);
 assert.equal(JSON.stringify(current),snapshot);
 assert.deepEqual(recordMseField(current,previous.text,previous),{...previous,review:'unchanged'});
 const skipped=recordMseField(current,'',previous);
 assert.equal(skipped.review,'not_assessed');assert.equal(visibleMseField(skipped,previous).text,'');
});
test('changed selections, restoration and draft resume keep explicit per-domain decisions',()=>{
 const prior=initialDocument('mse');prior.fields[2].text='Αγχώδες';const current=initialDocument('mse');
 current.fields[2]=recordMseField(current.fields[2],'Ευθυμικό',prior.fields[2]);
 assert.equal(mseDeltas(prior,current)[0].before,'Αγχώδες');assert.equal(mseReviewCounts(current,prior).changed,1);
 const restored=JSON.parse(JSON.stringify(current));assert.equal(visibleMseField(restored.fields[2],prior.fields[2]).text,'Ευθυμικό');
 restored.fields[2]=recordMseField(restored.fields[2],prior.fields[2].text,prior.fields[2]);
 assert.equal(mseReviewCounts(restored,prior).changed,0);assert.deepEqual(mseDeltas(prior,restored),[]);
 assert.equal(mseReviewCounts(initialDocument('mse'),prior).reviewed,0);
});
test('unreviewed previous domains need a decision; omitted domains do not imply resolution',()=>{
 const previous=initialDocument('mse');previous.fields[0].text='Συνεργάσιμος';previous.fields[2].text='Αγχώδες';
 const current=initialDocument('mse');current.fields[2]=recordMseField(current.fields[2],'Ευθυμικό',previous.fields[2]);
 const sections=['interview','mse','assessment','plan','review'].map(section_key=>({section_key,content:'Recorded',...(section_key==='mse'?{document:current}:{})}));
 const risk={suicidal_ideation:'negative'};
 assert.equal(finalizationBlocker(sections,risk,previous).anchor,'mse');
 current.fields[0]=recordMseField(current.fields[0],'',previous.fields[0]);
 assert.equal(finalizationBlocker(sections,risk,previous),null);
 assert.deepEqual(mseDeltas(previous,current).map(f=>f.key),['mood']);
});

test('explicit global confirmation retains changed findings and confirms only documented references',async()=>{
 const {confirmMseUnchanged}=await import('../lib/clinical/mse-review.ts');
 const current={kind:'mse',fields:[{key:'mood',label:'Mood',text:'Today changed',review:'changed'},{key:'speech',label:'Speech',text:''},{key:'cognition',label:'Cognition',text:''}]};
 const previous={kind:'mse',fields:[{key:'mood',label:'Mood',text:'Old'},{key:'speech',label:'Speech',text:'Coherent',reference:{session_id:'old',date:'2026-10-01'}}]};
 const result=confirmMseUnchanged(current,previous);
 assert.equal(result.fields[0].text,'Today changed');assert.equal(result.fields[1].review,'unchanged');assert.equal(result.fields[1].reference.session_id,'old');assert.equal(result.fields[2].text,'');assert.equal(result.fields[2].review,undefined);assert.equal(current.fields[1].text,'');
});

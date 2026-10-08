import test from 'node:test';
import assert from 'node:assert/strict';
import {groupPatientSubmissions,reviewChannelLabel} from '../lib/clinical/submissions.ts';
const intake={id:'i',patient_id:'p',patient_name:'TEST Patient',tools:['history','PHQ-9','GAD-7'],channel:'email',status:'submitted',submitted_at:'2026-10-08T10:00:00Z',created_at:'2026-10-08T09:00:00Z'};
const assessment={id:'a',patient_id:'p',patient_name:'TEST Patient',instrument:'PHQ-9',status:'completed',score:1,completed_at:'2026-10-08T10:00:01Z',created_at:'2026-10-08T09:00:00Z',reviewed_at:null,item9_review:true,item9_reviewed_at:null,intake_id:'i',provenance:'patient_intake:email'};
test('one intake with history and psychometrics produces one submission and preserves destinations and provenance',()=>{
 const inputs=JSON.stringify([intake,assessment]);const grouped=groupPatientSubmissions([intake],[assessment,{...assessment,id:'b',instrument:'GAD-7',item9_review:false}]);
 assert.equal(grouped.length,1);assert.deepEqual(grouped[0].tools,['history','PHQ-9','GAD-7']);assert.equal(grouped[0].has_history,true);assert.equal(grouped[0].channel,'email');assert.equal(grouped[0].when,assessment.completed_at);assert.equal(JSON.stringify([intake,assessment]),inputs);
});
test('reviewed assessment does not reappear through intake tools; item-9 pending survives generic review',()=>{
 const reviewed={...assessment,reviewed_at:'2026-10-08T11:00:00Z',item9_reviewed_at:'2026-10-08T11:01:00Z'};
 assert.deepEqual(groupPatientSubmissions([intake],[reviewed])[0].tools,['history']);
 const pending={...reviewed,item9_reviewed_at:null};assert.deepEqual(groupPatientSubmissions([], [pending])[0].tools,['PHQ-9']);assert.equal(groupPatientSubmissions([], [reviewed]).length,0);
});
test('conflict retains all tools, separate standalone assessments stay separate and duplicate inputs do not duplicate tools',()=>{
 const result=groupPatientSubmissions([{...intake,patient_id:null,status:'conflict'}],[assessment,assessment,{...assessment,id:'standalone',intake_id:null,provenance:'patient_link;server_scoring_v1'}]);
 assert.equal(result.length,2);const conflict=result.find(x=>x.intake_id);assert.equal(conflict.status,'conflict');assert.deepEqual(conflict.tools,['history','PHQ-9','GAD-7']);assert.equal(result.find(x=>!x.intake_id).channel,'Σύνδεσμος');
});
test('delivery provenance stays distinguishable',()=>{
 for(const [channel,label] of [['tablet','Tablet'],['email','Email'],['print','Έντυπο'],['scanned_paper','Έντυπο']])assert.equal(reviewChannelLabel('',`patient_intake:${channel};server_scoring_v1`),label);
});

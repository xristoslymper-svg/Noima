import test from 'node:test';
import assert from 'node:assert/strict';
import {mseTimeline,finalizationBlocker} from '../lib/clinical/visit-workspace-state.ts';
import {recordMseField,visibleMseField} from '../lib/clinical/mse-review.ts';
const fixture=()=>({sessions:[1,2,3,4].map(i=>({id:'s'+i,status:i===4?'draft':'completed',started_at:`2026-10-0${i}T09:00:00Z`})),sections:[
 {id:'m1',session_id:'s1',section_key:'mse',content:'MSE1',document:{kind:'mse',fields:[{key:'mood',label:'Mood',text:'Αγχώδες'},{key:'speech',label:'Speech',text:'Συνήθης'}]}},
 {id:'m2',session_id:'s2',section_key:'mse',content:'MSE2',document:{kind:'mse',fields:[{key:'mood',label:'Mood',text:'Ευθυμικό',review:'changed'},{key:'speech',label:'Speech',text:'Συνήθης',review:'unchanged'}]}},
 {id:'m3',session_id:'s3',section_key:'mse',content:'MSE3',document:{kind:'mse',fields:[{key:'mood',label:'Mood',text:'Ευθυμικό',review:'unchanged'},{key:'speech',label:'Speech',text:'',review:'not_assessed'}]}}
 ],corrections:[],addenda:[],appointments:[]});
test('third follow-up sees latest values and a dated older reference only for an unassessed domain',()=>{
 const b=fixture(),before=JSON.stringify(b),timeline=mseTimeline(b,'s4',b.sessions[3].started_at);
 assert.equal(timeline.references.mood.sessionId,'s3');assert.equal(timeline.references.mood.older,false);
 assert.equal(timeline.references.speech.sessionId,'s2');assert.equal(timeline.references.speech.older,true);
 assert.deepEqual(timeline.visits.map(v=>v.fields.find(f=>f.key==='mood').state),['first','changed','same']);
 assert.equal(timeline.visits[2].fields.find(f=>f.key==='speech').state,'not_assessed');assert.equal(JSON.stringify(b),before);
});
test('missing and unassessed observations do not erase earlier reference or imply improvement',()=>{
 const b=fixture();b.sections[2].document.fields=[];
 const t=mseTimeline(b,'s4',b.sessions[3].started_at);assert.equal(t.references.mood.sessionId,'s2');
 assert.equal(t.visits[2].fields.find(f=>f.key==='mood').state,'missing');
 b.sections[2].document.fields=[{key:'mood',label:'Mood',text:'Contradictory stale text',review:'not_assessed'}];
 assert.equal(mseTimeline(b,'s4',b.sessions[3].started_at).references.mood.field.text,'Ευθυμικό');
});
test('history applies structured corrections and narrative replacement without inventing structured choices',()=>{
 const b=fixture();b.corrections=[{id:'c',session_id:'s2',created_at:'2026-10-06',reason:'Corrected speech',patch:{mse:{after:{kind:'mse',fields:[{key:'speech',label:'Speech',text:'Βραδύς'}]}}}}];
 const t=mseTimeline(b,'s4',b.sessions[3].started_at);assert.equal(t.references.speech.field.text,'Βραδύς');assert.equal(t.visits[1].corrections[0].id,'c');
 b.corrections[0].patch.mse.after='Narrative correction, not structured observations';
 const narrative=mseTimeline(b,'s4',b.sessions[3].started_at);assert.equal(narrative.visits[1].narrative,'Narrative correction, not structured observations');assert.equal(narrative.references.speech.sessionId,'s1');
});
test('drafts and future encounters are excluded and encounter time orders the history',()=>{
 const b=fixture();b.sessions[1].status='draft';b.sessions[2].started_at='2026-10-05T09:00:00Z';b.appointments=[{session_id:'s3',scheduled_start:'2026-10-05T09:00:00Z'}];
 assert.deepEqual(mseTimeline(b,'s4',b.sessions[3].started_at).visits.map(v=>v.sessionId),['s1']);
});
test('confirming an older reference preserves provenance and requires a fresh domain decision',()=>{
 const t=mseTimeline(fixture(),'s4','2026-10-04T09:00:00Z');const source=t.references.speech;
 const previous={...source.field,reference:{session_id:source.sessionId,date:source.date}},empty={key:'speech',label:'Speech',text:''};
 assert.equal(visibleMseField(empty,previous).text,'Συνήθης');assert.equal(empty.text,'');
 const confirmed=recordMseField(empty,previous.text,previous);assert.deepEqual(confirmed.reference,previous.reference);assert.equal(confirmed.review,'unchanged');
 const sections=['interview','mse','assessment','plan','review'].map(section_key=>({section_key,content:'Recorded',...(section_key==='mse'?{document:{kind:'mse',fields:[{key:'mood',label:'Mood',text:'Ευθυμικό'}]}}:{})}));
 const references={kind:'mse',fields:Object.values(t.references).map(r=>r.field)};
 assert.equal(finalizationBlocker(sections,{suicidal_ideation:'negative'},references).anchor,'mse');
 sections[1].document.fields.push(confirmed);assert.equal(finalizationBlocker(sections,{suicidal_ideation:'negative'},references),null);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {briefFacts,briefAlerts} from '../lib/clinical/brief-presentation.ts';
test('brief orientation preserves authoritative diagnosis, medication and exact latest review provenance',()=>{
 const card={date:'2026-10-07T15:00:00Z',diagnoses:[{text:'F41.1 · confirmed',source_ids:['section:diagnosis']}],medications:[],sources:[
 {id:'old-review',kind:'session_section',section_key:'review',date:'2026-09-09T15:00:00Z',content:'Old task.'},
 {id:'new-review',kind:'session_section',section_key:'review',date:'2026-10-07T15:00:00Z',content:'Review sleep and residual worry.',required_correction_ids:['correction:1']},
 {id:'draft',kind:'session_section',section_key:'review',date:'2026-10-21T15:00:00Z',content:'Unfinished advice.'}]};
 const before=JSON.stringify(card),facts=briefFacts(card);
 assert.equal(facts.diagnoses[0].text,'F41.1 · confirmed');
 assert.deepEqual(facts.medications,[]);
 assert.deepEqual(facts.review.map(i=>i.text),['Review sleep and residual worry.']);
 assert.deepEqual(facts.review[0].source_ids,['new-review','correction:1']);
 assert.equal(JSON.stringify(card),before);
});

test('brief keeps medication doses and diagnosis statuses verbatim; differential is secondary but intact',()=>{
 const diagnoses=[{text:'F41.1 · diagnosis · provisional',source_ids:['d']},{text:'Διαφορική: unresolved differential',source_ids:['d','correction:d']}];
 const medications=[{text:'QA drug · 10 mg · daily',source_ids:['m']}];
 const card={sources:[],date:null,diagnoses,medications};
 const facts=briefFacts(card);
 assert.deepEqual(facts.diagnoses,[diagnoses[0]]);
 assert.deepEqual(facts.differential,[diagnoses[1]]);
 assert.deepEqual(facts.medications,medications);
 assert.deepEqual(briefFacts({...card,diagnoses:[],medications:[]}),{diagnoses:[],differential:[],medications:[],review:[]});
});
test('brief disclosure never hides structured risk, missing risk or medication/correction warnings',()=>{
 const alerts=['risk','risk-missing','risk-note','medication-refresh','correction:1'].map(key=>({key,text:key,source_ids:['source:'+key],attention:true}));
 const before=JSON.stringify(alerts),result=briefAlerts({alerts});
 assert.deepEqual(result.visible.map(i=>i.key),['risk','risk-missing','medication-refresh','correction:1']);
 assert.deepEqual(result.notes.map(i=>i.key),['risk-note']);
 assert.deepEqual([...result.visible,...result.notes].flatMap(i=>i.source_ids).sort(),alerts.flatMap(i=>i.source_ids).sort());
 assert.equal(JSON.stringify(alerts),before);
});

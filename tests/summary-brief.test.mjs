import test from 'node:test';
import assert from 'node:assert/strict';
import {briefFacts} from '../lib/clinical/brief-presentation.ts';
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

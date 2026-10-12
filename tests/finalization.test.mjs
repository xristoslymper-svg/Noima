import {test} from 'node:test';
import assert from 'node:assert/strict';
import {confirmedCompletion} from '../lib/clinical/finalization.ts';
import {mergeVisitContext} from '../lib/clinical/visit-workspace-state.ts';
const completed={id:'visit',patient_id:'patient',status:'completed',version:8,completed_at:'2026-10-12T12:00:00Z'};
test('success requires completed identity, patient, timestamp and version; malformed HTTP successes fail closed',()=>{
 assert.equal(confirmedCompletion(completed,'visit','patient'),completed);
 for(const value of [null,{},[],{...completed,status:'draft'},{...completed,id:'other'},{...completed,patient_id:'other'},{...completed,completed_at:null},{...completed,version:null}])assert.throws(()=>confirmedCompletion(value,'visit','patient'),/Δεν επιβεβαιώθηκε/);
});
test('a delayed draft response cannot reopen a canonically completed visit',()=>{
 const base={patient:{id:'patient',tester_id:'tenant'},sessions:[completed],sections:[],risks:[],proposals:[],addenda:[],corrections:[],assessments:[{id:'measurement'}]};
 const delayed={...base,sessions:[{...completed,status:'draft',version:7}],assessments:[]};
 const result=mergeVisitContext(delayed,base);
 assert.equal(result.sessions[0].status,'completed');assert.equal(result.sessions[0].version,8);assert.equal(result.assessments.length,1);
});

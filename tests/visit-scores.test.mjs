import {test} from 'node:test';
import assert from 'node:assert/strict';
import {visitScoreComparisons} from '../lib/clinical/visit-scores.ts';
const session=(id,date,status='completed')=>({id,started_at:date,completed_at:status==='completed'?date:null,status});
const score=(id,session_id,value,version='v1')=>({id,session_id,instrument:'PHQ-9',instrument_version:version,status:'completed',score:value,completed_at:'2026-10-01T12:00:00Z'});
const bundle=()=>({sessions:[session('old','2026-09-01'),session('previous','2026-10-01'),session('current','2026-10-02','draft')],assessments:[],appointments:[]});
test('scores compare the actual previous completed visit and preserve a zero score',()=>{
 const b=bundle();b.assessments=[score('a','previous',8),score('b','current',0)];const [c]=visitScoreComparisons(b,'current');assert.equal(c.delta,-8);assert.equal(c.current.score,0);
});
test('no fallback to older or unlinked measurements; versions must match',()=>{
 const b=bundle();b.assessments=[score('old-score','old',12),score('unlinked',null,4),score('current-score','current',6)];assert.equal(visitScoreComparisons(b,'current')[0].prior,null);
 b.assessments.push(score('previous-score','previous',8,'v2'));assert.equal(visitScoreComparisons(b,'current')[0].delta,null);
});
test('appointment attribution works, pending and future previous measurements are excluded',()=>{
 const b=bundle();b.appointments=[{id:'appointment',session_id:'previous'}];b.assessments=[{...score('a',null,4),appointment_id:'appointment'},score('b','current',3)];assert.equal(visitScoreComparisons(b,'current')[0].delta,-1);
 b.assessments[0].completed_at='2026-10-03T00:00:00Z';assert.equal(visitScoreComparisons(b,'current')[0].prior,null);
 b.assessments[1].status='assigned';assert.equal(visitScoreComparisons(b,'current')[0].current,null);
});

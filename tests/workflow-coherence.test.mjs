import {test} from 'node:test';
import assert from 'node:assert/strict';
import {medicationTimes,selectedMedicationTimes,toggleMedicationTime} from '../lib/clinical/medication-frequency.ts';
import {completedVisitNotes} from '../lib/clinical/completed-visit-notes.ts';
import {initialFollowupDraft,followupFieldConflicts} from '../lib/clinical/followup-fields.ts';
import {emptyContinuity} from '../lib/clinical/continuity.ts';

test('all daily combinations round-trip in chronological order and toggle off independently',()=>{
 for(let mask=0;mask<8;mask++){
  let value='';
  for(let index=2;index>=0;index--)if(mask&(1<<index))value=toggleMedicationTime(value,medicationTimes[index]);
  assert.deepEqual(selectedMedicationTimes(value),medicationTimes.filter((_,i)=>mask&(1<<i)));
  for(const time of medicationTimes){const twice=toggleMedicationTime(toggleMedicationTime(value,time),time);assert.equal(twice,value)}
 }
});
test('custom schedules and unequal-dose prescriptions are never guessed or replaced by quick choices',()=>{
 for(const value of ['1 morning','Πρωί 25 mg / βράδυ 50 mg','κάθε Δευτέρα','όποτε χρειάζεται','κάθε 8 ώρες']){
  assert.equal(selectedMedicationTimes(value),null);
  assert.equal(toggleMedicationTime(value,'Πρωί'),value);
 }
});
const section=(key,content,extra={})=>({id:key,session_id:'s',section_key:key,content,version:3,...extra});
const session={id:'s',status:'completed',started_at:'2026-10-11T10:00:00Z',completed_at:'2026-10-11T11:00:00Z'};
test('initial assessment projects all stored narrative fields without requiring compact continuity',()=>{
 const keys=['interview','plan','review','adherence','effects','functioning'];
 const notes=completedVisitNotes({sections:keys.map(k=>section(k,'Stored '+k)),corrections:[]},session);
 assert.equal(notes.clinical,'Stored interview');assert.equal(notes.plan,'Stored plan');assert.equal(notes.review,'Stored review');assert.equal(notes.adherence,'Stored adherence');assert.equal(notes.effects,'Stored effects');assert.equal(notes.functioning,'Stored functioning');
 assert.equal(completedVisitNotes({sections:[]},{...session,status:'draft'}),null);
});
test('latest corrected values including explicit clears take precedence over old memory',()=>{
 const bundle={sections:[section('plan','old plan')],corrections:[{session_id:'s',id:'c',created_at:'2026-10-11T12:00:00Z',patch:{plan:{after:'corrected plan'},review:{after:''},adherence:{after:'corrected adherence'}}}]};
 const notes=completedVisitNotes(bundle,{...session,continuity:{...emptyContinuity,approved_at:session.completed_at,clinical_state_summary:'original summary',treatment_decision:'old memory',next_review_focus:'old review'}});
 assert.equal(notes.plan,'corrected plan');assert.equal(notes.review,'');assert.equal(notes.adherence,'corrected adherence');assert.equal(notes.clinical,'original summary');assert.equal(notes.corrected,true);
});
test('missing current encounter values never fall back to a prior encounter',()=>{
 const notes=completedVisitNotes({sections:[section('adherence','prior',{session_id:'older'})],corrections:[]},session);
 assert.equal(notes.adherence,'');assert.equal(notes.clinical,'');
});
test('compact and detailed fields initialize from one draft without dropping provenance or source',()=>{
 const saved={...emptyContinuity,clinical_state_summary:'shared',treatment_decision:'decision',next_review_focus:'review',adherence:'taken',writing_provenance:{}};
 assert.equal(initialFollowupDraft({...session,closure_draft:saved},[section('interview','legacy')]),saved);
 const seeded=initialFollowupDraft(session,[section('interview','old'),section('review','next'),section('effects','not an adherence value')]);
 assert.equal(seeded.clinical_state_summary,'old');assert.equal(seeded.next_review_focus,'next');assert.equal(seeded.adherence,'');
});
test('legacy disagreement blocks confirmation until explicitly reconciled; separate clinical concepts are not conflicts',()=>{
 const value={...emptyContinuity,clinical_state_summary:'shared',treatment_decision:'plan'};
 const sections=[section('interview','older'),section('plan','plan'),section('assessment','separate assessment'),section('effects','separate tolerability')];
 const conflicts=followupFieldConflicts(value,'s',sections);
 assert.equal(conflicts.length,1);assert.equal(conflicts[0].section.version,3);assert.equal(conflicts[0].field,'clinical_state_summary');
 assert.deepEqual(followupFieldConflicts({...value,clinical_state_summary:'older'},'s',sections),[]);
 assert.equal(followupFieldConflicts({...value,clinical_state_summary:''},'s',sections).length,1);
});

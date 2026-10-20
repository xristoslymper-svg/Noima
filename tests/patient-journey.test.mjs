import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {journeyExcerpt,journeyReview,journeyReviewFingerprint,latestJourneyNotes,previousJourneyVisit} from '../lib/clinical/patient-journey.ts';
const seed=()=>JSON.parse(readFileSync('browser-tests/fixtures/warm-patient.json','utf8'));
test('previous-visit context excludes drafts, the current visit and future clinical dates',()=>{
 const b=seed(),template=b.sessions[0];
 b.sessions=[
 {...template,id:'earlier',status:'completed',started_at:'2026-09-01T10:00:00Z'},
 {...template,id:'previous',status:'completed',started_at:'2026-10-01T10:00:00Z'},
 {...template,id:'future',status:'completed',started_at:'2026-12-01T10:00:00Z'},
 {...template,id:'other-draft',status:'draft',started_at:'2026-10-16T10:00:00Z'},
 ];
 b.appointments=[];
 const current={...template,id:'current',status:'draft',started_at:'2026-10-18T10:00:00Z'};
 assert.equal(previousJourneyVisit(b,current).id,'previous');
 b.sessions.push(current);
 assert.equal(latestJourneyNotes(b,current).visit.id,'previous');
});
test('a patient without completed visits has no invented clinical history',()=>{
 const b=seed();b.sessions=b.sessions.map(s=>({...s,status:'draft'}));
 assert.equal(previousJourneyVisit(b),undefined);assert.equal(latestJourneyNotes(b).notes,null);
});
test('review reads the selected visit only and distinguishes already committed writes',()=>{
 const b=seed(),template=b.sessions[0],s={...template,id:'selected',session_type:'follow_up',closure_draft:{clinical_state_summary:'Selected picture',treatment_decision:'Selected plan',next_review_focus:'Selected review'}};
 b.sections=[{session_id:'unrelated',section_key:'interview',content:'Never show this as selected'}];
 b.medicationEvents=[{id:'committed',session_id:s.id},{id:'revised',session_id:s.id},{id:'other',session_id:'other'}];b.medicationRevisions=[{event_id:'revised'}];
 b.medicationSideEffects=[{session_id:s.id},{session_id:'other'}];
 const r=journeyReview(b,s);assert.equal(r.clinical,'Selected picture');assert.equal(r.plan,'Selected plan');assert.equal(r.review,'Selected review');assert.equal(r.medicationWrites,1);assert.equal(r.sideEffects,1);
});
test('orientation excerpts preserve the source text and visibly mark truncation',()=>{
 assert.equal(journeyExcerpt(' source text '),'source text');assert.equal(journeyExcerpt('abcdefgh',4),'abcd…');
});
test('both editors register directly after flush and identity validation without a review screen',()=>{
 const full=readFileSync('components/patients/PatientSession.tsx','utf8'),compact=readFileSync('components/patients/FollowupClosure.tsx','utf8');
 for(const source of [full,compact]){assert.doesNotMatch(source,/JourneyReview|reviewBundle|setReviewBundle/);assert.match(source,/flushAll\(true\)/);assert.match(source,/saved\.patient_id!==bundle\.patient\.id/);assert.match(source,/saved\.status!=='draft'/);}
 assert.match(full,/FollowupFinalizationGuard/);assert.match(full,/onFinalize\(draft.id,draft.session_type==='follow_up'/);assert.match(compact,/onFinalize\(saved.closure_version\|\|0\)/);
 const workspace=readFileSync('components/patients/PatientWorkspace.tsx','utf8');
 assert.ok(workspace.indexOf('confirmedCompletion(fresh.sessions')<workspace.indexOf("applyTab('timeline',null"));
 assert.match(workspace,/<VisitDialog open=\{tab==='record'\}/);assert.match(workspace,/JourneyCompletion/);
});

test('review identity detects post-review clinical edits and version changes',()=>{
 const b=seed(),s=b.sessions[0],before=journeyReviewFingerprint(b,s.id);
 const changed=structuredClone(b);changed.sessions.find(x=>x.id===s.id).version++;
 assert.notEqual(journeyReviewFingerprint(changed,s.id),before);
 const unrelated=structuredClone(b);unrelated.sections.push({session_id:'other',section_key:'interview',content:'Unrelated'});
 assert.equal(journeyReviewFingerprint(unrelated,s.id),before);
});

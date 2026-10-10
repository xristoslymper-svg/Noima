import test from 'node:test';
import assert from 'node:assert/strict';
import {ClinicalWriting,recoverWriting,narrativeWritingRecovery} from '../lib/clinical/clinical-writing.ts';
const machine=(value='Αρχική καταγραφή')=>new ClinicalWriting(value,()=>{});
test('dictation A/C: pending text, edits and successive segments never change confirmed content before acceptance',()=>{
 const m=machine();const first=m.start('permission');assert.equal(m.start('permission'),null);m.phase('recording');m.phase('paused');m.phase('recording');m.phase('transcribing');
 m.edit('Αρχική καταγραφή με χειροκίνητη διόρθωση');m.transcribed(first,'Πρώτο τμήμα');m.transcribed(first,'Πρώτο τμήμα');
 assert.equal(m.display(),'Αρχική καταγραφή με χειροκίνητη διόρθωση\n\nΠρώτο τμήμα');
 assert.equal(m.snapshot.confirmed,'Αρχική καταγραφή με χειροκίνητη διόρθωση');assert.throws(()=>m.assertSafe());
 m.edit(m.display()+' διορθωμένο');assert.equal(m.start('ai'),null);
 const second=m.start('permission');m.transcribed(second,'Δεύτερο τμήμα');
 assert.equal(m.display(),'Αρχική καταγραφή με χειροκίνητη διόρθωση\n\nΠρώτο τμήμα διορθωμένο\n\nΔεύτερο τμήμα');
 const review=m.assertReview();assert.equal(review.transcript,'Πρώτο τμήμα\n\nΔεύτερο τμήμα');m.accepted(review.text);m.assertSafe();assert.equal(m.snapshot.pending,null);
});
test('dictation cancellation restores exactly the confirmed base; cancelling a new capture keeps earlier review',()=>{
 const m=machine('  Original\n exact  ');m.transcribed(m.start('permission'),'segment');const text=m.display();m.start('permission');m.stop();assert.equal(m.display(),text);m.cancel();assert.equal(m.display(),'  Original\n exact  ');m.assertSafe();
});
test('AI D/E: editable candidate is isolated; reject restores exact source and accept commits only reviewed wording',()=>{
 const m=machine('Ο ασθενής δεν αναφέρει αϋπνία.');const base=m.display();m.polished(m.start('ai'),base,'Δεν αναφέρεται αϋπνία από τον ασθενή.','configured');assert.equal(m.snapshot.confirmed,base);assert.equal(m.start('permission'),null);m.edit('Ο ασθενής δεν αναφέρει αϋπνία σήμερα.');assert.equal(m.assertReview().text,'Ο ασθενής δεν αναφέρει αϋπνία σήμερα.');m.cancel();assert.equal(m.display(),base);
 m.polished(m.start('ai'),base,'Reviewed');m.accepted(m.assertReview().text);assert.equal(m.display(),'Reviewed');
});
test('F/G: API failures retain source and pending review; conflicts never approve a candidate against a newer base',()=>{
 const m=machine();const id=m.start('ai');m.fail(id,'Unavailable');assert.equal(m.display(),'Αρχική καταγραφή');m.assertSafe();m.transcribed(m.start('permission'),'pending');const pending=m.snapshot.pending;m.error('save conflict');assert.deepEqual(m.snapshot.pending,pending);m.sync('New server value');assert.throws(()=>m.assertReview(),/άλλαξε/);m.cancel();assert.equal(m.display(),'New server value');
});
test('H: stale/cancelled responses cannot overwrite edits or insert across independent fields, even edit-away-and-back',()=>{
 const a=machine('source'),b=machine('other');const id=a.start('ai');a.edit('edited');a.edit('source');a.polished(id,'source','stale');assert.equal(a.snapshot.phase,'error');assert.equal(a.display(),'source');assert.equal(b.display(),'other');const old=a.start('permission');a.stop();a.transcribed(old,'late');assert.equal(a.display(),'source');
});
test('pending recovery retains review/provenance and never adopts it as confirmed documentation',()=>{
 const a=machine('base');a.transcribed(a.start('permission'),'pending');a.proposalId('entry');const pending=recoverWriting(JSON.parse(JSON.stringify(a.snapshot.pending)));const b=machine('base');b.recover(pending);assert.equal(b.snapshot.confirmed,'base');assert.equal(b.assertReview().proposalId,'entry');assert.throws(()=>b.assertSafe());assert.equal(recoverWriting({kind:'dictation',text:'corrupt'}),null);
});
test('legacy and new narrative proposals recover without automatic AI or duplicated original paragraphs',()=>{
 const entry={id:'entry',transcript:'Raw',proposal:{clinical_text:'Edited raw',facts:[]},model:'legacy-model'};
 const old=narrativeWritingRecovery('Original',entry);assert.equal(old.text,'Original\n\nEdited raw');assert.equal(old.base,'Original');
 entry.proposal={clinical_text:'Original\n\nReviewed',facts:[],writing:{kind:'dictation',original:'Original'}};entry.model=null;
 const next=narrativeWritingRecovery('Newer server original',entry);assert.equal(next.text,'Original\n\nReviewed');assert.equal(next.base,'Original');assert.equal(next.kind,'dictation');const m=machine('Newer server original');m.recover(next);assert.throws(()=>m.assertReview(),/άλλαξε/);
 const local=narrativeWritingRecovery('Original',undefined,'raw',{text:'exact legacy replacement',manual:true,mode:'replace'});assert.equal(local.text,'exact legacy replacement');assert.equal(local.kind,'dictation');
});

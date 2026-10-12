import test from 'node:test';
import assert from 'node:assert/strict';
import {previsitFixture} from './fixtures/previsit-briefing.ts';
import {buildClinicalCard} from '../lib/clinical/clinical-card.ts';
import {buildSummaryContext,validateNarrative} from '../lib/clinical/summary-context.ts';
import {medicationTiming,reviewWindow} from '../lib/clinical/summary-orientation.ts';
import {providerEvidence} from '../lib/clinical/provider-evidence.ts';

test('orientation keeps older evidence and distinguishes historical plans from latest instructions',()=>{
 const b=previsitFixture();const old=b.sessions.find(s=>s.status==='completed'&&s.id!==b.sessions[0].id)||b.sessions[1];
 b.sections.push({id:'old-plan',session_id:old.id,section_key:'plan',content:'Παλαιότερη οδηγία εργαστηριακού ελέγχου.'});
 const context=buildSummaryContext(b,'2026-10-12'),card=buildClinicalCard(b,context);
 assert.equal(card.orientation.length,5);
 assert.ok(card.orientation[1].items.some(i=>i.source_ids.includes('section:old-report')));
 const next=card.orientation[4];assert.ok(next.items.some(i=>i.text.includes('δύο εβδομάδες')));
 assert.ok(next.history.some(i=>i.text.includes('Παλαιότερη οδηγία')));
 assert.ok(!next.items.some(i=>i.text.includes('Παλαιότερη οδηγία')));
 assert.ok(!JSON.stringify(card.orientation).includes('SECRET_DRAFT'));
});
test('verified older personal context appears even when absent from latest encounter; model cannot replace prescribing',()=>{
 const b=previsitFixture(),context=buildSummaryContext(b,'2026-10-12');
 const findings=validateNarrative({findings:[{text:'Αναφέρει παλαιότερη δυσκολία στην έναρξη του ύπνου.',theme:'context',group_label:'Σημαντικό πλαίσιο',source_ids:['section:old-report']}]},context);
 const card=buildClinicalCard(b,context,findings,true);
 assert.ok(card.orientation[3].items.some(i=>i.source_ids.includes('section:old-report')));
 assert.match(card.orientation[2].items[0].text,/Sertraline.*50 mg/);
});
test('prescribing duration distinguishes original start from current regimen without future or fabricated dates',()=>{
 assert.equal(medicationTiming('2026-05-04','2026-07-06','2026-10-12'),'έναρξη 2026-05-04 (161 ημέρες) · τρέχον σχήμα από 2026-07-06 (98 ημέρες)');
 assert.equal(medicationTiming('','2099-01-01','2026-10-12'),'');
 assert.equal(medicationTiming('invalid','invalid','2026-10-12'),'');
});
test('provider minimisation removes nested direct identifiers while preserving citations, clinical content and correction links',()=>{
 const value={patient_id:'patient',tester_id:'doctor',sources:[{id:'section:1',session_id:'s',required_correction_ids:['fix'],content:{patient_id:'patient',email:'private',dose:50,patch:{review:{after:'Επανεξέταση.'}}}}]};
 const result=providerEvidence(value);assert.equal(result.patient_id,undefined);assert.equal(result.sources[0].content.email,undefined);assert.deepEqual(result.sources[0].required_correction_ids,['fix']);assert.equal(result.sources[0].content.dose,50);assert.equal(value.sources[0].content.email,'private');
});

test('review window anchors explicit weeks to visit date and distinguishes elapsed time from an outstanding appointment',()=>{
 const text='Επανεκτίμηση σε 4–6 εβδομάδες.';
 assert.match(reviewWindow(text,'2026-10-05','2026-10-12'),/02\/11\/2026–16\/11\/2026/);
 assert.match(reviewWindow(text,'2026-10-05','2026-12-01'),/έχει παρέλθει/);
 assert.match(reviewWindow(text,'2026-10-05','2026-11-05'),/Εντός/);
 assert.equal(reviewWindow('Επανεκτίμηση σε 4–6 εβδομάδες αν χρειαστεί.','2026-10-05','2026-10-12'),'');
 assert.equal(reviewWindow(text,'invalid','2026-10-12'),'');
});

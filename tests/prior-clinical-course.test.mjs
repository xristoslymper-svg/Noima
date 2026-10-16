import test from 'node:test';
import assert from 'node:assert/strict';
import {copilotPatients} from '../lib/copilot/synthetic-fixtures.mjs';
import {buildSummaryContext,summaryReadiness,summaryContextHash,canonicalSummaryFindings} from '../lib/clinical/summary-context.ts';
import {buildClinicalCard} from '../lib/clinical/clinical-card.ts';
function chart(){
 const b=copilotPatients()[0];b.sessions=[];b.sections=[];b.risks=[];b.assessments=[];b.medications=[];b.medicationEvents=[];b.medicationSideEffects=[];b.medicationRevisions=[];b.appointments=[];
 b.priorCourse={id:'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa',tester_id:b.patient.tester_id,patient_id:b.patient.id,version:1,period_label:'1 έτος',content:'Παρακολουθείται έναν χρόνο για άγχος. Αρχική λειτουργική έκπτωση, στη συνέχεια βελτίωση, με πρόσφατη αϋπνία.',created_at:'2026-10-16T08:00:00Z'};
 return b;
}
test('prior course is accepted without fabricated clinical visits',()=>{
 const b=chart(),c=buildSummaryContext(b,'2026-10-16');assert.equal(b.sessions.length,0);assert.equal(summaryReadiness(b,c),null);
 const source=c.sources.find(s=>s.kind==='prior_course');assert.ok(source);assert.equal(source.record_id,b.priorCourse.id);
 assert.ok(c.layers.durable.some(s=>s.id===source.id));assert.ok(canonicalSummaryFindings(c).some(f=>f.source_ids.includes(source.id)));
 const card=buildClinicalCard(b,c);assert.ok(card.orientation?.find(r=>r.label==='Πορεία')?.items.some(i=>i.text.includes('Παρακολουθείται')));
});
test('draft changes do not invalidate the completed summary context',async()=>{
 const b=chart(),hash=await summaryContextHash(b,'2026-10-16');const changed=structuredClone(b);
 changed.sessions.push({id:'draft',status:'draft',started_at:'2026-10-16'});
 changed.sections.push({id:'draft-note',session_id:'draft',section_key:'interview',content:'UNAPPROVED_DRAFT'});
 assert.equal(await summaryContextHash(changed,'2026-10-16'),hash);
 changed.priorCourse={...changed.priorCourse,content:changed.priorCourse.content+' Διόρθωση του θεράποντος.',version:2};
 assert.notEqual(await summaryContextHash(changed,'2026-10-16'),hash);
 assert.ok(!buildSummaryContext(changed).sources.some(s=>String(s.content).includes('UNAPPROVED_DRAFT')));
});
test('without visit or prior course, synthesis remains unavailable',()=>{
 const b=chart();b.priorCourse=null;assert.equal(summaryReadiness(b),'no_completed_visit');
});

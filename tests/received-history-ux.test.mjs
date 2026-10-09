import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {emptyHistory} from '../lib/intake/history.ts';
import {receivedPatientHistories,normalizedPatientHistory,patientReportedHighlights} from '../lib/intake/patient-report.ts';

test('patient submission appears as received without requiring clinician review',()=>{
 const items=[
  {id:'reviewed',tools:['history'],status:'submitted',reviewed_at:'2026-10-09',submitted_at:'2026-10-09T09:00:00Z',history_answers:{reasons:['Άγχος']},channel:'email'},
  {id:'unreviewed',tools:['history'],status:'submitted',reviewed_at:null,submitted_at:'2026-10-09T11:00:00Z',history_answers:{reasons:['Ύπνος']},channel:'email'},
  {id:'conflict',tools:['history'],status:'conflict',submitted_at:'2026-10-09T12:00:00Z',history_answers:{reasons:['Ύπνος']},channel:'email'},
  {id:'psychometric',tools:['PHQ-9'],status:'submitted',submitted_at:'2026-10-09T12:00:00Z',history_answers:{reasons:[]},channel:'email'}
 ];
 assert.deepEqual(receivedPatientHistories(items).map(item=>item.id),['unreviewed','reviewed']);
});

test('partial answers do not become fabricated clinical negatives',()=>{
 const h=normalizedPatientHistory({reasons:['Ύπνος'],duration:'3 ημέρες',current_meds:'',suicide_attempt:''});
 assert.deepEqual(h.reasons,['Ύπνος']);
 const facts=patientReportedHighlights(h);
 assert.ok(facts.some(x=>x.includes('Ύπνος')));
 assert.ok(!facts.some(x=>/δεν υπάρχει κίνδυνος|δεν λαμβάνει αγωγή|απόπειρας/i.test(x)));
 assert.deepEqual(normalizedPatientHistory({}).family,{});
 assert.equal(emptyHistory.suicide_attempt,'');
});

test('explicit risk history and patient medication report remain attributed to the patient',()=>{
 const h=normalizedPatientHistory({current_meds:'yes',current_medication_name:'Sertraline 50 mg',suicide_attempt:'yes',reasons:[]});
 const facts=patientReportedHighlights(h).join(' · ');
 assert.match(facts,/Αναφερόμενη αγωγή: Sertraline 50 mg/);
 assert.match(facts,/Αναφέρει ιστορικό απόπειρας/);
});

test('history screen avoids the extra eight-field intake approval and exposes clinician notes only when wanted',()=>{
 const history=readFileSync('components/patients/PatientPanels.tsx','utf8');
 const workspace=readFileSync('components/patients/PatientWorkspace.tsx','utf8');
 const overview=readFileSync('components/patients/PatientRecordSummary.tsx','utf8');
 assert.match(history,/<PatientReportedHistory patientId=/);
 assert.match(history,/<details className="patient-doctor-notes"/);
 assert.doesNotMatch(history,/reviewIntake|Έλεγχος & ενσωμάτωση|Σύγκριση εκδόσεων/);
 assert.match(workspace,/label="Ιστορικό"/);
 assert.match(overview,/<PatientReportedHistory patientId=/);
});

test('opening received history clears its inbox notification without clinical approval',()=>{
 const api=readFileSync('app/api/intake/route.ts','utf8');
 const history=readFileSync('components/patients/PatientReportedHistory.tsx','utf8');
 const migration=readFileSync('supabase/migrations/20261009153029_intake_viewed_without_review.sql','utf8');
 assert.match(api,/b\.action==='mark_viewed'/);
 assert.match(history,/if\(!compact&&received\.length&&!viewed/);
 assert.match(history,/action:'mark_viewed'/);
 assert.match(migration,/viewed_at/);
 assert.match(migration,/i\.viewed_at is null/);
 assert.match(migration,/private\.pilot_assert_owner/);
 assert.doesNotMatch(migration,/SET reviewed_at=now\(\)/i);
});

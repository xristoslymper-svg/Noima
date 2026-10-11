import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const followup=readFileSync(new URL('../components/patients/FollowupClosure.tsx',import.meta.url),'utf8');
const continuity=readFileSync(new URL('../lib/clinical/continuity.ts',import.meta.url),'utf8');
const summary=readFileSync(new URL('../components/patients/PatientRecordSummary.tsx',import.meta.url),'utf8');
const treatment=readFileSync(new URL('../components/patients/PatientTreatment.tsx',import.meta.url),'utf8');
const context=readFileSync(new URL('../lib/clinical/continuity-context.ts',import.meta.url),'utf8');
const modal=readFileSync(new URL('../components/patients/PatientPanels.tsx',import.meta.url),'utf8');
const exportFile=readFileSync(new URL('../lib/clinical/record-export.ts',import.meta.url),'utf8');

test('the combined plan retains two independent saved continuity fields',()=>{
 assert.match(followup,/data-followup-plan-group="true"/);
 assert.match(followup,/writingField\('treatment_decision'/);
 assert.match(followup,/writingField\('next_review_focus'/);
 assert.doesNotMatch(followup,/>Δεν ελήφθη νέα απόφαση<\/button>/);
 assert.doesNotMatch(followup,/>Δεν ορίστηκε επόμενος έλεγχος<\/button>/);
 assert.match(summary,/notes\?\.review/);
 assert.match(continuity,/treatment_decision:string/);
 assert.match(continuity,/next_review_focus:string/);
 assert.match(exportFile,/next_review_focus|treatment_decision/);
});

test('shared adherence capture preserves independent pinned-context data',()=>{
 assert.match(followup,/writingField\('adherence'/);
 assert.doesNotMatch(followup,/writingField\('pinned_context'/);
 assert.match(followup,/draft\.value\.pinned_context\.trim\(\)/);
 assert.match(continuity,/pinned_context:string/);
 assert.match(continuity,/adherence:string/);
 assert.match(treatment,/notes\.adherence/);
 assert.match(context,/original\.pinned_context/);
});

test('medication response buttons are distinct from prescription changes and side effects',()=>{
 assert.match(followup,/readMedicationResponse\(draft\.value\.clinical_state_summary,m\)/);
 assert.match(followup,/updateMedicationResponse\(value\.clinical_state_summary,medication/);
 assert.match(followup,/mode:'change',id:m\.id/);
 assert.match(followup,/mode:'side_effect',id:m\.id/);
 assert.match(followup,/hasRecordedSideEffect/);
 assert.match(modal,/action:'medication_side_effect'/);
 assert.match(modal,/action:'medication_event'/);
 assert.doesNotMatch(followup,/>Χωρίς αλλαγή<\/button>/);
});


import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readMedicationResponse,updateMedicationResponse} from '../lib/clinical/medication-response-note.ts';

const first={medication_name:'Seroquel',dose:50,unit:'mg',frequency:'1 πρωί'};
const second={medication_name:'Sertraline',dose:100,unit:'mg',frequency:'1 βράδυ'};

test('clinician response is explicit, and replacing it does not erase narrative',()=>{
 const original='Η διάθεση βελτιώθηκε.\nΠροηγούμενη σημείωση με κλινική σημασία.';
 const good=updateMedicationResponse(original,first,'good');
 assert.equal(readMedicationResponse(good,first),'good');
 assert.ok(good.startsWith(original+'\n'));
 const neutral=updateMedicationResponse(good,first,'neutral');
 assert.equal(readMedicationResponse(neutral,first),'neutral');
 assert.equal(neutral.includes('Καλή.'),false);
 assert.equal(neutral.split('Ανταπόκριση στην αγωγή').length,2);
 assert.equal(updateMedicationResponse(neutral,first,'neutral'),neutral);
 assert.equal(updateMedicationResponse(neutral,first,null),original);
});

test('responses are scoped to each medication regimen, including different doses',()=>{
 const other={...first,dose:100};
 let summary=updateMedicationResponse('',first,'good');
 summary=updateMedicationResponse(summary,second,'neutral');
 summary=updateMedicationResponse(summary,other,'good');
 assert.equal(readMedicationResponse(summary,first),'good');
 assert.equal(readMedicationResponse(summary,second),'neutral');
 assert.equal(readMedicationResponse(summary,other),'good');
 assert.equal(readMedicationResponse(updateMedicationResponse(summary,first,null),second),'neutral');
});

test('preserves edited lines rather than silently deleting clinician words',()=>{
 const modified='Ανταπόκριση στην αγωγή · Seroquel (50 mg · 1 πρωί): Καλή με ανάγκη επανελέγχου.';
 const next=updateMedicationResponse(modified,first,'neutral');
 assert.ok(next.includes(modified));
 assert.equal(readMedicationResponse(next,first),'neutral');
});

test('preserves CRLF, original empty texts, and no-op removal',()=>{
 assert.equal(updateMedicationResponse('',first,null),'');
 const notes='Α\r\nΒ';
 assert.equal(updateMedicationResponse(updateMedicationResponse(notes,first,'good'),first,null),notes);
 assert.equal(updateMedicationResponse('Κλινική παρατήρηση.',second,null),'Κλινική παρατήρηση.');
});

test('label construction normalizes whitespace without changing unrelated content',()=>{
 const messy={...first,medication_name:'  Seroquel   ',frequency:'1  πρωί'};
 const changed=updateMedicationResponse('Παρατήρηση',messy,'good');
 assert.match(changed,/Seroquel \(50 mg · 1 πρωί\): Καλή\./);
});

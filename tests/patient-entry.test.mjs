import test from 'node:test';
import assert from 'node:assert/strict';
import {emptyPatientForm,persistPatientForm,recoverPatientForm,clearPatientForm,patientMatches,possiblePatientMatches,patientIdentityHint,hasOlderDraft} from '../lib/patients/patient-entry.ts';
const storage=()=>{const data=new Map();return {getItem:k=>data.get(k)??null,setItem:(k,v)=>data.set(k,v),removeItem:k=>data.delete(k)}};
test('registration recovery retains every field across remounts and isolates owners',()=>{
 const s=storage(),form=Object.fromEntries(Object.keys(emptyPatientForm).map(k=>[k,'synthetic '+k]));
 persistPatientForm(s,'owner-a',form);
 assert.deepEqual(recoverPatientForm(s,'owner-a'),form);assert.equal(recoverPatientForm(s,'owner-b'),null);
 clearPatientForm(s,'owner-b');assert.deepEqual(recoverPatientForm(s,'owner-a'),form);
 clearPatientForm(s,'owner-a');assert.equal(recoverPatientForm(s,'owner-a'),null);
});
test('registration has bounded expiry and never persists without an owner',()=>{
 const s=storage();persistPatientForm(s,'',{...emptyPatientForm,firstName:'Synthetic'});assert.equal(recoverPatientForm(s,''),null);
 persistPatientForm(s,'a',{...emptyPatientForm,firstName:'Synthetic'});s.setItem('noima-new-patient:a:expires','1');assert.equal(recoverPatientForm(s,'a'),null);
});
const patients=[
 {id:'a',first_name:'Μαρία',last_name:'Δείγμα',phone:'+30 690 000 0001',email:'a@example.invalid',reported_age:32,registry_number:1},
 {id:'b',first_name:'Μαρία',last_name:'Δείγμα',phone:'6900000002',email:'b@example.invalid',reported_age:54,registry_number:2},
];
test('same names remain distinct and searchable by accentless name, phone, email and registry',()=>{
 assert.equal(patients.filter(p=>patientMatches(p,'μαρια δειγμα')).length,2);
 assert.deepEqual(patients.filter(p=>patientMatches(p,'6900000002')).map(p=>p.id),['b']);
 assert.equal(patientMatches(patients[0],'A@EXAMPLE.INVALID'),true);
 assert.notEqual(patientIdentityHint(patients[0]),patientIdentityHint(patients[1]));
});
test('possible duplicates are advisory exact names or contact matches, never automatic merge',()=>{
 assert.equal(possiblePatientMatches(patients,{...emptyPatientForm,firstName:'μαρια',lastName:'δειγμα'}).length,2);
 assert.deepEqual(possiblePatientMatches(patients,{...emptyPatientForm,phone:'6900000002'}).map(p=>p.id),['b']);
 assert.equal(possiblePatientMatches(patients,{...emptyPatientForm,firstName:'Άλλος'}).length,0);
});
test('old draft selection respects Athens calendar day rather than UTC midnight',()=>{
 assert.equal(hasOlderDraft([{started_at:'2026-10-19T20:00:00Z'}],'2026-10-20T10:00:00Z'),true);
 assert.equal(hasOlderDraft([{started_at:'2026-10-19T21:30:00Z'}],'2026-10-20T10:00:00Z'),false);
 assert.equal(hasOlderDraft([],'2026-10-20T10:00:00Z'),false);
});

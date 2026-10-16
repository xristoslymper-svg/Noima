import test from 'node:test';
import assert from 'node:assert/strict';
import {checkIntakeIdentity,normalizeIntakeIdentity} from '../lib/intake/demographics.ts';
import {newPatientReviewIds} from '../lib/intake/review-lineage.ts';
import {readFileSync} from 'node:fs';

const patient={first_name:' Μαρία ',last_name:' Παπαδοπούλου ',age:'32',amka:'01019012345',address:'Αθήνα 12',phone:'6900000000',email:' MARIA@EXAMPLE.COM ',contact_phone:'2101234567'};

test('new patient form only normalizes identifiers and contact details',()=>{
 const value=normalizeIntakeIdentity(patient);
 assert.equal(checkIntakeIdentity(value),null);
 assert.equal(value.email,'maria@example.com');
 assert.equal(value.first_name,'Μαρία');
 assert.equal(value.last_name,'Παπαδοπούλου');
 assert.equal(value.amka,'01019012345');
 assert.equal(value.address,'Αθήνα 12');
 assert.equal(value.contact_phone,'2101234567');
 assert.deepEqual(Object.keys(value).sort(),['address','age','amka','contact_phone','email','first_name','last_name','phone'].sort());
 assert.ok(!Object.hasOwn(value,'mse')&&!Object.hasOwn(value,'diagnosis')&&!Object.hasOwn(value,'medications'));
});
test('required names and optional fields are validated without clinical inference',()=>{
 assert.equal(checkIntakeIdentity({...patient,first_name:'  '}),'first_name');
 assert.equal(checkIntakeIdentity({...patient,last_name:'  '}),'last_name');
 assert.equal(checkIntakeIdentity({...patient,amka:'12345'}),'amka');
 assert.equal(checkIntakeIdentity({...patient,email:'not-email'}),'email');
 assert.equal(checkIntakeIdentity({...patient,age:'121'}),'age');
 assert.equal(checkIntakeIdentity({...patient,amka:'',address:'',phone:'',email:'',age:'',contact_phone:''}),null);
});
test('review inbox identifies only submitted clinician-linked first-time records',()=>{
 const values=[
  {id:'new',patient_id:'patient-1',status:'submitted',identity:{first_name:'Δοκιμή',last_name:'Νέος'}},
  {id:'existing',patient_id:'patient-2',status:'submitted',identity:null},
  {id:'draft',patient_id:null,status:'assigned',identity:{first_name:'Άννα',last_name:'Νέα'}},
  {id:'conflict',patient_id:null,status:'conflict',identity:{first_name:'Άννα',last_name:'Νέα'}}
 ];
 assert.deepEqual([...newPatientReviewIds(values)],['new']);
});
test('intake persists demographics without synthetic MSE or initial assessment',()=>{
 const sql=readFileSync('supabase/migrations/20261007223000_clinical_intake_library.sql','utf8');
 assert.match(sql,/insert into public\.demo_patients\([\s\S]*?tester_id,first_name,last_name,reported_age,phone,landline,contact_phone,amka,address,email/);
 assert.match(sql,/perform private\.intake_materialize\(a,p\.id,p_history,p_psych\)/);
 assert.match(sql,/status='submitted'/);
 const form=readFileSync('components/intake/PatientIntakeForm.tsx','utf8');
 assert.match(form,/if\(payload\.needs_identity\)steps\.push\('identity'\)/);
 assert.match(form,/if\(tools\.includes\('PHQ-9'\)\)steps\.push\('PHQ-9'\)/);
 assert.match(form,/onSubmit\(payload\.needs_identity\?normalizeIntakeIdentity\(identity\):null,hasHistory\?history:null,p\)/);
});

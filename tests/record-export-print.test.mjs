import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {patientRecordPrintableHtml} from '../lib/clinical/record-export-print.ts';

function sample(){
 return {
  patient:{id:'patient-sensitive-id',first_name:'Δοκιμή',last_name:'Ασθενής',reported_age:39,amka:'00000000000',chief_complaint:'Άγχος',phone:'6900000000',email:'example@example.test'},
  history:{psychiatric_history:'Ιστορικό σε εξέλιξη',medical_history:'',previous_treatments:'',hospitalizations:'',family_history:'',substance_history:'',social_functioning:'',allergies:''},
  sessions:[
   {id:'visit1',patient_id:'patient-sensitive-id',started_at:'2026-09-08T10:00:00Z',completed_at:'2026-09-08T11:00:00Z',status:'completed',session_type:'initial_assessment'},
   {id:'draft1',patient_id:'patient-sensitive-id',started_at:'2026-10-10T10:00:00Z',status:'draft',session_type:'follow_up'},
  ],
  sections:[
   {session_id:'visit1',section_key:'assessment',content:'Παλιά εκτίμηση',source:'manual',document:{kind:'assessment',fields:[{key:'impression',label:'Clinical assessment',text:'Παλιά εκτίμηση'}]}},
   {session_id:'visit1',section_key:'plan',content:'Παλαιό πλάνο',source:'manual'},
   {session_id:'draft1',section_key:'interview',content:'ΑΝΕΓΚΡΙΤΟ ΠΡΟΧΕΙΡΟ ΠΕΡΙΕΧΟΜΕΝΟ',source:'manual'},
  ],
  risks:[{session_id:'visit1',patient_id:'patient-sensitive-id',suicidal_ideation:'unknown',intent:'not_assessed',plan:'not_assessed',self_harm:'not_assessed',attempt_history:'not_assessed',protective_factors:'',clinical_note:'Δεν διερευνήθηκαν όλες οι διαστάσεις.'}],
  corrections:[
   {id:'correct1',session_id:'visit1',created_at:'2026-09-09T00:00:00Z',patch:{assessment:{before:'old',after:'Νέα κλινική αποτίμηση'},plan:{before:'Παλαιό πλάνο',after:'Ενημερωμένο θεραπευτικό πλάνο'}}}
  ],
  medications:[{id:'m1',medication_name:'TEST-MED',dose:5,unit:'mg',frequency:'το βράδυ',status:'active',effective_from:'2026-09-01'}],
  medicationEvents:[{id:'m-start',medication_id:'m1',event_type:'started',effective_on:'2026-09-01',new_state:{medication_name:'TEST-MED'},reason:'Καταγεγραμμένη έναρξη'}],
  medicationSideEffects:[],
  medicationRevisions:[],
  proposals:[{id:'proposal',transcript:'ΑΠΟΡΡΗΤΗ ΜΗ ΕΓΚΕΚΡΙΜΕΝΗ ΠΡΟΤΑΣΗ AI',approved_text:null,status:'proposal'}],
  addenda:[],
  assessments:[{id:'test',instrument:'PHQ-9',status:'completed',score:5,completed_at:'2026-09-08T13:00:00Z',answers:[0,1,0],item9_review:true,item9_reviewed_at:null}],
  appointments:[{id:'appointment-internal-id',appointment_type:'follow_up',status:'scheduled',scheduled_start:'2026-10-20T09:00:00Z'}]
 };
}
test('printable clinical record uses readable Greek headings and corrections, not JSON or internal identifiers',()=>{
 const html=patientRecordPrintableHtml(sample(),'test-nonce','2026-10-10T08:00:00Z');
 for(const phrase of ['Κλινικός φάκελος','Καταγεγραμμένο ιστορικό','Κλινικές επισκέψεις','TEST-MED','Νέα κλινική αποτίμηση','Ενημερωμένο θεραπευτικό πλάνο','Ψυχομετρικές μετρήσεις','Εκκρεμεί ανασκόπηση στοιχείου 9','Προγραμματισμένο','Εκτύπωση / PDF'])assert.ok(html.includes(phrase),phrase);
 for(const absent of ['ΑΝΕΓΚΡΙΤΟ ΠΡΟΧΕΙΡΟ ΠΕΡΙΕΧΟΜΕΝΟ','ΑΠΟΡΡΗΤΗ ΜΗ ΕΓΚΕΚΡΙΜΕΝΗ ΠΡΟΤΑΣΗ AI','Παλιά εκτίμηση','Παλαιό πλάνο','patient-sensitive-id','appointment-internal-id','ΚΑΝΟΝΙΚΑ ΔΕΔΟΜΕΝΑ','JSON.stringify','"event_type"'])assert.ok(!html.includes(absent),absent);
 assert.ok(html.includes('Πρόχειρες καταγραφές:'));
 assert.match(html,/Cache-Control|ΔΟΚΙΜΑΣΤΙΚΑ ΔΕΔΟΜΕΝΑ/);
});

test('unsafe clinical strings are escaped, no direct HTML is executed, and missing data remains unknown',()=>{
 const b=sample();b.patient.first_name='<script>alert("x")</script>';b.history.psychiatric_history='<img src=x onerror=alert(1)>';
 const html=patientRecordPrintableHtml(b,'nonce-test');
 assert.ok(!html.includes('<script>alert("x")</script>'));
 assert.ok(html.includes('&lt;script&gt;'));
 assert.ok(html.includes('&lt;img src=x onerror=alert(1)&gt;'));
 assert.ok(html.includes('Δεν διερευνήθηκαν όλες οι διαστάσεις.'));
 assert.ok(html.includes('Δεν καταγράφηκε'));
 assert.doesNotMatch(html,/Δεν αναφέρθηκε αυτοκτονικός ιδεασμός/);
});

test('record menu presents print/PDF directly and keeps full technical export separately',()=>{
 const ui=readFileSync('components/patients/PatientWorkspace.tsx','utf8');
 const css=readFileSync('components/patients/PatientRecord.module.css','utf8');
 const route=readFileSync('app/api/patients/demo/export/route.ts','utf8');
 assert.match(ui,/Εκτύπωση \/ PDF/);
 assert.match(ui,/Αντίγραφο δεδομένων \(TXT\)/);
 assert.match(ui,/format=print/);
 assert.match(css,/\.more>summary::-webkit-details-marker\{display:none\}/);
 assert.match(css,/\.more>summary::marker\{content:''\}/);
 assert.match(route,/withPilot\(handleGET\)/);
 assert.match(route,/CLINICAL_DATA_MODE==='real'/);
 assert.match(route,/Content-Security-Policy/);
 assert.match(route,/private, no-store/);
 assert.match(route,/patientRecordText\(bundle\)/);
});

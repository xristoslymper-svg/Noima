import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {demoPatientContext,findDemoPatients,newDemoVisit,demoPatients,demoInvitation,readDemoInvitation} from '../lib/teleconsultations/entry.ts';
import {isPublicAccountPage} from '../lib/pilot/browser-session.ts';
const now=Date.parse('2026-10-18T18:00:00Z'),nonce='11111111-1111-4111-8111-111111111111';
test('patient selection needs two letters and tolerates Greek accents',()=>{
 assert.deepEqual(findDemoPatients('Ν'),[]);assert.equal(findDemoPatients('νι')[0].name,'Νίκος Παράδειγμα');
 assert.equal(findDemoPatients('ΣΟ')[0].id,demoPatients[0].id);assert.deepEqual(findDemoPatients('zz'),[]);
});
test('new unscheduled visit starts empty and creates one appointment/session identity',()=>{
 const visit=newDemoVisit(demoPatients[1].id,now,nonce);
 assert.equal(visit.patientId,demoPatients[1].id);assert.equal(visit.sessionId,visit.appointment.session_id);
 assert.equal(visit.patientId,visit.appointment.patient_id);assert.equal(visit.notes.transcript,'');assert.equal(visit.version,0);
 assert.throws(()=>newDemoVisit('real-patient',now,nonce));assert.throws(()=>newDemoVisit(demoPatients[0].id,NaN,nonce));
});
test('demo invitation retains visit scope, expires, and never contains clinical notes or patient name',()=>{
 const record=newDemoVisit(demoPatients[1].id,now,nonce);record.notes.transcript='PRIVATE CLINICAL NOTE';
 const invitation=demoInvitation(record,now,nonce),parsed=readDemoInvitation(invitation.token,now+1000);
 assert.equal(parsed.sessionId,record.sessionId);assert.equal(parsed.patientId,record.patientId);
 assert.equal(invitation.token.includes('PRIVATE'),false);assert.equal(invitation.token.includes('Νίκος'),false);
 assert.equal(readDemoInvitation(invitation.token,now+3600000),null);
 assert.equal(readDemoInvitation('invalid',now),null);assert.equal(readDemoInvitation(invitation.token.replace('demo~1~1','demo~1~9'),now),null);
 assert.throws(()=>demoInvitation({...record,appointment:{...record.appointment,session_id:'other'}},now,nonce));
});
test('only the exact synthetic guest page is public and its server renderer is preview-gated',()=>{
 assert.equal(isPublicAccountPage('/assessment/teleconsultation-preview'),true);
 for(const path of ['/teleconsultations','/patients','/account','/assessment/teleconsultation-preview/other'])assert.equal(isPublicAccountPage(path),false);
 const page=readFileSync('app/assessment/teleconsultation-preview/page.tsx','utf8');
 assert.match(page,/if\(!previewEnabled\(process.env\)\)notFound\(\)/);
 assert.doesNotMatch(page,/demoPost|supabase|fetch\(/);
 const guest=readFileSync('components/teleconsultations/TeleGuestPreview.tsx','utf8');
 assert.doesNotMatch(guest,/getUserMedia|fetch\(|PatientBundle|demo-runtime/);
});

test('switching synthetic patient never inherits another chart or demographic details',()=>{
 const source=JSON.parse(readFileSync('lib/clinical/treatment-preview.json','utf8'));
 const second=demoPatientContext(source,demoPatients[1]);
 assert.equal(second.patient.id,demoPatients[1].id);assert.equal(second.patient.reported_age,null);assert.equal(second.history,null);
 for(const key of ['sessions','sections','risks','medications','medicationEvents','medicationSideEffects','medicationRevisions','proposals','addenda','corrections','assessments','appointments'])assert.deepEqual(second[key],[]);
 assert.equal(source.patient.id,demoPatients[0].id);
});

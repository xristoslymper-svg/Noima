import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {confirmedPriorCourse,priorCourseInput} from '../lib/clinical/prior-course-record.ts';
const read=file=>readFile(file,'utf8');
const hash=value=>createHash('sha256').update(value).digest('hex');
const manifest=JSON.parse(await read('tests/selective-production-contract.json'));
for(const [file,expected] of Object.entries(manifest.hashes))test('production unchanged: '+file,async()=>assert.equal(hash(await read(file)),expected));
test('patient workspace differs only by the Visits prior-course integration',async()=>{
 const source=await read('components/patients/PatientWorkspace.tsx');
 assert.equal(hash(source.replace('viewer={null} beforeNavigate={sectionBeforeNavigate} priorCourseEnabled={!previewBundle}/>','viewer={null}/>')),manifest.workspaceHash);
 for(const label of ['Σύνοψη','Επισκέψεις','Θεραπευτικό πλάνο','Στοιχεία & ιστορικό'])assert.ok(source.includes('label="'+label+'"'));
 assert.ok(!source.includes('Προσθήκη παλαιών δεδομένων'));
});
test('previous course lives only inside Visits, never creates a clinical encounter',async()=>{
 const timeline=await read('components/patients/PatientTimeline.tsx'),section=await read('components/patients/PriorCourseSection.tsx'),api=await read('app/api/patients/demo/prior-course/route.ts');
 assert.ok(timeline.indexOf('priorCourseEnabled&&')>timeline.indexOf('<h2>Επισκέψεις</h2>'));
 assert.match(section,/beforeNavigate.current=guard/);
 assert.match(section,/writeRecovery\(sessionStorage/);
 assert.match(section,/recorder.current\?\.cancel/);
 assert.doesNotMatch(api,/demo_session_start|demo_calendar_start_session|medication_register|queueSummary/);
 assert.doesNotMatch(await read('components/patients/PatientPanels.tsx'),/PriorCourseSection/);
});
const tester='10000000-0000-4000-8000-000000000001',patient='20000000-0000-4000-8000-000000000001',request='30000000-0000-4000-8000-000000000001';
const base={tester,patient_id:patient,request_id:request,expected_version:0,period_label:' περίπου 2 έτη ',content:' Συνοπτική προηγούμενη κλινική πορεία. '};
test('prior course validates timestamps, identity and exact saved content',()=>{
 const input=priorCourseInput(base);assert.equal(input.content,base.content.trim());
 const row={id:request,tester_id:tester,patient_id:patient,version:1,period_label:input.period_label,content:input.content,created_at:'2026-10-17T12:00:00Z'};
 assert.deepEqual(confirmedPriorCourse(row,patient,tester,input),row);
 for(const patch of [{patient_id:request},{tester_id:request},{version:2},{content:'unrelated content'},{created_at:'not-a-date'}])assert.throws(()=>confirmedPriorCourse({...row,...patch},patient,tester,input));
 for(const patch of [{expected_version:-1},{expected_version:1.1},{content:'short'},{content:'x'.repeat(12001)},{patient_id:'bad'},{period_label:'x'.repeat(121)}])assert.throws(()=>priorCourseInput({...base,...patch}));
});
test('library uses a scoped compact launcher and retains assignment identity on email retry',async()=>{
 const library=await read('app/psychometrics/page.tsx'),launcher=await read('components/intake/LibraryIntakeLauncher.tsx');
 assert.match(library,/components\/intake\/LibraryIntakeLauncher/);
 assert.match(launcher,/if\(!receipt.current\)/);
 assert.match(launcher,/intake_id:assignment.id,token:assignment.token/);
 assert.match(launcher,/Ο φάκελος δημιουργείται μετά την υποβολή/);
 assert.match(launcher,/Το email είναι έτοιμο/);
 assert.doesNotMatch(launcher,/create_patient|start_session|medication_start/);
 assert.doesNotMatch(library,/next-intl|@\/i18n\//);
});
test('new intake includes contact details and a blank print never assigns a patient',async()=>{
 const form=await read('components/intake/PatientIntakeForm.tsx'),blank=await read('app/intake/blank/BlankPrint.tsx');
 for(const field of ['identity.first_name','identity.last_name','identity.amka','identity.phone','identity.email','identity.age','identity.address','identity.contact_phone'])assert.ok(form.includes(field),field);
 assert.match(form,/checkIntakeIdentity/);assert.match(form,/normalizeIntakeIdentity/);
 assert.match(blank,/needs_identity:true/);assert.doesNotMatch(blank,/fetch\(|create_patient|start_session/);
});

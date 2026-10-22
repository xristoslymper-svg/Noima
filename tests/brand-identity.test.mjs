import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=path=>readFileSync(path,'utf8');
test('psi-space branding covers Greek and English copy without changing semantic translation keys',()=>{
 for(const locale of ['el','en']){
  const messages=JSON.parse(read('i18n/messages/'+locale+'.json'));
  assert.equal(/\\b(?:NOIMA|Noima)\\b/.test(JSON.stringify(Object.values(messages))),false);
  assert.match(messages.polish.m008,/psi-space/);
  assert.match(messages.documents.printFooter,/psi-space/);
 }
});
test('psi-space appears in authentication, public pages, patient forms and export branding',()=>{
 for(const path of ['app/layout.tsx','components/AuthShell.tsx','components/PilotAccess.tsx','components/presence/PracticePage.tsx','components/intake/PatientIntakeForm.tsx','app/assessment/AssessmentForm.tsx','app/api/intake/email/route.ts','lib/clinical/record-export-print.ts','lib/clinical/record-export.ts']){
  const source=read(path);
  assert.match(source,/psi-space/,path);
  assert.doesNotMatch(source,/\\b(?:NOIMA|Noima)\\b/,path);
 }
 assert.match(read('components/AuthShell.tsx'),/>Ψ</);
 assert.match(read('components/patients/PatientWorkspace.tsx'),/psi-space-patient-/);
 assert.match(read('lib/calendar/google-sync.ts'),/summary:'Ραντεβού psi-space'/);
});
test('rebranding retains existing session, preference, draft and calendar identity contracts',()=>{
 assert.match(read('i18n/config.ts'),/'noima-locale'/);
 assert.match(read('lib/demo-tester.ts'),/noima-workspace-id=/);
 assert.match(read('lib/patients/registry-layout.ts'),/noima:registry-columns:v1:/);
 assert.match(read('lib/clinical/visit-layout.ts'),/noima:visit-layout:v1:/);
 assert.match(read('lib/calendar/google-sync.ts'),/noimaWorkspace/);
 assert.match(read('lib/mail/providers.ts'),/process.env.NOIMA_APP_ORIGIN/);
});

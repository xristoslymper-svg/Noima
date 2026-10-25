import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=path=>readFileSync(path,'utf8');
test('psi-space branding covers Greek and English copy without changing semantic translation keys',()=>{
 for(const locale of ['el','en']){
  const messages=JSON.parse(read('i18n/messages/'+locale+'.json'));
  assert.equal(/\b(?:NOIMA|Noima)\b/.test(JSON.stringify(Object.values(messages))),false);
  assert.match(messages.polish.m008,/Ψ-space/);
  assert.match(messages.documents.printFooter,/Ψ-space/);
 }
});
test('psi-space appears in authentication, public pages, patient forms and export branding',()=>{
 for(const path of ['app/layout.tsx','components/AuthShell.tsx','components/PilotAccess.tsx','components/presence/PracticePage.tsx','components/intake/PatientIntakeForm.tsx','app/assessment/AssessmentForm.tsx','app/api/intake/email/route.ts','lib/clinical/record-export-print.ts','lib/clinical/record-export.ts']){
  const source=read(path);
  assert.match(source,/Ψ-space/,path);
  assert.doesNotMatch(source,/\b(?:NOIMA|Noima)\b/,path);
 }
 assert.match(read('components/AuthShell.tsx'),/>Ψ</);
 assert.match(read('components/patients/PatientWorkspace.tsx'),/psi-space-patient-/);
 assert.match(read('lib/calendar/google-sync.ts'),/summary:'Ραντεβού Ψ-space'/);
});
test('rebranding retains existing session, preference, draft and calendar identity contracts',()=>{
 assert.match(read('i18n/config.ts'),/'noima-locale'/);
 assert.match(read('lib/demo-tester.ts'),/noima-workspace-id=/);
 assert.match(read('lib/patients/registry-layout.ts'),/noima:registry-columns:v1:/);
 assert.match(read('lib/clinical/visit-layout.ts'),/noima:visit-layout:v1:/);
 assert.match(read('lib/calendar/google-sync.ts'),/noimaWorkspace/);
 assert.match(read('lib/mail/providers.ts'),/process.env.NOIMA_APP_ORIGIN/);
});

test('legacy API labels still resolve to the renamed message instead of leaking old branding',async()=>{
 const {errorMessageKeys}=await import('../i18n/error-catalog.ts');
 const old='Δεν υπάρχει συνδεδεμένο tablet. Ανοίξτε πρώτα το Noima Tablet στη συσκευή.';
 const current=old.replace('Noima','Ψ-space');
 assert.equal(errorMessageKeys[old],errorMessageKeys[current]);
 assert.equal(errorMessageKeys[current],'errors.tabletNotConnected');
});

test('runtime source changes are limited to product-name substitutions',()=>{
 const expected={
  "app/layout.tsx": "52265358",
  "components/AuthShell.tsx": "f3e936dd",
  "components/PilotAccess.tsx": "7da12fc0",
  "components/calendar/GoogleCalendarPreview.tsx": "efab9750",
  "components/intake/PatientIntakeForm.tsx": "3dd1cd32",
  "components/patients/PatientJourney.tsx": "33c320fd",
  "components/patients/PatientWorkspace.tsx": "8571e0c7",
  "components/presence/PracticePage.tsx": "21a41d13",
  "components/presence/GoogleMaps.tsx": "4855cc4b",
  "app/api/intake/email/route.ts": "aec3cb5e",
  "app/api/mailbox/route.ts": "a8cd8c6",
  "app/api/patients/demo/export/route.ts": "e1e5164f",
  "app/api/intake/scan/route.ts": "b92ae958",
  "app/api/clinical/summary/route.ts": "1619b6bb",
  "app/assessment/AssessmentForm.tsx": "b827a8f6",
  "app/assessment/teleconsultation-preview/page.tsx": "9796b78e",
  "app/digital-presence/page.tsx": "57bb2f4f",
  "app/iatreio/[slug]/page.tsx": "cd5e2672",
  "app/page.tsx": "c4dfde00",
  "lib/calendar/google-sync.ts": "1addf755",
  "lib/calendar/google-preview-state.ts": "48058ac0",
  "lib/clinical/clinical-card.ts": "5f308860",
  "lib/clinical/record-export-print.ts": "c8a897bc",
  "lib/clinical/record-export.ts": "339f2578",
  "lib/copilot/clinical.ts": "70c37eea"
};
 const normalize=s=>s.replaceAll('Ψ-space','psi-space').replace("{t('settings.emailAlternative')}</small>","{t('settings.emailAlternative')} psi-space</small>").replace(/\b(?:NOIMA|Noima|psi-space)\b|noima(?=\.example|-patient-)/g,'BRAND');
 const fingerprint=s=>{let h=2166136261;for(const char of normalize(s)){h^=char.codePointAt(0);h=Math.imul(h,16777619)}return (h>>>0).toString(16)};
 for(const [path,hash] of Object.entries(expected))assert.equal(fingerprint(read(path)),hash,path);
});

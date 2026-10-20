import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
test('visit modal uses native focus containment and guarded close rather than backdrop dismissal',()=>{
 const s=readFileSync('components/patients/VisitDialog.tsx','utf8');
 assert.match(s,/showModal\(\)/);assert.match(s,/onCancel=\{event=>\{event.preventDefault\(\);void close.current\(\)/);
 assert.match(s,/document.body.style.overflow='hidden'/);assert.match(s,/document.body.style.overflow=previous/);
 assert.doesNotMatch(s,/onClick=|onPointerDown=/);
});
test('verified registration returns to the timeline only after server confirmation',()=>{
 const s=readFileSync('components/patients/PatientWorkspace.tsx','utf8');
 const start=s.indexOf('async function handleFinalized'),end=s.indexOf('if(loading)',start),body=s.slice(start,end);
 assert.ok(body.indexOf('confirmedCompletion(fresh.sessions')<body.indexOf("applyTab('timeline',null"));
 assert.match(body,/Η επίσκεψη καταχωρίστηκε/);
});
test('patient-facing source surfaces have no draft terminology',()=>{
 for(const path of ['components/patients/PatientTimeline.tsx','components/patients/PatientSession.tsx','components/patients/FollowupClosure.tsx','components/patients/PatientJourney.tsx','components/patients/PatientTreatment.tsx','lib/clinical/patient-record.ts','app/patients/page.tsx']){
  assert.doesNotMatch(readFileSync(path,'utf8'),/[Ππ]ρόχειρ|[Ππ]ροχείρ/,path);
 }
});

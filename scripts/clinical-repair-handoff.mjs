// One-use, assertion-guarded source patch for PR100. Removed after the handoff.
import {readFileSync,writeFileSync} from 'node:fs';
import assert from 'node:assert/strict';
function edit(path,apply){const before=readFileSync(path,'utf8');const after=apply(before.replace(/\r\n/g,'\n'));assert.notEqual(after,before,path+' must change');writeFileSync(path,after);console.log('Updated '+path)}
function once(text,old,replacement){assert.equal(text.split(old).length-1,1,'Expected one source match: '+old.slice(0,100));return text.replace(old,replacement)}
function between(text,start,end,replacement){const from=text.indexOf(start),to=text.indexOf(end,from+start.length);assert.ok(from>=0&&to>from,'Missing source boundary: '+start);return text.slice(0,from)+replacement+text.slice(to)}
edit('lib/clinical/visit-workspace-state.ts',s=>{
 s="import {reconcileRecord} from './record-reconciliation.ts';\n"+s;
 return between(s,'export function mergeVisitContext(',"const tabs=",`export function mergeVisitContext(visit:PatientBundle,context:PatientBundle|null):PatientBundle{
 return reconcileRecord(context,visit,'visit');
}
`);
});
edit('components/patients/PatientWorkspace.tsx',s=>{
 s=once(s,"import { demoPost } from '@/lib/patients/demo-client';","import { demoPost } from '@/lib/patients/demo-client';\nimport {assertRecordIdentity,reconcileRecord} from '@/lib/clinical/record-reconciliation';\nimport {confirmedCompletion} from '@/lib/clinical/finalization';");
 s=once(s,'[bundle,setBundle]=useState<PatientBundle|null>(null)','[bundle,setBundleState]=useState<PatientBundle|null>(null)');
 s=once(s,' const [measurementsOpen,setMeasurementsOpen]',` const bundleRef=useRef<PatientBundle|null>(null);
 function setBundle(value:PatientBundle|null|((current:PatientBundle|null)=>PatientBundle|null)){const next=typeof value==='function'?value(bundleRef.current):value;bundleRef.current=next;setBundleState(next)}
 const [measurementsOpen,setMeasurementsOpen]`);
 s=between(s,' async function loadShell()', ' function applyLocation(',` async function loadShell(){
  const requestedPatient=patientRef,sequence=++shellLoadSequence.current;
  try{
   const response=await fetch('/api/patients/demo/visit?tester='+getDemoTesterId()+'&patient='+encodeURIComponent(requestedPatient),{cache:'no-store'});
   const data=await response.json();if(activePatientRef.current!==requestedPatient||sequence!==shellLoadSequence.current)return null;
   if(!response.ok)throw new Error(data.error||'Δεν φορτώθηκε ο φάκελος.');
   assertRecordIdentity(data.bundle,requestedPatient);const fresh=reconcileRecord(bundleRef.current,data.bundle,'shell');setBundle(fresh);setLoading(false);return fresh;
  }catch(cause){if(activePatientRef.current===requestedPatient&&sequence===shellLoadSequence.current)setError(cause instanceof Error?cause.message:'Δεν φορτώθηκε ο φάκελος.');return null}
 }
 async function load(){
  const requestedPatient=patientRef,sequence=++fullLoadSequence.current;
  try{
   const response=await fetch('/api/patients/demo/runtime?tester='+getDemoTesterId()+'&patient='+encodeURIComponent(requestedPatient),{cache:'no-store'});
   const data=await response.json();if(activePatientRef.current!==requestedPatient||sequence!==fullLoadSequence.current)return null;
   if(!response.ok)throw new Error(data.error||'Δεν φορτώθηκε ο φάκελος.');
   assertRecordIdentity(data.bundle,requestedPatient);const fresh=reconcileRecord(bundleRef.current,data.bundle);setBundle(fresh);setContextReady(true);setError('');return fresh;
  }catch(cause){if(activePatientRef.current===requestedPatient&&sequence===fullLoadSequence.current)setError(cause instanceof Error?cause.message:'Δεν φορτώθηκε η καρτέλα.');return null}
  finally{if(activePatientRef.current===requestedPatient&&sequence===fullLoadSequence.current)setLoading(false)}
 }
`);
 s=once(s,'const refreshed=bundle?{...bundle,patient:shell.patient,sessions:shell.sessions,appointments:shell.appointments}:shell;setBundle(refreshed);','');
 const match=s.match(/onFinalized=\{async session=>\{[\s\S]*?\}\} onSelect=/g);assert.equal(match?.length,1,'one finalization callback');
 s=s.replace(match[0],'onFinalized={handleFinalized} onSelect=');
 s=once(s,' if(loading)return',` async function handleFinalized(session:PatientBundle['sessions'][number]){
  const current=bundleRef.current;
  if(!current||current.patient.id!==activePatientRef.current)throw new Error('Ο φάκελος άλλαξε κατά την οριστικοποίηση.');
  confirmedCompletion(session,session.id,current.patient.id);
  shellLoadSequence.current++;fullLoadSequence.current++;navigationSequence.current++;setRecordNotice('');
  setBundle(reconcileRecord(current,{...current,sessions:current.sessions.map(row=>row.id===session.id?session:row)}));
  const fresh=await load();if(!fresh)throw new Error('Η καταγραφή οριστικοποιήθηκε, αλλά ο φάκελος δεν ανανεώθηκε.');
  confirmedCompletion(fresh.sessions.find(row=>row.id===session.id),session.id,current.patient.id);
  applyTab('record',session.id,{clearAppointment:true});setRecordNotice('Η καταγραφή οριστικοποιήθηκε.');
 }
 if(loading)return`);
 return s;
});
edit('components/patients/VisitWorkspace.tsx',s=>{
 s=once(s,"import {finalizeAndVerify}","import {confirmedCompletion,finalizeAndVerify}");
 s=once(s,' async function defer(',` async function checkCompletion(){
  if(finalizeFlight.current)return;
  setFinalizing(true);setFinalizeError('');
  try{const fresh=await load();const completed=confirmedCompletion(fresh.sessions.find(row=>row.id===sessionId),sessionId,patientId);await onFinalized(completed)}
  catch(cause){setFinalizeError(cause instanceof Error?cause.message:'Δεν επιβεβαιώθηκε η ολοκλήρωση.')}
  finally{if(mounted.current)setFinalizing(false)}
 }
 async function defer(`);
 return once(s,'onClick={()=>void finalize(sessionId).catch(()=>{})}>Έλεγχος ολοκλήρωσης','onClick={()=>void checkCompletion()}>Έλεγχος ολοκλήρωσης');
});
edit('components/patients/PatientPanels.tsx',s=>once(s,'if(patientDirty.current)await savePatient()','if(patientDirty.current||patientFlight.current)throw new Error(\'Αποθηκεύστε ή ακυρώστε την αλλαγή στα στοιχεία ασθενή πριν συνεχίσετε.\')'));
edit('tests/finalization.test.mjs',s=>once(s,'const base={sessions:[completed]','const base={patient:{id:\'patient\',tester_id:\'tenant\'},sessions:[completed]'));
edit('browser-tests/warm-patient-workspace-fixture.tsx',s=>{
 s=once(s,"import React from 'react';","import React from 'react';\nimport fixture from './fixtures/warm-patient.json';");
 return once(s,'patientRef="warm-patient"','patientRef={fixture.patient.id}');
});
edit('browser-tests/clinical-cleanup.mjs',s=>{
 s=once(s,"await legacy.getByRole('textbox').waitFor();assert.equal(await legacy.getByRole('textbox').inputValue(),'Προϋπάρχουσα κλινική σημείωση — να διατηρηθεί αυτούσια.');","await legacy.getByText('Προϋπάρχουσα κλινική σημείωση — να διατηρηθεί αυτούσια.',{exact:true}).waitFor();assert.equal(await legacy.getByRole('textbox').count(),0,'legacy first-assessment text is preserved, not a second editable clinical source');");
 s=once(s,"const keys=['risk',...(history?['history']:[]),'assessment','medication','plan','appointment'];","const firstAssessment=await p.locator('.first-assessment').count()>0;\n  const keys=['risk',...(history?['history']:[]),...(firstAssessment?['diagnosis']:['assessment']),'medication','plan','appointment'];\n  if(firstAssessment){const impression=p.locator('[data-visit-part=\"assessment\"]');assert.equal(await impression.getByRole('textbox').count(),1,'one clinical impression editor');assert.equal(await impression.locator('[data-writing-editor]').count(),1,'one impression surface');assert.equal(await impression.getByRole('button',{name:/Βελτίωση διατύπωσης/}).count(),1)}");
 return s;
});
console.log('Handoff completed. Existing privacy/auth safeguards and clinical RPCs were not rewritten.');

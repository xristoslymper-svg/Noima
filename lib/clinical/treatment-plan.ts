import type {PatientBundle} from '../patients/demo-runtime';
import {completedVisitNotes} from './completed-visit-notes.ts';
import {completedMeasurements,patientRecord} from './patient-record.ts';

/** A write belongs only to the draft explicitly selected by the clinician. */
export function medicationSessionId(bundle:Pick<PatientBundle,'patient'|'sessions'>,selected?:string|null){
 if(!selected)return null;
 const session=bundle.sessions.find(s=>s.id===selected&&s.patient_id===bundle.patient.id&&s.status==='draft');
 if(!session)throw new Error('Η επιλεγμένη πρόχειρη επίσκεψη δεν είναι πλέον διαθέσιμη. Ανανεώστε τον φάκελο και επιλέξτε ξανά.');
 return session.id;
}
export function treatmentPlan(bundle:PatientBundle,now=new Date()){
 const record=patientRecord(bundle,now);
 const notes=completedVisitNotes(bundle,record.latestVisit);
 const measured=completedMeasurements(bundle,now).filter(a=>a.patient_id===bundle.patient.id);
 const scores=(['PHQ-9','GAD-7'] as const).flatMap(code=>{
  const current=measured.find(a=>a.instrument===code);if(!current)return [];
  const previous=measured.find(a=>a.instrument===code&&a.instrument_version===current.instrument_version&&Date.parse(a.completed_at!)<Date.parse(current.completed_at!))||null;
  return [{current,previous}];
 });
 return {record,notes,scores,drafts:bundle.sessions.filter(s=>s.patient_id===bundle.patient.id&&s.status==='draft').sort((a,b)=>Date.parse(b.started_at)-Date.parse(a.started_at))};
}

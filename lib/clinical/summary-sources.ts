import {emptyHistory} from '../intake/history.ts';
import type {PatientBundle} from '../patients/demo-runtime';
import {receivedPatientHistories,normalizedPatientHistory,patientReportedHighlights,type ReceivedHistory} from '../intake/patient-report.ts';
import {confirmedPriorCourse,type PriorCourseRecord} from './prior-course-record.ts';
export type SummarySupplement={priorCourse:PriorCourseRecord|null;reports:{id:string;submitted_at:string|null;content:string;answers:unknown;attribution:'patient_self_report'}[]};
export type SummaryBundle=PatientBundle&{summarySupplement?:SummarySupplement};
type Reader=(name:string,args:Record<string,unknown>)=>Promise<unknown>;
/** Read-only enrichment. No tokens/identity fields, clinical promotion or writes. */
export async function withSummarySources(bundle:PatientBundle,tester:string,read:Reader):Promise<SummaryBundle>{
 const patient=bundle.patient.id;
 const [prior,raw]=await Promise.all([read('demo_prior_course_get',{p_tester:tester,p_patient:patient}),read('demo_intake_list',{p_tester:tester,p_patient:patient})]);
 const row=Array.isArray(prior)?prior[0]:prior;
 if(!Array.isArray(raw))throw new Error('summary_sources_unavailable');
 const records=raw as (ReceivedHistory&{patient_id?:string;tester_id?:string})[];
 if(records.some(r=>r.patient_id&&r.patient_id!==patient||r.tester_id&&r.tester_id!==tester))throw new Error('summary_source_identity_mismatch');
 const reports=receivedPatientHistories(records).map(r=>({id:r.id,submitted_at:r.submitted_at,attribution:'patient_self_report' as const,
 content:patientReportedHighlights(normalizedPatientHistory(r.history_answers)).concat(r.history_answers?.other_note?[r.history_answers.other_note]:[]).join('. '),answers:Object.fromEntries(Object.keys(emptyHistory).filter(key=>r.history_answers&&Object.hasOwn(r.history_answers,key)).map(key=>[key,(r.history_answers as Record<string,unknown>)[key]]))}));
 return {...bundle,summarySupplement:{priorCourse:row?confirmedPriorCourse(row,patient,tester):null,reports}};
}

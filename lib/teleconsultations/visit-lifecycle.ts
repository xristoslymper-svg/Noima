import type {PatientBundle,DemoSection,DemoRisk} from '../patients/demo-runtime';
import {followupCompletionIssues} from '../clinical/visit-workspace-state.ts';
import {appointmentContext} from './policy.ts';
import type {FixtureRecord} from './preview';
export function visitRevision(record:FixtureRecord,mse?:DemoSection,risk?:DemoRisk){
 return JSON.stringify([record.patientId,record.sessionId,record.version,mse?.version??null,risk?.version??null]);
}
export function reviewFixtureVisit(record:FixtureRecord,mse?:DemoSection,risk?:DemoRisk){
 appointmentContext(record.appointment,record.patientId,record.sessionId);
 if([mse,risk].some(row=>row&&(row.patient_id!==record.patientId||row.session_id!==record.sessionId)))throw new Error('Η αξιολόγηση ανήκει σε διαφορετική επίσκεψη.');
 return followupCompletionIssues(record.notes,mse?[mse]:[],risk).map(issue=>issue.message);
}
/** In-memory adapter only. It produces the existing patient/session model without database or provider calls. */
export function completeFixtureVisit(bundle:PatientBundle,record:FixtureRecord,mse:DemoSection|undefined,risk:DemoRisk|undefined,options:{inCall:boolean;confirmed:boolean;reviewedRevision:string;now:string}):PatientBundle{
 if(options.inCall)throw new Error('Τερματίστε πρώτα την κλήση. Η καταγραφή παραμένει επεξεργάσιμη.');
 if(!options.confirmed)throw new Error('Ελέγξτε την επίσκεψη πριν την καταχώριση.');
 if(!Number.isFinite(Date.parse(options.now)))throw new Error('Μη έγκυρος χρόνος καταχώρισης.');
 if(bundle.patient.id!==record.patientId)throw new Error('Διαφορετικός φάκελος ασθενή.');
 const session=bundle.sessions.find(row=>row.id===record.sessionId&&row.patient_id===record.patientId);
 if(!session)throw new Error('Δεν βρέθηκε η συνδεδεμένη επίσκεψη.');
 if(session.status==='completed')return bundle;
 if(options.reviewedRevision!==visitRevision(record,mse,risk))throw new Error('Η καταγραφή άλλαξε. Κάντε ξανά έλεγχο.');
 const issues=reviewFixtureVisit(record,mse,risk);if(issues.length)throw new Error(issues.join('\n'));
 const continuity={...structuredClone(record.notes),session_id:record.sessionId,approved_at:options.now,approved_by:session.tester_id};
 const completed={...session,status:'completed' as const,completed_at:options.now,updated_at:options.now,version:session.version+1,closure_draft:structuredClone(record.notes),closure_version:record.version,continuity};
 return {...bundle,sessions:bundle.sessions.map(row=>row.id===session.id?completed:row),sections:[...bundle.sections.filter(row=>row.session_id!==record.sessionId||row.section_key!=='mse'),structuredClone(mse!)],risks:[...bundle.risks.filter(row=>row.session_id!==record.sessionId),structuredClone(risk!)],appointments:bundle.appointments.map(row=>row.id===record.appointment.id?{...row,status:'completed'}:row)};
}

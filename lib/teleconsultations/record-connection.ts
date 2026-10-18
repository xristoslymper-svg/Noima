import type {PatientBundle,DemoSection,DemoRisk,DemoSession} from '../patients/demo-runtime';
import type {ContinuityDraft} from '../clinical/continuity';
import {initialFollowupDraft,followupFieldConflicts} from '../clinical/followup-fields.ts';
import {assertRecordIdentity} from '../clinical/record-reconciliation.ts';
import {followupCompletionIssues,mseTimeline} from '../clinical/visit-workspace-state.ts';
import type {FixtureRecord} from './preview';
export function recordForVisit(bundle:PatientBundle,patientId:string,sessionId:string):FixtureRecord{
 assertRecordIdentity(bundle,patientId,sessionId);
 const session=bundle.sessions.find(s=>s.id===sessionId)!;
 if(session.session_type!=='follow_up')throw new Error('Ανοίξτε την αρχική αξιολόγηση από τον φάκελο ασθενή.');
 const appointment=bundle.appointments.find(a=>a.session_id===sessionId&&a.status!=='cancelled');
 return {patientId,sessionId,version:session.closure_version||0,notes:session.status==='completed'&&session.continuity?session.continuity:initialFollowupDraft(session,bundle.sections),assignments:[],appointment:{id:appointment?.id||'visit:'+sessionId,patient_id:patientId,session_id:sessionId,status:session.status==='completed'?'completed':'scheduled',scheduled_start:appointment?.scheduled_start||session.started_at,scheduled_end:appointment?.scheduled_end||new Date(Date.parse(session.started_at)+50*60000).toISOString()}};
}
export type RecordConnection={bundle:PatientBundle;read:()=>Promise<PatientBundle>;saveClosure:(value:ContinuityDraft,version:number|null)=>Promise<{value:ContinuityDraft;version:number}>;saveMse:(value:NonNullable<DemoSection['document']>,version:number|null)=>Promise<DemoSection>;saveRisk:(value:Omit<DemoRisk,'patient_id'|'session_id'|'version'|'updated_at'>,version:number|null)=>Promise<DemoRisk>;write:(body:Record<string,unknown>)=>Promise<{session?:unknown}>};
type Post=(body:Record<string,unknown>)=>Promise<Record<string,unknown>>;
export function recordConnection(bundle:PatientBundle,patientId:string,sessionId:string,read:()=>Promise<PatientBundle>,post:Post):RecordConnection{
 recordForVisit(bundle,patientId,sessionId);
 function scoped<T extends {patient_id:string;session_id?:string;id?:string;version:number}>(row:T,session=false):T{
  if(!row||row.patient_id!==patientId||(session?row.id:row.session_id)!==sessionId||!Number.isSafeInteger(row.version))throw new Error('Δεν επιβεβαιώθηκε η αποθήκευση στην επιλεγμένη επίσκεψη.');
  return row;
 }
 return {bundle,read:async()=>{const fresh=await read();recordForVisit(fresh,patientId,sessionId);return fresh},
  saveClosure:async(value,version)=>{
   const result=await post({action:'save_closure',session_id:sessionId,value,expected_version:version});
   const saved=scoped(result.session as DemoSession,true);
   if(!saved.closure_draft||!Number.isSafeInteger(saved.closure_version)||(saved.closure_version as number)<=(version??0))throw new Error('Δεν επιβεβαιώθηκε η έκδοση του προχείρου.');
   return {value:saved.closure_draft,version:saved.closure_version!};
  },
  saveMse:async(document,version)=>{const result=await post({action:'save_document',session_id:sessionId,section_key:'mse',document,expected_version:version});const saved=scoped(result.section as DemoSection);if(saved.section_key!=='mse'||saved.version<=(version??0))throw new Error('Δεν επιβεβαιώθηκε η ψυχική κατάσταση.');return saved},
  saveRisk:async(risk,version)=>{const result=await post({action:'save_risk',session_id:sessionId,risk,expected_version:version});const saved=scoped(result.risk as DemoRisk);if(saved.version<=(version??0))throw new Error('Δεν επιβεβαιώθηκε η εκτίμηση κινδύνου.');return saved},
  write:body=>{if(body.action!=='finalize_closure'||body.session_id!==sessionId||body.confirmed!==true)throw new Error('Μη έγκυρη καταχώριση επίσκεψης.');return post(body).then(result=>({session:result.session}))}
 };
}
export function reviewConnectedVisit(bundle:PatientBundle,record:FixtureRecord,mse?:DemoSection,risk?:DemoRisk){
 recordForVisit(bundle,record.patientId,record.sessionId);
 if([mse,risk].some(r=>r&&(r.patient_id!==record.patientId||r.session_id!==record.sessionId)))throw new Error('Η αξιολόγηση ανήκει σε διαφορετική επίσκεψη.');
 if(followupFieldConflicts(record.notes,record.sessionId,bundle.sections).length)throw new Error('Υπάρχουν διαφορετικές αναλυτικές σημειώσεις. Συμφωνήστε την καταγραφή από τον φάκελο πριν την ολοκλήρωση.');
 const session=bundle.sessions.find(s=>s.id===record.sessionId)!;
 return followupCompletionIssues(record.notes,mse?[mse]:[],risk,{kind:'mse',fields:Object.values(mseTimeline(bundle,record.sessionId,session.started_at).references).map(r=>r.field)}).map(i=>i.message);
}
export function assertReviewedRecord(bundle:PatientBundle,record:FixtureRecord,mse?:DemoSection,risk?:DemoRisk){
 const fresh=recordForVisit(bundle,record.patientId,record.sessionId);
 if(bundle.sessions.find(s=>s.id===record.sessionId)?.status==='completed')return;
 const serverMse=bundle.sections.find(s=>s.session_id===record.sessionId&&s.section_key==='mse'),serverRisk=bundle.risks.find(r=>r.session_id===record.sessionId);
 if(fresh.version!==record.version||(serverMse?.version??null)!==(mse?.version??null)||(serverRisk?.version??null)!==(risk?.version??null))throw new Error('Η καταγραφή άλλαξε μετά τον έλεγχο. Ελέγξτε τη νέα έκδοση στον φάκελο πριν την καταχώριση.');
 const issues=reviewConnectedVisit(bundle,record,serverMse,serverRisk);if(issues.length)throw new Error(issues.join('\n'));
}

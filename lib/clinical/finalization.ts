import type {DemoSession,PatientBundle} from '../patients/demo-runtime';

export function confirmedCompletion(value:unknown,sessionId:string,patientId?:string):DemoSession{
 const session=value as Partial<DemoSession>|null;
 if(!session||session.id!==sessionId||(patientId&&session.patient_id!==patientId)||session.status!=='completed'||typeof session.completed_at!=='string'||!Number.isFinite(Date.parse(session.completed_at))||!Number.isSafeInteger(session.version)||(session.version as number)<0)throw new Error('Δεν επιβεβαιώθηκε η ολοκλήρωση της συγκεκριμένης επίσκεψης. Ανανεώστε τον φάκελο πριν δοκιμάσετε ξανά.');
 return session as DemoSession;
}

export class CompletionVerificationError extends Error{
 readonly committed:boolean;
 constructor(cause:unknown,committed:boolean){
  const detail=cause instanceof Error?cause.message:'Δεν επιβεβαιώθηκε η οριστικοποίηση.';
  super(committed?'Η καταγραφή οριστικοποιήθηκε, αλλά δεν επιβεβαιώθηκε η ανανέωση της προβολής. Ανανεώστε τον φάκελο.':detail);
  this.name='CompletionVerificationError';this.committed=committed;
 }
}
type CompletionOptions={
 sessionId:string;patientId:string;closure?:boolean;closureVersion?:number;
 read:()=>Promise<PatientBundle>;
 write:(body:Record<string,unknown>)=>Promise<{session?:unknown}>;
 onCommitted:(session:DemoSession,bundle:PatientBundle)=>void;
 onVerified:(session:DemoSession,bundle:PatientBundle)=>void|Promise<void>;
};
/** A mutation acknowledgement is not a successful UI refresh. Never retry a write automatically. */
export async function finalizeAndVerify(options:CompletionOptions):Promise<DemoSession>{
 let committed=false;
 try{
  const baseline=await options.read();
  if(baseline.patient.id!==options.patientId)throw new Error('Η επίσκεψη δεν αντιστοιχεί στον επιλεγμένο ασθενή.');
  const current=baseline.sessions.find(row=>row.id===options.sessionId&&row.patient_id===options.patientId);
  if(!current)throw new Error('Η επιλεγμένη επίσκεψη δεν είναι διαθέσιμη.');
  let completed:DemoSession;
  if(current.status==='completed')completed=confirmedCompletion(current,options.sessionId,options.patientId);
  else{
   if(!Number.isSafeInteger(current.version)||current.version<0)throw new Error('Δεν επιβεβαιώθηκε η έκδοση του προχείρου. Ανανεώστε τον φάκελο.');
   if(options.closure&&(!Number.isSafeInteger(options.closureVersion)||(options.closureVersion as number)<0))throw new Error('Δεν επιβεβαιώθηκε η έκδοση της καταγραφής. Ανανεώστε τον φάκελο.');
   const result=await options.write({action:options.closure?'finalize_closure':'finalize_session',confirmed:Boolean(options.closure),expected_closure_version:options.closureVersion,session_id:options.sessionId,expected_version:current.version});
   completed=confirmedCompletion(result.session,options.sessionId,options.patientId);
  }
  committed=true;options.onCommitted(completed,baseline);
  const refreshed=await options.read();
  if(refreshed.patient.id!==options.patientId)throw new Error('Ασυμφωνία φακέλου κατά την ανανέωση.');
  const verified=confirmedCompletion(refreshed.sessions.find(row=>row.id===options.sessionId),options.sessionId,options.patientId);
  if(verified.version<completed.version)throw new Error('Η ανανεωμένη προβολή είναι παλαιότερη από την επιβεβαιωμένη καταγραφή.');
  await options.onVerified(verified,refreshed);
  return verified;
 }catch(cause){throw new CompletionVerificationError(cause,committed)}
}

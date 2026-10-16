import type {DemoSession,PatientBundle} from '../patients/demo-runtime';

/** Validate transport identity before any response reaches a patient editor. */
export function assertRecordIdentity(value:unknown,patientId:string,sessionId?:string):asserts value is PatientBundle{
 const bundle=value as Partial<PatientBundle>|null;
 if(!bundle?.patient||bundle.patient.id!==patientId||!Array.isArray(bundle.sessions)||!Array.isArray(bundle.sections)||!Array.isArray(bundle.risks))throw new Error('Δεν επιβεβαιώθηκε ο φάκελος του επιλεγμένου ασθενούς. Δοκιμάστε ξανά.');
 for(const rows of [bundle.sessions,bundle.sections,bundle.risks,bundle.medications||[],bundle.medicationEvents||[],bundle.medicationSideEffects||[],bundle.assessments||[],bundle.proposals||[],bundle.addenda||[],bundle.corrections||[]]){
  if(!Array.isArray(rows))throw new Error('Η απάντηση του φακέλου δεν είναι έγκυρη.');
  for(const row of rows){
   if(!row||typeof row!=='object'||('patient_id' in row&&row.patient_id!==patientId))throw new Error('Η απάντηση δεν αντιστοιχεί στον επιλεγμένο ασθενή.');
   if('tester_id' in row&&row.tester_id&&bundle.patient.tester_id&&row.tester_id!==bundle.patient.tester_id)throw new Error('Η απάντηση δεν αντιστοιχεί στον επιλεγμένο φάκελο.');
  }
 }
 if(bundle.history&&bundle.history.patient_id!==patientId)throw new Error('Το ιστορικό δεν αντιστοιχεί στον επιλεγμένο ασθενή.');
 if(bundle.priorCourse&&(bundle.priorCourse.patient_id!==patientId||(bundle.patient.tester_id&&bundle.priorCourse.tester_id!==bundle.patient.tester_id)))throw new Error('Η προηγούμενη πορεία δεν αντιστοιχεί στον επιλεγμένο ασθενή.');
 if(sessionId&&!bundle.sessions.some(row=>row.id===sessionId&&row.patient_id===patientId))throw new Error('Η συγκεκριμένη επίσκεψη δεν είναι διαθέσιμη στον φάκελο.');
}

type Versioned={version?:number;updated_at?:string};
export function newerVersion<T extends Versioned>(previous:T|undefined,incoming:T):T{
 if(!previous)return incoming;
 if(typeof previous.version==='number'&&typeof incoming.version==='number'&&previous.version>incoming.version)return previous;
 if(previous.version===incoming.version&&previous.updated_at&&incoming.updated_at&&Date.parse(previous.updated_at)>Date.parse(incoming.updated_at))return previous;
 return incoming;
}

/** Completion is irreversible; closure drafts have their own optimistic version. */
export function reconcileSession(previous:DemoSession|undefined,incoming:DemoSession):DemoSession{
 if(!previous)return incoming;
 if(previous.id!==incoming.id||previous.patient_id!==incoming.patient_id)throw new Error('Ασυμφωνία ταυτότητας επίσκεψης.');
 if(previous.status==='completed'&&incoming.status!=='completed')return previous;
 const chosen=newerVersion(previous,incoming);
 if(chosen.status==='draft'&&previous.status==='draft'&&incoming.status==='draft'){
  const closure=(previous.closure_version??0)>(incoming.closure_version??0)?previous:incoming;
  return {...chosen,closure_version:closure.closure_version,closure_draft:closure.closure_draft};
 }
 return chosen;
}
function mergeRows<T>(previous:T[],incoming:T[],key:(row:T)=>string,choose:(previous:T|undefined,incoming:T)=>T,partial=false):T[]{
 const old=new Map(previous.map(row=>[key(row),row]));
 const fresh=new Set(incoming.map(key));
 return [...(partial?previous.filter(row=>!fresh.has(key(row))):[]),...incoming.map(row=>choose(old.get(key(row)),row))];
}

/**
 * Reconcile full, shell and single-visit responses without copying old findings
 * into a new visit. Every row retains its identity, source and original version.
 * Transport callers must use assertRecordIdentity before this pure projection.
 */
export function reconcileRecord(previous:PatientBundle|null,incoming:PatientBundle,mode:'full'|'shell'|'visit'='full'):PatientBundle{
 if(!previous)return incoming;
 if(previous.patient?.id!==incoming.patient?.id||previous.patient?.tester_id!==incoming.patient?.tester_id)throw new Error('Δεν συνδυάζονται διαφορετικοί φάκελοι ασθενών.');
 const partial=mode==='visit';
 const sessions=mergeRows(previous.sessions,incoming.sessions,row=>row.id,reconcileSession,partial);
 const patient=newerVersion(previous.patient,incoming.patient);
 if(mode==='shell')return {...previous,patient,sessions,appointments:incoming.appointments};
 const base=partial?previous:incoming;
 return {...base,patient,sessions,
  sections:mergeRows(previous.sections,incoming.sections,row=>row.id,newerVersion,partial),
  risks:mergeRows(previous.risks,incoming.risks,row=>row.session_id,newerVersion,partial),
  proposals:partial?mergeRows(previous.proposals,incoming.proposals,row=>row.id,(_,row)=>row,true):incoming.proposals,
  addenda:partial?mergeRows(previous.addenda,incoming.addenda,row=>row.id,(_,row)=>row,true):incoming.addenda,
  corrections:partial?mergeRows(previous.corrections||[],incoming.corrections||[],row=>row.id,(_,row)=>row,true):incoming.corrections,
  history:partial?previous.history:incoming.history&&previous.history?newerVersion(previous.history,incoming.history):incoming.history,
 };
}

import type {PatientBundle} from '../patients/demo-runtime';
export type ContextRevision={id:string;request_id:string;source_session_id:string;patient_id:string;revision:number;action:'updated'|'resolved';content:string;actor_id:string;created_at:string};
export function continuityContexts(bundle:Pick<PatientBundle,'sessions'|'patient'|'contextRevisions'>){
 return bundle.sessions.filter(s=>s.patient_id===bundle.patient.id&&s.status==='completed'&&s.continuity?.approved_at&&s.continuity.pinned_context.trim()).map(s=>{
  const original=s.continuity!;
  const history=(bundle.contextRevisions||[]).filter(r=>r.source_session_id===s.id&&r.patient_id===bundle.patient.id).sort((a,b)=>a.revision-b.revision);
  const latest=history[history.length-1];
  return {id:s.id,content:latest?.content||original.pinned_context,status:latest?.action==='resolved'?'resolved':'active',revision:latest?.revision||0,sourceSessionId:s.id,sourceDate:s.started_at,approvedAt:original.approved_at,approvedBy:original.approved_by,original:original.pinned_context,updatedAt:latest?.created_at||original.approved_at,history};
 }).sort((a,b)=>Date.parse(b.updatedAt)-Date.parse(a.updatedAt)||a.id.localeCompare(b.id));
}

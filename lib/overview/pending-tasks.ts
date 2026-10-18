export type PendingTask={id:string;tester_id:string;patient_id:string|null;source_session_id:string|null;title:string;due_at:string|null;status:'open'|'completed';completed_at:string|null;created_at:string;updated_at:string;patient_name?:string;session_started_at?:string;derived?:boolean};
export type TaskPatient={id:string;first_name:string;last_name:string};
export type PendingVisit={id:string;patient_id:string;status:string;started_at:string;updated_at:string};
export function pendingTasks(tasks:PendingTask[],visits:PendingVisit[],patients:TaskPatient[]):PendingTask[]{
 const names=new Map(patients.map(p=>[p.id,[p.first_name,p.last_name].filter(Boolean).join(' ')]));
 const linked=new Map<string,PendingTask>();
 const result:PendingTask[]=[];
 for(const task of tasks){
  if(task.status!=='open')continue;
  if(task.source_session_id){if(!linked.has(task.source_session_id))linked.set(task.source_session_id,task);continue;}
  result.push({...task,patient_name:task.patient_id?names.get(task.patient_id):undefined});
 }
 const seen=new Set<string>();
 for(const visit of visits){
  if(visit.status!=='draft'||seen.has(visit.id)||!names.has(visit.patient_id))continue;
  seen.add(visit.id);
  const task=linked.get(visit.id),valid=task?.patient_id===visit.patient_id?task:undefined;
  result.push({...valid,id:valid?.id||'draft:'+visit.id,tester_id:valid?.tester_id||'',patient_id:visit.patient_id,source_session_id:visit.id,title:'Ολοκλήρωση καταγραφής · '+names.get(visit.patient_id),due_at:valid?.due_at||null,status:'open',completed_at:null,created_at:valid?.created_at||visit.started_at,updated_at:visit.updated_at,patient_name:names.get(visit.patient_id),session_started_at:visit.started_at,derived:!valid});
 }
 return result.sort((a,b)=>{
  const aDue=a.due_at?Date.parse(a.due_at):Infinity,bDue=b.due_at?Date.parse(b.due_at):Infinity;
  return (aDue===bDue?0:aDue-bDue)||Date.parse(b.created_at)-Date.parse(a.created_at)||a.id.localeCompare(b.id);
 });
}
export function pendingTaskHref(task:PendingTask){
 if(!task.patient_id)return null;
 return '/patients/demo/'+encodeURIComponent(task.patient_id)+(task.source_session_id?'?tab=record&session='+encodeURIComponent(task.source_session_id):'');
}
export function taskStatusChange(task:PendingTask,status:'open'|'completed'){
 if(task.source_session_id)throw new Error('Η εκκρεμότητα κλείνει με την καταχώριση της επίσκεψης.');
 return {action:'set_status' as const,id:task.id,status};
}
export function pendingListState(state:'loading'|'ready'|'error',refreshFailed:boolean,count:number){
 if(state==='loading')return 'loading';
 if(state==='error')return 'error';
 if(refreshFailed)return 'stale';
 return count?'items':'empty';
}

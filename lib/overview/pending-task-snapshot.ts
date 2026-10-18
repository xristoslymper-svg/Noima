import {pendingTasks,type PendingTask,type PendingVisit,type TaskPatient} from './pending-tasks.ts';
type Read=(path:string)=>Promise<unknown>;
// Every page uses the same authenticated request scope. No bootstrap or mutations.
async function allRows<T>(read:Read,path:string):Promise<T[]>{
 const result:T[]=[];const size=500;
 for(let offset=0;;offset+=size){
  const page=await read(path+'&limit='+size+'&offset='+offset);
  if(!Array.isArray(page))throw new Error('invalid_pending_snapshot');
  result.push(...page as T[]);
  if(page.length<size)return result;
 }
}
export async function pendingTaskSnapshot(read:Read,tester:string,tasks:PendingTask[]){
 const scope='&tester_id=eq.'+encodeURIComponent(tester);
 const [visits,patients]=await Promise.all([
  allRows<PendingVisit>(read,'demo_sessions?select=id,patient_id,status,started_at,updated_at'+scope+'&status=eq.draft&order=id.asc'),
  allRows<TaskPatient>(read,'demo_patients?select=id,first_name,last_name'+scope+'&order=id.asc')
 ]);
 return pendingTasks(tasks,visits,patients);
}

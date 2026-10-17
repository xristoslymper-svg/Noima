import {after} from 'next/server';
import {isClinicalId} from './identity';

/** Use the existing guarded/cache-aware summary path after confirmed writes. */
export function queueSummary(request:Request,patientId:string){
 if(!isClinicalId(patientId))return;
 const cookie=request.headers.get('cookie')||'',origin=new URL(request.url).origin;
 after(async()=>{
  try{
   const response=await fetch(origin+'/api/clinical/summary',{method:'POST',headers:{'Content-Type':'application/json',Cookie:cookie},body:JSON.stringify({patient_id:patientId})});
   if(!response.ok)console.error('clinical_summary_background_failed',{status:response.status});
  }catch{console.error('clinical_summary_background_failed',{code:'background_request_failed'})}
 });
}

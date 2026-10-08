// Navigation only reads the verified cache or immediate canonical fallback.
// Generation belongs to background jobs or an explicit manual refresh.
export async function requestClinicalSummary<T>({patientId,tester,hash,force=false,signal}:{patientId:string;tester:string;hash:string;force?:boolean;signal?:AbortSignal},request:typeof fetch=fetch):Promise<T>{
 const generate=()=>request('/api/clinical/summary',{method:'POST',signal,headers:{'Content-Type':'application/json'},body:JSON.stringify({tester,patient_id:patientId,context_hash:hash})});
 const response=force?await generate():await request('/api/clinical/summary?patient_id='+encodeURIComponent(patientId),{cache:'no-store',signal});
 const data=await response.json();
 if(!response.ok)throw new Error('summary_unavailable');
 if(!force&&hash&&data.context_hash!==hash)throw new Error('summary_pending');
 return data as T;
}

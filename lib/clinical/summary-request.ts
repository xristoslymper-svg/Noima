// Read a verified cache or consume the generated response, including fallback.
// A fallback is deliberately not cached by the server, but remains useful here.
export async function requestClinicalSummary<T>({patientId,tester,hash,force=false,signal}:{patientId:string;tester:string;hash:string;force?:boolean;signal?:AbortSignal},request:typeof fetch=fetch):Promise<T>{
 const generate=()=>request('/api/clinical/summary',{method:'POST',signal,headers:{'Content-Type':'application/json'},body:JSON.stringify({tester,patient_id:patientId,context_hash:hash})});
 let response=force?await generate():await request('/api/clinical/summary?patient_id='+encodeURIComponent(patientId),{cache:'no-store',signal});
 if(!force&&response.status===404)response=await generate();
 let data=await response.json();
 if(!response.ok)throw new Error('summary_unavailable');
 if(!force&&hash&&data.context_hash!==hash){response=await generate();data=await response.json();if(!response.ok)throw new Error('summary_unavailable')}
 return data as T;
}

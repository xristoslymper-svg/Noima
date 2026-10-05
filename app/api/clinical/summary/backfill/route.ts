import { after } from 'next/server';
import { withPilot } from '@/lib/pilot/route';
import { listPatientRows, request } from '@/lib/patients/demo-runtime';
import { isClinicalId } from '@/lib/clinical/identity';

export const dynamic='force-dynamic';

type CachedPatient={patient_id:string};

async function handlePOST(request:Request){
 const body=await request.json().catch(()=>({}));
 const tester=body&&typeof body==='object'&&!Array.isArray(body)&&isClinicalId((body as Record<string,unknown>).tester)
  ?String((body as Record<string,unknown>).tester)
  :'';
 if(!tester)return Response.json({error:'Λείπει η δοκιμαστική ταυτότητα.'},{status:400});

 const patients=await listPatientRows(tester);
 const cachedRaw=await requestCache(tester);
 const cached=new Set(cachedRaw.map(row=>row.patient_id));
 const candidates=patients.filter(patient=>patient.last_session&&!cached.has(patient.id)).slice(0,2);
 if(!candidates.length)return Response.json({queued:0});

 const cookie=request.headers.get('cookie')||'';
 const origin=new URL(request.url).origin;
 after(async()=>{
  for(const patient of candidates){
   try{
    const response=await fetch(origin+'/api/clinical/summary',{
     method:'POST',
     headers:{'Content-Type':'application/json',Cookie:cookie},
     body:JSON.stringify({patient_id:patient.id}),
    });
    if(!response.ok)console.error('clinical_summary_backfill_failed',{status:response.status});
   }catch(error){
    console.error('clinical_summary_backfill_failed',{error:error instanceof Error?error.message:'unknown'});
   }
  }
 });
 return Response.json({queued:candidates.length});
}

async function requestCache(tester:string){
 const value=await request(`demo_clinical_summary_cache?select=patient_id&tester_id=eq.${encodeURIComponent(tester)}`);
 return Array.isArray(value)?value as CachedPatient[]:[];
}

export const POST=withPilot(handlePOST);

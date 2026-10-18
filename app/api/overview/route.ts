import {withPilot} from '@/lib/pilot/route';
import {rpc,request as read} from '@/lib/patients/demo-runtime';
import {isClinicalId} from '@/lib/clinical/identity';

import {pendingTaskSnapshot} from '@/lib/overview/pending-task-snapshot';

export const dynamic='force-dynamic';
export const preferredRegion='fra1';

async function handleGET(request:Request){
  const tester=new URL(request.url).searchParams.get('tester')||'';
  if(!isClinicalId(tester))return Response.json({error:'Λείπει η δοκιμαστική ταυτότητα.'},{status:400});
  try{
    const value=await rpc('demo_overview_state',{p_tester:tester});
    const payload=Array.isArray(value)?value[0]:value;
    if(!payload||!Array.isArray(payload.tasks))throw new Error('invalid_overview');
    const tasks=await pendingTaskSnapshot(read,tester,payload.tasks);
    return Response.json({...payload,tasks},{headers:{'Cache-Control':'no-store'}});
  }catch{
    return Response.json({error:'Δεν φορτώθηκε η επισκόπηση.'},{status:502});
  }
}
export const GET=withPilot(handleGET);

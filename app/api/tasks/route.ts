import { withPilot } from '@/lib/pilot/route';
import { rpc } from '@/lib/patients/demo-runtime';

export const dynamic='force-dynamic';
export const preferredRegion='fra1';

const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const rows=<T,>(value:unknown):T[]=>Array.isArray(value)?value as T[]:value?[value as T]:[];

async function handleGET(request:Request){
  const tester=new URL(request.url).searchParams.get('tester')||'';
  if(!uuid.test(tester))return Response.json({error:'Λείπει η δοκιμαστική ταυτότητα.'},{status:400});
  try{
    const value=await rpc('demo_task_list',{p_tester:tester});
    return Response.json({tasks:rows(value)});
  }catch{
    return Response.json({error:'Δεν φορτώθηκαν οι εργασίες.'},{status:502});
  }
}

async function handlePOST(request:Request){
  const body=await request.json().catch(()=>({}));
  const tester=typeof body.tester==='string'?body.tester:'';
  if(!uuid.test(tester))return Response.json({error:'Λείπει η δοκιμαστική ταυτότητα.'},{status:400});
  try{
    if(body.action==='create'){
      const title=typeof body.title==='string'?body.title.trim():'';
      const patient=typeof body.patient_id==='string'&&uuid.test(body.patient_id)?body.patient_id:null;
      const dueAt=typeof body.due_at==='string'&&Number.isFinite(Date.parse(body.due_at))?body.due_at:null;
      if(!title||title.length>240)return Response.json({error:'Γράψτε μια σύντομη εργασία.'},{status:400});
      const value=await rpc('demo_task_create',{p_tester:tester,p_title:title,p_patient:patient,p_due_at:dueAt});
      return Response.json({task:Array.isArray(value)?value[0]:value});
    }
    if(body.action==='set_status'){
      const id=typeof body.id==='string'?body.id:'';
      const status=body.status==='open'||body.status==='completed'?body.status:'';
      if(!uuid.test(id)||!status)return Response.json({error:'Μη έγκυρη εργασία.'},{status:400});
      const value=await rpc('demo_task_set_status',{p_tester:tester,p_id:id,p_status:status});
      return Response.json({task:Array.isArray(value)?value[0]:value});
    }
    return Response.json({error:'Μη έγκυρη ενέργεια.'},{status:400});
  }catch(error){
    const message=error instanceof Error?error.message:'';
    if(message.includes('task_not_found'))return Response.json({error:'Η εργασία δεν βρέθηκε.'},{status:404});
    if(message.includes('task_managed_by_record'))return Response.json({error:'Η εκκρεμότητα κλείνει αυτόματα όταν ολοκληρωθεί η καταγραφή.'},{status:409});
    return Response.json({error:'Η εργασία δεν αποθηκεύτηκε.'},{status:502});
  }
}

export const GET=withPilot(handleGET);
export const POST=withPilot(handlePOST);

import { withPilot } from '@/lib/pilot/route';
import { rpc } from '@/lib/patients/demo-runtime';

export const dynamic = 'force-dynamic';

const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const statuses=new Set(['unknown','pending','paid','not_applicable']);

async function handlePOST(request:Request){
  const body=await request.json().catch(()=>({}));
  const tester=typeof body.tester==='string'?body.tester:'';
  const eventId=typeof body.event_id==='string'?body.event_id:'';
  const status=typeof body.status==='string'?body.status:'';
  if(!uuid.test(tester)||!uuid.test(eventId)||!statuses.has(status)){
    return Response.json({error:'Μη έγκυρη κατάσταση πληρωμής.'},{status:400});
  }
  try{
    const result=await rpc('demo_payment_set',{p_tester:tester,p_event:eventId,p_status:status});
    const event=Array.isArray(result)?result[0]:result;
    if(!event)return Response.json({error:'Το ραντεβού δεν βρέθηκε.'},{status:404});
    return Response.json({event});
  }catch(error){
    const message=error instanceof Error?error.message:'';
    if(message.includes('event_not_found'))return Response.json({error:'Το ραντεβού δεν βρέθηκε.'},{status:404});
    return Response.json({error:'Η πληρωμή δεν ενημερώθηκε. Δοκιμάστε ξανά.'},{status:502});
  }
}

export const POST=withPilot(handlePOST);

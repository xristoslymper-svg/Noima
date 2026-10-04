import {rpc} from '@/lib/patients/demo-runtime';
export const dynamic='force-dynamic';
export async function POST(request:Request){
 const b=await request.json().catch(()=>({}));const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
 try{
  if(b.action==='open'||b.action==='submit'){
   if(typeof b.token!=='string'||!/^[a-f0-9]{64}$/.test(b.token))return Response.json({error:'Ο σύνδεσμος δεν είναι έγκυρος.'},{status:400});
   return Response.json(await rpc(b.action==='open'?'demo_assessment_open':'demo_assessment_submit',b.action==='open'?{p_token:b.token}:{p_token:b.token,p_answers:b.answers}),{headers:{'Cache-Control':'no-store'}});
  }
  if(!uuid.test(b.tester||''))return Response.json({error:'Λείπει η δοκιμαστική ταυτότητα.'},{status:400});
  if(b.action==='assign'){
   if(!uuid.test(b.id||'')||!uuid.test(b.patient_id||'')||!/^[a-f0-9]{64}$/.test(b.token||''))return Response.json({error:'Μη έγκυρη ανάθεση.'},{status:400});
   if(b.session_id&&(!uuid.test(b.session_id)||b.appointment_id))return Response.json({error:'Μη έγκυρη επίσκεψη.'},{status:400});
   const args={p_tester:b.tester,p_patient:b.patient_id,p_id:b.id,p_instrument:b.instrument,p_token:b.token};
   return Response.json(await rpc(b.session_id?'demo_assessment_assign_to_session':'demo_assessment_assign',b.session_id?{...args,p_session:b.session_id}:{...args,p_appointment:b.appointment_id||null}));
  }
  if(b.action==='review_item9'){await rpc('demo_assessment_item9_review',{p_tester:b.tester,p_id:b.id});return Response.json({ok:true})}
  if(b.action==='revoke'){await rpc('demo_assessment_revoke',{p_tester:b.tester,p_id:b.id});return Response.json({ok:true})}
  return Response.json({error:'Μη έγκυρη ενέργεια.'},{status:400});
 }catch(e){const message=e instanceof Error?e.message:'';const expired=message.includes('link_expired'),done=message.includes('already_completed');return Response.json({error:expired?'Ο σύνδεσμος έχει λήξει. Ζητήστε νέο από τον γιατρό σας.':done?'Το ερωτηματολόγιο έχει ήδη υποβληθεί.':message.includes('invalid_answers')?'Απαντήστε σε όλες τις ερωτήσεις.':'Η ενέργεια δεν ολοκληρώθηκε. Ο σύνδεσμος μπορεί να έχει ανακληθεί. Οι απαντήσεις παραμένουν διαθέσιμες για επανάληψη.'},{status:expired?410:done?409:400})}
}

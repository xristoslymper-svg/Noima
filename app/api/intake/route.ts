import {randomBytes,randomUUID} from 'node:crypto';
import {withPilot} from '@/lib/pilot/route';
import {rpc} from '@/lib/patients/demo-runtime';
import {isClinicalId} from '@/lib/clinical/identity';

export const runtime='nodejs';export const dynamic='force-dynamic';
const token=()=>randomBytes(32).toString('hex');
const toolsAllowed=new Set(['history','PHQ-9','GAD-7']);
const tools=(value:unknown)=>Array.isArray(value)&&value.length>0&&value.length<=3&&value.every(x=>typeof x==='string'&&toolsAllowed.has(x))&&new Set(value).size===value.length?value:null;
async function handlePOST(request:Request){
 const b=await request.json().catch(()=>({}));const tester=String(b.tester||'');
 if(!isClinicalId(tester))return Response.json({error:'Λείπει η δοκιμαστική ταυτότητα.'},{status:400});
 try{
  if(b.action==='register_device'){
   const id=randomUUID(),secret=token(),label=String(b.label||'Tablet Υποδοχής').trim().slice(0,80);
   const device=await rpc('demo_intake_device_register',{p_tester:tester,p_id:id,p_token:secret,p_label:label||'Tablet Υποδοχής'});
   return Response.json({device,deviceToken:secret});
  }
  if(b.action==='devices')return Response.json({devices:await rpc('demo_intake_device_list',{p_tester:tester})});
  if(b.action==='revoke_device'){if(!isClinicalId(String(b.id||'')))return Response.json({error:'Μη έγκυρο tablet.'},{status:400});await rpc('demo_intake_device_revoke',{p_tester:tester,p_id:b.id});return Response.json({ok:true})}
  if(b.action==='assign'){
   const selected=tools(b.tools);if(!selected)return Response.json({error:'Επιλέξτε έγκυρα εργαλεία.'},{status:400});
   const appointment=String(b.appointment_id||''),patient=String(b.patient_id||''),channel=String(b.channel||'');
   if(appointment&&!isClinicalId(appointment)||patient&&!isClinicalId(patient)||!['tablet','email','print'].includes(channel))return Response.json({error:'Μη έγκυρη ανάθεση.'},{status:400});
   const rawIdentity=b.provisional_identity;
   const provisional=!appointment&&!patient&&rawIdentity&&typeof rawIdentity==='object'&&!Array.isArray(rawIdentity)
    ?{first_name:String(rawIdentity.first_name||'').trim().slice(0,120),last_name:String(rawIdentity.last_name||'').trim().slice(0,120),email:String(rawIdentity.email||'').trim().toLowerCase().slice(0,254)}
    :null;
   if(!appointment&&!patient&&!provisional?.first_name)return Response.json({error:'Συμπληρώστε το όνομα του νέου ασθενή.'},{status:400});
   const device=String(b.device_id||'');if(channel==='tablet'&&!isClinicalId(device))return Response.json({error:'Επιλέξτε συνδεδεμένο tablet.'},{status:400});
   const id=randomUUID(),secret=token();
   const intake=await rpc('demo_intake_assign',{p_tester:tester,p_id:id,p_token:secret,p_appointment:appointment||null,p_patient:patient||null,p_tools:selected,p_channel:channel,p_device:device||null});
   if(provisional)await rpc('demo_intake_prefill',{p_tester:tester,p_id:id,p_identity:provisional});
   const origin=process.env.NOIMA_APP_ORIGIN||new URL(request.url).origin;
   return Response.json({intake,intakeToken:secret,intakeLink:new URL('/intake',origin).href+'#'+secret,printLink:new URL('/intake?print=1',origin).href+'#'+secret});
  }
  if(b.action==='list'){
   const patient=String(b.patient_id||'');if(patient&&!isClinicalId(patient))return Response.json({error:'Μη έγκυρος ασθενής.'},{status:400});
   return Response.json({intakes:await rpc('demo_intake_list',{p_tester:tester,p_patient:patient||null})});
  }
  if(b.action==='revoke'){if(!isClinicalId(String(b.id||'')))return Response.json({error:'Μη έγκυρο intake.'},{status:400});await rpc('demo_intake_revoke',{p_tester:tester,p_id:b.id});return Response.json({ok:true})}
  if(b.action==='review'){
   if(!isClinicalId(String(b.id||''))||!Number.isInteger(b.expected_history_version)||!b.patch||typeof b.patch!=='object'||Array.isArray(b.patch))return Response.json({error:'Μη έγκυρη ενσωμάτωση.'},{status:400});
   return Response.json({history:await rpc('demo_intake_review',{p_tester:tester,p_id:b.id,p_patch:b.patch,p_expected_history_version:b.expected_history_version})});
  }
  if(b.action==='resolve'){
   if(!isClinicalId(String(b.id||'')))return Response.json({error:'Μη έγκυρο intake.'},{status:400});
   const patient=String(b.patient_id||'');if(patient&&!isClinicalId(patient))return Response.json({error:'Μη έγκυρος ασθενής.'},{status:400});
   return Response.json(await rpc('demo_intake_resolve',{p_tester:tester,p_id:b.id,p_patient:patient||null,p_create_new:b.create_new===true}));
  }
  return Response.json({error:'Μη έγκυρη ενέργεια.'},{status:400});
 }catch(e){const m=e instanceof Error?e.message:'';
  if(m.includes('device_not_found'))return Response.json({error:'Το tablet δεν είναι διαθέσιμο.'},{status:409});
  if(m.includes('appointment_unavailable'))return Response.json({error:'Το ραντεβού δεν είναι διαθέσιμο.'},{status:409});
  if(m.includes('stale_history'))return Response.json({error:'Το ιστορικό άλλαξε. Ανανεώστε τον φάκελο πριν την ενσωμάτωση.',code:'stale'},{status:409});
  if(m.includes('amka_conflict'))return Response.json({error:'Ο ίδιος ΑΜΚΑ υπάρχει ήδη. Συνδέστε το intake με τον υπάρχοντα φάκελο.'},{status:409});
  return Response.json({error:'Η ενέργεια intake δεν ολοκληρώθηκε.'},{status:400});
 }
}
export const POST=withPilot(handlePOST);

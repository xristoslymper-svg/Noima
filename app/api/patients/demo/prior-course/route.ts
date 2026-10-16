import {withPilot} from '@/lib/pilot/route';
import {rpc} from '@/lib/patients/demo-runtime';
import {isClinicalId} from '@/lib/clinical/identity';
export const dynamic='force-dynamic';
async function get(req:Request){
 const u=new URL(req.url),tester=u.searchParams.get('tester'),patient=u.searchParams.get('patient_id');
 if(!tester||!patient||!isClinicalId(tester)||!isClinicalId(patient))return Response.json({error:'Μη έγκυρος φάκελος.'},{status:400});
 try{const rows=await rpc('demo_prior_course_get',{p_tester:tester,p_patient:patient});return Response.json({priorCourse:(rows as unknown[])[0]||null},{headers:{'Cache-Control':'no-store'}});}
 catch{return Response.json({error:'Δεν φορτώθηκε η προηγούμενη πορεία.'},{status:503});}
}
async function post(req:Request){
 const b=await req.json().catch(()=>null);
 if(!b||!isClinicalId(b.tester)||!isClinicalId(b.patient_id)||!isClinicalId(b.request_id)
 ||!Number.isInteger(b.expected_version)||b.expected_version<0||typeof b.content!=='string'
 ||b.content.trim().length<15||b.content.length>12000||typeof b.period_label!=='string'||b.period_label.length>120)
 return Response.json({error:'Η πορεία πρέπει να έχει 15–12.000 χαρακτήρες.'},{status:400});
 try{const row=await rpc('demo_prior_course_save',{p_tester:b.tester,p_patient:b.patient_id,p_request:b.request_id,p_expected_version:b.expected_version,p_period:b.period_label.trim(),p_content:b.content.trim()});return Response.json({priorCourse:row},{headers:{'Cache-Control':'no-store'}});}
 catch(e){const msg=e instanceof Error?e.message:'';
 if(msg.includes('stale_prior_course'))return Response.json({error:'Η καταγραφή άλλαξε σε άλλη καρτέλα. Ανανεώστε πριν αποθηκεύσετε.',code:'stale_prior_course'},{status:409});
 if(msg.includes('patient_not_found'))return Response.json({error:'Ο φάκελος δεν βρέθηκε.'},{status:404});
 return Response.json({error:'Δεν αποθηκεύτηκε η προηγούμενη πορεία.'},{status:503});}
}
export const GET=withPilot(get);
export const POST=withPilot(post);

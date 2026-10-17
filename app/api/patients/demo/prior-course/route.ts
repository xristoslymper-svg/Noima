import {withPilot} from '@/lib/pilot/route';
import {rpc} from '@/lib/patients/demo-runtime';
import {isClinicalId} from '@/lib/clinical/identity';
import {priorCourseInput,confirmedPriorCourse} from '@/lib/clinical/prior-course-record';
export const dynamic='force-dynamic';
const json=(value:unknown,status=200)=>Response.json(value,{status,headers:{'Cache-Control':'private, no-store'}});
const realMode=()=>process.env.CLINICAL_DATA_MODE?.trim().toLowerCase()==='real';
function failure(error:unknown){
 const message=error instanceof Error?error.message:'';
 if(message.includes('stale_prior_course')||message.includes('request_conflict'))return json({error:'Η καταγραφή άλλαξε. Το κείμενό σας διατηρήθηκε. Ελέγξτε τη νεότερη έκδοση πριν αποθηκεύσετε.',code:'stale_prior_course'},409);
 if(message.includes('patient_not_found'))return json({error:'Ο φάκελος δεν βρέθηκε.'},404);
 return json({error:'Η προηγούμενη πορεία δεν είναι διαθέσιμη. Το πρόχειρό σας διατηρείται.',code:'prior_course_unavailable'},503);
}
async function get(req:Request){
 if(realMode())return json({error:'Η πραγματική κλινική πρόσβαση δεν έχει ενεργοποιηθεί.'},403);
 const q=new URL(req.url).searchParams,patient=q.get('patient_id'),tester=q.get('tester');
 if(!patient||!tester||!isClinicalId(patient)||!isClinicalId(tester))return json({error:'Μη έγκυρος φάκελος.'},400);
 try{const rows=await rpc('demo_prior_course_get',{p_tester:tester,p_patient:patient});const raw=Array.isArray(rows)?rows[0]:rows;return json({priorCourse:raw?confirmedPriorCourse(raw,patient,tester):null})}catch(error){return failure(error)}
}
async function post(req:Request){
 if(realMode())return json({error:'Η πραγματική κλινική πρόσβαση δεν έχει ενεργοποιηθεί.'},403);
 let input;
 try{input=priorCourseInput(await req.json())}catch{return json({error:'Συμπληρώστε την προηγούμενη πορεία (15–12.000 χαρακτήρες).'},400)}
 try{
  const row=await rpc('demo_prior_course_save',{p_tester:input.tester,p_patient:input.patient_id,p_request:input.request_id,p_expected_version:input.expected_version,p_period:input.period_label,p_content:input.content});
  return json({priorCourse:confirmedPriorCourse(row,input.patient_id,input.tester,input)});
 }catch(error){return failure(error)}
}
export const GET=withPilot(get);
export const POST=withPilot(post);

import { bootstrap, createPatient, listPatientRows, patientBundle, rpc } from '@/lib/patients/demo-runtime';
export const dynamic='force-dynamic';
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const testerOf=(value:unknown)=>typeof value==='string'&&uuid.test(value)?value:'';
const first=<T,>(value:unknown):T=>Array.isArray(value)?value[0] as T:value as T;
function failure(error:unknown){
 const message=error instanceof Error?error.message:'';
 if(message.includes('stale_'))return Response.json({error:'Η καταχώρηση άλλαξε σε άλλη καρτέλα. Επαναφορτώστε τα δεδομένα πριν συνεχίσετε.',code:'stale'},{status:409});
 if(message.includes('missing_sections'))return Response.json({error:'Συμπληρώστε Ψυχιατρική συνέντευξη, MSE, Κλινική εκτίμηση, Πλάνο και Επανεκτίμηση πριν την ολοκλήρωση.',code:'missing_sections'},{status:422});
 if(message.includes('risk_required'))return Response.json({error:'Χρειάζεται εκτίμηση αυτοκτονικού ιδεασμού πριν την ολοκλήρωση.',code:'risk_required'},{status:422});
 if(message.includes('patient_not_found'))return Response.json({error:'Ο δοκιμαστικός ασθενής δεν βρέθηκε.',code:'not_found'},{status:404});
 return Response.json({error:'Η ενέργεια δεν αποθηκεύτηκε. Δοκιμάστε ξανά.'},{status:502});
}
export async function GET(request:Request){
 const url=new URL(request.url); const tester=testerOf(url.searchParams.get('tester')); if(!tester)return Response.json({error:'Λείπει η δοκιμαστική ταυτότητα.'},{status:400});
 try{const patient=url.searchParams.get('patient');return Response.json(patient?{bundle:await patientBundle(tester,patient)}:{patients:await listPatientRows(tester)})}catch(error){return failure(error)}
}
export async function POST(request:Request){
 const body=await request.json().catch(()=>({})); const tester=testerOf(body.tester); if(!tester)return Response.json({error:'Λείπει η δοκιμαστική ταυτότητα.'},{status:400});
 try{
  await bootstrap(tester);
  switch(body.action){
   case 'create_patient':{
    const firstName=String(body.first_name||'').trim(); const age=body.age===''||body.age==null?null:Number(body.age);
    if(!firstName||(age!==null&&(!Number.isInteger(age)||age<0||age>120)))return Response.json({error:'Συμπληρώστε έγκυρα βασικά στοιχεία.'},{status:400});
    return Response.json({patient:await createPatient(tester,{first_name:firstName,last_name:String(body.last_name||'').trim(),age,phone:String(body.phone||'').trim(),email:String(body.email||'').trim(),chief_complaint:String(body.chief_complaint||'').trim()})});
   }
   case 'start_session': return Response.json({session:first(await rpc('demo_session_start',{p_tester:tester,p_patient:body.patient_id,p_type:body.session_type}))});
   case 'save_section': return Response.json({section:first(await rpc('demo_session_save_section',{p_tester:tester,p_session:body.session_id,p_section:body.section_key,p_content:String(body.content||''),p_source:body.source||'manual',p_expected_version:body.expected_version??null}))});
   case 'save_risk': return Response.json({risk:first(await rpc('demo_session_save_risk',{p_tester:tester,p_session:body.session_id,p_risk:body.risk||{},p_expected_version:body.expected_version??null}))});
   case 'save_history': return Response.json({history:first(await rpc('demo_history_save',{p_tester:tester,p_patient:body.patient_id,p_history:body.history||{}}))});
   case 'medication_start': return Response.json({medication:first(await rpc('demo_medication_start',{p_tester:tester,p_patient:body.patient_id,p_session:body.session_id||null,p_name:String(body.name||'').trim(),p_dose:Number(body.dose),p_unit:String(body.unit||'mg').trim(),p_frequency:String(body.frequency||'').trim(),p_effective:body.effective_on,p_reason:String(body.reason||'').trim()}))});
   case 'medication_change': return Response.json({medication:first(await rpc('demo_medication_change',{p_tester:tester,p_medication:body.medication_id,p_session:body.session_id||null,p_dose:Number(body.dose),p_unit:String(body.unit||'mg').trim(),p_frequency:String(body.frequency||'').trim(),p_effective:body.effective_on,p_reason:String(body.reason||'').trim()}))});
   case 'finalize_session': return Response.json({session:first(await rpc('demo_session_finalize',{p_tester:tester,p_session:body.session_id,p_expected_version:Number(body.expected_version)}))});
   default:return Response.json({error:'Άγνωστη ενέργεια.'},{status:400});
  }
 }catch(error){return failure(error)}
}

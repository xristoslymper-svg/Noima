import { createPatient, listPatientRows, patientBundle, rpc } from '@/lib/patients/demo-runtime';
import {isClinicalId} from '@/lib/clinical/identity';
export const dynamic='force-dynamic';
const testerOf=(value:unknown)=>isClinicalId(value)?value:'';
const first=<T,>(value:unknown):T=>Array.isArray(value)?value[0] as T:value as T;
function failure(error:unknown){
 const message=error instanceof Error?error.message:'';
 if(message.includes('event_date_conflict')||message.includes('event_after_stop_or_before_start')||message.includes('conflicting_start'))return Response.json({error:'Η αλλαγή συγκρούεται με το υπάρχον χρονολόγιο. Διορθώστε ή ακυρώστε πρώτα το σχετικό συμβάν.'},{status:409});
 if(message.includes('stale_'))return Response.json({error:'Η καταχώρηση άλλαξε σε άλλη καρτέλα. Επαναφορτώστε τα δεδομένα πριν συνεχίσετε.',code:'stale'},{status:409});
 if(message.includes('missing_sections'))return Response.json({error:'Συμπληρώστε Ψυχιατρική συνέντευξη, MSE, Κλινική εκτίμηση, Πλάνο και Επανεκτίμηση πριν την ολοκλήρωση.',code:'missing_sections'},{status:422});
 if(message.includes('risk_followup_required'))return Response.json({error:'Με θετικό αυτοκτονικό ιδεασμό χρειάζεται να αξιολογηθούν Πρόθεση, Σχέδιο, Αυτοτραυματισμός και Ιστορικό απόπειρας πριν την ολοκλήρωση.',code:'risk_followup_required'},{status:422});
 if(message.includes('risk_required'))return Response.json({error:'Χρειάζεται εκτίμηση αυτοκτονικού ιδεασμού πριν την ολοκλήρωση.',code:'risk_required'},{status:422});
 if(message.includes('invalid_medication_history'))return Response.json({error:'Ελέγξτε τις ημερομηνίες έναρξης και διακοπής της προηγούμενης αγωγής.'},{status:422});
 if(message.includes('invalid_document'))return Response.json({error:'Η δομή της καταγραφής δεν είναι έγκυρη.'},{status:422});
 if(message.includes('invalid_patient'))return Response.json({error:'Συμπληρώστε έγκυρα στοιχεία ασθενή.'},{status:400});
 if(message.includes('patient_not_found'))return Response.json({error:'Ο δοκιμαστικός ασθενής δεν βρέθηκε.',code:'not_found'},{status:404});
 return Response.json({error:'Η ενέργεια δεν αποθηκεύτηκε. Δοκιμάστε ξανά.'},{status:502});
}
export async function GET(request:Request){
 if(process.env.CLINICAL_DATA_MODE==='real')return Response.json({error:'Αυτός ο χώρος δέχεται μόνο φανταστικά δεδομένα. Η πραγματική κλινική πρόσβαση δεν έχει ενεργοποιηθεί.'},{status:403});
 const url=new URL(request.url); const tester=testerOf(url.searchParams.get('tester')); if(!tester)return Response.json({error:'Λείπει η δοκιμαστική ταυτότητα.'},{status:400});
 try{const patient=url.searchParams.get('patient');return Response.json(patient?{bundle:await patientBundle(tester,patient)}:{patients:await listPatientRows(tester)})}catch(error){return failure(error)}
}
export async function POST(request:Request){
 if(process.env.CLINICAL_DATA_MODE==='real')return Response.json({error:'Η πραγματική κλινική πρόσβαση δεν έχει ενεργοποιηθεί.'},{status:403});
 const body=await request.json().catch(()=>({})); const tester=testerOf(body.tester); if(!tester)return Response.json({error:'Λείπει η δοκιμαστική ταυτότητα.'},{status:400});
 try{

  switch(body.action){
   case 'save_document': return Response.json({section:first(await rpc('demo_session_save_document',{p_tester:tester,p_session:body.session_id,p_section:body.section_key,p_document:body.document,p_expected_version:body.expected_version??null}))});
   case 'approve_proposal': return Response.json({section:first(await rpc('demo_proposal_approve',{p_tester:tester,p_id:body.proposal_id,p_text:String(body.text||''),p_mode:body.mode,p_expected_version:body.expected_version??null}))});
   case 'addendum': return Response.json({addendum:first(await rpc('demo_addendum_create',{p_tester:tester,p_session:body.session_id,p_request:body.request_id,p_kind:body.kind,p_reason:String(body.reason||''),p_content:String(body.content||'')}))});
   case 'create_patient':{
    const firstName=String(body.first_name||'').trim(); const age=body.age===''||body.age==null?null:Number(body.age);
    if(!firstName||(age!==null&&(!Number.isInteger(age)||age<0||age>120)))return Response.json({error:'Συμπληρώστε έγκυρα βασικά στοιχεία.'},{status:400});
    return Response.json({patient:await createPatient(tester,{first_name:firstName,last_name:String(body.last_name||'').trim(),age,phone:String(body.phone||'').trim(),landline:String(body.landline||'').trim(),contact_phone:String(body.contact_phone||'').trim(),amka:String(body.amka||'').trim(),address:String(body.address||'').trim(),email:String(body.email||'').trim(),chief_complaint:String(body.chief_complaint||'').trim()})});
   }
   case 'update_patient':{
    const firstName=String(body.first_name||'').trim(); const age=body.age===''||body.age==null?null:Number(body.age);
    if(!firstName||(age!==null&&(!Number.isInteger(age)||age<0||age>120)))return Response.json({error:'Συμπληρώστε έγκυρα στοιχεία ασθενή.'},{status:400});
    return Response.json({patient:first(await rpc('demo_patient_update_v2',{p_tester:tester,p_patient:body.patient_id,p_first_name:firstName,p_last_name:String(body.last_name||'').trim(),p_age:age,p_phone:String(body.phone||'').trim(),p_landline:String(body.landline||'').trim(),p_contact_phone:String(body.contact_phone||'').trim(),p_amka:String(body.amka||'').trim(),p_address:String(body.address||'').trim(),p_email:String(body.email||'').trim(),p_complaint:String(body.chief_complaint||'').trim(),p_expected_updated_at:body.expected_updated_at||null}))});
   }
   case 'start_session': return Response.json({session:first(await rpc(body.appointment_id?'demo_calendar_start_session':'demo_session_start',body.appointment_id?{p_tester:tester,p_event:body.appointment_id}:{p_tester:tester,p_patient:body.patient_id,p_type:body.session_type}))});
   case 'save_section': return Response.json({section:first(await rpc('demo_session_save_section',{p_tester:tester,p_session:body.session_id,p_section:body.section_key,p_content:String(body.content||''),p_source:body.source||'manual',p_expected_version:body.expected_version??null}))});
   case 'save_risk': return Response.json({risk:first(await rpc('demo_session_save_risk',{p_tester:tester,p_session:body.session_id,p_risk:body.risk||{},p_expected_version:body.expected_version??null}))});
   case 'save_history': return Response.json({history:first(await rpc('demo_history_save',{p_tester:tester,p_patient:body.patient_id,p_history:body.history||{},p_expected_version:body.expected_version??null}))});
   case 'medication_history': return Response.json({medication:first(await rpc('demo_medication_record_history',{p_tester:tester,p_patient:body.patient_id,p_session:body.session_id||null,p_name:String(body.name||'').trim(),p_dose:Number(body.dose),p_unit:String(body.unit||'mg'),p_frequency:String(body.frequency||''),p_started:body.started_on,p_stopped:body.stopped_on,p_reason:String(body.reason||'')}))});
   case 'medication_start': return Response.json({medication:first(await rpc('demo_medication_start',{p_tester:tester,p_patient:body.patient_id,p_session:body.session_id||null,p_name:String(body.name||'').trim(),p_dose:Number(body.dose),p_unit:String(body.unit||'mg').trim(),p_frequency:String(body.frequency||'').trim(),p_effective:body.effective_on,p_reason:String(body.reason||'').trim()}))});
   case 'medication_event': return Response.json({medication:first(await rpc('demo_medication_event_write',{p_tester:tester,p_medication:body.medication_id,p_session:body.session_id||null,p_type:body.event_type,p_dose:body.dose??null,p_unit:body.unit??null,p_frequency:body.frequency??null,p_effective:body.effective_on,p_reason:String(body.reason||''),p_expected_version:body.expected_version,p_replace:body.replace_id||null,p_cancel:body.cancel===true}))});
   case 'medication_change': return Response.json({medication:first(await rpc('demo_medication_change',{p_tester:tester,p_medication:body.medication_id,p_session:body.session_id||null,p_dose:Number(body.dose),p_unit:String(body.unit||'mg').trim(),p_frequency:String(body.frequency||'').trim(),p_effective:body.effective_on,p_reason:String(body.reason||'').trim()}))});
   case 'medication_stop': return Response.json({medication:first(await rpc('demo_medication_stop',{p_tester:tester,p_medication:body.medication_id,p_session:body.session_id||null,p_effective:body.effective_on,p_reason:String(body.reason||'').trim()}))});
   case 'medication_side_effect_resolve': return Response.json({side_effect:first(await rpc('demo_medication_side_effect_resolve',{p_tester:tester,p_id:body.side_effect_id,p_resolved_on:body.resolved_on}))});
   case 'medication_side_effect': return Response.json({side_effect:first(await rpc('demo_medication_side_effect_add',{p_tester:tester,p_medication:body.medication_id,p_session:body.session_id||null,p_effect:String(body.effect||'').trim(),p_severity:body.severity||'moderate',p_impact:String(body.impact||'').trim(),p_noted_on:body.noted_on,p_note:String(body.note||'').trim()}))});
   case 'finalize_session': return Response.json({session:first(await rpc('demo_session_finalize',{p_tester:tester,p_session:body.session_id,p_expected_version:Number(body.expected_version)}))});
   default:return Response.json({error:'Άγνωστη ενέργεια.'},{status:400});
  }
 }catch(error){return failure(error)}
}

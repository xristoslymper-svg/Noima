import {withPilot} from '@/lib/pilot/route';
import {rpc} from '@/lib/patients/demo-runtime';
import {isClinicalId} from '@/lib/clinical/identity';
import {isCustomSection} from '@/lib/clinical/visit-layout';
export const dynamic='force-dynamic';
export const preferredRegion='fra1';
export const POST=withPilot(async request=>{
 const body=await request.json();
 if(!isClinicalId(body.tester)||!isClinicalId(body.session_id)||!isCustomSection(body.section_key)||typeof body.title!=='string'||!body.title.trim()||body.title.length>100||/[\n\r]/.test(body.title)||typeof body.content!=='string'||body.content.length>20000||!(body.expected_version===null||Number.isInteger(body.expected_version)&&body.expected_version>0))return Response.json({error:'Ελέγξτε τον τίτλο και το κείμενο της ενότητας.'},{status:400});
 try{const result=await rpc('demo_visit_custom_save',{p_tester:body.tester,p_session:body.session_id,p_section:body.section_key,p_title:body.title,p_content:body.content,p_expected_version:body.expected_version});return Response.json({section:Array.isArray(result)?result[0]:result})}
 catch(cause){const message=cause instanceof Error?cause.message:'';
 if(message.includes('stale_section'))return Response.json({error:'Η ενότητα άλλαξε σε άλλη καρτέλα. Επαναφορτώστε για σύγκριση.',code:'stale_section'},{status:409});
 if(message.includes('Could not find the function'))return Response.json({error:'Η αποθήκευση προσωπικών ενοτήτων χρειάζεται ενεργοποίηση βάσης για αυτό το preview. Το κείμενό σας διατηρείται για ανάκτηση.',code:'custom_sections_unavailable'},{status:503});
 return Response.json({error:'Η ενότητα δεν αποθηκεύτηκε. Διατηρήστε το κείμενο και δοκιμάστε ξανά.'},{status:409})}
});

import {visitBundle} from '@/lib/patients/visit-runtime';
import {isClinicalId} from '@/lib/clinical/identity';
export const dynamic='force-dynamic';
export async function GET(req:Request){
 if(process.env.CLINICAL_DATA_MODE==='real')return Response.json({error:'Ο δοκιμαστικός χώρος δεν δέχεται πραγματικά δεδομένα.'},{status:403});
 const p=new URL(req.url).searchParams,tester=p.get('tester'),patient=p.get('patient'),session=p.get('session');
 if(!isClinicalId(tester)||!patient)return Response.json({error:'Μη έγκυρη επίσκεψη.'},{status:400});
 try{return Response.json({bundle:await visitBundle(tester,patient,session||undefined)},{headers:{'Cache-Control':'no-store'}})}catch(e){const missing=e instanceof Error&&/patient_not_found|session_unavailable/.test(e.message);return Response.json({error:missing?'Η συγκεκριμένη επίσκεψη δεν είναι διαθέσιμη.':'Δεν φορτώθηκε η επίσκεψη. Δοκιμάστε ξανά.'},{status:missing?404:503})}
}

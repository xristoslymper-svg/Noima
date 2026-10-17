
import {rpc} from '@/lib/patients/demo-runtime';
import {checkIntakeIdentity,normalizeIntakeIdentity} from '@/lib/intake/demographics';
import type {IntakeIdentity} from '@/lib/intake/history';
export const dynamic='force-dynamic';
const hex=/^[a-f0-9]{64}$/;
function sameOrigin(req:Request){const origin=req.headers.get('origin');const site=req.headers.get('sec-fetch-site');return (!origin||origin===new URL(req.url).origin)&&site!=='cross-site'}
export async function POST(request:Request){
 const mode=process.env.CLINICAL_DATA_MODE?.trim().toLowerCase();
 if(mode&&!['demo','synthetic'].includes(mode))return Response.json({error:'Η πραγματική κλινική πρόσβαση δεν έχει ενεργοποιηθεί.',code:'clinical_data_disabled'},{status:403,headers:{'Cache-Control':'private, no-store'}});
 if(!sameOrigin(request))return Response.json({error:'Μη έγκυρη προέλευση.'},{status:403});
 const b=await request.json().catch(()=>({}));
 const newIdentity=b.identity;
 if(['submit','device_submit'].includes(b.action)&&newIdentity!=null){
  if(typeof newIdentity!=='object'||Array.isArray(newIdentity))return Response.json({error:'Μη έγκυρα στοιχεία ασθενή.'},{status:422});
  const issue=checkIntakeIdentity(newIdentity as Partial<IntakeIdentity>);
  if(issue)return Response.json({error:'Ελέγξτε τα βασικά στοιχεία ασθενή ('+issue+').',code:'invalid_patient_details'},{status:422});
  b.identity=normalizeIntakeIdentity(newIdentity as Partial<IntakeIdentity>);
 }

 try{
  if(b.action==='open'){if(typeof b.token!=='string'||!hex.test(b.token))return Response.json({error:'Ο σύνδεσμος δεν είναι έγκυρος.'},{status:400});return Response.json(await rpc('demo_intake_open',{p_token:b.token}),{headers:{'Cache-Control':'no-store'}})}
  if(b.action==='submit'){if(typeof b.token!=='string'||!hex.test(b.token))return Response.json({error:'Ο σύνδεσμος δεν είναι έγκυρος.'},{status:400});return Response.json(await rpc('demo_intake_submit',{p_token:b.token,p_identity:b.identity||null,p_history:b.history||null,p_psych:b.psychometrics||{}}),{headers:{'Cache-Control':'no-store'}})}
  if(b.action==='device_poll'){if(typeof b.deviceToken!=='string'||!hex.test(b.deviceToken))return Response.json({error:'Το tablet δεν είναι συνδεδεμένο.'},{status:400});return Response.json(await rpc('demo_intake_device_poll',{p_token:b.deviceToken}),{headers:{'Cache-Control':'no-store'}})}
  if(b.action==='device_submit'){if(typeof b.deviceToken!=='string'||!hex.test(b.deviceToken)||typeof b.intakeId!=='string')return Response.json({error:'Η συνεδρία tablet δεν είναι έγκυρη.'},{status:400});return Response.json(await rpc('demo_intake_device_submit',{p_device_token:b.deviceToken,p_intake:b.intakeId,p_identity:b.identity||null,p_history:b.history||null,p_psych:b.psychometrics||{}}),{headers:{'Cache-Control':'no-store'}})}
  return Response.json({error:'Μη έγκυρη ενέργεια.'},{status:400});
 }catch(e){const m=e instanceof Error?e.message:'';
  if(m.includes('intake_expired'))return Response.json({error:'Ο σύνδεσμος έχει λήξει.'},{status:410});
  if(m.includes('device_unavailable'))return Response.json({error:'Το tablet χρειάζεται νέα σύνδεση.'},{status:410});
  if(m.includes('invalid_phq9')||m.includes('invalid_gad7'))return Response.json({error:'Απαντήστε σε όλες τις ερωτήσεις του τεστ.'},{status:422});
  if(m.includes('identity_required'))return Response.json({error:'Συμπληρώστε τουλάχιστον το όνομα.'},{status:422});
  if(m.includes('invalid_amka'))return Response.json({error:'Ο ΑΜΚΑ πρέπει να έχει 11 ψηφία.'},{status:422});
  return Response.json({error:'Η συμπλήρωση δεν ολοκληρώθηκε. Δοκιμάστε ξανά.'},{status:400});
 }
}

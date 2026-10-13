import {withPilot} from '@/lib/pilot/route';
import {rpc,patientBundle} from '@/lib/patients/demo-runtime';
import {POST as sendMail} from '@/app/api/mailbox/send/route';
import {isClinicalId} from '@/lib/clinical/identity';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export const maxDuration=120;
type Receipt={kind:string;event_id?:string;status?:string;recipient?:string;invitations?:{id:string;token:string;instrument:string}[]};
async function post(req:Request){
 const b=await req.json().catch(()=>null);
 if(!b||b.confirm!==true||!isClinicalId(b.proposal_id))return Response.json({error:'Απαιτείται ρητή επιβεβαίωση συγκεκριμένης πρότασης.'},{status:400});
 try{
  const proposal=await rpc('copilot_action_get',{p_tester:b.tester,p_id:b.proposal_id}) as {patient:string;kind:string};
  await patientBundle(b.tester,proposal.patient);
  const result=await rpc('copilot_execute',{p_tester:b.tester,p_id:b.proposal_id,p_confirm:true}) as Receipt;
  if(result.kind==='calendar')return Response.json({answer:'Η αλλαγή αποθηκεύτηκε και επαληθεύτηκε στη βάση.',sources:[{label:'Ραντεβού',href:'/patients/demo/'+proposal.patient+'?appointment='+result.event_id}],status:'verified'});
  const deliveries=[];
  for(const invitation of result.invitations||[]){
   const link=new URL('/assessment',process.env.NOIMA_APP_ORIGIN||req.url).href+'#'+invitation.token;
   const headers=new Headers(req.headers);headers.set('content-type','application/json');headers.set('origin',new URL(req.url).origin);
   const response=await sendMail(new Request(new URL('/api/mailbox/send',req.url),{method:'POST',headers,body:JSON.stringify({assessment_id:invitation.id,token:invitation.token,to:result.recipient,subject:'Συμπλήρωση ερωτηματολογίου',body:'Παρακαλώ συμπληρώστε το '+invitation.instrument+' από τον προσωπικό σύνδεσμο:\n'+link+'\nΙσχύει για 14 ημέρες. Μην τον προωθείτε. Πατήστε Υποβολή στο τέλος.'})}));
   const data=await response.json();deliveries.push({instrument:invitation.instrument,status:response.ok&&data.status==='accepted'?'accepted':data.code==='unknown'?'unknown':'failed'});
  }
  return Response.json({answer:deliveries.map(d=>d.instrument+': '+(d.status==='accepted'?'έγινε δεκτό από την υπηρεσία email· η παράδοση στον παραλήπτη δεν έχει επιβεβαιωθεί.':d.status==='unknown'?'η αποστολή είναι αβέβαιη· ελέγξτε τα απεσταλμένα.':'δεν επιβεβαιώθηκε αποστολή.')).join('\n'),sources:[],deliveries,status:deliveries.every(d=>d.status==='accepted')?'accepted':'attention'});
 }catch{return Response.json({error:'Δεν επιβεβαιώθηκε ολοκλήρωση. Η πρόταση μπορεί να έληξε ή τα δεδομένα να άλλαξαν. Επαναλάβετε την ίδια επιβεβαίωση για έλεγχο, πριν δημιουργήσετε νέα πρόταση.'},{status:409})}
}
export const POST=withPilot(post);

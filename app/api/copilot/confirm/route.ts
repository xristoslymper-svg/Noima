import {withPilot} from '@/lib/pilot/route';
import {rpc,patientBundle} from '@/lib/patients/demo-runtime';
import {POST as sendMail} from '@/app/api/mailbox/send/route';
import {isClinicalId} from '@/lib/clinical/identity';
import {validEmail} from '@/lib/mail/providers';
import {manualQuestionnaireEmail} from '@/lib/mail/manual-compose';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export const maxDuration=120;
type Receipt={kind:string;event_id?:string;status?:string;recipient?:string;invitations?:{id:string;token:string;instrument:string}[]};
async function post(req:Request){
 if(!['demo','synthetic'].includes(process.env.CLINICAL_DATA_MODE||''))return Response.json({error:'Δεν έχει ενεργοποιηθεί πρόσβαση πραγματικών δεδομένων.'},{status:403});
 const b=await req.json().catch(()=>null);
 if(!b||b.confirm!==true||!isClinicalId(b.proposal_id))return Response.json({error:'Απαιτείται ρητή επιβεβαίωση συγκεκριμένης πρότασης.'},{status:400});
 try{
  const proposal=await rpc('copilot_action_get',{p_tester:b.tester,p_id:b.proposal_id}) as {patient:string;kind:string};
  const bundle=await patientBundle(b.tester,proposal.patient);
  const result=await rpc('copilot_execute',{p_tester:b.tester,p_id:b.proposal_id,p_confirm:true}) as Receipt;
  if(result.kind==='calendar')return Response.json({answer:'Η αλλαγή αποθηκεύτηκε και επαληθεύτηκε στη βάση.',sources:[{label:'Ραντεβού',href:'/patients/demo/'+proposal.patient+'?appointment='+result.event_id}],status:'verified'});
  if(result.kind!=='questionnaires'||!validEmail(result.recipient)||bundle.patient.email!==result.recipient||
   !Array.isArray(result.invitations)||result.invitations.length<1||result.invitations.length>2||
   result.invitations.some(i=>!isClinicalId(i.id)||!['PHQ-9','GAD-7'].includes(i.instrument)||!/^[a-f0-9]{64}$/.test(i.token)))
   throw new Error('invalid_invitation_receipt');
  const deliveries:{instrument:string;status:'accepted'|'unknown'|'failed'|'manual'}[]=[];
  const manualLinks:string[]=[];
  let manualRequired=false;
  for(const invitation of result.invitations){
   const link=new URL('/assessment',process.env.NOIMA_APP_ORIGIN||req.url).href+'#'+invitation.token;
   // A missing or disconnected mailbox is a user-operated compose flow, never a sent email.
   // Do not keep trying the mailbox for the remaining instruments after "connect".
   if(manualRequired){manualLinks.push(link);deliveries.push({instrument:invitation.instrument,status:'manual'});continue}
   const headers=new Headers(req.headers);headers.set('content-type','application/json');headers.set('origin',new URL(req.url).origin);
   const response=await sendMail(new Request(new URL('/api/mailbox/send',req.url),{method:'POST',headers,body:JSON.stringify({assessment_id:invitation.id,token:invitation.token,to:result.recipient,subject:'Συμπλήρωση φόρμας',body:'Καλησπέρα σας,\\n\\nΤο ιατρείο σας προσκαλεί να συμπληρώσετε μία φόρμα από τον προσωπικό σύνδεσμο:\\n'+link+'\\n\\nΟ σύνδεσμος ισχύει για 14 ημέρες. Δεν χρειάζεται λογαριασμός. Πατήστε «Υποβολή» στο τέλος. Μην προωθείτε τον σύνδεσμο.'})}));
   const data=await response.json();
   if(!response.ok&&data.code==='connect'){
    manualRequired=true;manualLinks.push(link);deliveries.push({instrument:invitation.instrument,status:'manual'});continue;
   }
   deliveries.push({instrument:invitation.instrument,status:response.ok&&data.status==='accepted'?'accepted':data.code==='unknown'?'unknown':'failed'});
  }
  const compose=manualLinks.length?manualQuestionnaireEmail(result.recipient,manualLinks):undefined;
  const answer=deliveries.map(d=>d.instrument+': '+(
   d.status==='accepted'?'έγινε δεκτό από την υπηρεσία email· η παράδοση στον παραλήπτη δεν έχει επιβεβαιωθεί.':
   d.status==='unknown'?'η αποστολή είναι αβέβαιη· ελέγξτε τα απεσταλμένα.':
   d.status==='manual'?'η πρόσκληση δημιουργήθηκε, αλλά δεν έχει σταλεί email. Ανοίξτε το έτοιμο μήνυμα και πατήστε «Αποστολή».':
   'δεν επιβεβαιώθηκε αποστολή.')).join('\\n');
  return Response.json({answer,sources:[],deliveries,...(compose?{compose}:{}),status:compose?'manual':deliveries.every(d=>d.status==='accepted')?'accepted':'attention'});
 }catch{return Response.json({error:'Δεν επιβεβαιώθηκε ολοκλήρωση. Η πρόταση μπορεί να έληξε ή τα δεδομένα να άλλαξαν. Επαναλάβετε την ίδια επιβεβαίωση για έλεγχο, πριν δημιουργήσετε νέα πρόταση.'},{status:409})}
}
export const POST=withPilot(post);

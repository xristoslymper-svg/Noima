import {withPilot} from '@/lib/pilot/route';
import {seal,unseal} from '@/lib/mail/crypto';
import {syntheticPreviewEnabled,syntheticPatient} from '@/lib/copilot/preview';
import {syntheticAnswer,answerStream,type FastMemory} from '@/lib/copilot/fast';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export const maxDuration=45;
async function post(req:Request){
 if(!syntheticPreviewEnabled())return Response.json({error:'Η δοκιμή δεν είναι διαθέσιμη εδώ.'},{status:404});
 const b=await req.json().catch(()=>null);
 if(!b||typeof b.query!=='string'||b.query.trim().length<3||b.query.length>1500||
  Object.keys(b).some(k=>!['query','conversation','tester'].includes(k))||
  (b.conversation!==undefined&&(typeof b.conversation!=='string'||b.conversation.length>20000)))
  return Response.json({error:'Γράψτε ερώτηση έως 1500 χαρακτήρες για τον συνθετικό φάκελο.'},{status:400});
 try{
  const owner='synthetic-copilot:'+b.tester;
  seal({probe:true},owner);
  const bundle=syntheticPatient();
  let memory:FastMemory|null=b.conversation?unseal<FastMemory>(b.conversation,owner):null;
  if(memory&&(memory.expires<Date.now()||memory.patient_id!==bundle.patient.id))memory=null;
  const abort=new AbortController();
  req.signal.addEventListener('abort',()=>abort.abort(),{once:true});
  return answerStream(syntheticAnswer(b.query,memory,abort.signal),{
   patient:{id:bundle.patient.id,first_name:bundle.patient.first_name,last_name:bundle.patient.last_name},sources:[],synthetic:true
  },answer=>({conversation:seal({patient_id:bundle.patient.id,question:b.query,answer,expires:Date.now()+30*60000},owner)}),abort);
 }catch{
  return Response.json({error:'Δεν ξεκίνησε η δοκιμή. Ξεκινήστε νέα συζήτηση και δοκιμάστε ξανά.'},{status:503});
 }
}
export const POST=withPilot(post);

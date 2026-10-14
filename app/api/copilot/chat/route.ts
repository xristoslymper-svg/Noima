import {withPilot} from '@/lib/pilot/route';
import {patientBundle,request} from '@/lib/patients/demo-runtime';
import {isClinicalId} from '@/lib/clinical/identity';
import {normalizedName,type SearchPatient} from '@/lib/overview/record-search';
import {seal,unseal} from '@/lib/mail/crypto';
import {assertCopilotPrivacy} from '@/lib/copilot/provider';
import {fastAnswer,answerStream,type FastMemory} from '@/lib/copilot/fast';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export const maxDuration=45;
async function post(req:Request){
 const b=await req.json().catch(()=>null);
 if(!b||typeof b.query!=='string'||b.query.trim().length<3||b.query.length>1500||
  (b.patient_id!==undefined&&(!isClinicalId(b.patient_id)))||
  (b.conversation!==undefined&&(typeof b.conversation!=='string'||b.conversation.length>20000)))
  return Response.json({error:'Μη έγκυρη ερώτηση ή επιλογή ασθενούς.'},{status:400});
 try{
  assertCopilotPrivacy();seal({probe:true},'copilot-chat:'+b.tester);
  let memory:FastMemory|null=b.conversation?unseal<FastMemory>(b.conversation,'copilot-chat:'+b.tester):null;
  if(memory&&memory.expires<Date.now())memory=null;
  const roster=await request('demo_patients?select=id,first_name,last_name&tester_id=eq.'+encodeURIComponent(b.tester)) as SearchPatient[];
  // Explicit UI selection only; never let a model choose authorization scope.
  const id=b.patient_id||memory?.patient_id;
  if(!id){
   const words=new Set(normalizedName(b.query).split(/\s+/));
   const found=roster.filter(p=>normalizedName(p.first_name+' '+p.last_name).split(/\s+/).some(w=>w.length>=3&&words.has(w)));
   return Response.json({answer:'Επίλεξε τον ασθενή για αυτή τη συζήτηση. Μπορείς επίσης να ανοίξεις την καρτέλα του.',choices:(found.length?found:roster).slice(0,12),sources:[]});
  }
  const patient=roster.find(p=>p.id===id);
  if(!patient)return Response.json({error:'Ο φάκελος δεν είναι διαθέσιμος.'},{status:404});
  if(memory?.patient_id!==id)memory=null;
  const bundle=await patientBundle(b.tester,id);
  const controller=new AbortController();
  req.signal.addEventListener('abort',()=>controller.abort(),{once:true});
  return answerStream(fastAnswer(bundle,b.query,memory,controller.signal),{patient,sources:[],snapshot_at:new Date().toISOString()},answer=>({
   conversation:seal({patient_id:id,question:b.query,answer,expires:Date.now()+30*60000},'copilot-chat:'+b.tester)
  }),controller);
 }catch{
  return Response.json({error:'Η συζήτηση δεν είναι διαθέσιμη. Ελέγξτε τη σύνδεση και τη ρύθμιση AI του χώρου.'},{status:503});
 }
}
export const POST=withPilot(post);

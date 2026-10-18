import {withPilot} from '@/lib/pilot/route';
import {patientBundle,request,rpc} from '@/lib/patients/demo-runtime';
import {isClinicalId} from '@/lib/clinical/identity';
import {matchPatients,normalizedName,recordAnswer,type SearchPatient} from '@/lib/overview/record-search';
import {seal,unseal} from '@/lib/mail/crypto';
import {assertCopilotPrivacy,type Usage} from '@/lib/copilot/provider';
import {understand,synthesize,resolveMedication,type Memory,type Cache} from '@/lib/copilot/clinical';
import {prepareAction} from '@/lib/copilot/actions';
import {summaryContextHash} from '@/lib/clinical/summary-context';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export const maxDuration=180;
const messages:Record<string,string>={
 copilot_privacy_disabled:'Η πρόσβαση AI δεν έχει εγκριθεί για αυτόν τον χώρο. Απαιτείται ρητή ρύθμιση φανταστικών δεδομένων.',
 copilot_provider_unconfigured:'Δεν έχει ρυθμιστεί διαθέσιμο μοντέλο για τον Βοηθό Ψ.',
 copilot_recipient_missing:'Δεν υπάρχει έγκυρο email στον φάκελο. Ελέγξτε τα στοιχεία ασθενούς.',
 copilot_mailbox_missing:'Συνδέστε πρώτα το email αποστολής στον λογαριασμό.',
 copilot_invitation_pending:'Υπάρχει ήδη ενεργή πρόσκληση. Ελέγξτε την πριν δημιουργήσετε νέα.',
 copilot_calendar_conflict:'Η ώρα συμπίπτει με άλλο ραντεβού. Επιλέξτε διαφορετική ώρα.',
 copilot_no_evidence:'Δεν υπάρχουν διαθέσιμες καταγραφές για να απαντήσω σε αυτή την ερώτηση.',
 copilot_context_limit:'Το σχετικό αρχείο υπερβαίνει το ασφαλές όριο σύνθεσης. Δεν παραλείφθηκαν σιωπηρά παλαιότερες καταγραφές.',
 copilot_stale:'Ο φάκελος άλλαξε κατά την επεξεργασία. Επαναλάβετε την ερώτηση.',
};
async function post(req:Request){
 const b=await req.json().catch(()=>null),started=Date.now();
 if(!b||typeof b.query!=='string'||b.query.trim().length<3||b.query.length>1500||(b.patient_id!==undefined&&!isClinicalId(b.patient_id))||b.conversation&&typeof b.conversation!=='string')return Response.json({error:'Γράψτε ερώτηση έως 1500 χαρακτήρες.'},{status:400});
 const usage:Usage={calls:0,input_tokens:0,output_tokens:0};
 try{
  assertCopilotPrivacy();
  // Validate encryption configuration before any provider call.
  seal({probe:true},'copilot:'+b.tester);
  let memory:Memory|null=null;
  if(b.conversation){if(b.conversation.length>20000)throw new Error('invalid_context');memory=unseal<Memory>(b.conversation,'copilot:'+b.tester);if(memory.expires<Date.now())memory=null;}
  const roster=await request('demo_patients?select=id,first_name,last_name&tester_id=eq.'+encodeURIComponent(b.tester)) as SearchPatient[];
  const selected=b.patient_id?roster.find(p=>p.id===b.patient_id):undefined;
  if(b.patient_id&&!selected)return Response.json({error:'Ο φάκελος δεν είναι διαθέσιμος.'},{status:404});
  // The authenticated roster authorizes scope; model output never selects it.
  if(selected&&memory?.patient_id!==selected.id)memory={patient_id:selected.id,medication_ids:[],focus_medication_id:null,after:null,question:'',expires:0};
  const intent=await understand(b.query,memory,usage);
  if(intent.tool==='clarify')return Response.json({patient:selected,answer:intent.clarification||'Διευκρινίστε την ερώτηση. Ο βοηθός δεν συνταγογραφεί ούτε μεταβάλλει κλινικές καταγραφές.',sources:[]});
  let matches=intent.patient_name?matchPatients(roster,intent.patient_name):selected?[selected]:intent.use_current_patient&&memory?roster.filter(p=>p.id===memory!.patient_id):[];
  if(intent.patient_name){
   const words=normalizedName(b.query).split(/\s+/);
   const present=normalizedName(intent.patient_name).split(/\s+/).every(term=>words.some(word=>matchPatients([{id:'',first_name:term,last_name:''}],word).length));
   if(!present)matches=[];
   else if(selected){
    if(!matches.some(p=>p.id===selected.id))return Response.json({patient:selected,answer:'Η ενέργεια αφορά διαφορετικό ασθενή από τον ανοιχτό φάκελο. Άνοιξε πρώτα τη σωστή καρτέλα.',sources:[]});
    matches=[selected];
   }
  }
  if(b.choice_id){if(!isClinicalId(b.choice_id)||!matches.some(p=>p.id===b.choice_id))return Response.json({error:'Η επιλογή δεν αντιστοιχεί στην ερώτηση.'},{status:400});matches=matches.filter(p=>p.id===b.choice_id);}
  if(matches.length!==1)return Response.json({answer:matches.length?'Επίλεξε τον σωστό ασθενή.':'Για ποιον ασθενή; Γράψε το πλήρες καταγεγραμμένο όνομα.',choices:matches.slice(0,12),sources:[]});
  const patient=matches[0],bundle=await patientBundle(b.tester,patient.id);
  if(!memory||memory.patient_id!==patient.id)memory={patient_id:patient.id,medication_ids:[],focus_medication_id:null,after:null,question:'',expires:0};
  let result:Record<string,unknown>;
  if(intent.tool==='calendar'||intent.tool==='questionnaires'){
   result=await prepareAction(b.tester,bundle,b.query,intent.tool,usage);
  }else if(['medications','last_visit','next_appointment'].includes(intent.tool)){
   result=recordAnswer(bundle,intent.tool as 'medications'|'last_visit'|'next_appointment');
   if(intent.tool==='medications')memory.medication_ids=bundle.medications.filter(m=>m.status==='active').map(m=>m.id);
  }else if(intent.tool==='medication_start'){
   const med=resolveMedication(bundle,memory,intent);
   if(!med)result={answer:'Δεν είναι σαφές ποια αγωγή εννοείς. Ζήτησε την τρέχουσα αγωγή και επίλεξε συγκεκριμένο φάρμακο.',sources:[]};
   else{memory.focus_medication_id=med.id;memory.after=med.started_at;result={answer:med.medication_name+' · καταγεγραμμένη έναρξη '+med.started_at+'.',sources:[{label:med.medication_name+' · έναρξη',href:'/patients/demo/'+patient.id+'?tab=medications'}]};}
  }else if(intent.tool==='tasks'){
   const rows=await rpc('demo_task_list',{p_tester:b.tester});
   const tasks=(Array.isArray(rows)?rows:[]).filter(t=>t.patient_id===patient.id&&t.status==='open');
   result={answer:tasks.length?'Ανοιχτές εκκρεμότητες:':'Δεν υπάρχουν καταγεγραμμένες ανοιχτές εκκρεμότητες.',blocks:tasks.map(t=>({title:'Εκκρεμότητα',text:t.title+(t.due_at?' · '+t.due_at:''),sources:[{label:'Καταγραφή',href:'/patients/demo/'+patient.id+(t.source_session_id?'?tab=record&session='+t.source_session_id:'')}]})),sources:[]};
  }else if(intent.tool==='psychometrics'){
   const values=bundle.assessments.filter(a=>a.status==='completed').sort((a,b)=>(b.completed_at||b.created_at).localeCompare(a.completed_at||a.created_at));
   result={answer:values.length?'Καταγεγραμμένες ψυχομετρικές μετρήσεις (νεότερη πρώτη):':'Δεν υπάρχουν ολοκληρωμένες μετρήσεις. Αυτό δεν αποτελεί αρνητικό εύρημα.',blocks:values.map(a=>({title:a.instrument,text:String(a.score??'Μη καταγεγραμμένη βαθμολογία')+' · '+(a.completed_at||a.created_at).slice(0,10),sources:[{label:a.instrument,href:'/patients/demo/'+patient.id+'?tab=psychometrics&assessment='+a.id}]})),sources:[]};
  }else{
   if(intent.medication_number){const med=resolveMedication(bundle,memory,intent);if(!med)return Response.json({patient,answer:'Ποια συγκεκριμένη αγωγή εννοείς;',sources:[]});memory.focus_medication_id=med.id;memory.after=med.started_at;}
   let cache:Cache|null=null;
   try{const rows=await request('demo_clinical_summary_cache?select=context_hash,policy_version,findings&tester_id=eq.'+encodeURIComponent(b.tester)+'&patient_id=eq.'+patient.id+'&limit=1');cache=Array.isArray(rows)?rows[0]||null:null}catch{/* Primary evidence remains authoritative. */}
   result=await synthesize(bundle,intent.question,intent.after_focus?memory.after:null,cache,usage);
   if(await summaryContextHash(await patientBundle(b.tester,patient.id))!==result.snapshot)throw new Error('copilot_stale');
  }
  memory.question=intent.question;memory.expires=Date.now()+30*60000;
  return Response.json({...result,patient,conversation:seal(memory,'copilot:'+b.tester),usage:{...usage,elapsed_ms:Date.now()-started}});
 }catch(e){
  const code=e instanceof Error?e.message:'copilot_failed';
  // Fixed error codes only: no questions, provider payloads, names or clinical text.
  const safe=Object.hasOwn(messages,code)?code:'copilot_failed';
  return Response.json({error:messages[safe]||'Η επεξεργασία δεν ολοκληρώθηκε. Δοκιμάστε ξανά.',code:safe},{status:safe==='copilot_privacy_disabled'?403:503});
 }
}
export const POST=withPilot(post);

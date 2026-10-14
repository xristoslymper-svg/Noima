import {maskProviderPayload} from '../clinical/text-masking.ts';
import type {PatientBundle} from '../patients/demo-runtime';
import {clinicalInput,clinicalInstructions} from './clinical.ts';
import {assertCopilotPrivacy,COPILOT_CONTEXT_LIMIT,type Usage} from './provider.ts';
import {syntheticPreviewEnabled,syntheticPatient} from './preview.ts';
import {sseData} from './stream.ts';

export type FastMemory={patient_id:string;question:string;answer:string;expires:number};
export type FastEvent={type:'delta';text:string}|{type:'done';answer:string;usage:Usage;first_text_ms:number;elapsed_ms:number;snapshot:string};
export async function* fastAnswer(bundle:PatientBundle,question:string,previous:FastMemory|null,signal?:AbortSignal):AsyncGenerator<FastEvent>{
 assertCopilotPrivacy(process.env.OPENAI_COPILOT_FAST_MODEL);
 yield* generateFastAnswer(bundle,question,previous,signal);
}
// This entry point accepts no caller-supplied chart and never reads a patient DB.
export async function* syntheticAnswer(question:string,previous:FastMemory|null,signal?:AbortSignal):AsyncGenerator<FastEvent>{
 if(!syntheticPreviewEnabled()||!process.env.OPENAI_API_KEY||!process.env.OPENAI_COPILOT_FAST_MODEL)throw new Error('synthetic_preview_disabled');
 yield* generateFastAnswer(syntheticPatient(),question,previous,signal);
}
async function* generateFastAnswer(bundle:PatientBundle,question:string,previous:FastMemory|null,signal?:AbortSignal):AsyncGenerator<FastEvent>{
 const started=performance.now(),usage:Usage={calls:0,input_tokens:0,output_tokens:0};
 // No model selector, summary generator or reviewer in this path.
 const context=await clinicalInput(bundle,question,null,null,usage,false);
 const visits=bundle.sessions.filter(v=>v.status==='completed').sort((a,b)=>b.started_at.localeCompare(a.started_at));
 const medicationTimeline=bundle.medications.map(m=>({
  medication:m.medication_name,
  listing:{status:m.status,dose:m.dose,unit:m.unit,medication_started_on:m.started_at,
   note:'Η ημερομηνία έναρξης αφορά το φάρμακο συνολικά, όχι υποχρεωτικά τη σημερινή δόση.'},
  dated_events:bundle.medicationEvents.filter(e=>e.medication_id===m.id).sort((a,b)=>(a.effective_on||a.created_at).localeCompare(b.effective_on||b.created_at)).map(e=>({date:e.effective_on||e.created_at,type:e.event_type,state:e.new_state}))
 }));
 const input={...(context.input as Record<string,unknown>),
  encounter_dates:{latest_completed:visits[0]?.started_at||null,previous_completed:visits[1]?.started_at||null},
  medication_timeline:medicationTimeline,previous:previous?.patient_id===bundle.patient.id?{question:previous.question,answer:previous.answer}:null,current_question:question};
 const encoded=JSON.stringify(maskProviderPayload(input,bundle.patient,bundle));
 if(encoded.length>COPILOT_CONTEXT_LIMIT)throw new Error('copilot_context_limit');
 const abort=AbortSignal.any([AbortSignal.timeout(30000),...(signal?[signal]:[])]);
 const model=process.env.OPENAI_COPILOT_FAST_MODEL;
 if(!model)throw new Error('copilot_provider_unconfigured');
 const response=await fetch((process.env.OPENAI_BASE_URL||'https://api.openai.com/v1')+'/responses',{
  method:'POST',signal:abort,headers:{Authorization:'Bearer '+process.env.OPENAI_API_KEY,'Content-Type':'application/json'},
  body:JSON.stringify({model,store:false,stream:true,reasoning:{effort:'none'},max_output_tokens:1000,
   instructions:clinicalInstructions+'\nΣυνήθως απάντησε σε 2–4 προτάσεις, έως περίπου 120 λέξεις. Δώσε περισσότερα μόνο αν ζητήθηκε. Η προηγούμενη απάντηση βοηθά μόνο στην κατανόηση της συνέχειας, δεν αποτελεί νέα τεκμηρίωση. Η συζήτηση αφορά αποκλειστικά τον επιλεγμένο φάκελο. Για άλλον ασθενή ζήτησε αλλαγή καρτέλας. Απάντησε μόνο στο ζητούμενο· μην επεκτείνεσαι σε άσχετα γεγονότα. Κάθε ημερομηνία ανήκει μόνο στη δική της καταγραφή. Η πτώση σκορ περιγράφεται ως μεταβολή σκορ, όχι από μόνη της ως συνολική κλινική βελτίωση. Η επιλογή «Ενέργεια» υποστηρίζει μόνο ραντεβού και αποστολή ερωτηματολογίων. Αλλαγή αγωγής, νέα διάγνωση ή οριστικοποίηση σημειώσεων δεν υποστηρίζονται σε κανέναν τρόπο χρήσης· εξήγησέ το χωρίς υπόσχεση εκτέλεσης.',
   input:encoded})});
 usage.calls++;
 if(!response.ok||!response.body)throw new Error('copilot_provider_failed');
 let answer='',firstText=0,completed=false;
 for await(const raw of sseData(response.body)){
  if(raw==='[DONE]')continue;
  const event=JSON.parse(raw);
  if(event.type==='response.output_text.delta'&&typeof event.delta==='string'){
   if(event.delta.trim()&&!firstText)firstText=Math.round(performance.now()-started);
   answer+=event.delta;yield {type:'delta',text:event.delta};
  }else if(event.type==='response.completed'){
   if(event.response?.status!=='completed')throw new Error('copilot_incomplete_output');
   usage.input_tokens=event.response.usage?.input_tokens||0;usage.output_tokens=event.response.usage?.output_tokens||0;
   completed=true;break;
  }else if(['error','response.failed','response.incomplete'].includes(event.type))throw new Error('copilot_incomplete_output');
 }
 if(!completed||!answer.trim())throw new Error('copilot_stream_interrupted');
 yield {type:'done',answer,usage,first_text_ms:firstText,elapsed_ms:Math.round(performance.now()-started),snapshot:context.snapshot};
}
export function answerStream(events:AsyncIterable<FastEvent>,meta:Record<string,unknown>,finish:(answer:string)=>Record<string,unknown>,abort:AbortController){
 const encoder=new TextEncoder();let cancelled=false;
 return new Response(new ReadableStream<Uint8Array>({
  async start(controller){
   const send=(value:unknown)=>{if(!cancelled)controller.enqueue(encoder.encode('data: '+JSON.stringify(value)+'\n\n'))};
   try{
    send({type:'meta',...meta});
    for await(const event of events)send(event.type==='done'?{...event,...finish(event.answer)}:event);
   }catch{send({type:'error',error:'Η απάντηση διακόπηκε. Το μερικό κείμενο δεν είναι ολοκληρωμένη απάντηση. Δοκιμάστε ξανά.'});}
   finally{if(!cancelled)controller.close();}
  },
  cancel(){cancelled=true;abort.abort();}
 }),{headers:{'Content-Type':'text/event-stream; charset=utf-8','Cache-Control':'private, no-store, no-transform','X-Accel-Buffering':'no'}});
}

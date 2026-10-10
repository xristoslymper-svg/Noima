import {withPilot} from '@/lib/pilot/route';
import {request,type DemoSession} from '@/lib/patients/demo-runtime';
import {isClinicalId} from '@/lib/clinical/identity';
import {eligibleWritingField,polishingInstructions} from '@/lib/clinical/writing-policy';
export const runtime='nodejs';export const dynamic='force-dynamic';
async function handlePOST(req:Request){
 const b=await req.json().catch(()=>({}));
 if(!isClinicalId(b.session_id)||!eligibleWritingField(b.section,b.field_key)||typeof b.text!=='string'||b.text.trim().length<2||b.text.length>20000)return Response.json({error:'Το πεδίο δεν είναι διαθέσιμο για βελτίωση διατύπωσης.'},{status:400});
 const sessions=await request(`demo_sessions?select=id,status,session_type&tester_id=eq.${encodeURIComponent(b.tester)}&id=eq.${b.session_id}`) as DemoSession[];
 if(!sessions.some(s=>s.status==='draft'&&(b.section!=='closure'||s.session_type==='follow_up')))return Response.json({error:'Η επίσκεψη δεν είναι διαθέσιμη για επεξεργασία.'},{status:404});
 const key=process.env.OPENAI_API_KEY;if(!key)return Response.json({error:'Η υπηρεσία AI δεν είναι διαθέσιμη. Το αρχικό κείμενο διατηρείται.'},{status:503});
 const model=process.env.OPENAI_CLINICAL_MODEL||'gpt-6-luna';
 try{const r=await fetch(`${process.env.OPENAI_BASE_URL||'https://api.openai.com/v1'}/responses`,{method:'POST',signal:AbortSignal.timeout(45000),headers:{Authorization:`Bearer ${key}`,'Content-Type':'application/json'},body:JSON.stringify({model,reasoning:{effort:'none'},store:false,instructions:polishingInstructions,input:b.text,text:{format:{type:'json_schema',name:'clinical_wording',strict:true,schema:{type:'object',properties:{text:{type:'string'}},required:['text'],additionalProperties:false}}}})});
  if(!r.ok)throw new Error('provider');const payload=await r.json();const raw=payload.output?.flatMap((item:{content?:{type:string;text?:string}[]})=>item.content||[]).find((item:{type:string})=>item.type==='output_text')?.text;const result=raw&&JSON.parse(raw);
  if(typeof result?.text!=='string'||!result.text.trim()||result.text.length>20000)throw new Error('invalid');return Response.json({text:result.text,model});
 }catch{return Response.json({error:'Δεν δημιουργήθηκε πρόταση. Το αρχικό κείμενο διατηρείται για νέα προσπάθεια.'},{status:502})}
}
export const POST=withPilot(handlePOST);

import {submitClinicalEntry} from "@/lib/clinical/demo-clinical";
export const runtime="nodejs"; export const dynamic="force-dynamic";
function outputText(p:any){for(const i of p?.output||[])for(const c of i?.content||[])if(c?.type==="output_text")return c.text;return null}
const labels:Record<string,string>={interview:"Ψυχιατρική συνέντευξη / συμπτώματα",effects:"Παρενέργειες",adherence:"Συμμόρφωση",mse:"MSE",risk:"Εκτίμηση κινδύνου",assessment:"Διάγνωση & κλινική εκτίμηση",plan:"Θεραπευτικό πλάνο",review:"Επόμενη επανεκτίμηση"};
export async function POST(req:Request){
 const key=process.env.OPENAI_API_KEY;if(!key)return Response.json({error:"Η υπηρεσία AI δεν είναι ρυθμισμένη."},{status:503});
 const b=await req.json().catch(()=>({}));const section=typeof b.section==="string"?b.section:"";const transcript=typeof b.transcript==="string"?b.transcript.trim():"";
 if(!labels[section]||!transcript)return Response.json({error:"Λείπει η ενότητα ή η μεταγραφή."},{status:400});
 const schema={type:"object",properties:{clinical_text:{type:"string"},facts:{type:"array",items:{type:"object",properties:{label:{type:"string"},value:{type:"string"}},required:["label","value"],additionalProperties:false}}},required:["clinical_text","facts"],additionalProperties:false};
 const prompt=`You structure clinician-authored psychiatric dictation. Section: ${labels[section]}. Preserve meaning, negations, uncertainty, medication names/doses and time references. Do not diagnose, infer, recommend, or add facts. Write concise Greek clinical prose in clinical_text and extract only explicitly stated facts. Transcript: ${transcript}`;
 const r=await fetch("https://api.openai.com/v1/responses",{method:"POST",headers:{Authorization:`Bearer ${key}`,"Content-Type":"application/json"},body:JSON.stringify({model:"gpt-6-luna",reasoning:{effort:"none"},store:false,input:prompt,text:{format:{type:"json_schema",name:"clinical_section",strict:true,schema}}})});
 if(!r.ok)return Response.json({error:"Δεν δημιουργήθηκε κλινική πρόταση."},{status:502});
 const raw=outputText(await r.json());if(!raw)return Response.json({error:"Δεν δημιουργήθηκε κλινική πρόταση."},{status:502});
 const proposal=JSON.parse(raw);try{const entry=await submitClinicalEntry(section,transcript,proposal);return Response.json({entry});}catch{return Response.json({error:"Η πρόταση δημιουργήθηκε αλλά δεν αποθηκεύτηκε."},{status:502})}
}
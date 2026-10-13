import {writeFile,mkdir} from 'node:fs/promises';
import {copilotPatients,greekQuestions} from '../fixtures/copilot.mjs';
import {synthesize,understand} from '../../lib/copilot/clinical.ts';
await mkdir('evaluation',{recursive:true});
const report={mode:'live',model:process.env.OPENAI_COPILOT_MODEL||null,results:[],status:'not_run',usage:{calls:0,input_tokens:0,output_tokens:0}};
if(process.env.COPILOT_EVAL_APPROVED!=='true'||!process.env.OPENAI_API_KEY||!process.env.OPENAI_COPILOT_MODEL){report.reason='Approved synthetic test-provider configuration unavailable';}
else{
 Object.assign(process.env,{CLINICAL_DATA_MODE:'synthetic',COPILOT_SYNTHETIC_APPROVED:'true',EXTERNAL_AI_ENABLED:'true'});
 const patients=copilotPatients();
 for(let i=0;i<patients.length;i++){
  const start=performance.now(),u={calls:0,input_tokens:0,output_tokens:0};
  try{const answer=await synthesize(patients[i],'Πώς εξελίχθηκε η κατάσταση, τι άλλαξε από την προηγούμενη επίσκεψη και ποια παλαιότερα στοιχεία είναι σημαντικά;',null,null,u);
   report.results.push({patient:i,status:'grounding_verified',latency_ms:Math.round(performance.now()-start),answer});
  }catch(e){report.results.push({patient:i,status:'failed',error:e.message})}
  for(const key of Object.keys(u))report.usage[key]+=u[key];
 }
 for(const question of greekQuestions){
  const u={calls:0,input_tokens:0,output_tokens:0};
  try{const intent=await understand(question,null,u);report.results.push({question,intent})}catch(e){report.results.push({question,status:'failed',error:e.message})}
  for(const key of Object.keys(u))report.usage[key]+=u[key];
 }
 report.status=report.results.some(r=>r.status==='failed')?'failed':'completed';
 report.cost='Not estimated: account/model pricing has not been supplied.';
}
await writeFile('evaluation/copilot-live.json',JSON.stringify(report,null,2));
console.log(JSON.stringify({status:report.status,reason:report.reason,usage:report.usage}));
if(report.status==='failed')process.exitCode=1;

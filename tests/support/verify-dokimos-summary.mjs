// Explicit opt-in live provider check of the fictional chart, outside auth/UI.
// No credentials or clinical writes appear in its output.
import fs from 'node:fs/promises';
import vm from 'node:vm';
import ts from 'typescript';
import nextEnv from '@next/env';
import * as context from '../../lib/clinical/summary-context.ts';
import {isClinicalId} from '../../lib/clinical/identity.ts';
nextEnv.loadEnvConfig(process.cwd());
if(!process.env.OPENAI_API_KEY||process.env.OPENAI_API_KEY==='[SENSITIVE]')throw Error('Local provider key required');
const bundle=JSON.parse(await fs.readFile('../dokimos-summary-fixed.json','utf8'));
const module={exports:{}};const provider=[];const adversarial=process.argv.includes('--adversarial');
const generated=adversarial?JSON.parse(await fs.readFile('../../outputs/dokimos-summary-live.json','utf8')).data.findings.filter(f=>f.origin==='synthesis').map(({text,source_ids})=>({text,source_ids})):null;
if(generated){
 generated[0].text='Επιβεβαιωμένη διπολική διαταραχή τύπου Ι με μανιακά επεισόδια.';
 generated[1].text='Δεν υπήρξε επεισόδιο θυμού ή ρίψη αντικειμένων προς τον τοίχο.';
 generated[2].text='Η Escitalopram έχει διακοπεί και δεν λαμβάνει πλέον αγωγή.';
}
const code=ts.transpileModule(await fs.readFile('app/api/clinical/summary/route.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
vm.runInNewContext(code,{module,exports:module.exports,Error,Response,AbortSignal,process,console:{error:()=>{}},fetch:async(url,options)=>{
 const request=JSON.parse(options.body);
 if(generated&&request.text.format.name==='clinical_evidence')return Response.json({output:[{content:[{type:'output_text',text:JSON.stringify({findings:generated})}]}]});
 const r=await fetch(url,options);const payload=await r.clone().json();
 provider.push({status:r.status,format:request.text.format.name,output:payload.output,status_detail:payload.status,error:payload.error?{code:payload.error.code,type:payload.error.type,message:payload.error.message}:undefined});return r;
},require:id=>id.includes('pilot/route')?{withPilot:h=>h}:id.includes('demo-runtime')?{patientBundle:async()=>bundle}:id.includes('identity')?{isClinicalId}:context});
const before=JSON.stringify(bundle),start=Date.now();
const r=await module.exports.POST(new Request('http://localhost/api/clinical/summary',{method:'POST',body:JSON.stringify({tester:bundle.patient.tester_id,patient_id:bundle.patient.id})}));
const data=await r.json();
const result={status:r.status,elapsed_ms:Date.now()-start,canonical_unchanged:JSON.stringify(bundle)===before,data,provider};
await fs.writeFile(adversarial?'../../outputs/dokimos-summary-grounding-rejection.json':'../../outputs/dokimos-summary-live.json',JSON.stringify(result,null,2));
console.log(JSON.stringify({status:r.status,mode:data.mode,reason:data.reason,model:data.model,provider:provider.map(p=>({status:p.status,format:p.format,error:p.error})),unchanged:result.canonical_unchanged,findings:data.findings?.map(f=>({text:f.text,sources:f.source_ids,origin:f.origin,attention:f.attention})),elapsed_ms:result.elapsed_ms},null,2));
if(r.status!==200||(adversarial?data.mode!=='canonical'||data.reason!=='grounding_not_verified':data.mode!=='synthesis')||!result.canonical_unchanged)process.exitCode=1;

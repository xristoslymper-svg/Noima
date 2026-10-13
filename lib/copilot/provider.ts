export type Usage={input_tokens:number;output_tokens:number;calls:number};
export function assertCopilotPrivacy(){
 const mode=process.env.CLINICAL_DATA_MODE?.trim().toLowerCase();
 if(!['demo','synthetic'].includes(mode||'')||process.env.COPILOT_SYNTHETIC_APPROVED!=='true'||process.env.EXTERNAL_AI_ENABLED!=='true')throw new Error('copilot_privacy_disabled');
 if(!process.env.OPENAI_API_KEY||!(process.env.OPENAI_COPILOT_MODEL||process.env.OPENAI_CLINICAL_MODEL))throw new Error('copilot_provider_unconfigured');
}
export async function modelJSON<T>(instructions:string,input:unknown,schema:Record<string,unknown>,usage:Usage):Promise<T>{
 assertCopilotPrivacy();
 const encoded=JSON.stringify(input);
 if(encoded.length>110000)throw new Error('copilot_context_limit');
 const response=await fetch((process.env.OPENAI_BASE_URL||'https://api.openai.com/v1')+'/responses',{
 method:'POST',signal:AbortSignal.timeout(45000),headers:{Authorization:'Bearer '+process.env.OPENAI_API_KEY,'Content-Type':'application/json'},
 body:JSON.stringify({model:process.env.OPENAI_COPILOT_MODEL||process.env.OPENAI_CLINICAL_MODEL,store:false,max_output_tokens:3000,instructions,input:encoded,text:{format:{type:'json_schema',name:'copilot_result',strict:true,schema}}})});
 if(!response.ok)throw new Error('copilot_provider_failed');
 const value=await response.json();
 if(value.status&&value.status!=='completed')throw new Error('copilot_incomplete_output');
 usage.calls++;usage.input_tokens+=value.usage?.input_tokens||0;usage.output_tokens+=value.usage?.output_tokens||0;
 const raw=value.output?.flatMap((x:{content?:{type:string;text?:string}[]})=>x.content||[]).find((x:{type:string})=>x.type==='output_text')?.text;
 if(!raw)throw new Error('copilot_empty_output');
 return JSON.parse(raw) as T;
}
export const objectSchema=(properties:Record<string,unknown>)=>({type:'object',properties,required:Object.keys(properties),additionalProperties:false});
export const stringSchema={type:'string'};

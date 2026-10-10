// Execute the REAL upload route and withPilot middleware. Only external Auth
// and the speech provider are fixtures; no credentials or patient data are used.
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {AsyncLocalStorage} from 'node:async_hooks';
import ts from 'typescript';

export function transcriptionRoute({authenticated=true,membership=true,provider,routeSource}={}) {
 const calls=[],scope=new AsyncLocalStorage();
 const env={OPENAI_API_KEY:'synthetic-test-key',OPENAI_BASE_URL:'https://speech-provider.invalid/v1'};
 const client={
  auth:{getUser:async()=>({data:{user:authenticated?{id:'synthetic-clinician'}:null},error:null}),getSession:async()=>({data:{session:authenticated?{access_token:'synthetic-session-token'}:null}})},
  rpc:async name=>{if(name!=='pilot_identity')throw new Error('Unexpected RPC in upload-only test');return {data:membership?{workspace_id:'synthetic-workspace'}:null,error:null}},
 };
 function load(path,mocks,source=readFileSync(path,'utf8')) {
  const mod={exports:{}};
  const compiled=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
  vm.runInNewContext(compiled,{
   module:mod,exports:mod.exports,
   require:name=>{if(!(name in mocks))throw new Error('Unexpected import: '+name);return mocks[name]},
   Request,Response,FormData,File,Blob,URL,AbortController,DOMException,setTimeout,clearTimeout,
   process:{env},
   fetch:async(url,init)=>{
    if(url!=='https://speech-provider.invalid/v1/audio/transcriptions')throw new Error('Unexpected provider URL');
    const call={url,init,scope:scope.getStore()};calls.push(call);
    return provider?provider(call):Response.json({text:'Συνθετική δοκιμή. Δεν αναφέρει αϋπνία.'});
   },
  },{filename:path});
  return mod.exports;
 }
 const {withPilot}=load('lib/pilot/route.ts',{'./server':{pilotClient:async()=>client},'./request-scope':{pilotScope:scope}});
 const {POST}=load('app/api/transcribe/route.ts',{'@/lib/pilot/route':{withPilot}},routeSource);
 return {POST,calls};
}

export function uploadRequest({key='audio',file=new File([new Uint8Array([26,69,223,163,1,2,3,4])],'synthetic.webm',{type:'audio/webm'}),purpose='clinical',headers={},extra}={}) {
 const form=new FormData();if(file!==null)form.set(key,file);form.set('purpose',purpose);extra?.(form);
 return new Request('https://noima.test/api/transcribe',{method:'POST',headers:{Origin:'https://noima.test',...headers},body:form});
}

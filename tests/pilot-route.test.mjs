import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import ts from 'typescript';
import {readFile} from 'node:fs/promises';
import {AsyncLocalStorage} from 'node:async_hooks';
const source=ts.transpileModule(await readFile('lib/pilot/route.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
function wrapper({user={id:'actor'},identity={workspace_id:'owned'},token='verified-token'}={}){
 const scope=new AsyncLocalStorage();const module={exports:{}};
 const client={auth:{getUser:async()=>({data:{user}}),getSession:async()=>({data:{session:token?{access_token:token}:null}})},rpc:async()=>({data:identity})};
 vm.runInNewContext(source,{module,exports:module.exports,Request,Response,URL,JSON,require:id=>id.includes('server')?{pilotClient:async()=>client}:{pilotScope:scope}});
 return {withPilot:module.exports.withPilot,scope};
}
const request=(tester='forged')=>new Request('https://noima.test/api/patients?tester='+tester,{method:'POST',headers:{'Content-Type':'application/json',Origin:'https://noima.test'},body:JSON.stringify({tester,action:'save'})});
test('verified ownership replaces body/query IDs and concurrent requests retain their own tokens',async()=>{
 const {withPilot,scope}=wrapper();
 const handler=withPilot(async r=>{await Promise.resolve();return Response.json({body:await r.json(),tester:new URL(r.url).searchParams.get('tester'),token:scope.getStore().token})});
 const [a,b]=await Promise.all([handler(request('forged-A')),handler(request('forged-B'))]);
 for(const response of [a,b]){assert.equal(response.headers.get('cache-control'),'private, no-store');assert.deepEqual(await response.json(),{body:{tester:'owned',action:'save'},tester:'owned',token:'verified-token'})}
});
test('missing login/membership and cross-origin mutations fail before a clinical handler runs',async()=>{
 let calls=0;const handler=async()=>{calls++;return Response.json({ok:true})};
 assert.equal((await wrapper({user:null}).withPilot(handler)(request())).status,401);
 assert.equal((await wrapper({identity:null}).withPilot(handler)(request())).status,403);
 assert.equal((await wrapper().withPilot(handler)(new Request('https://noima.test/api/patients',{method:'POST',headers:{Origin:'https://attacker.test'}}))).status,403);
 assert.equal(calls,0);
});
test('public questionnaire permission is limited to token open/submit; assignment still needs login',async()=>{
 const {withPilot}=wrapper({user:null});let calls=0;const handler=withPilot(async()=>{calls++;return Response.json({ok:true})},true);
 for(const action of ['open','submit'])assert.equal((await handler(new Request('https://noima.test/api/psychometrics',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action,token:'fictional'})}))).status,200);
 assert.equal((await handler(new Request('https://noima.test/api/psychometrics',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'assign'})}))).status,401);assert.equal(calls,2);
});

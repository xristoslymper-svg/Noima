import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import * as config from '../i18n/config.ts';

function harness({user={id:'owner',user_metadata:{}},authError=null,saveError=null,environment='production'}={}){
 const calls=[],cookies=[],module={exports:{}};
 const code=ts.transpileModule(readFileSync('app/api/locale/route.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText;
 vm.runInNewContext(code,{module,exports:module.exports,Response,URL,process:{env:{VERCEL_ENV:environment}},require:name=>{
  if(name==='@/i18n/config')return config;
  if(name==='next/headers')return {cookies:async()=>({set:(...args)=>cookies.push(args)})};
  if(name==='@/lib/pilot/server')return {pilotClient:async()=>({auth:{getUser:async()=>({data:{user},error:authError}),updateUser:async data=>{calls.push(data);return {error:saveError}}}})};
  throw Error(name);
 }});
 const post=(body,origin='https://noima.test')=>module.exports.POST(new Request('https://noima.test/api/locale',{method:'POST',headers:{origin,'content-type':'application/json'},body:JSON.stringify(body)}));
 return {post,calls,cookies};
}
test('locale updates target only the authenticated account and persist an explicit secure cookie',async()=>{
 const h=harness();const r=await h.post({locale:'en'});assert.equal(r.status,200);assert.equal((await r.json()).locale,'en');
 assert.deepEqual(JSON.parse(JSON.stringify(h.calls)),[{data:{noima_locale:'en'}}]);
 assert.equal(h.cookies[0][0],config.localeCookie);assert.equal(h.cookies[0][1],'en');assert.equal(h.cookies[0][2].httpOnly,true);assert.equal(h.cookies[0][2].secure,true);assert.equal(h.cookies[0][2].sameSite,'lax');
});
test('an explicit anonymous language can persist without a clinical or account mutation',async()=>{
 const h=harness({user:null,authError:{name:'AuthSessionMissingError'}});assert.equal((await h.post({locale:'en'})).status,200);assert.equal(h.calls.length,0);assert.equal(h.cookies[0][1],'en');
});
test('a forged user identity, invalid locale and cross-origin requests never write preferences',async()=>{
 const h=harness();assert.equal((await h.post({locale:'en',user_id:'someone-else'})).status,400);assert.equal((await h.post({locale:'en'},'https://untrusted.invalid')).status,403);assert.equal((await h.post({locale:'xx'})).status,400);assert.equal(h.calls.length,0);assert.equal(h.cookies.length,0);
});
test('transient authentication and preference-write failures do not silently save an anonymous cookie',async()=>{
 for(const options of [{authError:{name:'AuthRetryableFetchError'}},{saveError:{message:'unavailable'}}]){const h=harness(options);assert.equal((await h.post({locale:'en'})).status,503);assert.equal(h.cookies.length,0)}
});

test('preview language changes are cookie-only even for an authenticated production account',async()=>{
 const h=harness({environment:'preview'});assert.equal((await h.post({locale:'en'})).status,200);assert.equal(h.calls.length,0);assert.equal(h.cookies[0][1],'en');
});

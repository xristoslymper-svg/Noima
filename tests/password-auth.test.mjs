import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import ts from 'typescript';
import {readFile} from 'node:fs/promises';
const source=ts.transpileModule(await readFile('app/api/auth/password/route.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
function route({emailEnabled=true,user={id:'verified-doctor'},recovery=false,sendError=null}={}){
 const calls=[],module={exports:{}};
 const client={auth:{
  resetPasswordForEmail:async(email,options)=>{calls.push(['send',email,options]);return {error:sendError}},
  getUser:async()=>({data:{user},error:null}),getClaims:async()=>({data:{claims:{amr:[{method:recovery?'recovery':'oauth'}]}},error:null}),
  updateUser:async input=>{calls.push(['update',input]);return {error:null}},signOut:async()=>{calls.push(['signout']);return {error:null}}
 }};
 vm.runInNewContext(source,{module,exports:module.exports,Response,URL,require:id=>id==='next/headers'?{cookies:async()=>({delete:key=>calls.push(['delete_cookie',key])})}:id.includes('auth-email')?{authEmailEnabled:emailEnabled}:{pilotClient:async()=>client}});
 return {...module.exports,calls};
}
const post=body=>new Request('https://noima.example.invalid/api/auth/password',{method:'POST',headers:{Origin:'https://noima.example.invalid','Content-Type':'application/json'},body:JSON.stringify(body)});
test('email recovery fails clearly without SMTP readiness and never pretends an email was sent',async()=>{
 const result=route({emailEnabled:false});const response=await result.POST(post({action:'request_reset',email:'fictional@example.invalid'}));
 assert.equal(response.status,503);assert.equal(result.calls.length,0);assert.equal(response.headers.get('Cache-Control'),'private, no-store');
});
test('recovery requests keep identity private, target the current origin and report provider failures honestly',async()=>{
 const result=route();const response=await result.POST(post({action:'request_reset',email:' Fictional@Example.invalid '}));assert.equal(response.status,200);
 assert.deepEqual(await response.json(),{ok:true});assert.equal(result.calls[0][1],'fictional@example.invalid');
 assert.equal(result.calls[0][2].redirectTo,'https://noima.example.invalid/auth/callback');
 for(const [status,expected] of [[429,429],[500,503]])assert.equal((await route({sendError:{status}}).POST(post({action:'request_reset',email:'fictional@example.invalid'}))).status,expected);
});
test('ordinary Google sign-in cannot reset a password; recovery claims are required and successful reset signs out',async()=>{
 const result=route();assert.equal((await result.POST(post({action:'reset',password:'fictional-pass-123'}))).status,403);assert.equal(result.calls.length,0);
 const recovery=route({recovery:true});assert.equal((await recovery.POST(post({action:'reset',password:'fictional-pass-123'}))).status,200);
 assert.ok(recovery.calls.some(call=>call[0]==='signout'));assert.ok(recovery.calls.some(call=>call[0]==='delete_cookie'));
 assert.equal((await route({user:null}).POST(post({action:'reset',password:'fictional-pass-123'}))).status,401);
});
test('existing password accounts can change passwords without email delivery, after current-password verification',async()=>{
 const result=route({emailEnabled:false});assert.equal((await result.POST(post({action:'change',password:'fictional-pass-123',current_password:'fictional-old-123'}))).status,200);
 assert.equal(result.calls[0][1].current_password,'fictional-old-123');
 const invalid=route();assert.equal((await invalid.POST(post({action:'change',password:'fictional-pass-123'}))).status,400);assert.equal(invalid.calls.length,0);
});

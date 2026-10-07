import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import ts from 'typescript';
import {readFile} from 'node:fs/promises';

async function compiled(path){return ts.transpileModule(await readFile(path,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText}
const routeSource=await compiled('app/api/pilot/route.ts');
const browserSource=await compiled('lib/pilot/browser-session.ts');
const callbackSource=await compiled('app/auth/callback/route.ts');
function storage(initial={}){
 const values=new Map(Object.entries(initial));
 return {get length(){return values.size},key:index=>[...values.keys()][index]??null,removeItem:key=>values.delete(key),getItem:key=>values.get(key)??null,setItem:(key,value)=>values.set(key,String(value)),values};
}
function browserRecovery(){
 const session=storage({'unrelated-library-setting':'keep','noima-account-scope':'old','noima-proposal:session:section':'draft','assessment:test-token':'answers','40000000-0000-4000-8000-000000000001:history':'notes','40000000-0000-4000-8000-000000000001:transcript:review':'transcript'}),local=storage();
 const module={exports:{}};
 vm.runInNewContext(browserSource,{module,exports:module.exports,sessionStorage:session,localStorage:local,crypto:{randomUUID:()=> 'change-marker'}});
 return {session,local,...module.exports};
}
function route({user={id:'verified-user',email:'doctor@example.invalid',app_metadata:{providers:['google']}},identity={workspace_id:'private-space',full_name:'Test Doctor'},authError=null,identityError=null,signOutError=null,emailEnabled=true}={}){
 const calls=[];
 const client={
  auth:{
   getUser:async()=>({data:{user},error:authError}),
   signInWithOAuth:async input=>{calls.push(['oauth',input]);return {data:{url:'https://provider.example.invalid'},error:null}},
   signInWithPassword:async input=>{calls.push(['login',input]);return {error:null}},
   signUp:async input=>{calls.push(['signup',input]);return {data:{session:null},error:null}},
   signOut:async input=>{calls.push(['logout',input]);return {error:signOutError}},
  },
  rpc:async(name,input)=>{calls.push([name,input]);return {data:identity,error:identityError}}
 };
 const module={exports:{}};
 vm.runInNewContext(routeSource,{module,exports:module.exports,Response,URL,require:id=>id==='next/headers'?{cookies:async()=>({delete:name=>calls.push(['delete_cookie',name])})}:id.includes('auth-email')?{authEmailEnabled:emailEnabled}:{pilotClient:async()=>client}});
 return {...module.exports,calls};
}
const post=(body,origin='https://preview.noima.example.invalid')=>new Request('https://preview.noima.example.invalid/api/pilot',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},body:JSON.stringify(body)});

test('logout clears clinical recovery and questionnaire answers without clearing unrelated browser state',()=>{
 const session=browserRecovery();session.notifyAccountChange();
 assert.deepEqual([...session.session.values],[['unrelated-library-setting','keep']]);
 assert.equal(session.local.getItem(session.ACCOUNT_CHANGE_KEY),'change-marker');
 assert.equal(session.local.length,1);
});
test('login/recovery and public questionnaires stay public; account and clinical pages require checks',()=>{
 const {isPublicAccountPage}=browserRecovery();
 for(const path of ['/login','/forgot-password','/reset-password','/assessment'])assert.equal(isPublicAccountPage(path),true);
 for(const path of ['/','/account','/pilot','/patients','/calendar','/patients/demo/patient'])assert.equal(isPublicAccountPage(path),false);
});
test('account identity comes from verified auth; unavailable membership is not an empty new account',async()=>{
 const result=route();const response=await result.GET();const account=await response.json();
 assert.equal(account.user_id,'verified-user');assert.equal(account.identity.workspace_id,'private-space');assert.equal(account.has_password,false);
 assert.equal(response.headers.get('Cache-Control'),'private, no-store');
 assert.equal((await route({user:null}).GET()).status,401);
 assert.equal((await route({authError:{status:503}}).GET()).status,503);
 assert.equal((await route({identityError:{message:'database unavailable'}}).GET()).status,503);
 assert.equal((await route({identity:null}).GET()).status,200);
});
test('open signup normalizes email and keeps confirmation mandatory when Auth provides no session',async()=>{
 const result=route();const response=await result.POST(post({action:'signup',email:' Doctor@Example.invalid ',password:'fictional-pass-123'}));
 assert.equal(response.status,200);assert.equal((await response.json()).confirmation_required,true);
 assert.equal(result.calls[0][1].email,'doctor@example.invalid');
 assert.equal(result.calls[0][1].options.emailRedirectTo,'https://preview.noima.example.invalid/auth/callback');
});
test('unconfigured email delivery cannot create an account that will be stuck awaiting confirmation; existing password sign-in remains available',async()=>{
 const result=route({emailEnabled:false});assert.equal((await result.POST(post({action:'signup',email:'test@example.invalid',password:'fictional-pass-123'}))).status,503);
 assert.equal(result.calls.length,0);
 assert.equal((await result.POST(post({action:'login',email:'test@example.invalid',password:'fictional-pass-123'}))).status,200);
 assert.equal(result.calls[0][0],'login');
});
test('OAuth uses the requesting deployment origin; logout revokes the local session only',async()=>{
 const result=route();await result.POST(post({action:'google'}));
 assert.equal(result.calls[0][1].options.redirectTo,'https://preview.noima.example.invalid/auth/callback');
 const response=await result.POST(post({action:'logout'}));
 assert.equal(response.status,200);assert.equal(response.headers.get('Cache-Control'),'private, no-store');
 assert.equal(result.calls.find(call=>call[0]==='logout')[1].scope,'local');
 assert.ok(result.calls.some(call=>call[0]==='delete_cookie'));
 const failed=route({signOutError:{message:'unavailable'}});assert.equal((await failed.POST(post({action:'logout'}))).status,502);
 assert.equal(failed.calls.some(call=>call[0]==='delete_cookie'),false);
});
test('malformed, cross-origin and excessive credentials fail before creating accounts',async()=>{
 for(const body of [[],null,{action:'signup',email:'invalid',password:'fictional-pass-123'},{action:'signup',email:'test@example.invalid',password:'a'.repeat(129)},{action:'login',email:'test@example.invalid',password:{value:'invalid'}}]){
  const result=route();assert.equal((await result.POST(post(body))).status,400);assert.equal(result.calls.length,0);
 }
 const result=route();assert.equal((await result.POST(post({action:'signup'},'https://other.example.invalid'))).status,403);assert.equal(result.calls.length,0);
});
test('joining remains open and returns only the verified account workspace, without trusting a supplied ID',async()=>{
 const result=route();const response=await result.POST(post({action:'join',name:'  Test Doctor  ',workspace_id:'forged'}));
 assert.equal(response.status,200);assert.equal((await response.json()).identity.workspace_id,'private-space');
 assert.deepEqual(result.calls.map(call=>JSON.stringify(call)),[JSON.stringify(['pilot_join',{p_name:'Test Doctor'}])]);
 assert.equal((await route({user:null}).POST(post({action:'join',name:'Test Doctor'}))).status,401);
});
test('OAuth callback exchanges the code and selects recovery from verified claims, never a caller redirect',async()=>{
 async function callback({recovery=false,error=null,code=true}={}){
  const module={exports:{}};
  vm.runInNewContext(callbackSource,{module,exports:module.exports,URL,require:id=>id==='next/server'?{NextResponse:{redirect:url=>new Response(null,{status:307,headers:{Location:String(url)}})}}:{pilotClient:async()=>({auth:{exchangeCodeForSession:async()=>({error}),getClaims:async()=>({data:{claims:{amr:[{method:recovery?'recovery':'oauth'}]}}})}})}});
  return module.exports.GET(new Request(`https://preview.noima.example.invalid/auth/callback?${code?'code=test-code&':''}next=https://attacker.example.invalid`));
 }
 assert.equal((await callback()).headers.get('location'),'https://preview.noima.example.invalid/pilot');
 assert.equal((await callback({recovery:true})).headers.get('location'),'https://preview.noima.example.invalid/reset-password');
 for(const settings of [{error:{message:'expired'}},{code:false}])assert.equal((await callback(settings)).headers.get('location'),'https://preview.noima.example.invalid/login?error=oauth');
});

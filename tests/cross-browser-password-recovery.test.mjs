import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import ts from 'typescript';
import {readFile} from 'node:fs/promises';

async function compile(path,jsx=false){return ts.transpileModule(await readFile(path,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,...(jsx?{jsx:ts.JsxEmit.ReactJSX}:{})}}).outputText}
function run(source,require,extra={}){const module={exports:{}};vm.runInNewContext(source,{module,exports:module.exports,require,URL,URLSearchParams,Response,...extra});return module.exports}
const link=run(await compile('lib/pilot/recovery-link.ts'),()=>{throw Error('unexpected import')});
const tokenSource=await compile('lib/pilot/token-recovery.ts'),routeSource=await compile('app/api/auth/password/route.ts'),formSource=await compile('components/PasswordForms.tsx',true),middlewareSource=await compile('middleware.ts');
const token='pkce_'+'a'.repeat(56),password='synthetic-password-123';
function fixture({verifyError=null,updateError=null,throwVerify=false,missingSession=false}={}){
 const calls=[],used=new Set();
 const helper=run(tokenSource,id=>{
  if(id==='@supabase/supabase-js')return {createClient:(url,key,options)=>{
   calls.push(['isolated',options.auth]);
   return {auth:{
    verifyOtp:async input=>{
     calls.push(['verify',input]);
     if(throwVerify)throw Error('provider unavailable');
     if(verifyError||used.has(input.token_hash))return {data:{user:null,session:null},error:verifyError||{status:403}};
     used.add(input.token_hash);
     return {data:{user:{id:'email-link-owner'},session:missingSession?null:{access_token:'synthetic'}},error:null};
    },
    updateUser:async input=>{calls.push(['update-link-owner',input]);return {error:updateError}},
    signOut:async input=>{calls.push(['revoke',input]);return {error:null}}
   }};
  }};
  if(id==='./config')return {supabaseUrl:'https://example.supabase.co',supabaseKey:'public-test-key'};
  return link;
 });
 const route=run(routeSource,id=>{
  if(id==='next/headers')return {cookies:async()=>({delete:key=>calls.push(['delete-cookie',key])})};
  if(id.includes('token-recovery'))return helper;
  if(id.includes('auth-email'))return {authEmailEnabled:true};
  return {pilotClient:async()=>{calls.push(['ambient-client']);return {auth:{
   getUser:async()=>{calls.push(['ambient-user']);return {data:{user:{id:'unrelated-signed-in-user'}},error:null}},
   updateUser:async()=>{throw Error('must not change unrelated account')},
   signOut:async input=>{calls.push(['ambient-signout',input]);return {error:null}}
  }}}};
 });
 return {...route,...helper,calls};
}
const post=(body,origin='https://noima.example.invalid')=>new Request('https://noima.example.invalid/api/auth/password',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},body:JSON.stringify(body)});

test('a fresh browser with no PKCE state resets only the email-link owner, never an ambient signed-in account',async()=>{
 const f=fixture(),response=await f.POST(post({action:'reset',token_hash:token,password}));
 assert.equal(response.status,200);assert.deepEqual(await response.json(),{ok:true});
 assert.equal(response.headers.get('Cache-Control'),'private, no-store');
 assert.equal(f.calls.some(x=>x[0]==='ambient-user'),false);
 assert.equal(f.calls.filter(x=>x[0]==='update-link-owner').length,1);
 assert.deepEqual(JSON.parse(JSON.stringify(f.calls.find(x=>x[0]==='verify')[1])),{token_hash:token,type:'recovery'});
 assert.deepEqual(JSON.parse(JSON.stringify(f.calls.find(x=>x[0]==='isolated')[1])),{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false});
 assert.equal(f.calls.find(x=>x[0]==='revoke')[1].scope,'global');
 assert.equal(f.calls.find(x=>x[0]==='ambient-signout')[1].scope,'local');
});
test('used, expired and wrong-type tokens never update a password or fall back to a signed-in account',async()=>{
 const f=fixture();await f.POST(post({action:'reset',token_hash:token,password}));f.calls.length=0;
 assert.equal((await f.POST(post({action:'reset',token_hash:token,password}))).status,403);
 assert.equal(f.calls.some(x=>x[0]==='update-link-owner'||x[0]==='ambient-client'),false);
 for(const status of [403,422,429]){
  const bad=fixture({verifyError:{status}});
  assert.equal((await bad.POST(post({action:'reset',token_hash:token,password}))).status,status===429?429:403);
  assert.equal(bad.calls.some(x=>x[0]==='update-link-owner'||x[0]==='ambient-client'),false);
 }
});
test('malformed tokens, short passwords and cross-origin requests fail before consuming the token',async()=>{
 for(const value of ['',null,{},'invalid','a'.repeat(300)]){
  const f=fixture();assert.equal((await f.POST(post({action:'reset',token_hash:value,password}))).status,400);assert.equal(f.calls.length,0);
 }
 for(const value of ['short','x'.repeat(129),{password}]){
  const f=fixture();assert.equal((await f.POST(post({action:'reset',token_hash:token,password:value}))).status,400);assert.equal(f.calls.length,0);
 }
 const f=fixture();assert.equal((await f.POST(post({action:'reset',token_hash:token,password},'https://other.invalid'))).status,403);assert.equal(f.calls.length,0);
});
test('verification outages, missing sessions and rejected password changes fail closed without false success',async()=>{
 for(const [settings,status] of [[{throwVerify:true},503],[{missingSession:true},403],[{updateError:{message:'policy rejected'}},400]]){
  const f=fixture(settings);assert.equal((await f.POST(post({action:'reset',token_hash:token,password}))).status,status);
  assert.equal(f.calls.some(x=>x[0]==='ambient-client'),false);
  if(settings.updateError)assert.equal(f.calls.find(x=>x[0]==='revoke')[1].scope,'local');
 }
});
test('fragment parser keeps tokens out of the request URL and rejects duplicate token parameters',()=>{
 assert.equal(link.recoveryTokenFromFragment('#token_hash='+token),token);
 assert.equal(link.recoveryTokenFromFragment(''),undefined);
 assert.equal(link.recoveryTokenFromFragment('#token_hash='+token+'&token_hash='+token),'');
 assert.equal(link.recoveryTokenFromFragment('#token_hash=bad'),'');
});
test('GET recovery form permits any browser without reading auth, verifying tokens or signing in',async()=>{
 const middleware=run(middlewareSource,id=>{
  if(id==='next/server')return {NextResponse:{next:()=>new Response(null)}};
  if(id==='@supabase/ssr')return {createServerClient:()=>{throw Error('GET must not touch auth')}};
  if(id.includes('config'))return {};
  return {mobileV2Enabled:false};
 });
 const response=await middleware.middleware({nextUrl:new URL('https://noima.example.invalid/reset-password')});
 assert.equal(response.headers.get('Cache-Control'),'private, no-store');
 assert.equal(response.headers.get('Referrer-Policy'),'no-referrer');
 assert.equal(response.headers.get('X-Robots-Tag'),'noindex, nofollow');
});
test('the existing password form consumes no token on render and submits it only with the explicit password action',async()=>{
 const calls=[],states=['',password,password,false,'',''];
 const runtime={jsx:(type,props)=>({type,props}),jsxs:(type,props)=>({type,props})};
 const form=run(formSource,id=>{
  if(id==='react')return {useState:()=>[states.shift(),()=>{}]};
  if(id==='react/jsx-runtime')return runtime;
  if(id.includes('recovery-link'))return link;
  return {notifyAccountChange:()=>calls.push(['notify'])};
 },{
  window:{location:{hash:'#token_hash='+token,replace:url=>calls.push(['redirect',url])}},
  fetch:async(url,options)=>{calls.push(['post',JSON.parse(options.body)]);return {ok:true,json:async()=>({ok:true})}}
 });
 const tree=form.PasswordChangeForm({recovery:true});
 assert.equal(calls.length,0);
 await tree.props.onSubmit({preventDefault(){}});
 assert.deepEqual(JSON.parse(JSON.stringify(calls[0][1])),{action:'reset',password,token_hash:token});
 assert.equal(calls.find(x=>x[0]==='redirect')[1],'/login?password=updated');
});
test('hosted recovery email uses the canonical app form fragment, not an auto-consumed provider link',async()=>{
 const template=await readFile('supabase/templates/recovery.html','utf8');
 assert.ok(template.includes('{{ .SiteURL }}/reset-password#token_hash={{ .TokenHash }}'));
 assert.equal(template.includes('ConfirmationURL'),false);
 const page=await readFile('app/reset-password/page.tsx','utf8');
 assert.ok(page.includes('<PasswordChangeForm recovery/>'));
});

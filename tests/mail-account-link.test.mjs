import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
import {authorization,validEmail} from '../lib/mail/providers.ts';
function app({returnedEmail='doctor@example.com',userEmail='doctor@example.com',storedEmail='doctor@example.com',stateUser='owner',age=0,state='state',refresh=true}={}){
 const writes=[],jar={get:()=>({value:'encrypted'}),delete(){},set(name,value,options){writes.push({name,value,options})}};
 const client={auth:{getUser:async()=>({data:{user:{id:'owner',email:userEmail}}})},rpc:async(name,args)=>{writes.push({name,args});return {data:null,error:null}}};
 const mocks={
 'next/headers':{cookies:async()=>jar},
 'next/server':{NextResponse:{redirect:url=>Response.redirect(url)}},
 'node:crypto':{randomBytes:()=>({toString:()=> 'random'}),createHash:()=>({update:()=>({digest:()=> 'challenge'})})},
 '@/lib/pilot/server':{pilotClient:async()=>client},
 '@/lib/pilot/route':{withPilot:f=>f},
 '@/lib/mail/crypto':{seal:JSON.stringify,unseal:()=>({state,verifier:'verifier',provider:'google',user:stateUser,email:storedEmail,created:Date.now()-age})},
 '@/lib/mail/providers':{authorization,validEmail,ready:()=>true,callback:()=> 'https://noima.test/api/mailbox/callback',tokens:async()=>({access_token:'fixture',refresh_token:refresh?'fixture':undefined}),mailboxEmail:async()=>returnedEmail}
 };
 function compile(path){const module={exports:{}};new Function('require','module','exports',ts.transpileModule(readFileSync(path,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText)(n=>mocks[n],module,module.exports);return module.exports;}
 return {writes,route:compile('app/api/mailbox/route.ts'),callback:compile('app/api/mailbox/callback/route.ts')};
}
process.env.GOOGLE_MAIL_CLIENT_ID='fixture';
process.env.NOIMA_APP_ORIGIN='https://noima.test';
test('connect uses server-authenticated account email, ignores a client-supplied sender',async()=>{
 const a=app();const r=await a.route.POST(new Request('https://noima.test/api/mailbox',{method:'POST',headers:{origin:'https://noima.test'},body:JSON.stringify({action:'connect',provider:'google',email:'attacker@example.com'})}));
 const body=await r.json();assert.equal(new URL(body.url).searchParams.get('login_hint'),'doctor@example.com');
 const cookie=a.writes.find(x=>x.name==='noima-mail-oauth');assert.equal(JSON.parse(cookie.value).email,'doctor@example.com');
 assert.equal(cookie.options.httpOnly,true);assert.equal(cookie.options.secure,true);
});
test('callback saves verified same-account mailbox with user-bound ciphertext',async()=>{
 const a=app({returnedEmail:'Doctor@example.com'});const r=await a.callback.GET(new Request('https://noima.test/api/mailbox/callback?state=state&code=fixture'));
 assert.match(r.headers.get('location'),/mail=connected/);assert.equal(a.writes[0].name,'pilot_mailbox_save');assert.equal(a.writes[0].args.p_email,'Doctor@example.com');
});
test('different mailbox or changed login email cannot be silently linked',async()=>{
 for(const options of [{returnedEmail:'other@example.com'},{storedEmail:'previous@example.com'}]){
  const a=app(options);const r=await a.callback.GET(new Request('https://noima.test/api/mailbox/callback?state=state&code=fixture'));
  assert.match(r.headers.get('location'),/mail=wrong_account/);assert.equal(a.writes.length,0);
 }
});
test('foreign owner, expired or wrong state and missing offline grant never save credentials',async()=>{
 for(const options of [{stateUser:'other'},{age:600001},{state:'wrong'},{refresh:false}]){
  const a=app(options);const r=await a.callback.GET(new Request('https://noima.test/api/mailbox/callback?state=state&code=fixture'));
  assert.match(r.headers.get('location'),/mail=error/);assert.equal(a.writes.length,0);
 }
});

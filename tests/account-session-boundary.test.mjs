import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import ts from 'typescript';
import {readFile} from 'node:fs/promises';
const source=ts.transpileModule(await readFile('components/AccountSessionBoundary.tsx','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText;
const browserSource=ts.transpileModule(await readFile('lib/pilot/browser-session.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
const account={user_id:'verified-a',email:'fictional@example.invalid',has_password:false,identity:{workspace_id:'space-a',full_name:'TEST Doctor'}};
async function boundary({path='/patients',responses=[Response.json(account)],stored={}}={}){
 const entries=new Map(Object.entries(stored)),listeners=new Map(),effects=[],states=[],navigation=[],requests=[];
 const sessionStorage={get length(){return entries.size},key:index=>[...entries.keys()][index]??null,getItem:key=>entries.get(key)??null,setItem:(key,value)=>entries.set(key,value),removeItem:key=>entries.delete(key)};
 const helpers={exports:{}};vm.runInNewContext(browserSource,{module:helpers,exports:helpers.exports});
 let stateIndex=0;
 const react={createContext:()=>({Provider:'provider'}),useContext:()=>null,useRef:value=>({current:value}),useState:initial=>{const index=stateIndex++;states[index]=initial;return [initial,next=>{states[index]=next}]},useEffect:fn=>effects.push(fn)};
 const window={location:{replace:url=>navigation.push(['replace',url]),reload:()=>navigation.push(['reload'])},addEventListener:(name,fn)=>listeners.set(name,fn),removeEventListener:name=>listeners.delete(name)};
 const document={visibilityState:'visible',addEventListener:(name,fn)=>listeners.set(name,fn),removeEventListener:name=>listeners.delete(name)};
 const module={exports:{}};
 vm.runInNewContext(source,{module,exports:module.exports,window,document,sessionStorage,AbortController,fetch:async(url,options)=>{requests.push({url,options});const result=responses.shift();if(result instanceof Error)throw result;return result},require:id=>id==='react'?react:id==='react/jsx-runtime'?{jsx:(type,props)=>({type,props}),jsxs:(type,props)=>({type,props})}:id==='next/navigation'?{usePathname:()=>path}:helpers.exports});
 const rendered=module.exports.default({children:'clinical-content'});
 const cleanup=effects[0]();
 const settle=()=>new Promise(resolve=>setImmediate(resolve));await settle();
 return {entries,listeners,states,navigation,requests,cleanup,rendered,settle};
}
test('first account verification blocks clinical children and clears recovery inherited from a different account',async()=>{
 const result=await boundary({stored:{'noima-account-scope':'other-account:other-space','noima-proposal:old:section':'previous-doctor-notes','unrelated':'keep'}});
 assert.notEqual(result.rendered,'clinical-content');assert.equal(result.states[0].user_id,'verified-a');
 assert.equal(result.entries.has('noima-proposal:old:section'),false);assert.equal(result.entries.get('unrelated'),'keep');
 assert.equal(result.entries.get('noima-account-scope'),'verified-a:space-a');assert.equal(result.requests[0].options.cache,'no-store');
 result.cleanup();assert.equal(result.listeners.size,0);
});
test('other-tab signout reloads the clinical view and removes browser recovery',async()=>{
 const result=await boundary({stored:{'noima-proposal:old:section':'notes'}});
 result.listeners.get('storage')({key:'unrelated'});assert.deepEqual(result.navigation,[]);
 result.listeners.get('storage')({key:'noima-account-change'});assert.deepEqual(result.navigation,[['reload']]);
 assert.equal(result.entries.size,0);result.cleanup();
});
test('focus revalidation catches a new account even if cross-tab storage notifications are unavailable',async()=>{
 const other={...account,user_id:'verified-b',identity:{...account.identity,workspace_id:'space-b'}};
 const result=await boundary({responses:[Response.json(account),Response.json(other)]});
 result.entries.set('noima-proposal:old:section','notes');await result.listeners.get('focus')();
 assert.deepEqual(result.navigation,[['reload']]);assert.equal(result.entries.size,0);result.cleanup();
});
test('expired auth redirects to sign-in but transient account-service errors do not sign the doctor out',async()=>{
 const expired=await boundary({responses:[Response.json({error:'expired'},{status:401})],stored:{'noima-proposal:old:section':'notes'}});
 assert.deepEqual(expired.navigation,[['replace','/login?session=expired']]);assert.equal(expired.entries.size,0);expired.cleanup();
 const unavailable=await boundary({responses:[Response.json({error:'unavailable'},{status:503})],stored:{'noima-proposal:old:section':'notes'}});
 assert.deepEqual(unavailable.navigation,[]);assert.equal(unavailable.states[1],true);assert.equal(unavailable.entries.get('noima-proposal:old:section'),'notes');unavailable.cleanup();
});
test('first-time doctors reach setup; signup and questionnaire pages never require an account fetch',async()=>{
 const fresh=await boundary({responses:[Response.json({...account,identity:null})]});assert.deepEqual(fresh.navigation,[['replace','/pilot']]);fresh.cleanup();
 for(const path of ['/login','/assessment']){const publicPage=await boundary({path});assert.equal(publicPage.rendered,'clinical-content');assert.equal(publicPage.requests.length,0);assert.equal(publicPage.listeners.size,0)}
});

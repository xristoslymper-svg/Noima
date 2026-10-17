import {intlTestModule} from './helpers/i18n.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import * as jsx from 'react/jsx-runtime';
import * as navigation from '../lib/clinical/visit-workspace-state.ts';
import * as reconciliation from '../lib/clinical/record-reconciliation.ts';
import * as calendarContext from '../lib/calendar/appointment-context.ts';
import * as finalization from '../lib/clinical/finalization.ts';
const source=ts.transpileModule(readFileSync('components/patients/PatientWorkspace.tsx','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText;
const nodes=tree=>!tree?[]:Array.isArray(tree)?tree.flatMap(nodes):tree.props?[tree,...nodes(tree.props.children)]:[];
const tick=()=>new Promise(resolve=>setImmediate(resolve));
async function mount(search='',sessions=[]){
 const cells=[],effects=[];let cursor=0;const posts=[],listeners=new Map();const location={pathname:'/patients/demo/p',search,hash:'',origin:'https://noima.test',get href(){return this.origin+this.pathname+this.search}};
 const history={state:{},pushState(state,_,url){this.state=state;location.search=new URL(url,location.origin).search},replaceState(state,_,url){this.state=state;location.search=new URL(url,location.origin).search}};
 const hooks={useRef(value){const i=cursor++;return cells[i]??= {current:value}},useState(value){const i=cursor++;if(!(i in cells))cells[i]=value;return [cells[i],v=>cells[i]=typeof v==='function'?v(cells[i]):v]},useEffect(f,deps){const i=cursor++;const old=cells[i];if(!old||deps.some((d,j)=>d!==old.deps[j])){cells[i]={deps};effects.push(()=>{old?.cleanup?.();cells[i].cleanup=f()})}}};
 const VisitWorkspace=()=>null;const bundle={patient:{id:'p',tester_id:'tenant',first_name:'Synthetic',last_name:'Only',reported_age:30,amka:''},sessions,appointments:[],sections:[],risks:[],medications:[],medicationEvents:[],medicationSideEffects:[],medicationRevisions:[],assessments:[],proposals:[],addenda:[],corrections:[],history:null};const fallback={default:()=>null};
 const returnCode=ts.transpileModule(readFileSync('lib/calendar/return-context.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;const returnModule={exports:{}};const storage=new Map();vm.runInNewContext(returnCode,{module:returnModule,exports:returnModule.exports,history,location,document:{referrer:''},sessionStorage:{getItem:k=>storage.get(k)??null,setItem:(k,v)=>storage.set(k,v),removeItem:k=>storage.delete(k)},URL,require:(id)=>(intlTestModule(id)??(()=>calendarContext)(id))});
 const module={exports:{}};const win={location,history,scrollTo(){},addEventListener:(key,f)=>listeners.set(key,f),removeEventListener(){}};
 vm.runInNewContext(source,{module,exports:module.exports,Error,window:win,document:{visibilityState:'visible'},URL,URLSearchParams,setInterval:()=>1,clearInterval(){},fetch:async()=>({ok:true,json:async()=>({bundle})}),require:(id)=>(intlTestModule(id)??(id=>id==='react'?hooks:id==='react/jsx-runtime'?jsx:id.includes('return-context')?returnModule.exports:id.includes('visit-workspace-state')?navigation:id.includes('record-reconciliation')?reconciliation:id.includes('finalization')?finalization:id.includes('VisitWorkspace')?{default:VisitWorkspace}:id.includes('demo-client')?{demoPost:async body=>{posts.push(body);return {session:{id:'new'}}}}:id.includes('demo-tester')?{getDemoTesterId:()=>''}:id.includes('patient-record')?{patientRecord:()=>({})}:id.includes('useMobileNavigation')?{useMobileNavigation:()=>[false,()=>{}]}:id.includes('clinic-time')?{formatClinicAppointment:v=>v}:id==='lucide-react'?{}:id.includes('.css')?{default:{}}:fallback)(id))});
 const render=()=>{cursor=0;const tree=module.exports.default({patientRef:'p'});while(effects.length)effects.shift()();return tree};let tree=render();await tick();tree=render();await tick();tree=render();
 return {render,posts,location,listeners,visit:()=>nodes(render()).find(n=>n.type===VisitWorkspace),nav:label=>nodes(render()).find(n=>n.props.label===label),tree:()=>render()};
}
const draft=id=>({id,patient_id:'p',tester_id:'tenant',version:1,status:'draft',session_type:'initial_assessment',started_at:'2026-10-10'});
test('patient composition has four browsing tabs and a recording dialog; passive open never writes',async()=>{
 const app=await mount('?tab=record',[draft('a'),draft('b')]);assert.deepEqual(nodes(app.tree()).filter(n=>n.props.label).map(n=>n.props.label),['Σύνοψη','Πορεία','Θεραπεία','Ιστορικό']);assert.equal(app.visit(),undefined);assert.equal(app.posts.length,0);assert.equal(nodes(app.tree()).filter(n=>n.type==='button'&&n.props.children?.includes?.(' · ')).length,2);
});
test('record remains mounted with exactly the selected completed or draft session across tabs and refresh locations',async()=>{
 for(const status of ['draft','completed']){const app=await mount('?tab=record&session=exact',[{...draft('exact'),status},draft('other')]);const visit=app.visit();let flushed=0;visit.props.beforeNavigate.current=async()=>{flushed++};app.nav('Σύνοψη').props.onClick();await tick();assert.equal(app.visit().key,visit.key);assert.equal(app.visit().props.sessionId,'exact');assert.equal(navigation.workspaceLocation(app.location.search).tab,'summary');assert.equal(navigation.workspaceLocation(app.location.search).sessionId,'exact');app.nav('Θεραπεία').props.onClick();await tick();assert.equal(flushed,2);assert.equal(app.posts.length,0)}
});
test('pending clinical work blocks tab change inline and keeps the same visit',async()=>{
 const app=await mount('?tab=record&session=exact',[draft('exact')]);app.visit().props.beforeNavigate.current=async()=>{throw new Error('Ολοκληρώστε την ενεργή υπαγόρευση.')};app.nav('Σύνοψη').props.onClick();await tick();assert.equal(navigation.workspaceLocation(app.location.search).tab,'record');assert.equal(app.visit().props.sessionId,'exact');assert.ok(nodes(app.tree()).some(n=>n.props.role==='alert'&&n.props.children==='Ολοκληρώστε την ενεργή υπαγόρευση.'));assert.equal(app.posts.length,0);
});
test('legacy explicit sessions are routed to the recording workspace, never substituted',async()=>{
 const app=await mount('?tab=sessions&session=exact',[draft('newer'),draft('exact')]);assert.equal(navigation.workspaceLocation(app.location.search).tab,'record');assert.equal(app.visit().props.sessionId,'exact');assert.equal(app.posts.length,0);
});



test('dialog close flushes pending work and returns to the background tab; export is in the dropdown',async()=>{const app=await mount('?tab=timeline&record_session=exact',[draft('exact')]);await app.visit().props.onSelect('exact');await tick();let flushed=0;app.visit().props.beforeNavigate.current=async()=>{flushed++};const close=nodes(app.tree()).find(n=>n.type==='button'&&n.props['aria-label']==='Κλείσιμο καταγραφής και επιστροφή στον φάκελο');close.props.onClick();await tick();assert.equal(flushed,1);assert.equal(navigation.workspaceLocation(app.location.search).tab,'timeline');assert.equal(app.visit().props.sessionId,'exact');const details=nodes(app.tree()).find(n=>n.type==='details');assert.ok(nodes(details).some(n=>n.type==='a'&&n.props.href.includes('format=print')));assert.equal(app.posts.length,0)});

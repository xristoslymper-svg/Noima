import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import * as jsx from 'react/jsx-runtime';
import * as navigation from '../lib/clinical/visit-workspace-state.ts';
const source=ts.transpileModule(readFileSync('components/patients/PatientWorkspace.tsx','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText;
const nodes=tree=>!tree?[]:Array.isArray(tree)?tree.flatMap(nodes):tree.props?[tree,...nodes(tree.props.children)]:[];
const tick=()=>new Promise(resolve=>setImmediate(resolve));
async function mount(search='',sessions=[]){
 const cells=[],effects=[];let cursor=0;const posts=[],listeners=new Map();const location={pathname:'/patients/demo/p',search,hash:'',origin:'https://noima.test',get href(){return this.origin+this.pathname+this.search}};
 const history={state:{},pushState(state,_,url){this.state=state;location.search=new URL(url,location.origin).search},replaceState(state,_,url){this.state=state;location.search=new URL(url,location.origin).search}};
 const hooks={useRef(value){const i=cursor++;return cells[i]??= {current:value}},useState(value){const i=cursor++;if(!(i in cells))cells[i]=value;return [cells[i],v=>cells[i]=typeof v==='function'?v(cells[i]):v]},useEffect(f,deps){const i=cursor++;const old=cells[i];if(!old||deps.some((d,j)=>d!==old.deps[j])){cells[i]={deps};effects.push(()=>{old?.cleanup?.();cells[i].cleanup=f()})}}};
 const VisitWorkspace=()=>null;const bundle={patient:{id:'p',first_name:'Synthetic',last_name:'Only',reported_age:30,amka:''},sessions,appointments:[]};const fallback={default:()=>null};
 const module={exports:{}};const win={location,history,scrollTo(){},addEventListener:(key,f)=>listeners.set(key,f),removeEventListener(){}};
 vm.runInNewContext(source,{module,exports:module.exports,Error,window:win,document:{visibilityState:'visible'},URL,URLSearchParams,setInterval:()=>1,clearInterval(){},fetch:async()=>({ok:true,json:async()=>({bundle})}),require:id=>id==='react'?hooks:id==='react/jsx-runtime'?jsx:id.includes('visit-workspace-state')?navigation:id.includes('VisitWorkspace')?{default:VisitWorkspace}:id.includes('demo-client')?{demoPost:async body=>{posts.push(body);return {session:{id:'new'}}}}:id.includes('demo-tester')?{getDemoTesterId:()=>''}:id.includes('patient-record')?{patientRecord:()=>({})}:id.includes('useMobileNavigation')?{useMobileNavigation:()=>[false,()=>{}]}:id.includes('clinic-time')?{formatClinicAppointment:v=>v}:id==='lucide-react'?{}:id.includes('.css')?{default:{}}:fallback});
 const render=()=>{cursor=0;const tree=module.exports.default({patientRef:'p'});while(effects.length)effects.shift()();return tree};let tree=render();await tick();tree=render();await tick();tree=render();
 return {render,posts,location,listeners,visit:()=>nodes(render()).find(n=>n.type===VisitWorkspace),nav:label=>nodes(render()).find(n=>n.props.label===label),tree:()=>render()};
}
const draft=id=>({id,status:'draft',session_type:'initial_assessment',started_at:'2026-10-10'});
test('real patient composition has the fifth Record tab; passive open never writes',async()=>{
 const app=await mount('?tab=record',[draft('a'),draft('b')]);assert.deepEqual(nodes(app.tree()).filter(n=>n.props.label).map(n=>n.props.label),['Σύνοψη','Πορεία','Θεραπεία','Ιστορικό','Καταγραφή']);assert.equal(app.visit(),undefined);assert.equal(app.posts.length,0);assert.equal(nodes(app.tree()).filter(n=>n.type==='button'&&n.props.children?.includes?.(' · ')).length,2);
});
test('record remains mounted with exactly the selected completed or draft session across tabs and refresh locations',async()=>{
 for(const status of ['draft','completed']){const app=await mount('?tab=record&session=exact',[{...draft('exact'),status},draft('other')]);const visit=app.visit();let flushed=0;visit.props.beforeNavigate.current=async()=>{flushed++};app.nav('Σύνοψη').props.onClick();await tick();assert.equal(app.visit().key,visit.key);assert.equal(app.visit().props.sessionId,'exact');assert.equal(navigation.workspaceLocation(app.location.search).tab,'summary');assert.equal(navigation.workspaceLocation(app.location.search).sessionId,'exact');app.nav('Θεραπεία').props.onClick();await tick();app.nav('Καταγραφή').props.onClick();await tick();assert.equal(flushed,3);assert.equal(app.posts.length,0)}
});
test('pending clinical work blocks tab change inline and keeps the same visit',async()=>{
 const app=await mount('?tab=record&session=exact',[draft('exact')]);app.visit().props.beforeNavigate.current=async()=>{throw new Error('Ολοκληρώστε την ενεργή υπαγόρευση.')};app.nav('Σύνοψη').props.onClick();await tick();assert.equal(app.nav('Καταγραφή').props.active,true);assert.equal(app.visit().props.sessionId,'exact');assert.ok(nodes(app.tree()).some(n=>n.props.role==='alert'&&n.props.children==='Ολοκληρώστε την ενεργή υπαγόρευση.'));assert.equal(app.posts.length,0);
});
test('legacy explicit sessions are routed to the recording workspace, never substituted',async()=>{
 const app=await mount('?tab=sessions&session=exact',[draft('newer'),draft('exact')]);assert.equal(app.nav('Καταγραφή').props.active,true);assert.equal(app.visit().props.sessionId,'exact');assert.equal(app.posts.length,0);
});



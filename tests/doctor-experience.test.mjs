import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import vm from 'node:vm';
import ts from 'typescript';
import React from 'react';
import * as jsx from 'react/jsx-runtime';
import {renderToStaticMarkup} from 'react-dom/server';
import * as record from '../lib/clinical/patient-record.ts';
import * as clinicTime from '../lib/clinic-time.ts';
import * as assessmentLink from '../lib/clinical/assessment-link.ts';

const require=createRequire(import.meta.url);
const compiled=file=>ts.transpileModule(readFileSync('components/patients/'+file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText;
const fixture=(appointments=[])=>({patient:{id:'fictional',phone:''},appointments,sessions:[],sections:[],risks:[],assessments:[],medications:[],medicationEvents:[],medicationSideEffects:[],medicationRevisions:[],addenda:[],corrections:[]});
const appointment=(id,start,overrides={})=>({id,status:'scheduled',scheduled_start:start,scheduled_end:new Date(Date.parse(start)+3600000).toISOString(),...overrides});
const nodes=t=>!t?[]:Array.isArray(t)?t.flatMap(nodes):typeof t==='object'&&t.props?[t,...nodes(t.props.children)]:[];
const text=t=>typeof t==='string'||typeof t==='number'?String(t):Array.isArray(t)?t.map(text).join(''):t?.props?text(t.props.children):'';

// Stateful component simulation follows the repository's existing hook harness.
// No real requests or appointments are created. Browser rendering is checked separately.
function mount({bundle=fixture(),response={ok:true,json:async()=>({})},reload=async()=>({})}={}){
 const cells=[],effects=[],cleanups=new Map(),flushers=new Map(),requests=[],dirty=[];let cursor=0;
 const hooks={useId:()=> 'appointment-form',useMemo:f=>f(),useRef(initial){const i=cursor++;return cells[i]??=( {current:initial})},useState(initial){const i=cursor++;if(!(i in cells))cells[i]=initial;return[cells[i],value=>{cells[i]=typeof value==='function'?value(cells[i]):value}]},useEffect(fn){const i=cursor++;effects.push(()=>{cleanups.get(i)?.();cleanups.set(i,fn())})}};
 const module={exports:{}};
 vm.runInNewContext(compiled('VisitNextAppointment.tsx'),{module,exports:module.exports,Date,JSON,Error,requestAnimationFrame:fn=>fn(),fetch:async(url,options)=>{requests.push({url,...JSON.parse(options.body)});return response},require:name=>name==='react'?hooks:name==='react/jsx-runtime'?jsx:name==='@/lib/demo-tester'?{getDemoTesterId:()=> 'fixture'}:name==='@/lib/clinic-time'?clinicTime:name==='@/lib/clinical/patient-record'?record:name.endsWith('.css')?{}:require(name)});
 const props={bundle,reload,registerFlusher:(key,fn)=>{flushers.set(key,fn);return()=>flushers.delete(key)},onDirtyChange:(_,value)=>dirty.push(value)};
 return {requests,dirty,flush:()=>flushers.get('appointment')(),render(){cursor=0;const tree=module.exports.default(props);effects.splice(0).forEach(fn=>fn());return tree}};
}
const form=t=>nodes(t).find(n=>n.props.id==='appointment-form');
const button=(t,label)=>nodes(t).find(n=>n.type==='button'&&!n.props.hidden&&text(n)===label);
const date=t=>nodes(t).find(n=>n.type==='input'&&n.props.type==='date');
const open=m=>{let t=m.render();nodes(t).find(n=>n.type==='button'&&n.props['aria-controls']).props.onClick();return m.render()};

test('appointment header and visit share date ordering and retain linked future appointments',()=>{
 const now=new Date('2026-10-09T10:00:00Z');
 const bundle=fixture([appointment('later','2026-10-20T10:00:00Z'),appointment('linked','2026-10-10T10:00:00Z',{session_id:'draft'}),appointment('cancelled','2026-10-09T11:00:00Z',{status:'cancelled'}),appointment('past','2026-10-01T10:00:00Z'),appointment('completed','2026-10-09T11:00:00Z',{status:'completed'})]);
 assert.deepEqual(record.upcomingAppointments(bundle,now).map(a=>a.id),['linked','later']);
 assert.equal(record.patientRecord(bundle,now).nextAppointment.id,'linked');
 assert.equal(bundle.appointments[0].id,'later');
});
test('empty scheduling is optional and opening/cancelling creates no request',async()=>{
 const m=mount();let t=m.render();assert.equal(form(t).props.hidden,true);assert.match(text(t),/Δεν έχει προγραμματιστεί/);await m.flush();
 t=open(m);assert.equal(form(t).props.hidden,false);button(t,'Ακύρωση').props.onClick();t=m.render();assert.equal(form(t).props.hidden,true);await m.flush();assert.equal(m.requests.length,0);
});
test('one or multiple future appointments do not expose a new form by default',()=>{
 for(const count of [1,2]){const m=mount({bundle:fixture(Array.from({length:count},(_,i)=>appointment(String(i),`2099-10-${10+i}T10:00:00Z`)))});const t=m.render();assert.equal(form(t).props.hidden,true);assert.ok(button(t,'Νέο ραντεβού'));assert.equal(nodes(t).some(n=>n.type==='summary'&&text(n).includes('Άλλα προγραμματισμένα')),count===2)}
});
test('unsaved scheduling still blocks completion and explicit cancellation clears the guard',async()=>{
 const m=mount();let t=open(m);date(t).props.onInput({currentTarget:{value:'2099-10-10'}});t=m.render();assert.equal(m.dirty.at(-1),true);await assert.rejects(m.flush(),/Αποθηκεύστε ή ακυρώστε/);assert.equal(form(m.render()).props.hidden,false);
 button(t,'Ακύρωση').props.onClick();t=m.render();await m.flush();assert.equal(m.dirty.at(-1),false);assert.equal(form(t).props.hidden,true);
});
test('failed save retains date, visible form and finalization guard',async()=>{
 const m=mount({response:{ok:false,json:async()=>({error:'Δοκιμαστικό σφάλμα'})}});let t=open(m);date(t).props.onInput({currentTarget:{value:'2099-10-10'}});t=m.render();button(t,'Προγραμματισμός').props.onClick();await new Promise(r=>setImmediate(r));t=m.render();assert.equal(date(t).props.value,'2099-10-10');assert.equal(form(t).props.hidden,false);assert.match(text(t),/Δοκιμαστικό σφάλμα/);await assert.rejects(m.flush());assert.equal(m.requests.length,1);
});
test('successful save collapses only after refresh; failed refresh cannot resubmit the saved date',async()=>{
 for(const refreshOK of [true,false]){const m=mount({reload:async()=>refreshOK?{}:null});let t=open(m);date(t).props.onInput({currentTarget:{value:'2099-10-10'}});t=m.render();button(t,'Προγραμματισμός').props.onClick();await new Promise(r=>setImmediate(r));t=m.render();assert.equal(date(t).props.value,'');assert.equal(form(t).props.hidden,refreshOK);assert.match(text(t),refreshOK?/Το ραντεβού αποθηκεύτηκε\./:/η προβολή δεν ανανεώθηκε/);await m.flush();assert.equal(m.requests.length,1);assert.equal(m.requests[0].patient_id,'fictional');assert.equal(m.requests[0].appointment_type,'follow_up')}
});

const summaryModule={exports:{}};
const summaryMocks={'@/lib/clinical/patient-record':record,'@/lib/clinic-time':clinicTime,'@/lib/clinical/assessment-link':assessmentLink,'./PatientContext':()=>null,'./ClinicalSummary':()=>null,'./PatientReportedHistory':()=>React.createElement('p',{},'ΑΠΑΝΤΗΣΕΙΣ ΑΣΘΕΝΟΥΣ'),'./PatientRecord.module.css':{}};
new Function('require','module','exports',compiled('PatientRecordSummary.tsx'))(name=>name in summaryMocks?summaryMocks[name]:require(name),summaryModule,summaryModule.exports);
function renderSummary(bundle){return renderToStaticMarkup(React.createElement(summaryModule.exports.default,{bundle,reload:async()=>{},onVisit:()=>{},onMeasurements:()=>{},onTreatment:()=>{},onHistory:()=>{}}))}
test('real summary presentation places existing active issues first and current information before self-report',()=>{
 const bundle=fixture();bundle.medicationSideEffects=[{id:'effect',medication_id:'med',effect_text:'Υποθετική παρενέργεια',noted_on:'2026-01-01'}];
 const html=renderSummary(bundle);assert.ok(html.indexOf('ΑΝΟΙΧΤΑ ΘΕΜΑΤΑ')<html.indexOf('ΣΥΝΟΨΗ ΤΕΛΕΥΤΑΙΑΣ'));assert.ok(html.indexOf('ΤΕΛΕΥΤΑΙΑ ΚΑΤΑΓΕΓΡΑΜΜΕΝΗ')<html.indexOf('ΑΠΑΝΤΗΣΕΙΣ ΑΣΘΕΝΟΥΣ'));assert.match(html,/Υποθετική παρενέργεια/);assert.doesNotMatch(html,/Δεν υπάρχουν καταγεγραμμένα ανοιχτά/);
});
test('empty summary does not invent issues or hide access to self-report',()=>{const html=renderSummary(fixture());assert.doesNotMatch(html,/aria-label="Ανοιχτά θέματα"/);assert.match(html,/Δεν υπάρχουν καταγεγραμμένα ανοιχτά κλινικά θέματα/);assert.match(html,/ΑΠΑΝΤΗΣΕΙΣ ΑΣΘΕΝΟΥΣ/)});

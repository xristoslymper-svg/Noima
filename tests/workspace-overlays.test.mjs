import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import ts from 'typescript';
import React,{act} from 'react';
import * as jsxRuntime from 'react/jsx-runtime';
import renderer from 'react-test-renderer';
import {readFile} from 'node:fs/promises';
import * as workspace from '../lib/clinical/visit-workspace-state.ts';
import * as canonical from '../lib/psychometrics/instruments.ts';
globalThis.IS_REACT_ACT_ENVIRONMENT=true;
async function load(path,dependencies={},globals={},append=''){
 const source=ts.transpileModule((await readFile(path,'utf8'))+append,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText;
 const module={exports:{}};const icons=new Proxy({},{get:()=>()=>React.createElement('i')});
 vm.runInNewContext(source,{module,exports:module.exports,Error,Intl,Date,URL,URLSearchParams,...globals,require:id=>id==='react'?React:id==='react/jsx-runtime'?jsxRuntime:id==='lucide-react'?icons:dependencies[id]||{default:()=>null}});return module.exports;
}
const text=node=>typeof node==='string'?node:node?.children?node.children.map(text).join(''):'';
test('nested overlay Escape closes only top layer; busy layers stay open and scroll lock restores after last cleanup',async()=>{
 const listeners=new Set(),document={body:{style:{overflow:'auto'}},addEventListener:(_,fn)=>listeners.add(fn),removeEventListener:(_,fn)=>listeners.delete(fn)};
 const {useOverlayDismiss}=await load('components/useOverlayDismiss.ts',{}, {document});const calls=[];
 function Layer({id,busy=false}){useOverlayDismiss(()=>calls.push(id),{busy});return null}
 let parent,child;await act(async()=>{parent=renderer.create(React.createElement(Layer,{id:'parent'}))});await act(async()=>{child=renderer.create(React.createElement(Layer,{id:'child',busy:true}))});
 const escape=()=>{let stopped=false;const e={key:'Escape',defaultPrevented:false,preventDefault(){this.defaultPrevented=true},stopImmediatePropagation(){stopped=true}};for(const fn of listeners){fn(e);if(stopped)break}};
 escape();assert.deepEqual(calls,[]);assert.equal(document.body.style.overflow,'hidden');
 await act(async()=>child.update(React.createElement(Layer,{id:'child'})));escape();assert.deepEqual(calls,['child']);
 await act(async()=>child.unmount());assert.equal(document.body.style.overflow,'hidden');escape();assert.deepEqual(calls,['child','parent']);
 await act(async()=>parent.unmount());assert.equal(document.body.style.overflow,'auto');assert.equal(listeners.size,0);
});

test('appointment confirmation closes on outside backdrop and Escape but never on inside clicks',async()=>{
 let cancelled=0,confirmed=0,shown=0;const Component=(await load('components/calendar/AppointmentStartConfirmation.tsx',{'@/components/useOverlayDismiss':{useOverlayDismiss(){}},'@/lib/clinic-time':{formatClinicDateTime:x=>x}})).default;
 let tree;await act(async()=>{tree=renderer.create(React.createElement(Component,{scheduledStart:'2026-10-08',onCancel:()=>cancelled++,onConfirm:()=>confirmed++}),{createNodeMock:()=>({showModal(){shown++}})})});
 const dialog=tree.root.findByType('dialog');const node={getBoundingClientRect:()=>({left:100,right:500,top:100,bottom:500})};
 dialog.props.onClick({target:{},currentTarget:node,clientX:0,clientY:0});assert.equal(cancelled,0);
 dialog.props.onClick({target:node,currentTarget:node,clientX:200,clientY:200});assert.equal(cancelled,0);
 dialog.props.onClick({target:node,currentTarget:node,clientX:0,clientY:0});assert.equal(cancelled,1);
 let prevented=false;dialog.props.onCancel({preventDefault(){prevented=true}});assert.equal(prevented,true);assert.equal(cancelled,2);assert.equal(shown,1);assert.equal(confirmed,0);await act(async()=>tree.unmount());
});

const fixture=sessions=>({patient:{id:'patient',first_name:'TEST',last_name:'Patient'},sessions,appointments:[],history:null,medications:[],medicationEvents:[],medicationRevisions:[],medicationSideEffects:[],assessments:[],sections:[],risks:[],proposals:[],addenda:[],corrections:[]});
test('new-patient Summary exposes exactly one recording CTA; draft initial/follow-up wording and deep-link tabs survive reload',async()=>{
 for(const [sessions,search,expected] of [[[],'','Νέα καταγραφή αρχικής αξιολόγησης'],[[{id:'initial',status:'draft',session_type:'initial_assessment'}],'','Συνέχεια καταγραφής αρχικής αξιολόγησης'],[[{id:'followup',status:'draft',session_type:'follow_up'}],'','Συνέχεια καταγραφής επανεξέτασης'],[[],'?tab=medications',null]]){
  const bundle=fixture(sessions);const listeners=new Map();const window={location:{href:'http://localhost/patients/demo/patient'+search,search,pathname:'/patients/demo/patient',hash:''},addEventListener:(k,v)=>listeners.set(k,v),removeEventListener:k=>listeners.delete(k)};
  const Component=(await load('components/patients/PatientWorkspace.tsx',{'@/lib/clinical/visit-workspace-state':workspace,'@/lib/demo-tester':{getDemoTesterId:()=> 'tester'},'@/components/useOverlayDismiss':{useOverlayDismiss(){}},'next/link':{default:p=>React.createElement('a',p)},'@/components/patients/PatientPanels':{HistoryPanel:()=>null,MedicationsPanel:()=>React.createElement('div',{'data-test':'medications'})},'@/lib/clinic-time':{formatClinicAppointment:x=>x,formatClinicDateTime:x=>x}}, {window,document:{visibilityState:'visible'},setInterval:()=>1,clearInterval(){},fetch:async()=>Response.json({bundle})})).default;
  let tree;await act(async()=>{tree=renderer.create(React.createElement(Component,{patientRef:'patient'}))});
  const buttons=tree.root.findAllByType('button').filter(b=>text(b).includes('καταγραφ'));
  assert.equal(buttons.length,expected?1:0);if(expected)assert.equal(text(buttons[0]),expected+'→');else assert.equal(tree.root.findAllByProps({'data-test':'medications'}).length,1);
  assert.equal(tree.root.findAllByProps({className:'patient-voice-cta'}).length,0);await act(async()=>tree.unmount());assert.equal(listeners.size,0);
 }
});

test('clinician Library previews reuse canonical PHQ-9/GAD-7 wording and do not claim official validation',async()=>{
 const {libraryInstruments}=await load('app/psychometrics/page.tsx',{'@/lib/psychometrics/instruments':canonical,'@/lib/intake/history':{}}, {},'\nexport {instruments as libraryInstruments};');
 for(const code of ['PHQ-9','GAD-7']){const instrument=libraryInstruments.find(x=>x.code===code);assert.deepEqual([...instrument.items], [...canonical.instruments[code].items]);assert.match(instrument.source,/δοκιμαστική/);assert.doesNotMatch(instrument.source,/Επίσημη|επικυρωμένο/)}
 assert.ok(libraryInstruments.some(x=>x.code==='ASRS-6'&&x.area==='ADHD'));
});

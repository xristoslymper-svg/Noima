import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import ts from 'typescript';
import React,{act} from 'react';
import * as jsxRuntime from 'react/jsx-runtime';
import renderer from 'react-test-renderer';
import {readFile} from 'node:fs/promises';
import {medicationEditRequest,medicationStopRequest} from '../lib/medications/plan-actions.ts';
import {searchMedicationCatalog} from '../lib/medications/catalog.ts';

globalThis.IS_REACT_ACT_ENVIRONMENT=true;
const source=ts.transpileModule(await readFile('components/patients/MedicationTable.tsx','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText;
const medication={id:'med-1',medication_name:'TEST Medicine',dose:5,unit:'mg',frequency:'daily',status:'active',started_at:'2026-10-01',ended_at:null,plan_version:2};
const fixture=(medications=[])=>({patient:{id:'patient-1'},sessions:[],medications,medicationEvents:[],medicationRevisions:[],medicationSideEffects:[],clinical_day:'2026-10-08'});
const deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b});return {promise,resolve,reject}};
const text=node=>typeof node==='string'?node:Array.isArray(node)?node.map(text).join(''):node?.children?node.children.map(text).join(''):'';
async function table({bundle=fixture(),post=async()=>({}),reload=async()=>bundle,fetch=async()=>Response.json({items:[]}),sessionId}={}){
 const calls=[],timers=new Map(),guards=new Map();let serial=0;
 const module={exports:{}};
 const icons=new Proxy({},{get:()=>()=>React.createElement('i')});
 vm.runInNewContext(source,{module,exports:module.exports,AbortController,Intl,Date,Number,Error,fetch,setTimeout:fn=>{timers.set(++serial,fn);return serial},clearTimeout:id=>timers.delete(id),require:id=>id==='react'?React:id==='react/jsx-runtime'?jsxRuntime:id==='lucide-react'?icons:id.includes('plan-actions')?{medicationEditRequest,medicationStopRequest}:id.includes('demo-client')?{demoPost:async b=>{calls.push(b);return post(b)}}:{formatClinicDate:v=>v}});
 let tree;
 await act(async()=>{tree=renderer.create(React.createElement(module.exports.default,{bundle,sessionId,reload,editablePlan:true,registerFlusher:(key,flush)=>{guards.set(key,flush);return()=>guards.delete(key)}}))});
 const input=label=>tree.root.findByProps({'aria-label':label});
 const button=label=>tree.root.findAllByType('button').find(b=>text(b).includes(label)||b.props.title===label);
 const change=async(label,value)=>act(async()=>input(label).props.onChange({target:{value}}));
 const click=async label=>act(async()=>button(label).props.onClick());
 const runTimers=()=>{const pending=[...timers.values()];timers.clear();return pending.map(fn=>fn())};
 const close=async()=>act(async()=>tree.unmount());
 return {tree,calls,guards,input,button,change,click,runTimers,close};
}

test('inline add requires fields, preserves free text, sends once on rapid double click, and clears after commit',async()=>{
 const flight=deferred();const ui=await table({post:()=>flight.promise});
 await ui.click('Προσθήκη φαρμάκου');assert.equal(ui.button('Συμπλήρωσε τα πεδία με *').props.disabled,true);
 await ui.change('Φάρμακο','Unavailable TEST medicine');await ui.change('Δόση','2,5');await ui.change('Συχνότητα','nightly');
 await assert.rejects(ui.guards.get('medication-new')(),/Ολοκλήρωσε/);
 const submit=ui.button('Προσθήκη').props.onClick;await act(async()=>{submit();submit()});
 assert.equal(ui.calls.length,1);assert.equal(ui.calls[0].name,'Unavailable TEST medicine');assert.equal(ui.calls[0].dose,2.5);assert.equal(ui.calls[0].session_id,null);
 await act(async()=>flight.resolve({}));assert.ok(ui.button('Προσθήκη φαρμάκου'));await ui.guards.get('medication-new')();await ui.close();
});

test('cancel does not write; API failure retains inputs and explicit error for retry',async()=>{
 const ui=await table({post:async()=>{throw new Error('TEST API unavailable')}});
 await ui.click('Προσθήκη φαρμάκου');await ui.change('Φάρμακο','TEST text');await ui.click('Ακύρωση');assert.equal(ui.calls.length,0);
 await ui.click('Προσθήκη φαρμάκου');await ui.change('Φάρμακο','TEST text');await ui.change('Δόση','5');await ui.change('Συχνότητα','daily');await ui.click('Προσθήκη');
 assert.equal(ui.input('Φάρμακο').props.value,'TEST text');assert.match(text(ui.tree.root),/TEST API unavailable/);await ui.close();
});

test('edit dose, unit and frequency uses plan version; cancel restores values; stop rejects a date before start',async()=>{
 const ui=await table({bundle:fixture([medication]),sessionId:'draft-1'});
 await ui.click('Τροποποίηση');await ui.change('Δόση TEST Medicine','10');await ui.click('Ακύρωση');assert.equal(ui.calls.length,0);
 await ui.click('Τροποποίηση');assert.equal(ui.input('Δόση TEST Medicine').props.value,'5');
 await ui.change('Δόση TEST Medicine','10');await ui.change('Μονάδα TEST Medicine','ml');await ui.change('Συχνότητα TEST Medicine','twice daily');await ui.click('Αποθήκευση');
 assert.equal(ui.calls[0].expected_version,2);assert.equal(ui.calls[0].unit,'ml');assert.equal(ui.calls[0].frequency,'twice daily');assert.equal(ui.calls[0].session_id,'draft-1');
 await ui.click('Διακοπή');const date=ui.tree.root.findByProps({type:'date'});await act(async()=>date.props.onChange({target:{value:'2026-09-30'}}));await ui.click('Επιβεβαίωση διακοπής');
 assert.equal(ui.calls.length,1);assert.match(text(ui.tree.root),/δεν μπορεί να προηγείται/);
 await act(async()=>date.props.onChange({target:{value:'2026-10-08'}}));await ui.click('Επιβεβαίωση διακοπής');assert.equal(ui.calls[1].event_type,'stopped');assert.equal(ui.calls[1].expected_version,2);await ui.close();
});

test('new medication only links to an explicitly supplied draft, never an unrelated folder draft',async()=>{
 const bundle={...fixture(),sessions:[{id:'unrelated-draft',status:'draft'}]};const ui=await table({bundle});
 await ui.click('Προσθήκη φαρμάκου');await ui.change('Φάρμακο','TEST Medicine');await ui.change('Δόση','5');await ui.change('Συχνότητα','daily');await ui.click('Προσθήκη');assert.equal(ui.calls[0].session_id,null);await ui.close();
});

test('save committed but reload failed clears draft and reports reconciliation instead of retrying the add',async()=>{
 const ui=await table({reload:async()=>{throw new Error('offline')}});
 await ui.click('Προσθήκη φαρμάκου');await ui.change('Φάρμακο','TEST Medicine');await ui.change('Δόση','5');await ui.change('Συχνότητα','daily');await ui.click('Προσθήκη');
 assert.equal(ui.calls.length,1);assert.equal(ui.input('Φάρμακο').props.value,'');assert.match(text(ui.tree.root),/αγωγή προστέθηκε/);await ui.close();
});

test('autocomplete supports keyboard selection and mouse selection without a blur timer reopening results',async()=>{
 const items=[{id:'q',brand:'SEROQUEL',active:'Quetiapine'},{id:'g',brand:'QUETIAPINE',active:'Quetiapine'}];
 const ui=await table({fetch:async()=>Response.json({items})});await ui.click('Προσθήκη φαρμάκου');await act(async()=>ui.input('Φάρμακο').props.onFocus());await ui.change('Φάρμακο','sero');await act(async()=>Promise.all(ui.runTimers()));
 const key=async key=>act(async()=>ui.input('Φάρμακο').props.onKeyDown({key,preventDefault(){},stopPropagation(){}}));
 await key('ArrowDown');await key('ArrowDown');await key('ArrowUp');await key('Enter');assert.equal(ui.input('Φάρμακο').props.value,'SEROQUEL');
 await act(async()=>Promise.all(ui.runTimers()));assert.equal(ui.tree.root.findAllByProps({role:'listbox'}).length,0);
 await ui.change('Φάρμακο','quet');await act(async()=>Promise.all(ui.runTimers()));const option=ui.tree.root.findAllByProps({role:'option'})[1];let prevented=false;
 option.props.onMouseDown({preventDefault(){prevented=true}});assert.equal(prevented,true);await act(async()=>option.props.onClick());assert.equal(ui.input('Φάρμακο').props.value,'QUETIAPINE');await ui.close();
});

test('rapid search ignores older responses; Escape, blur and empty query suppress in-flight results',async()=>{
 const requests=[];const ui=await table({fetch:()=>{const f=deferred();requests.push(f);return f.promise}});await ui.click('Προσθήκη φαρμάκου');await act(async()=>ui.input('Φάρμακο').props.onFocus());
 await ui.change('Φάρμακο','old');act(()=>{ui.runTimers()});await ui.change('Φάρμακο','new');act(()=>{ui.runTimers()});
 await act(async()=>requests[1].resolve(Response.json({items:[{id:'new',brand:'NEW',active:'TEST'}]})));await act(async()=>requests[0].resolve(Response.json({items:[{id:'old',brand:'OLD',active:'TEST'}]})));assert.match(text(ui.tree.root),/NEW/);assert.doesNotMatch(text(ui.tree.root),/OLD/);
 await ui.change('Φάρμακο','escape');act(()=>{ui.runTimers()});await act(async()=>ui.input('Φάρμακο').props.onKeyDown({key:'Escape',preventDefault(){},stopPropagation(){}}));
 await act(async()=>requests[2].resolve(Response.json({items:[{id:'late',brand:'LATE',active:'TEST'}]})));assert.equal(ui.tree.root.findAllByProps({role:'listbox'}).length,0);
 await ui.change('Φάρμακο','blur');act(()=>{ui.runTimers()});await act(async()=>ui.input('Φάρμακο').props.onBlur());await act(async()=>requests[3].resolve(Response.json({items:[{id:'blur',brand:'BLUR',active:'TEST'}]})));assert.equal(ui.tree.root.findAllByProps({role:'listbox'}).length,0);
 await ui.change('Φάρμακο','empty');act(()=>{ui.runTimers()});await ui.change('Φάρμακο','');await act(async()=>requests[4].resolve(Response.json({items:[{id:'empty',brand:'EMPTY',active:'TEST'}]})));assert.equal(ui.tree.root.findAllByProps({role:'listbox'}).length,0);await ui.close();
});

test('catalog searches brands, ingredients and Greek accents; empty/unavailable query remains free text',()=>{
 assert.ok(searchMedicationCatalog('sErO').some(x=>x.brand==='SEROQUEL'));
 assert.ok(searchMedicationCatalog('quetiapine').some(x=>x.brand==='SEROQUEL'));
 assert.deepEqual(searchMedicationCatalog('σερτραλίνη'),searchMedicationCatalog('ΣΕΡΤΡΑΛΙΝΗ'));
 assert.deepEqual(searchMedicationCatalog(''),[]);assert.deepEqual(searchMedicationCatalog('Unavailable fictional medication'),[]);
});

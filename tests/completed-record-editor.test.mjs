import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import ts from 'typescript';
import * as document from '../lib/clinical/visit-document.ts';
import * as corrections from '../lib/clinical/corrections.ts';
import * as jsx from 'react/jsx-runtime';
const source=ts.transpileModule(await readFile('components/patients/CompletedRecordEditor.tsx','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText;
// Preserve hook state over canonical prop updates, including the initial partial
// visit response. Actual React/browser rendering is separately checked locally.
function mount(){
 const cells=[];let cursor=0;const writes=[];
 const hooks={useMemo:f=>f(),useEffect:()=>{},useState(initial){const index=cursor++;if(!(index in cells))cells[index]=initial;return [cells[index],value=>{cells[index]=typeof value==='function'?value(cells[index]):value}]},useRef(initial){const index=cursor++;if(!(index in cells))cells[index]={current:initial};return cells[index]}};
 const module={exports:{}};
 vm.runInNewContext(source,{module,exports:module.exports,crypto,console,require:id=>id==='react'?hooks:id==='react/jsx-runtime'?jsx:id.includes('visit-document')?document:id.includes('corrections')?corrections:id.includes('demo-client')?{demoPost:async input=>writes.push(input)}:id.includes('clinic-time')?{formatClinicDateTime:()=>''}:{default:()=>null}});
 return {writes,render(props){cursor=0;return module.exports.default(props)}};
}
function nodes(tree){if(!tree)return [];if(Array.isArray(tree))return tree.flatMap(nodes);return typeof tree==='object'&&tree.props?[tree,...nodes(tree.props.children)]:[]}
const text=tree=>nodes(tree).flatMap(n=>Array.isArray(n.props.children)?n.props.children.filter(c=>typeof c==='string'):typeof n.props.children==='string'?[n.props.children]:[]).join(' ');
function props(full=false){const session={id:'s',session_type:'follow_up',status:'completed',started_at:'2026-10-07'};return {session,bundle:{sections:full?['interview','mse','assessment','plan','review'].map(key=>({session_id:'s',section_key:key,content:'Recorded '+key})):[],risks:full?[{session_id:'s',suicidal_ideation:'negative'}]:[],corrections:[]},reload:async()=>{},onBack:()=>{},registerFlusher:()=>()=>{},onDirtyChange:()=>{}}}
test('late canonical response populates view and edit snapshot without spurious blank corrections',()=>{
 const component=mount();let tree=component.render(props());
 assert.equal(nodes(tree).find(n=>n.type==='button'&&n.props.disabled)?.props.disabled,true);
 const full=props(true);tree=component.render(full);assert.ok(nodes(tree).some(n=>n.type==='textarea'&&n.props.value==='Recorded plan'));
 nodes(tree).find(n=>n.type==='button'&&n.props.children==='Διόρθωση καταγραφής').props.onClick();tree=component.render(full);
 assert.ok(text(tree).includes('Καμία αλλαγή'));assert.ok(nodes(tree).some(n=>n.type==='textarea'&&n.props.value==='Recorded plan'));
 assert.equal(component.writes.length,0);
});
test('active correction remains based on its opening snapshot and rejects a competing correction',async()=>{
 const component=mount(),full=props(true);let tree=component.render(full);
 nodes(tree).find(n=>n.type==='button'&&n.props.children==='Διόρθωση καταγραφής').props.onClick();tree=component.render(full);
 nodes(tree).find(n=>n.type==='textarea'&&n.props.value==='Recorded plan').props.onChange({target:{value:'My corrected plan'}});
 tree=component.render(full);assert.ok(text(tree).includes('Αποθήκευση διόρθωσης (1)'));
 const changed=structuredClone(full.bundle);changed.corrections=[{id:'c',session_id:'s',created_at:'2026-10-07',reason:'Concurrent',patch:{plan:{before:'Recorded plan',after:'Other corrected plan'}}}];
 const newer={...full,bundle:changed};tree=component.render(newer);
 assert.ok(nodes(tree).some(n=>n.type==='textarea'&&n.props.value==='My corrected plan'));
 const reason=nodes(tree).find(n=>n.type==='input'&&n.props.placeholder);reason.props.onChange({target:{value:'Clarification'}});tree=component.render(newer);
 const save=nodes(tree).find(n=>n.type==='button'&&typeof n.props.onClick==='function'&&String(n.props.children).includes('Αποθήκευση'));
 await save.props.onClick();tree=component.render(newer);assert.ok(text(tree).includes('διορθώθηκε όσο'));assert.equal(component.writes.length,0);
});

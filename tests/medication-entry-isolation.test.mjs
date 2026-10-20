import {intlTestModule} from './helpers/i18n.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import {medicationSessionId} from '../lib/clinical/treatment-plan.ts';
import * as jsx from 'react/jsx-runtime';

const source=ts.transpileModule(readFileSync('components/patients/MedicationTable.tsx','utf8')+'\nexport {SideEffectEntry};',{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText;
const nodes=t=>!t?[]:Array.isArray(t)?t.flatMap(nodes):t.props?[t,...nodes(t.props.children)]:[];
function entry(id){
 const cells=[];let cursor=0;const posts=[];
 const hooks={useState(v){const i=cursor++;if(!(i in cells))cells[i]=v;return [cells[i],v=>cells[i]=v]},useEffect(){},useCallback:f=>f};
 const module={exports:{}};
 vm.runInNewContext(source,{module,exports:module.exports,require:name=>name==='react'?hooks:name==='react/jsx-runtime'?jsx:name.includes('treatment-plan')?{medicationSessionId}:name.includes('MedicationSaveScope')?{useMedicationPost:()=>async body=>posts.push(body)}:name.includes('demo-client')?{demoPost:async body=>posts.push(body)}:{}});
 const render=()=>{cursor=0;return module.exports.SideEffectEntry({bundle:{patient:{id:'patient'},sessions:[{id:'visit',patient_id:'patient',status:'draft'}]},medication:{id,medication_name:'Synthetic '+id},sessionId:'visit',today:'2026-10-12',firstAssessment:true,reload:async()=>{}})};
 return {render,posts};
}
test('adding a second medication does not open tolerance entry or inherit the first row draft',async()=>{
 const first=entry('one');assert.equal(first.render().type,'button');first.render().props.onClick();
 nodes(first.render()).find(n=>n.props['aria-label']==='Νέα παρενέργεια — Synthetic one').props.onChange({target:{value:'Synthetic observation'}});
 const second=entry('two');assert.equal(second.render().type,'button');second.render().props.onClick();
 assert.equal(nodes(second.render()).find(n=>n.type==='input').props.value,'');
 assert.equal(nodes(first.render()).find(n=>n.type==='input').props.value,'Synthetic observation');
 nodes(first.render()).find(n=>n.type==='select').props.onChange({target:{value:'mild'}});
 nodes(first.render()).find(n=>n.type==='button'&&n.props.className==='primary').props.onClick();
 await new Promise(resolve=>setImmediate(resolve));
 assert.equal(first.posts[0].medication_id,'one');assert.equal(second.posts.length,0);
 assert.equal(first.render().type,'button');
 const cancel=nodes(second.render()).filter(n=>n.type==='button').at(-1);cancel.props.onClick();assert.equal(second.render().type,'button');
});

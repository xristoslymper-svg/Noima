import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import * as jsx from 'react/jsx-runtime';
import {appendAssessmentDictation} from '../lib/clinical/assessment-dictation.ts';
import {initialDocument} from '../lib/clinical/visit-document.ts';

test('reviewed field dictation preserves existing text, diagnostic metadata, other fields and stored keys',()=>{
 const doc=initialDocument('assessment');
 const field=doc.fields.find(f=>f.key==='differential-1');
 field.text='Υπάρχουσα υπόθεση';field.status='provisional';
 field.codes=[{code:'F32.9',label:'Depressive episode',system:'WHO ICD-10',edition:'2019'}];
 const snapshot=structuredClone(doc);
 const reordered={...doc,fields:[...doc.fields].reverse()};
 const result=appendAssessmentDictation(reordered,'differential-1','  Νέα στοιχεία υπέρ και κατά  ');
 assert.deepEqual(result.fields.find(f=>f.key==='differential-1'),{...field,text:'Υπάρχουσα υπόθεση\nΝέα στοιχεία υπέρ και κατά'});
 assert.deepEqual(result.fields.filter(f=>f.key!=='differential-1'),reordered.fields.filter(f=>f.key!=='differential-1'));
 assert.deepEqual(doc,snapshot);
 assert.deepEqual(initialDocument('assessment','',JSON.parse(JSON.stringify(result))),result);
 const impression=appendAssessmentDictation(result,'impression','Κλινικό συμπέρασμα');
 assert.equal(impression.fields.find(f=>f.key==='impression').text,'Κλινικό συμπέρασμα');
 assert.deepEqual(impression.fields.find(f=>f.key==='differential-1'),result.fields.find(f=>f.key==='differential-1'));
});
test('empty/cancelled transcript, removed target and MSE cannot change a document',()=>{
 const doc=initialDocument('assessment');
 assert.equal(appendAssessmentDictation(doc,'impression','  '),doc);
 assert.equal(appendAssessmentDictation(doc,'removed-field','Text'),doc);
 const mse=initialDocument('mse');
 assert.equal(appendAssessmentDictation(mse,'appearance','Text'),mse);
});

function harness(){
 let state=false;const cleanups=[];const flushers=new Map(),dirty=[],inserted=[];
 const ref={current:false};const mod={exports:{}};
 const Dialog=()=>null;
 const hooks={useState:()=>[state,value=>{state=value}],useRef:()=>ref,useEffect:effect=>{const cleanup=effect();if(cleanup)cleanups.push(cleanup)}};
 vm.runInNewContext(ts.transpileModule(readFileSync('components/patients/AssessmentFieldDictation.tsx','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX}}).outputText,{
  exports:mod.exports,module:mod,require:name=>name==='react'?hooks:name==='react/jsx-runtime'?jsx:name==='lucide-react'?{Mic2:()=>null}:name.endsWith('.module.css')?{default:{microphone:'microphone'}}:{default:Dialog},
 });
 const render=()=>mod.exports.default({fieldKey:'impression',title:'Κλινική εκτίμηση',onInsert:text=>inserted.push(text),registerFlusher:(key,flush)=>{flushers.set(key,flush);return()=>flushers.delete(key)},onDirtyChange:(key,value)=>dirty.push({key,value})});
 return {render,Dialog,flushers,dirty,inserted,cleanups};
}
test('each field opens the existing dictation dialog; navigation is blocked until review or cancellation',async()=>{
 const h=harness();let tree=h.render();
 const button=tree.props.children[0];
 assert.equal(button.type,'button');assert.equal(button.props.type,'button');
 assert.equal(button.props['aria-label'],'Υπαγόρευση: Κλινική εκτίμηση');
 button.props.onClick();tree=h.render();
 const dialog=tree.props.children[1];assert.equal(dialog.type,h.Dialog);
 assert.equal(dialog.props.title,'Κλινική εκτίμηση');
 assert.deepEqual(h.inserted,[]);
 const flush=h.flushers.get('section:assessment:dictation:impression');
 await assert.rejects(flush(),/Ολοκληρώστε ή κλείστε την υπαγόρευση/);
 dialog.props.onInsert('Ελεγμένη μεταγραφή');
 assert.deepEqual(h.inserted,['Ελεγμένη μεταγραφή']);
 await flush();assert.equal(h.dirty.at(-1).value,false);
 assert.equal(h.render().props.children[1],false);
 h.render().props.children[0].props.onClick();
 h.render().props.children[1].props.onClose();
 assert.deepEqual(h.inserted,['Ελεγμένη μεταγραφή']);await flush();
 h.cleanups.forEach(cleanup=>cleanup());assert.equal(h.dirty.at(-1).value,false);
});

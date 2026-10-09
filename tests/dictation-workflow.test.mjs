import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import ts from 'typescript';
import {readFileSync} from 'node:fs';
import * as text from '../lib/clinical/dictation-text.ts';
const compiled=ts.transpileModule(readFileSync('components/dictation/SectionDictation.tsx','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX}}).outputText;
const children=node=>Array.isArray(node)?node.flatMap(children):node&&typeof node==='object'?[node,...children(node.props?.children)]:[];
const words=node=>Array.isArray(node)?node.map(words).join(''):node&&typeof node==='object'?words(node.props?.children)+(node.type==='textarea'?node.props.value||'':''):String(node??'');
function harness({responses=[],denied=false,saved=null}={}){
 const states=[],refs=[],deps=[],effects=[],storage=new Map(saved?[['noima-dictation:visit:closure',JSON.stringify(saved)]]:[]),inserted=[];let index=0,refIndex=0,effectIndex=0,stopped=0,interval;
 const react={useRef:value=>{const i=refIndex++;return refs[i]??=( {current:value})},useState:value=>{const i=index++;if(!(i in states))states[i]=value;return [states[i],next=>states[i]=typeof next==='function'?next(states[i]):next]},useEffect:(fn,d)=>{const i=effectIndex++;if(!deps[i]||d.some((v,j)=>v!==deps[i][j])){deps[i]=d;effects.push(fn)}}};
 class Recorder{static isTypeSupported(){return true}constructor(){this.state='inactive';this.mimeType='audio/webm';Recorder.last=this}start(){this.state='recording'}stop(){this.state='inactive';this.ondataavailable?.({data:new Blob(['x'.repeat(1000)])});this.onstop?.()}}
 const mod={exports:{}};vm.runInNewContext(compiled,{module:mod,exports:mod.exports,Blob,FormData,AbortController,DOMException,navigator:{mediaDevices:{getUserMedia:async()=>{if(denied)throw new DOMException('Denied','NotAllowedError');return {getTracks:()=>[{stop:()=>stopped++}]}}}},MediaRecorder:Recorder,setInterval:fn=>{interval=fn;return 1},clearInterval(){},sessionStorage:{getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v),removeItem:k=>storage.delete(k)},fetch:async()=>{const r=responses.shift();if(r instanceof Error)throw r;return r},require:n=>n==='react'?react:n==='react/jsx-runtime'?{jsx:(type,props)=>({type,props}),jsxs:(type,props)=>({type,props})}:n==='lucide-react'?{Mic2:'mic',Square:'stop',X:'x'}:text});
 let tree;function render(){index=refIndex=effectIndex=0;tree=mod.exports.default({title:'QA',storageKey:'visit:closure',onClose(){},onInsert:t=>inserted.push(t)});for(const n of children(tree))if(n.props?.ref)n.props.ref.current={showModal(){}};const pending=effects.splice(0);pending.forEach(fn=>fn());return tree}render();render();
 const click=async label=>{render();const b=children(tree).find(n=>n.type==='button'&&words(n).includes(label));assert.ok(b,label);b.props.onClick();await new Promise(r=>setImmediate(r));render();render()};
 return {render,click,storage,inserted,text:()=>words(render()),stopped:()=>stopped,field:(label,value)=>{render();const node=children(tree).find(n=>n.type==='label'&&words(n).startsWith(label));const input=children(node).find(n=>n.type==='textarea');assert.ok(input);input.props.onChange({target:{value}});render();render()}};
}
test('consecutive recordings preserve corrected segments in order; failed second transcription can retry without losing accepted text',async()=>{
 const h=harness({responses:[Response.json({text:'Sertraline 50 mg. Δεν αναφέρει ιδεασμό.'}),new Error('offline'),Response.json({text:'Αναφέρει ήπια ναυτία.'})]});
 await h.click('Έναρξη ηχογράφησης');await h.click('Διακοπή & μεταγραφή');h.field('Κείμενο προς έλεγχο','Sertraline 25 mg. Δεν διερευνήθηκε ιδεασμός.');
 await h.click('Προσθήκη επόμενου τμήματος');await h.click('Διακοπή & μεταγραφή');assert.ok(h.text().includes('Δεν διερευνήθηκε'));assert.ok(h.text().includes('Επανάληψη μεταγραφής'));
 await h.click('Επανάληψη μεταγραφής');await h.click('Χρήση κειμένου');assert.deepEqual(h.inserted,['Sertraline 25 mg. Δεν διερευνήθηκε ιδεασμός.\n\nΑναφέρει ήπια ναυτία.']);assert.equal(h.storage.size,0);assert.ok(h.stopped()>=2);
});
test('microphone denial retains recovered text and supports manual continuation without audio persistence',async()=>{
 const h=harness({denied:true,saved:{accepted:'Ελεγμένο πρώτο τμήμα.',text:''}});await h.click('Έναρξη ηχογράφησης');assert.ok(h.text().includes('Δεν δόθηκε πρόσβαση'));h.field('Κείμενο προς έλεγχο','Δεύτερο χειροκίνητο τμήμα.');assert.ok([...h.storage.values()].every(v=>!v.includes('audio')&&!v.includes('blob')));await h.click('Χρήση κειμένου');assert.equal(h.inserted[0],'Ελεγμένο πρώτο τμήμα.\n\nΔεύτερο χειροκίνητο τμήμα.');
});
test('blank segments do not add separators, repeated dictated words remain, and capacity fails explicitly',()=>{assert.equal(text.appendDictationText('  Α  ',' '),'Α');assert.equal(text.appendDictationText('Α','Α'),'Α\n\nΑ');assert.throws(()=>text.appendDictationText('x'.repeat(20000),'y'),/20.000/)});

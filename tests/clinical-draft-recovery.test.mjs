import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import * as reconciliation from '../lib/clinical/draft-reconciliation.ts';

const code=ts.transpileModule(readFileSync('components/patients/useClinicalDraft.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
function mount({stored,write,onSaved=async()=>{}}={}){
 const cells=[],effects=[],timers=new Map(),storage=new Map(stored?[['mse',JSON.stringify(stored)]]:[]);
 let cursor=0,timerId=0,props;
 const changed=(a,b)=>!a||a.length!==b.length||b.some((v,i)=>!Object.is(v,a[i]));
 const react={
  useState(initial){const i=cursor++;if(!(i in cells))cells[i]=initial;return [cells[i],v=>{cells[i]=typeof v==='function'?v(cells[i]):v}]},
  useRef(initial){const i=cursor++;return cells[i]??=( {current:initial})},
  useCallback(fn,deps){const i=cursor++;if(changed(cells[i]?.deps,deps))cells[i]={fn,deps};return cells[i].fn},
  useEffect(fn,deps){const i=cursor++;if(changed(cells[i]?.deps,deps)){const old=cells[i];cells[i]={deps,fn};effects.push(()=>{old?.cleanup?.();cells[i].cleanup=fn()})}},
 };
 const module={exports:{}};
 vm.runInNewContext(code,{module,exports:module.exports,Error,require:id=>id==='react'?react:reconciliation,
  sessionStorage:{getItem:k=>storage.get(k)??null,setItem:(k,v)=>storage.set(k,v),removeItem:k=>storage.delete(k)},
  setTimeout:fn=>{timers.set(++timerId,fn);return timerId},clearTimeout:id=>timers.delete(id),
 });
 const render=(next={})=>{props={storageKey:'mse',initial:'',version:1,write,onSaved,onDirty:()=>{},...props,...next};cursor=0;const draft=module.exports.useClinicalDraft(props);while(effects.length)effects.shift()();return draft};
 return {render,storage,timers,replay(){for(const c of cells)if(c?.fn&&c?.deps&&'cleanup' in c){c.cleanup?.();c.cleanup=c.fn()}}};
}

test('same-version recovered MSE retries automatically without a conflict',async()=>{
 const writes=[];const h=mount({stored:{value:'new MSE',version:1},write:async(value,version)=>{writes.push({value,version});return {value,version:2}}});
 h.render();let d=h.render();assert.equal(d.value,'new MSE');assert.equal(d.error,'');assert.equal(d.hasConflict,false);
 h.replay();assert.equal(h.timers.size,1);
 await d.flush();d=h.render({initial:'new MSE',version:2});assert.equal(d.hasConflict,false);assert.equal(writes.length,1);assert.equal(h.storage.has('mse'),false);
});

test('canonical refresh during an in-flight save does not recover current typing or block it',async()=>{
 let finish;const writes=[];let h;
 h=mount({write:(value,version)=>{writes.push({value,version});if(writes.length===1)return new Promise(resolve=>{finish=()=>resolve({value,version:2})});return Promise.resolve({value,version:3})},onSaved:async()=>{if(writes.length===1){h.render({initial:'first',version:2});const d=h.render();assert.equal(d.hasConflict,false);assert.equal(d.error,'');assert.equal(JSON.parse(h.storage.get('mse')).version,2)}}});
 let d=h.render();d.change('first');d=h.render();const saving=d.flush();d.change('second');finish();await saving;
 d=h.render({initial:'second',version:3});assert.equal(d.value,'second');assert.equal(d.error,'');assert.equal(d.hasConflict,false);
 assert.deepEqual(writes,[{value:'first',version:1},{value:'second',version:2}]);
});

test('genuinely stale recovery remains protected from overwriting the server',async()=>{
 let writes=0;const h=mount({stored:{value:'local',version:1},write:async()=>{writes++}});
 h.render({initial:'remote',version:2});const d=h.render();assert.equal(d.value,'local');assert.equal(d.hasConflict,true);await assert.rejects(d.flush());assert.equal(writes,0);assert.ok(h.storage.has('mse'));
});

test('network error permits retry while a real write conflict blocks it',async()=>{
 for(const [message,conflict] of [['Network unavailable',false],['stale',true]]){
  const h=mount({write:async()=>{throw new Error(message)}});let d=h.render();d.change('local');await assert.rejects(d.flush());d=h.render();assert.equal(d.hasConflict,conflict);assert.equal(d.error,message);assert.ok(h.storage.has('mse'));
 }
});

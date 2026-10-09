import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import ts from 'typescript';
import {readFileSync} from 'node:fs';
import * as reconciliation from '../lib/clinical/draft-reconciliation.ts';
import {emptyContinuity,mergeContinuityProposal} from '../lib/clinical/continuity.ts';

const compiled=ts.transpileModule(readFileSync(process.env.NOIMA_DRAFT_TEST_SOURCE||'components/patients/useClinicalDraft.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText;
const deferred=()=>{let resolve;const promise=new Promise(r=>resolve=r);return {promise,resolve}};
// Executes the actual hook with controlled React commits, storage and delayed I/O.
// It is a component simulation, not a browser or a clinician usability test.
function harness({initial={a:'',b:''},version=0,storage=new Map(),write:customWrite,onSaved:customSaved,quietRecovery=false}={}){
 const cells=[],dependencies=[],effects=[],timers=new Map();let cursor=0,clock=0,result,props,server={value:initial,version},writes=[];
 const react={useRef:v=>{const i=cursor++;return cells[i]??={current:v}},useState:v=>{const i=cursor++;if(!(i in cells))cells[i]=v;return [cells[i],next=>cells[i]=typeof next==='function'?next(cells[i]):next]},useCallback:(fn,d)=>{const i=cursor++;if(!dependencies[i]||d.some((v,j)=>v!==dependencies[i][j])){dependencies[i]=d;cells[i]=fn}return cells[i]},useEffect:(fn,d)=>{const i=cursor++;if(!dependencies[i]||d.some((v,j)=>v!==dependencies[i][j])){dependencies[i]=d;effects.push(fn)}}};
 const mod={exports:{}};vm.runInNewContext(compiled,{exports:mod.exports,module:mod,require:n=>n==='react'?react:reconciliation,Date,JSON,Error,setTimeout:fn=>{timers.set(++clock,fn);return clock},clearTimeout:id=>timers.delete(id),sessionStorage:{getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v),removeItem:k=>storage.delete(k)}});
 props={storageKey:'qa:closure',initial,version,quietRecovery,onDirty(){},onSaved:async()=>{if(customSaved)await customSaved();refresh()},write:async(value,v)=>{writes.push({value,v});if(customWrite)server=await customWrite(value,v,server);else{if(v!==server.version)throw Error('stale_closure');server={value,version:v+1}}return server}};
 function render(){cursor=0;result=mod.exports.useClinicalDraft(props);effects.splice(0).forEach(fn=>fn());return result}
 function refresh(incoming=server){props={...props,initial:incoming.value,version:incoming.version};render();render()}
 render();render();
 return {get draft(){return render()},render,refresh,storage,writes,get server(){return server},remote(value){server={value,version:server.version+1};refresh()},async tick(){const jobs=[...timers.values()];timers.clear();jobs.forEach(fn=>fn());await new Promise(r=>setImmediate(r));render();render()}};
}

test('AI apply → clinician correction → autosave + normal refresh retains exact approved wording',async()=>{
 const h=harness({initial:{...emptyContinuity}});
 h.draft.change(mergeContinuityProposal(h.draft.value,{...emptyContinuity,clinical_state_summary:'Πρόταση AI: βελτίωση',treatment_decision:'Συνέχιση',next_review_focus:'Ύπνος',source:'ai_assisted'}));
 h.draft.change({...h.draft.value,clinical_state_summary:'ΔΙΟΡΘΩΣΗ: ο κίνδυνος δεν αξιολογήθηκε.'});
 await h.tick();h.refresh();await h.draft.flush();
 assert.equal(h.server.value.clinical_state_summary,'ΔΙΟΡΘΩΣΗ: ο κίνδυνος δεν αξιολογήθηκε.');assert.equal(h.draft.error,'');assert.equal(h.storage.size,0);
 assert.equal(h.draft.version(),1);
});

test('edits during an in-flight write are saved with the acknowledged version; refresh never replays recovery',async()=>{
 const gate=deferred();let count=0;
 const h=harness({write:async(value,v,server)=>{if(++count===1)await gate.promise;assert.equal(v,server.version);return {value,version:v+1}}});
 h.draft.change({a:'first',b:''});const flush=h.draft.flush();
 h.draft.change({...h.draft.value,a:'corrected'});h.draft.change({...h.draft.value,b:'second field'});
 h.refresh();assert.equal(h.draft.value.a,'corrected');gate.resolve();await flush;
 assert.equal(h.draft.error,'');assert.equal(h.server.value.a,'corrected');assert.equal(h.server.value.b,'second field');assert.deepEqual(h.writes.map(w=>w.v),[0,1]);
});

test('rapid consecutive field updates use latest local content even before a React render',async()=>{
 const h=harness();const draft=h.draft;
 draft.change(current=>({...current,a:'A'}));draft.change(current=>({...current,b:'B'}));await draft.flush();
 assert.deepEqual(JSON.parse(JSON.stringify(h.server.value)),{a:'A',b:'B'});
});

test('same-version interrupted draft retries safely without routine recovery intervention',async()=>{
 const storage=new Map([['qa:closure',JSON.stringify({value:{a:'recovered',b:''},version:0})]]);
 const h=harness({storage});assert.equal(h.draft.value.a,'recovered');assert.equal(h.draft.error,'');await h.tick();assert.equal(h.server.value.a,'recovered');assert.equal(storage.size,0);
});

test('genuine concurrent edit remains blocked, preserves local text and never overwrites remote',async()=>{
 const h=harness();h.draft.change({a:'local',b:''});h.remote({a:'other clinician',b:''});
 await assert.rejects(h.draft.flush(),/stale/);assert.equal(h.draft.value.a,'local');assert.equal(h.server.value.a,'other clinician');assert.ok(h.storage.get('qa:closure').includes('local'));
 await assert.rejects(h.draft.flush(),/σύγκρουση/);
 h.draft.acceptServer(h.server.value,h.server.version);assert.equal(h.draft.value.a,'other clinician');assert.equal(h.draft.olderRecovery.a,'local');
 h.draft.resolve(h.draft.olderRecovery,h.server.value,h.server.version);await h.draft.flush();assert.equal(h.server.value.a,'local');
});

test('stale recovered draft cannot replace a newer server record',async()=>{
 const storage=new Map([['qa:closure',JSON.stringify({value:{a:'old local',b:''},version:0})]]);
 const h=harness({initial:{a:'server',b:''},version:2,storage});assert.equal(h.draft.value.a,'old local');await assert.rejects(h.draft.flush(),/σύγκρουση/);assert.equal(h.writes.length,0);assert.equal(h.server.value.a,'server');
});

test('pending recovery is rebased after own successful write before browser interruption',async()=>{
 const gate=deferred(),reload=deferred();
 const h=harness({write:async(value,v)=>{await gate.promise;return {value,version:v+1}},onSaved:()=>reload.promise});
 h.draft.change({a:'first',b:''});const flush=h.draft.flush();h.draft.change({a:'second',b:''});
 // Delay parent reload to inspect the browser recovery envelope between writes.
 h.refresh();gate.resolve();await new Promise(r=>setImmediate(r));
 const envelope=JSON.parse(h.storage.get('qa:closure'));assert.equal(envelope.version,1);assert.equal(envelope.value.a,'second');
 const recovered=harness({initial:h.server.value,version:h.server.version,storage:h.storage});assert.equal(recovered.draft.error,'');await recovered.draft.flush();assert.equal(recovered.server.value.a,'second');
 reload.resolve();await flush;assert.equal(h.server.value.a,'second');assert.equal(h.draft.error,'');
});

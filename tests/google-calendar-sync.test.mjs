import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import * as crypto from 'node:crypto';
const modules={};
for(const name of ['google-sync','google-client','google-runner','google-oauth','google-preview-state']){
 const source=readFileSync('lib/calendar/'+name+'.ts','utf8'),exports={};
 vm.runInNewContext(ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{exports,require:path=>path==='node:crypto'?crypto:modules[path.replace('./','')],process,URL,URLSearchParams,fetch,Response,AbortSignal,Date,Map,Set});
 modules[name]=exports;
}
const {planSync,googleBody,googleEventId,remoteSlot}=modules['google-sync'];
const {GoogleCalendarClient,GoogleCalendarError}=modules['google-client'];
const {synchronizeCalendar}=modules['google-runner'];
const workspace='00000000-0000-4000-8000-000000000001',id='00000000-0000-4000-8000-000000000002';
const local={id,revision:'1',start:'2026-11-02T15:00:00+02:00',end:'2026-11-02T16:00:00+02:00',cancelled:false};
const moved={...local,revision:'2',start:'2026-11-02T17:00:00+02:00',end:'2026-11-02T18:00:00+02:00'};
const remote={id:googleEventId(workspace,id),etag:'v1',status:'confirmed',...googleBody(workspace,local)};
const link={localId:id,remoteId:remote.id,localRevision:'1',remoteEtag:'v1',slot:local};
test('stable provider identity prevents duplicate creates and excludes patient data',()=>{
 assert.equal(googleEventId(workspace,id),remote.id);assert.match(remote.id,/^[0-9a-v]+$/);
 assert.equal(planSync(workspace,[local],[remote],[]).push.length,0);
 assert.equal(planSync(workspace,[local],[remote,remote],[link]).links.length,1);
 assert.deepEqual(Object.keys(googleBody(workspace,{...local,patient_name:'SECRET',detail:'SECRET'})).sort(),['end','extendedProperties','start','summary','transparency','visibility']);
 assert.ok(!JSON.stringify(googleBody(workspace,local)).includes('SECRET'));
});
test('local time moves push conditionally; remote time moves pull',()=>{
 const push=planSync(workspace,[moved],[remote],[link]);assert.equal(push.push.length,1);assert.equal(push.push[0].etag,'v1');
 const pull=planSync(workspace,[local],[{...remote,etag:'v2',start:{dateTime:moved.start},end:{dateTime:moved.end}}],[link]);assert.equal(pull.pull.length,1);assert.equal(pull.pull[0].slot.start,moved.start);
});
test('cancellations synchronize in both directions, including sparse tombstones',()=>{
 assert.equal(planSync(workspace,[{...local,cancelled:true}],[remote],[link]).push.length,1);
 const p=planSync(workspace,[local],[{id:remote.id,etag:'deleted',status:'cancelled'}],[link]);
 assert.equal(p.pull.length,1);assert.equal(p.pull[0].slot.cancelled,true);
});
test('concurrent divergent changes are preserved as conflicts',()=>{
 const p=planSync(workspace,[moved],[{...remote,etag:'v2',status:'cancelled'}],[link]);assert.equal(p.conflicts[0].reason,'both_changed');assert.equal(p.push.length+p.pull.length,0);
});
test('same instant with different offsets does not trigger a write or feedback loop',()=>{
 const r={...remote,start:{dateTime:'2026-11-02T13:00:00Z'},end:{dateTime:'2026-11-02T14:00:00Z'}};
 const p=planSync(workspace,[local],[r],[link]);assert.equal(p.links.length,1);assert.equal(p.push.length+p.pull.length,0);
});
test('missing incremental item is not cancellation and local changes still push',()=>{
 assert.equal(planSync(workspace,[local],[],[link]).pull.length,0);
 assert.equal(planSync(workspace,[moved],[],[link]).push.length,1);
});
test('unrelated external events become busy slots, never patients',()=>{
 const p=planSync(workspace,[],[{id:'personal',etag:'x',start:{date:'2026-11-02'},end:{date:'2026-11-03'}},{id:'free',etag:'f',transparency:'transparent'}],[]);
 assert.equal(p.busy.length,1);assert.equal(p.pull.length,0);
});
test('mismatched identity, started visits, overlaps and invalid times are blocked',()=>{
 assert.equal(planSync(workspace,[local],[{...remote,extendedProperties:{private:{noimaWorkspace:'other'}}}],[link]).conflicts[0].reason,'identity_mismatch');
 const change={...remote,start:{dateTime:moved.start},end:{dateTime:moved.end}};
 assert.equal(planSync(workspace,[{...local,locked:true}],[change],[link]).conflicts[0].reason,'locked_visit');
 const other={...moved,id:'00000000-0000-4000-8000-000000000003'};
 assert.equal(planSync(workspace,[local,other],[change],[link]).conflicts[0].reason,'overlap');
 assert.equal(remoteSlot({...remote,start:{dateTime:'2026-11-02T15:00:00'}}),null);
});
test('Google pagination commits the final cursor only, with identical query options',async()=>{
 const urls=[];const client=new GoogleCalendarClient('fixture','calendar@example.test',async url=>{urls.push(String(url));return Response.json(urls.length===1?{items:[remote],nextPageToken:'page2'}:{items:[],nextSyncToken:'next'})});
 const result=await client.list('prior');assert.equal(result.syncToken,'next');assert.equal(result.events.length,1);
 for(const url of urls){const q=new URL(url).searchParams;assert.equal(q.get('syncToken'),'prior');assert.equal(q.get('singleEvents'),'true');assert.equal(q.has('timeMin'),false)}
 assert.equal(new URL(urls[1]).searchParams.get('pageToken'),'page2');
});
test('retrying an ambiguous insert reads the stable event on 409 without overwrite',async()=>{
 const calls=[];const client=new GoogleCalendarClient('fixture','primary',async(url,init)=>{calls.push(init.method||'GET');return init.method==='POST'?new Response(null,{status:409}):Response.json(remote)});
 assert.equal((await client.write(workspace,local)).id,remote.id);assert.deepEqual(calls,['POST','GET']);
});
test('conditional updates and deletes send ETag and suppress attendee emails',async()=>{
 const calls=[];const client=new GoogleCalendarClient('fixture','primary',async(url,init)=>{calls.push({url:String(url),init});return init.method==='DELETE'?new Response(null,{status:204}):Response.json(remote)});
 await client.write(workspace,moved,'v1');await client.write(workspace,{...local,cancelled:true},'v1');
 for(const c of calls){assert.equal(c.init.headers['If-Match'],'v1');assert.equal(new URL(c.url).searchParams.get('sendUpdates'),'none')}
});
function memory(snapshot){
 let held=false;return {snapshot:structuredClone(snapshot),checkpoints:0,reset:false,released:false,
 async acquire(){if(held)return false;held=true;return true},async release(){held=false;this.released=true},async read(){return structuredClone(this.snapshot)},
 async cache(events,token,reset){this.reset=reset;const all=new Map((reset?[]:this.snapshot.remotes).map(x=>[x.id,x]));for(const x of events)all.set(x.id,x);this.snapshot.remotes=[...all.values()];this.snapshot.syncToken=token},
 async applyLocal(eventId,revision,slot){const event=this.snapshot.locals.find(x=>x.id===eventId);if(event.revision!==revision)throw new Error('stale_local');Object.assign(event,slot,{revision:'next'});return {...event}},
 async checkpoint(value){const event=this.snapshot.locals.find(x=>x.id===value.localId);if(event.revision!==value.localRevision)throw new Error('stale_local');this.checkpoints++;this.snapshot.links=this.snapshot.links.filter(x=>x.localId!==value.localId).concat([value])}};
}
test('runner recovers expired cursor without deleting local appointments',async()=>{
 const store=memory({workspace,locals:[local],remotes:[remote],links:[link],syncToken:'expired'}),tokens=[];
 await synchronizeCalendar(store,{async list(token){tokens.push(token);if(token)throw new GoogleCalendarError(410,'GET');return {events:[remote],syncToken:'fresh'}},async write(){throw new Error('unexpected_write')}});
 assert.deepEqual(tokens,['expired',undefined]);assert.equal(store.reset,true);assert.equal(store.snapshot.locals.length,1);assert.equal(store.released,true);
});
test('end-to-end fixture creates once, moves both ways and cancels both ways',async()=>{
 const store=memory({workspace,locals:[local],remotes:[],links:[]}),providerState=new Map();let inserts=0;
 const provider={async list(){return {events:[...providerState.values()],syncToken:'cursor'}},async write(w,event,etag){if(!etag)inserts++;const value={id:googleEventId(w,event.id),etag:'v'+(providerState.size+1),status:event.cancelled?'cancelled':'confirmed',...googleBody(w,event)};providerState.set(value.id,value);return value}};
 await synchronizeCalendar(store,provider);await synchronizeCalendar(store,provider);assert.equal(inserts,1);
 store.snapshot.locals[0]={...moved};await synchronizeCalendar(store,provider);assert.equal(providerState.get(remote.id).start.dateTime,moved.start);
 const changed={...providerState.get(remote.id),etag:'remote-change',start:{dateTime:local.start},end:{dateTime:local.end}};providerState.set(remote.id,changed);
 await synchronizeCalendar(store,provider);assert.equal(store.snapshot.locals[0].start,local.start);
 providerState.set(remote.id,{id:remote.id,etag:'deleted',status:'cancelled'});await synchronizeCalendar(store,provider);assert.equal(store.snapshot.locals[0].cancelled,true);
 // Independent second fixture exercises cancellation from NOIMA.
 const second=memory({workspace,locals:[{...local,cancelled:true}],remotes:[remote],links:[link]});providerState.set(remote.id,remote);await synchronizeCalendar(second,provider);assert.equal(providerState.get(remote.id).status,'cancelled');
});
test('stale ETag becomes conflict; API failure releases lease without checkpoint',async()=>{
 const store=memory({workspace,locals:[moved],remotes:[remote],links:[link]});
 const provider={async list(){return {events:[],syncToken:'next'}},async write(){throw new GoogleCalendarError(412,'PATCH')}};
 const result=await synchronizeCalendar(store,provider);assert.equal(result.conflicts.length,1);assert.equal(store.checkpoints,0);
 provider.write=async()=>{throw new GoogleCalendarError(401,'PATCH')};await assert.rejects(()=>synchronizeCalendar(store,provider));assert.equal(store.released,true);assert.equal(store.checkpoints,0);
});
test('lost insert response is reconciled on retry; stale local checkpoint is refused',async()=>{
 const store=memory({workspace,locals:[local],remotes:[],links:[]});let created=false;
 const provider={async list(){return {events:created?[remote]:[],syncToken:'next'}},async write(){created=true;throw new Error('timeout')}};
 await assert.rejects(()=>synchronizeCalendar(store,provider),/timeout/);await synchronizeCalendar(store,provider);assert.equal(store.snapshot.links.length,1);
 const other=memory({workspace,locals:[moved],remotes:[remote],links:[link]});
 await assert.rejects(()=>synchronizeCalendar(other,{async list(){return {events:[],syncToken:'next'}},async write(){other.snapshot.locals[0].revision='concurrent';return {...remote,...googleBody(workspace,moved)}}}),/stale_local/);
 assert.equal(other.snapshot.links.length,1);assert.equal(other.snapshot.links[0].localRevision,'1');
});
test('calendar OAuth uses dedicated configuration, PKCE and no email-send scope',()=>{
 const {calendarAuthorization,calendarScopes}=modules['google-oauth'];const result=calendarAuthorization({clientId:'test',clientSecret:'fixture',redirectUri:'https://preview.test/api/calendar/google/callback'}),url=new URL(result.url);
 assert.equal(url.searchParams.get('code_challenge_method'),'S256');assert.equal(url.searchParams.get('access_type'),'offline');assert.equal(url.searchParams.get('state'),result.state);assert.ok(result.verifier.length>=43);assert.ok(!calendarScopes.join(' ').includes('gmail'));
});

const {createPreviewState,previewReducer:reduce}=modules['google-preview-state'];
function conflictFixture(){
 let state=createPreviewState();for(const type of ['connect','sync','local-move','remote-move','sync'])state=reduce(state,{type});return state;
}
test('preview connection requires explicit opt-in and does not synchronize on connect',()=>{
 let state=createPreviewState();state=reduce(state,{type:'sync'});assert.equal(state.connected,false);assert.equal(state.remotes.length,0);
 state=reduce(state,{type:'connect'});assert.equal(state.connected,true);assert.equal(state.remotes.length,0);
 state=reduce(state,{type:'sync'});assert.equal(state.remotes.length,1);
 state=reduce(state,{type:'disconnect'});const previous=JSON.stringify(state.remotes);state=reduce(state,{type:'sync'});assert.equal(JSON.stringify(state.remotes),previous);
});
test('both explicit conflict choices reconcile to the chosen slot without duplicates',()=>{
 for(const choice of ['local','remote']){
  const state=conflictFixture();assert.ok(state.comparison);
  const expected=state.comparison[choice];const resolved=reduce(state,{type:'resolve',choice,expected:state.comparison});
  assert.equal(resolved.local.start,expected.start);assert.equal(remoteSlot(resolved.remotes[0]).start,expected.start);assert.equal(resolved.comparison,null);
  const again=reduce(resolved,{type:'sync'});assert.equal(again.remotes.length,1);assert.equal(again.comparison,null);
 }
});
test('postponing a conflict preserves both versions and the next sync shows it again',()=>{
 const state=conflictFixture(),dismissed=reduce(state,{type:'dismiss'});
 assert.equal(dismissed.local.start,state.local.start);assert.equal(dismissed.remotes[0].start.dateTime,state.remotes[0].start.dateTime);assert.equal(dismissed.comparison,null);
 assert.ok(reduce(dismissed,{type:'sync'}).comparison);
});
test('stale local or remote comparison is refused before applying a choice',()=>{
 for(const type of ['local-cancel','remote-cancel']){
  const state=conflictFixture(),changed=reduce(state,{type}),resolved=reduce(changed,{type:'resolve',choice:'local',expected:state.comparison});
  assert.match(resolved.message,/άλλαξαν/);assert.equal(resolved.local.cancelled,changed.local.cancelled);assert.equal(resolved.remotes[0].status,changed.remotes[0].status);
 }
});
test('cancellation versus moved time is presented and resolves only by explicit choice',()=>{
 let state=createPreviewState();for(const type of ['connect','sync','local-cancel','remote-move','sync'])state=reduce(state,{type});
 assert.equal(state.comparison.local.cancelled,true);assert.equal(state.comparison.remote.cancelled,false);
 for(const choice of ['local','remote']){const resolved=reduce(state,{type:'resolve',choice,expected:state.comparison});assert.equal(resolved.local.cancelled,choice==='local');assert.equal(resolved.remotes[0].status,choice==='local'?'cancelled':'confirmed')}
});

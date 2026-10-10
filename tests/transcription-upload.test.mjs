import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {transcriptionRoute,uploadRequest} from './helpers/transcription-route.mjs';

for(const key of ['audio','file']) {
 test(`real upload route accepts ${key} through withPilot and forwards the same bytes as file`,async()=>{
  const route=transcriptionRoute();
  const file=new File([new Uint8Array([26,69,223,163,8,7,6,5])],'synthetic.webm',{type:'audio/webm'});
  const response=await route.POST(uploadRequest({key,file}));
  assert.equal(response.status,200);assert.equal(response.headers.get('cache-control'),'private, no-store');
  assert.match((await response.json()).text,/Συνθετική δοκιμή/);assert.equal(route.calls.length,1);
  const call=route.calls[0],forwarded=call.init.body.get('file');
  assert.ok(forwarded instanceof File);assert.equal(forwarded.name,file.name);assert.equal(forwarded.type,file.type);
  assert.deepEqual(Buffer.from(await forwarded.arrayBuffer()),Buffer.from(await file.arrayBuffer()));
  assert.equal(call.init.body.get('audio'),null);assert.equal(call.init.body.get('model'),'gpt-transcribe');
  assert.match(call.init.body.get('prompt'),/Greek psychiatric clinical dictation/);
  assert.deepEqual(call.scope,{token:'synthetic-session-token',workspace:'synthetic-workspace'});
 });
}

test('reproduces the old file-only parser error using the clinical client multipart contract',async()=>{
 const source=readFileSync('app/api/transcribe/route.ts','utf8');
 const expression='incoming.get("file") ?? incoming.get("audio")';assert.ok(source.includes(expression));
 const old=transcriptionRoute({routeSource:source.replace(expression,'incoming.get("file")')});
 const response=await old.POST(uploadRequest());assert.equal(response.status,400);
 assert.equal((await response.json()).error,'Δεν βρέθηκε αρχείο ήχου.');assert.equal(old.calls.length,0);
 const fixed=transcriptionRoute();assert.equal((await fixed.POST(uploadRequest())).status,200);
});

test('file takes precedence; an invalid canonical file cannot be bypassed with an audio alias',async()=>{
 const route=transcriptionRoute();
 const good=uploadRequest({key:'file',extra:form=>form.set('audio',new File(['different'],'other.webm'))});
 assert.equal((await route.POST(good)).status,200);assert.equal(route.calls[0].init.body.get('file').name,'synthetic.webm');
 const invalid=transcriptionRoute();const response=await invalid.POST(uploadRequest({extra:form=>form.set('file','not-a-file')}));
 assert.equal(response.status,400);assert.equal(invalid.calls.length,0);
});

test('missing, string, empty and unknown upload fields fail without contacting speech provider',async()=>{
 for(const options of [{file:null},{file:'not-a-file'},{file:new File([],'empty.webm')},{key:'unexpected'}]) {
  const route=transcriptionRoute();assert.equal((await route.POST(uploadRequest(options))).status,400);assert.equal(route.calls.length,0);
 }
});

test('audio alias retains the existing 25 MB limit',async()=>{
 const route=transcriptionRoute();const file=new File([new Uint8Array(25*1024*1024+1)],'too-large.webm',{type:'audio/webm'});
 assert.equal((await route.POST(uploadRequest({file}))).status,413);assert.equal(route.calls.length,0);
});

test('multipart authentication, workspace and cross-site safeguards still run before the provider',async()=>{
 for(const [options,headers,status] of [[{authenticated:false},{},401],[{membership:false},{},403],[{},{Origin:'https://attacker.invalid'},403],[{},{'sec-fetch-site':'cross-site'},403]]) {
  const route=transcriptionRoute(options);assert.equal((await route.POST(uploadRequest({headers}))).status,status);assert.equal(route.calls.length,0);
 }
});

test('malformed multipart returns invalid recording rather than leaking a parser error',async()=>{
 const route=transcriptionRoute();const response=await route.POST(new Request('https://noima.test/api/transcribe',{method:'POST',headers:{'content-type':'multipart/form-data; boundary=broken'},body:'invalid'}));
 assert.equal(response.status,400);assert.equal((await response.json()).error,'Μη έγκυρη ηχογράφηση.');assert.equal(route.calls.length,0);
});

test('calendar dictation retains its literal calendar transcription prompt',async()=>{
 const route=transcriptionRoute();assert.equal((await route.POST(uploadRequest({key:'file',purpose:'calendar'}))).status,200);
 assert.match(route.calls[0].init.body.get('prompt'),/Greek calendar voice command/);
});

test('provider failure and empty transcript remain distinct from missing audio',async()=>{
 const failed=transcriptionRoute({provider:()=>Response.json({error:'fixture-failure'},{status:503})});
 const response=await failed.POST(uploadRequest());assert.equal(response.status,502);assert.equal((await response.json()).code,'transcription_failed');assert.equal(failed.calls.length,1);
 const empty=transcriptionRoute({provider:()=>Response.json({text:'  '})});
 const noSpeech=await empty.POST(uploadRequest());assert.equal(noSpeech.status,422);assert.equal((await noSpeech.json()).code,'empty_transcript');
});

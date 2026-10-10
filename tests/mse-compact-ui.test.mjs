import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import React from 'react';
import * as jsx from 'react/jsx-runtime';
import {renderToStaticMarkup} from 'react-dom/server';
import * as documents from '../lib/clinical/visit-document.ts';
import * as options from '../lib/clinical/mse-options.ts';
import * as review from '../lib/clinical/mse-review.ts';
import * as presentation from '../lib/clinical/mse-presentation.ts';

function load(file,mocks){
 const mod={exports:{}};
 vm.runInNewContext(ts.transpileModule(readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX}}).outputText,{
  exports:mod.exports,module:mod,require:name=>name==='react'?React:name==='react/jsx-runtime'?jsx:mocks[name]||{},React,Date,Intl,
 });return mod.exports.default;
}
const MseDomain=load('components/patients/MseDomain.tsx',{
 '@/lib/clinical/visit-document':documents,'@/lib/clinical/mse-options':options,'@/lib/clinical/mse-presentation':presentation,
});
const nodes=tree=>!tree||typeof tree!=='object'?[]:[tree,...React.Children.toArray(tree.props?.children).flatMap(nodes)];

test('MSE rows keep every domain, option and note control, using existing Greek terminology',()=>{
 for(const field of documents.initialDocument('mse').fields){
  const html=renderToStaticMarkup(React.createElement(MseDomain,{field,onChange(){},onBlur(){}}));
  assert.match(html,new RegExp('data-mse-domain="'+field.key+'"'));
  assert.ok(html.includes(presentation.mseDomainLabel(field).replace('&','&amp;')));
  assert.match(html,/mse-empty">—<\/span>/);
  assert.doesNotMatch(html,/Οδηγός ενότητας|Δεν αξιολογήθηκε/);
  assert.equal((html.match(/<textarea/g)||[]).length,1);
  for(const axis of options.mseAxes[field.key])for(const option of axis.options)assert.ok(html.includes(option));
  assert.doesNotMatch(html,/ open=""|aria-pressed="true"/);
 }
});

test('collapsed previews only show recorded text; negation, uncertainty and pending-reference status survive',()=>{
 const field={key:'perception',label:'Perception',text:'Δεν αναφέρονται ψευδαισθήσεις.\nΑβέβαιη αναφορά — χρειάζεται επανέλεγχος.'};
 const snapshot=structuredClone(field);
 assert.equal(presentation.mseRecordedPreview(field),'Δεν αναφέρονται ψευδαισθήσεις. Αβέβαιη αναφορά — χρειάζεται επανέλεγχος.');
 const html=renderToStaticMarkup(React.createElement(MseDomain,{field:{...field,text:''},pending:true,previousField:field,onChange(){},onBlur(){}}));
 assert.match(html,/Προηγούμενη καταγραφή/);
 assert.match(html,/mse-empty">—<\/span>/);
 assert.doesNotMatch(html,/aria-pressed="true"/);
 assert.match(html,/Δεν αναφέρονται ψευδαισθήσεις/);
 assert.deepEqual(field,snapshot);
 assert.equal(presentation.mseRecordedPreview({...field,text:''}),'');
});

test('editing a domain preserves stored key, labels, selected options and exact free text through save/load',()=>{
 let document=documents.initialDocument('mse');
 document.fields[2].text='Υποκειμενικό συναίσθημα: Αγχώδες\nΥπάρχουσα σημείωση';
 const unchanged=structuredClone(document.fields.filter(f=>f.key!=='mood'));
 const tree=MseDomain({field:document.fields[2],onChange:text=>{document={...document,fields:document.fields.map(f=>f.key==='mood'?{...f,text}:f)}},onBlur(){}});
 nodes(tree).find(n=>n.type==='textarea').props.onChange({target:{value:'Δεν διαπιστώθηκε μεταβολή — παραμένει υπό διερεύνηση.'}});
 const loaded=documents.initialDocument('mse','',JSON.parse(JSON.stringify(document)));
 assert.equal(loaded.fields[2].key,'mood');assert.equal(loaded.fields[2].label,'Mood');
 assert.equal(loaded.fields[2].text,'Υποκειμενικό συναίσθημα: Αγχώδες\nΔεν διαπιστώθηκε μεταβολή — παραμένει υπό διερεύνηση.');
 assert.deepEqual(loaded.fields.filter(f=>f.key!=='mood'),unchanged);
});

test('structured MSE retains legacy and additional stored domains in the same container',()=>{
 const document=documents.initialDocument('mse','Παλαιότερη αφήγηση');
 document.fields.push({key:'custom-domain',label:'Πρόσθετη καταγραφή',text:'Αυτούσια σημείωση'});
 const Editor=load('components/patients/StructuredVisitEditor.tsx',{
  '@/lib/clinical/visit-document':documents,'@/lib/clinical/mse-review':review,
  './MseDomain':{default:MseDomain},'@/lib/clinic-time':{formatClinicDateTime:value=>value},
  './useClinicalDraft':{useClinicalDraft:({initial})=>({value:initial,change(){},flush:async()=>{},saving:false,error:'',savedAt:''})},
 });
 const html=renderToStaticMarkup(React.createElement(Editor,{sessionId:'mse-ui-test',kind:'mse',followup:false,existing:{document,content:'',version:1},registerFlusher:()=>()=>{},onDirtyChange(){},onSaved:async()=>{}}));
 assert.equal((html.match(/data-mse-domain=/g)||[]).length,14);
 assert.match(html,/data-mse-domain="legacy"/);assert.match(html,/Παλαιότερη αφήγηση/);
 assert.match(html,/data-mse-domain="custom-domain"/);assert.match(html,/Αυτούσια σημείωση/);
 assert.doesNotMatch(html,/class="mse-column"/);
 assert.deepEqual(document.fields.map(f=>f.key),[...documents.mseItems.map(([key])=>key),'legacy','custom-domain']);
});

test('the redesigned editor keeps the existing versioned save_document contract for edited MSE data',async()=>{
 const document=documents.initialDocument('mse');document.fields[2].text='Υποκειμενικό συναίσθημα: Αγχώδες';
 const domains=[],writes=[];let next=document,committed;
 const Editor=load('components/patients/StructuredVisitEditor.tsx',{
  '@/lib/clinical/visit-document':documents,'@/lib/clinical/mse-review':review,
  './MseDomain':{default:props=>{domains.push(props);return null}},
  '@/lib/clinic-time':{formatClinicDateTime:value=>value},
  '@/lib/patients/demo-client':{demoPost:async payload=>{writes.push(payload);return {section:{document:payload.document,version:8}}}},
  './useClinicalDraft':{useClinicalDraft:config=>({value:config.initial,currentValue:()=>next,change:value=>{next=value},flush:()=>{committed=config.write(next,config.version);return committed},saving:false,error:'',savedAt:''})},
 });
 renderToStaticMarkup(React.createElement(Editor,{sessionId:'existing-mse-visit',kind:'mse',followup:false,existing:{document,content:'',version:7},registerFlusher:()=>()=>{},onDirtyChange(){},onSaved:async()=>{}}));
 const mood=domains.find(d=>d.field.key==='mood');
 mood.onChange('Υποκειμενικό συναίσθημα: Αγχώδες\nΑκριβής νέα σημείωση');mood.onBlur();
 const saved=await committed;
 assert.equal(writes.length,1);
 assert.equal(writes[0].action,'save_document');assert.equal(writes[0].section_key,'mse');
 assert.equal(writes[0].session_id,'existing-mse-visit');assert.equal(writes[0].expected_version,7);
 assert.equal(saved.version,8);
 const loaded=documents.initialDocument('mse','',JSON.parse(JSON.stringify(saved.value)));
 assert.equal(loaded.fields[2].text,'Υποκειμενικό συναίσθημα: Αγχώδες\nΑκριβής νέα σημείωση');
 assert.deepEqual(loaded.fields.filter(f=>f.key!=='mood'),document.fields.filter(f=>f.key!=='mood').map(f=>({...f,review:'not_assessed'})));
 assert.ok(document.fields.filter(f=>f.key!=='mood').every(f=>f.text===''&&f.review===undefined),'saving must not mutate the source document');
});

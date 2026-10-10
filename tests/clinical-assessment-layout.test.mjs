import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import React from 'react';
import * as jsx from 'react/jsx-runtime';
import {renderToStaticMarkup} from 'react-dom/server';
import {initialDocument,mseItems} from '../lib/clinical/visit-document.ts';

const componentSource=readFileSync('components/patients/StructuredVisitEditor.tsx','utf8');
const css=readFileSync('app/visit-workspace.css','utf8');
const js=ts.transpileModule(componentSource,{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX}}).outputText;
const mod={exports:{}};
const draftState={current:null};
const requireMock=name=>{
 if(name==='react')return React;
 if(name==='react/jsx-runtime')return jsx;
 if(name==='@/lib/clinical/visit-document')return {initialDocument,mseItems};
 if(name==='./useClinicalDraft')return {useClinicalDraft:({initial})=>({
  value:draftState.current||initial,change(){},flush:async()=>{},saving:false,savedAt:'',error:'',hasConflict:false,
 })};
 if(name==='./ICD10Picker')return {default:()=>React.createElement('span',{'data-testid':'icd-picker'})};
 if(name==='./MseDomain')return {default:()=>React.createElement('span',{'data-testid':'mse-domain'})};
 if(name==='@/lib/clinical/mse-review')return {mseReviewCounts:()=>({changed:0}),visibleMseField:f=>f,recordMseField:(f,text)=>({...f,text}),confirmMseUnchanged:f=>f};
 if(name==='@/lib/clinic-time')return {formatClinicDateTime:value=>value};
 return {};
};
vm.runInNewContext(js,{exports:mod.exports,module:mod,require:requireMock,React,Date,Intl});
const render=(kind,document)=>{
 draftState.current=document;
 const result=renderToStaticMarkup(React.createElement(mod.exports.default,{
  sessionId:'qa-visit',kind,followup:false,existing:{content:'',document,version:1},registerFlusher:()=>()=>{},onDirtyChange(){},onSaved:async()=>{},
 }));
 draftState.current=null;
 return result;
};

test('clinical assessment is a single column with diagnosis and impression first',()=>{
 assert.match(css,/\.visit-structured\.assessment\{display:grid;grid-template-columns:minmax\(0,1fr\)/);
 const html=render('assessment',initialDocument('assessment'));
 const diagnosis=html.indexOf('Διάγνωση ή διαγνωστική υπόθεση');
 const impression=html.indexOf('Κλινική αποτίμηση');
 const advanced=html.indexOf('Πρόσθετη κλινική διερεύνηση');
 assert.ok(diagnosis>=0&&diagnosis<impression&&impression<advanced);
 assert.match(html,/Διατύπωση περίπτωσης/);
 assert.match(html,/Διαφορική διάγνωση/);
 assert.match(html,/Βεβαιότητα/);
 assert.match(html,/ICD-10/);
 assert.match(html,/placeholder="Σημερινή κλινική εικόνα/);
});

test('existing formulation and differential notes remain visible on first open and are not discarded',()=>{
 const document=initialDocument('assessment');
 document.fields.find(f=>f.key==='diagnosis').text='Πιθανή διαταραχή υπό διερεύνηση';
 document.fields.find(f=>f.key==='formulation').text='Εργασιακή πίεση και αλλαγές ύπνου';
 document.fields.find(f=>f.key.startsWith('differential-')).text='Διαταραχή προσαρμογής';
 document.fields.find(f=>f.key==='diagnosis').codes=[{code:'F32.9',label:'Depressive episode, unspecified',system:'WHO ICD-10',edition:'2019'}];
 const html=render('assessment',document);
 assert.match(html,/visit-assessment-additional" open=""/);
 assert.match(html,/Εργασιακή πίεση και αλλαγές ύπνου/);
 assert.match(html,/Διαταραχή προσαρμογής/);
 assert.match(html,/F32\.9/);
 assert.match(html,/Πιθανή διαταραχή υπό διερεύνηση/);
 assert.deepEqual(document.fields.map(f=>f.key),['differential-1','diagnosis','formulation','impression']);
});

test('additional assessment inputs default closed only when empty; MSE domain interaction is untouched',()=>{
 const html=render('assessment',initialDocument('assessment'));
 assert.match(html,/<details class="visit-assessment-additional">/);
 assert.doesNotMatch(html,/visit-assessment-additional" open=/);
 const mse=render('mse',initialDocument('mse'));
 assert.equal((mse.match(/data-testid="mse-domain"/g)||[]).length,12);
 assert.doesNotMatch(mse,/Πρόσθετη κλινική διερεύνηση/);
 assert.match(css,/\.visit-structured\.mse\{display:grid;grid-template-columns:1fr 1fr/);
});

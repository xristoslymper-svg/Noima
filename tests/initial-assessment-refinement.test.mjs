import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import React from 'react';
import * as jsx from 'react/jsx-runtime';
import {renderToStaticMarkup} from 'react-dom/server';
import postcss from 'postcss';

const source=readFileSync('components/patients/VisitHistory.tsx','utf8');
const mod={exports:{}};
vm.runInNewContext(ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX}}).outputText,{
 exports:mod.exports,module:mod,require:name=>name==='react'?React:name==='react/jsx-runtime'?jsx:name==='./useClinicalDraft'?{useClinicalDraft:({initial})=>({value:initial,change(){},flush:async()=>{},saving:false,error:'',savedAt:''})}:{},
});
function render(type){return renderToStaticMarkup(React.createElement(mod.exports.default,{
 bundle:{sessions:[{id:'synthetic',session_type:type}],history:{psychiatric_history:'Υποθετική καταγραφή κλινικού',allergies:'Δεν διερευνήθηκε'}},
 sessionId:'synthetic',reload:async()=>{},registerFlusher:()=>()=>{},onDirtyChange(){},
}));}
test('initial history identifies clinician notes and directs to patient answers without approval or new required fields',()=>{
 const html=render('initial_assessment');
 assert.match(html,/Κλινική καταγραφή ιστορικού/);
 assert.match(html,/Οι απαντήσεις του ασθενούς βρίσκονται στην καρτέλα «Ιστορικό»/);
 assert.match(html,/Δεν έχει καταγραφεί · σημειώσεις από τη συνέντευξη/);
 assert.match(html,/Υποθετική καταγραφή κλινικού/);
 assert.match(html,/Δεν διερευνήθηκε/);
 assert.equal((html.match(/<textarea/g)||[]).length,8);
 assert.doesNotMatch(html,/required=|<button|<input/);
});
test('follow-up history keeps its existing labels, empty state and saved values',()=>{
 const html=render('follow_up');
 assert.match(html,/Ιστορικό ασθενούς/);
 assert.match(html,/Αφορά ολόκληρο τον φάκελο/);
 assert.match(html,/placeholder="Καταγραφή από τη συνέντευξη…"/);
 assert.doesNotMatch(html,/Κλινική καταγραφή ιστορικού|Οι απαντήσεις του ασθενούς/);
 assert.match(html,/Υποθετική καταγραφή κλινικού/);
 assert.equal((html.match(/<textarea/g)||[]).length,8);
});
test('every added CSS rule requires initial history and excludes MSE from section styling',()=>{
 const css=postcss.parse(readFileSync('app/initial-assessment.css','utf8'));
 css.walkRules(rule=>{
  for(const selector of rule.selectors){
   assert.ok(selector.startsWith('.runtime-session:has(> .visit-document > [data-visit-part="history"])'));
   assert.doesNotMatch(selector,/\.mse-|\.risk-tree-|\.visit-dialog/);
   if(selector.includes('.visit-part'))assert.match(selector,/\.visit-part:not\(\[data-visit-part="mse"\]\)/);
  }
 });
});

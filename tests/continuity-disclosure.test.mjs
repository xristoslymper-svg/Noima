import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import * as findings from '../lib/clinical/risk-findings.ts';
function load(file,mocks){const compiled=ts.transpileModule(readFileSync('components/patients/'+file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX}}).outputText;const m={exports:{}};new Function('require','module','exports',compiled)(n=>mocks[n],m,m.exports);return m.exports.default;}
test('disclosure preserves user open and close intent across autosave props; another visit starts fresh',()=>{
 function mounted(){let value,initialized=false;const hooks={useState:initial=>{if(!initialized){value=initial;initialized=true}return [value,next=>value=next]}};return load('StableDetails.tsx',{'react':hooks,'react/jsx-runtime':{jsx:(type,props)=>({type,props})}})}
 const Details=mounted();let view=Details({initialOpen:false,children:'field'});view.props.onToggle({currentTarget:{open:true}});
 view=Details({initialOpen:false,children:'saved field'});assert.equal(view.props.open,true);assert.equal(view.props.children,'saved field');
 view.props.onToggle({currentTarget:{open:false}});assert.equal(Details({initialOpen:true,children:'next saved value'}).props.open,false);
 assert.equal(mounted()({initialOpen:false,children:'another visit'}).props.open,false);
});
test('completed risk presentation shows branched NSSI answer and explicit missing history without contradictory generic placeholder',()=>{
 const Read=load('RiskAssessmentRead.tsx',{'react/jsx-runtime':awaitRuntime,'@/lib/clinical/risk-findings':findings});
 const html=renderToStaticMarkup(React.createElement(Read,{risk:{suicidal_ideation:'negative',self_harm:'not_assessed',attempt_history:'not_assessed',tree:{version:1,answers:{wish:'negative',selfthoughts:'negative'},notes:{}}}}));
 assert.match(html,/χωρίς επιθυμία θανάτου/);assert.ok(html.includes('Όχι'));assert.ok(html.includes('Ιστορικό απόπειρας'));assert.ok(html.includes('Δεν διερευνήθηκε'));assert.ok(!html.includes('Γενική καταγραφή αυτοτραυματισμού'));
});
import * as awaitRuntime from 'react/jsx-runtime';

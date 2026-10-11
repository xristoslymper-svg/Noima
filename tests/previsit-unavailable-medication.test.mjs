import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
import React from 'react';
import * as jsx from 'react/jsx-runtime';
import {renderToStaticMarkup} from 'react-dom/server';
import {previsitFixture} from './fixtures/previsit-briefing.ts';
import * as cards from '../lib/clinical/clinical-card.ts';
import {buildSummaryContext} from '../lib/clinical/summary-context.ts';
const mod={exports:{}};
const source=ts.transpileModule(readFileSync('components/patients/PrevisitBriefingView.tsx','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX}}).outputText;
vm.runInNewContext(source,{module:mod,exports:mod.exports,require:name=>{
 if(name==='react/jsx-runtime')return jsx;
 if(name==='next/link')return {default:props=>React.createElement('a',props)};
 if(name==='@/lib/clinical/clinical-card')return cards;
 if(name==='@/lib/clinic-time')return {formatClinicDate:value=>value};
 if(name.endsWith('.module.css'))return {default:{}};
 throw Error('Unexpected view dependency: '+name);
}});
function html(bundle){const card=cards.buildClinicalCard(bundle,buildSummaryContext(bundle,'2026-10-11'));return renderToStaticMarkup(React.createElement(mod.exports.default,{card,brief:card.briefing,patientId:bundle.patient.id}));}
test('a stale medication snapshot asks for refresh, never says no active medication is recorded',()=>{
 const b=previsitFixture();b.clinical_day='2026-10-10';const result=html(b);
 assert.match(result,/Χρειάζεται ανανέωση των στοιχείων αγωγής/);
 assert.doesNotMatch(result,/Δεν υπάρχει καταχωρισμένη ενεργή αγωγή/);
});
test('an actually empty current medication list remains distinct from unavailable data',()=>{
 const b=previsitFixture();b.medications=[];const result=html(b);
 assert.match(result,/Δεν υπάρχει καταχωρισμένη ενεργή αγωγή/);
 assert.doesNotMatch(result,/Χρειάζεται ανανέωση των στοιχείων αγωγής/);
});

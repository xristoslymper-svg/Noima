import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

test('clinical writing actions share the existing field header with accessible compact controls',()=>{
 const source=readFileSync('components/dictation/ClinicalTextField.tsx','utf8');
 const css=readFileSync('components/dictation/ClinicalTextField.module.css','utf8');
 assert.match(source,/htmlFor=\{id\}/);
 // Contextual hints explain unavailable actions; rendered labels are verified in clinical-writing-ui.test.mjs.
 assert.match(source,/title=\{micHint\}/);assert.match(source,/title=\{aiHint\}/);
 assert.match(source,/aria-label=\{'Υπαγόρευση: '\+p.title\}/);
 assert.match(source,/aria-label=\{'Βελτίωση διατύπωσης: '\+p.title\}/);
 assert.equal((source.match(/<textarea\b/g)||[]).length,1);assert.doesNotMatch(source,/<dialog|showModal/);
 assert.match(css,/justify-content:flex-start/);assert.match(css,/:focus-visible/);
});
test('MSE domain structure and its separate styling remain untouched',()=>{
 const visitCss=readFileSync('app/visit-workspace.css','utf8');
 const mseSource=readFileSync('components/patients/MseDomain.tsx','utf8');
 assert.match(visitCss,/\.mse-mic\{position:absolute;right:9px;top:9px/);
 assert.match(mseSource,/data-mse-domain=\{field.key\}/);
 assert.match(mseSource,/className="mse-note-label"/);
});

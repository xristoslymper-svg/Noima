import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
test('recorder and review belong to the same single-editor subtree, not a body portal',()=>{
 const source=readFileSync('components/dictation/ClinicalTextField.tsx','utf8');
 assert.equal((source.match(/<textarea\b/g)||[]).length,1);
 assert.match(source,/data-writing-editor="true"/);assert.match(source,/data-writing-recorder="inline"/);
 assert.doesNotMatch(source,/createPortal|document\.body|recorderDockPosition/);
 assert.match(source,/pending&&!capturing/);
 const css=readFileSync('components/dictation/ClinicalTextField.module.css','utf8');
 assert.match(css,/\.recorder\{position:static/);assert.doesNotMatch(css,/position:fixed|z-index:1300/);
});
test('browser regression uses a modal top layer and real production field/visit CSS',()=>{
 const fixture=readFileSync('browser-tests/clinical-recorder-fixture.tsx','utf8');
 const runner=readFileSync('browser-tests/clinical-recorder.mjs','utf8');
 assert.match(fixture,/<dialog/);assert.match(fixture,/showModal\(/);assert.match(fixture,/app\/visit-workspace\.css/);
 assert.match(runner,/elementFromPoint/);assert.match(runner,/:modal/);assert.match(runner,/realRoute\.POST/);
});

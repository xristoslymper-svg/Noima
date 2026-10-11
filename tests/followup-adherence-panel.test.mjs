import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const followup=readFileSync(new URL('../components/patients/FollowupClosure.tsx',import.meta.url),'utf8');
const css=readFileSync(new URL('../app/clinical-editor.css',import.meta.url),'utf8');
test('no quick adherence capture, legacy content retained',()=>{
 assert.equal(followup.includes('data-followup-adherence-group="true"'),false);
 assert.equal(followup.includes("writingField('adherence'"),false);
 assert.ok(followup.includes('Προϋπάρχουσα καταγραφή λήψης'));
 assert.ok(followup.includes('draft.value.adherence.trim()'));
 assert.ok(followup.includes('data-followup-medication-group="true"'));
 assert.ok(css.includes('.visit-workspace .visit-part-surface'));
});

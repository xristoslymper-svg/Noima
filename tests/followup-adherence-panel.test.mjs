import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readLocalizedSource as readFileSync} from './helpers/localized-source.mjs';
const followup=readFileSync(new URL('../components/patients/FollowupClosure.tsx',import.meta.url),'utf8');
const css=readFileSync(new URL('../app/clinical-editor.css',import.meta.url),'utf8');
test('adherence remains editable beside medication and has no automatic clinical defaults',()=>{
 assert.equal(followup.includes('data-followup-adherence-group="true"'),false);
 assert.equal(followup.includes("writingField('adherence'"),true);
 assert.ok(followup.includes("writingField('adherence','Λήψη αγωγής'"));
 assert.ok(followup.includes('data-followup-medication-group="true"'));
 assert.ok(css.includes('.visit-workspace .visit-part-surface'));
});

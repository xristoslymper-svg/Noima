import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const followup=readFileSync(new URL('../components/patients/FollowupClosure.tsx',import.meta.url),'utf8');
const sharedCss=readFileSync(new URL('../app/clinical-editor.css',import.meta.url),'utf8');

test('existing quick adherence buttons and dictation editor share a grouped surface',()=>{
 assert.match(followup,/data-followup-adherence-group="true"/);
 assert.match(followup,/className="visit-part-surface" data-followup-adherence-group/);
 assert.match(followup,/writingField\('adherence','Σημερινή ανασκόπηση λήψης'\)\}<\/div><\/section>/);
 assert.match(followup,/\['Κανονική λήψη','Υπήρξε θέμα','Δεν αξιολογήθηκε'\]/);
 assert.match(sharedCss,/\.visit-workspace \.visit-part-surface\s*\{[\s\S]*?border:1px solid var\(--clinical-field-border\)/);
});

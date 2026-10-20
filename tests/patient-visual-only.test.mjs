import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
// Clinical controls, handlers and every stylesheet are protected by i18n-current-contract.test.mjs.
test('patient visual layer cannot hide, reorder, inject content or change state colors',async()=>{
 const css=await readFile('components/patients/PatientVisual.module.css','utf8');
 const rules=css.replace(/\/\*[\s\S]*?\*\//g,'');
 assert.doesNotMatch(rules,/(?:^|[;{])\s*(?:color|background(?:-color)?|order|content|visibility|pointer-events)\s*:/m);
 assert.doesNotMatch(rules,/display\s*:\s*none|overflow\s*:\s*hidden/);
 const icon=await readFile('components/patients/PatientVisualIcon.tsx','utf8');
 assert.match(icon,/aria-hidden="true"/);assert.match(icon,/strokeWidth=\{1\.7\}/);
 assert.doesNotMatch(icon,/onClick|useEffect|useState|fetch\(|localStorage|sessionStorage/);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

test('ordinary clinical dictation microphone sits immediately beside the section title',()=>{
 const globalCss=readFileSync('app/globals.css','utf8');
 const sectionRule=globalCss.match(/\.clinical-section-head\{([^}]*)\}/)?.[1]||'';
 assert.match(sectionRule,/display:flex/);
 assert.match(sectionRule,/justify-content:flex-start/);
 assert.match(sectionRule,/gap:8px/);
 assert.doesNotMatch(sectionRule,/justify-content:space-between/);
 const source=readFileSync('components/patients/PatientSession.tsx','utf8');
 assert.match(source,/className="clinical-section-head"/);
 assert.match(source,/className="section-mic"/);
});

test('MSE microphone retains its original in-field placement and sizing',()=>{
 const visitCss=readFileSync('app/visit-workspace.css','utf8');
 const mseSource=readFileSync('components/patients/MseDomain.tsx','utf8');
 assert.match(visitCss,/\.mse-mic\{position:absolute;right:9px;top:9px/);
 assert.match(mseSource,/mse-mic/);
});

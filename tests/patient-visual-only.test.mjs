import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
// Fingerprints of 03ae9d9. Strip only the explicit decorative additions;
// every field, label, handler, condition, request, navigation and editor must stay byte-identical.
const baseline={
  "components/patients/PatientWorkspace.tsx": "c38ced74f28bf89dddda0ff428f6d9316be1418f6b36e8cb801c0a4e071f3142",
  "components/patients/BriefClinicalSummary.tsx": "e5f399f486e83038fc15a9907242109dd38ea1b2a3b1f969dec0da05125da3ae",
  "components/patients/PatientTimeline.tsx": "a675d8d4e0280db14a378ce99b4f48f206970fe2bf9fce8f282a4ae845970c02",
  "components/patients/PatientTreatment.tsx": "a871425430709cab678f7a58da4afc7b4392f4d8968d92a64f7ccaa9023f2902",
  "components/patients/PatientPanels.tsx": "a2973a31f1db2b17e33a6836ef13f7beeb9f5c1c7b3e76a990578d7f65fbc85a",
  "components/patients/PatientReportedHistory.tsx": "2b984c6f788990e308d950109d7b8c58231c6a9f8685e50315aa52fff898dd9e",
  "components/patients/PatientAppointmentDialog.tsx": "ff7b8982917430a8a32b368b03a36e94363594812ebe785e32ebf355d784c4dd",
  "components/patients/PatientSession.tsx": "f4a1337f5c88116e895a5dc860ae8d8eaaabefd91adc8ceabbafc95b3e2f5633",
  "components/patients/CompletedRecordEditor.tsx": "ba87aff7f6508883d132cc2c70e74b45c833dca6be6903f2c7addb651b81b2b2",
  "components/patients/VisitCanvas.tsx": "80147811312f81ec0fbbc1125e3607432b960bf397476b9380dc7b9f34267316"
};
const behavior=source=>source.replace("import PatientVisualIcon from './PatientVisualIcon';\n","").replace("import visual from './PatientVisual.module.css';\n","").replace(/<PatientVisualIcon\b[^>]*\/>/g,"").replace(" ${visual.scope}","");
for(const [path,expected] of Object.entries(baseline))test('visual polish keeps exact existing behavior and content: '+path,async()=>{
 assert.equal(createHash('sha256').update(behavior(await readFile(path,'utf8'))).digest('hex'),expected);
});
test('patient visual layer cannot hide, reorder, inject content or change state colors',async()=>{
 const css=await readFile('components/patients/PatientVisual.module.css','utf8');
 const rules=css.replace(/\/\*[\s\S]*?\*\//g,'');
 assert.doesNotMatch(rules,/(?:^|[;{])\s*(?:color|background(?:-color)?|order|content|visibility|pointer-events)\s*:/m);
 assert.doesNotMatch(rules,/display\s*:\s*none|overflow\s*:\s*hidden/);
 const icon=await readFile('components/patients/PatientVisualIcon.tsx','utf8');
 assert.match(icon,/aria-hidden="true"/);assert.match(icon,/strokeWidth=\{1\.7\}/);
 assert.doesNotMatch(icon,/onClick|useEffect|useState|fetch\(|localStorage|sessionStorage/);
});

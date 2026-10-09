import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import ts from 'typescript';
import React from 'react';
import * as jsx from 'react/jsx-runtime';
import {renderToStaticMarkup} from 'react-dom/server';
import {readFileSync} from 'node:fs';
import * as record from '../lib/clinical/patient-record.ts';
import * as documentation from '../lib/clinical/record-documentation.ts';
import * as risk from '../lib/clinical/record-risk.ts';
import * as time from '../lib/clinic-time.ts';
import * as assessment from '../lib/clinical/assessment-link.ts';
const compiled=ts.transpileModule(readFileSync('components/patients/PatientRecordSummary.tsx','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX}}).outputText;
const mod={exports:{}};
vm.runInNewContext(compiled,{exports:mod.exports,module:mod,Date,Intl,require:n=>({react:React,'react/jsx-runtime':jsx,'@/lib/clinical/patient-record':record,'@/lib/clinical/record-documentation':documentation,'@/lib/clinical/record-risk':risk,'@/lib/clinic-time':time,'@/lib/clinical/assessment-link':assessment}[n]||(n.endsWith('.css')?{default:{}}:{default:()=>null}))});
const visit={id:'qa',status:'completed',session_type:'initial_assessment',started_at:'2026-10-01T09:00:00Z',completed_at:'2026-10-01T10:00:00Z'};
const fixture={patient:{id:'p'},sessions:[visit],sections:[{session_id:'qa',section_key:'assessment',content:'Κλινική διόρθωση υπό διερεύνηση'},{session_id:'qa',section_key:'review',content:'Έλεγχος ύπνου'},{session_id:'qa',section_key:'plan',content:'Ψυχοεκπαίδευση'}],risks:[{session_id:'qa',suicidal_ideation:'negative',attempt_history:'unknown',intent:'not_assessed',plan:'not_assessed',tree:{version:1,answers:{wish:'negative',selfthoughts:'not_assessed',others:'unknown'},notes:{}},clinical_note:'Απόπειρα δεν διευκρινίστηκε'}],appointments:[],medications:[],medicationEvents:[],medicationSideEffects:[],medicationRevisions:[],assessments:[],corrections:[],addenda:[]};
const render=bundle=>renderToStaticMarkup(React.createElement(mod.exports.default,{bundle,reload:async()=>bundle,onVisit(){},onMeasurements(){},onTreatment(){},onHistory(){}}));
test('actual summary component renders sourced initial findings, plan, next focus and exact risk domains',()=>{
 const html=render(fixture);assert.match(html,/Κλινική διόρθωση υπό διερεύνηση/);assert.match(html,/Αρχική αξιολόγηση/);assert.match(html,/Έλεγχος ύπνου/);assert.match(html,/Ψυχοεκπαίδευση/);assert.match(html,/επιθυμία θανάτου/);assert.match(html,/Ιστορικό απόπειρας: Άγνωστο/);assert.match(html,/Αυτοκτονικές σκέψεις: Δεν διερευνήθηκε/);assert.match(html,/Απόπειρα δεν διευκρινίστηκε/);assert.doesNotMatch(html,/Δεν αναφέρθηκε αυτοκτονικός ιδεασμός|δεν περιλαμβάνει επιβεβαιωμένη σύντομη/);
});
test('actual component preserves approved follow-up view and refuses to invent missing initial findings',()=>{
 const html=render({...fixture,sessions:[{...visit,session_type:'follow_up',continuity:{approved_at:visit.completed_at,clinical_state_summary:'Εγκεκριμένη επανεξέταση',next_review_focus:'Ανοχή',treatment_decision:'Συνέχιση'}}]});assert.match(html,/Εγκεκριμένη επανεξέταση/);assert.match(html,/Ανοχή/);assert.doesNotMatch(html,/Κλινική διόρθωση υπό διερεύνηση|Θεραπευτικό πλάνο αυτής/);
 const missing=render({...fixture,sections:[],risks:[]});assert.match(missing,/Δεν καταγράφηκε κλινική αποτίμηση/);assert.doesNotMatch(missing,/Ψυχοεκπαίδευση|Έλεγχος ύπνου/);
});

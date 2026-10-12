import {readFileSync,writeFileSync} from 'node:fs';
import assert from 'node:assert/strict';
function replace(path,from,to){const source=readFileSync(path,'utf8');assert.equal(source.split(from).length-1,1,path+': unique patch anchor required');writeFileSync(path,source.replace(from,to));}
replace('components/patients/VisitWorkspace.tsx','async function load(){','async function load():Promise<PatientBundle>{');
replace('browser-tests/clinical-cleanup.mjs',"...(firstAssessment?['diagnosis']:['assessment'])","...(firstAssessment?[]:['assessment'])");
replace('tests/patient-record-tab.test.mjs',"import * as navigation from '../lib/clinical/visit-workspace-state.ts';","import * as navigation from '../lib/clinical/visit-workspace-state.ts';\nimport * as reconciliation from '../lib/clinical/record-reconciliation.ts';\nimport * as finalization from '../lib/clinical/finalization.ts';");
replace('tests/patient-record-tab.test.mjs',"const bundle={patient:{id:'p',first_name:'Synthetic',last_name:'Only',reported_age:30,amka:''},sessions,appointments:[]}","const bundle={patient:{id:'p',tester_id:'tenant',first_name:'Synthetic',last_name:'Only',reported_age:30,amka:''},sessions,appointments:[],sections:[],risks:[],medications:[],medicationEvents:[],medicationSideEffects:[],medicationRevisions:[],assessments:[],proposals:[],addenda:[],corrections:[],history:null}");
replace('tests/patient-record-tab.test.mjs',"id.includes('visit-workspace-state')?navigation:","id.includes('visit-workspace-state')?navigation:id.includes('record-reconciliation')?reconciliation:id.includes('finalization')?finalization:");
replace('tests/patient-record-tab.test.mjs',"const draft=id=>({id,status:'draft'","const draft=id=>({id,patient_id:'p',tester_id:'tenant',version:1,status:'draft'");
console.log('Completed typed verification and complete synthetic workspace identity fixtures.');

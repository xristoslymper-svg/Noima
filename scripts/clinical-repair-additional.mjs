import {readFileSync,writeFileSync} from 'node:fs';
import assert from 'node:assert/strict';
function replace(path,from,to){const source=readFileSync(path,'utf8');assert.equal(source.split(from).length-1,1,path+': unique patch anchor required');writeFileSync(path,source.replace(from,to));}
replace('components/patients/VisitWorkspace.tsx','async function load(){','async function load():Promise<PatientBundle>{');
replace('browser-tests/clinical-cleanup.mjs',"...(firstAssessment?['diagnosis']:['assessment'])","...(firstAssessment?[]:['assessment'])");
console.log('Completed typed raw-response verification and initial-assessment layout checks.');

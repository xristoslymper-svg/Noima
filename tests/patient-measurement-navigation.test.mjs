import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {patientRecord,completedMeasurements} from '../lib/clinical/patient-record.ts';
import * as instruments from '../lib/psychometrics/instruments.ts';
import * as assessmentLink from '../lib/clinical/assessment-link.ts';
import * as clinicTime from '../lib/clinic-time.ts';
const require=createRequire(import.meta.url);
const ts=require('typescript');

// Exercise the real patient presentation with React's renderer. External write
// controls are inert; no browser, network, authentication, or database is used.
function presentation(file,mocks){
 const source=readFileSync(new URL('../components/patients/'+file,import.meta.url),'utf8');
 const compiled=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText;
 const module={exports:{}};
 new Function('require','module','exports',compiled)(name=>name in mocks?mocks[name]:require(name),module,module.exports);
 return module.exports.default;
}
const empty=()=>null;
const Psychometrics=presentation('PatientPsychometrics.tsx',{
 '@/components/mail/AssessmentEmail':empty,'@/components/intake/IntakeLauncher':empty,
 '@/lib/clinical/patient-record':{completedMeasurements},'@/lib/patients/demo-runtime':{},'@/lib/demo-tester':{getDemoTesterId:()=> 'fixture'},
 '@/lib/clinical/assessment-link':assessmentLink,'@/lib/psychometrics/instruments':instruments,'@/lib/clinic-time':clinicTime,
});
const Treatment=presentation('PatientTreatment.tsx',{
 '@/lib/clinical/patient-record':{patientRecord},'./PatientPanels':{MedicationsPanel:empty},
 './PatientPsychometrics':Psychometrics,'./PatientRecordSummary':{recordDate:value=>value},
 './PatientRecord.module.css':{},
});
const assessment=id=>({id,instrument:'PHQ-9',instrument_version:'1',status:'completed',score:9,answers:[1,1,1,1,1,1,1,1,1],completed_at:'2026-10-01T12:00:00Z',created_at:'2026-10-01T12:00:00Z',item9_review:false});
function bundle(overrides={}){return {clinical_day:'2026-10-08',patient:{id:'fictional',email:'',first_name:'Test',last_name:'Only'},sessions:[],appointments:[],medications:[],medicationEvents:[],medicationRevisions:[],medicationSideEffects:[],assessments:[assessment('older'),assessment('selected')],risks:[],...overrides}}
const render=(Component,props)=>renderToStaticMarkup(React.createElement(Component,props));
test('a targeted patient measurement opens only that assessment’s answers',()=>{
 const html=render(Psychometrics,{bundle:bundle(),reload:async()=>{},selectedAssessmentId:'selected'});
 const articles=html.match(/<article\b[\s\S]*?<\/article>/g);
 assert.equal(articles.length,2);
 assert.ok(!articles[0].includes('<details open=""'));
 assert.ok(articles[1].includes('data-assessment-id="selected"'));
 assert.ok(articles[1].includes('<details open=""'));
 assert.ok(articles[1].includes('tabindex="-1"'));
});
test('measurement targeting does not alter the existing visit workspace interaction',()=>{
 const html=render(Psychometrics,{bundle:bundle(),reload:async()=>{},sessionId:'visit',selectedAssessmentId:'selected'});
 assert.ok(!html.includes('<details open=""'));
 assert.ok(!html.includes('tabindex="-1"'));
 assert.ok(html.includes('Αποστολή ερωτηματολογίου'));
});
test('missing selected assessment is explicit while other results remain accessible',()=>{
 const html=render(Psychometrics,{bundle:bundle(),reload:async()=>{},selectedAssessmentId:'missing'});
 assert.ok(html.includes('Η συγκεκριμένη μέτρηση δεν είναι διαθέσιμη'));
 assert.equal((html.match(/data-assessment-id=/g)||[]).length,2);
});
test('treatment shows a stored future effect resolution instead of claiming no end is recorded',()=>{
 const props={reload:async()=>{},beforeNavigate:{current:null},measurementsOpen:true,selectedAssessmentId:'selected'};
 const html=render(Treatment,{...props,bundle:bundle({medicationSideEffects:[{id:'effect',medication_id:'med',effect_text:'Fictional effect',severity:'mild',impact:'',noted_on:'2026-10-01',resolved_on:'2026-10-10'}]})}).replace(/<!--[\s\S]*?-->/g,'');
 assert.ok(html.includes('Καταγεγραμμένη λήξη 2026-10-10'));
 assert.ok(!html.includes('Χωρίς καταγεγραμμένη λήξη'));
 const open=render(Treatment,{...props,bundle:bundle({medicationSideEffects:[{id:'effect',medication_id:'med',effect_text:'Fictional effect',severity:'mild',impact:'',noted_on:'2026-10-01',resolved_on:null}]})});
 assert.ok(open.includes('Χωρίς καταγεγραμμένη λήξη'));
});

test('detailed patient trajectories also exclude future measurements while retaining their source records',()=>{
 const future={...assessment('future'),score:23,completed_at:new Date(Date.now()+86400000).toISOString()};
 const html=render(Psychometrics,{bundle:bundle({assessments:[assessment('past'),future]}),reload:async()=>{}});
 const trajectories=html.match(/<div class="psychometric-trajectories">([\s\S]*?)<\/div><\/div>/)[1];
 assert.ok(trajectories.includes('9 ('));assert.ok(!trajectories.includes('23 ('));
 assert.ok(html.includes('data-assessment-id="future"'));
 assert.ok(html.includes('Η χρονική σήμανση ή το αποτέλεσμα δεν είναι διαθέσιμο'));
});

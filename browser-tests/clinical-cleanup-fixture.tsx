// Test-only real PatientSession composition. No app route imports this file.
import React,{useRef,useState} from 'react';
import {createRoot} from 'react-dom/client';
import PatientSession from '../components/patients/PatientSession';
import {initialDocument} from '../lib/clinical/visit-document';
import type {PatientBundle} from '../lib/patients/demo-runtime';
import '../app/globals.css';
import '../app/clinical-refinement.css';
import '../app/visit-workspace.css';
import '../app/mobile.css';
import '../app/initial-assessment.css';
import '../app/clinical-editor.css';

const documentText=(document:{fields:{label:string;text:string}[]})=>document.fields.filter(f=>f.text.trim()).map(f=>f.label+': '+f.text).join('\n');
const q=new URLSearchParams(location.search),followup=q.has('followup'),legacy=q.has('legacy');
const patientId='40000000-0000-4000-8000-000000000099',sessionId='50000000-0000-4000-8000-000000000099';
const now='2026-10-10T10:00:00.000Z';
const assessment=initialDocument('assessment');
assessment.fields.find(f=>f.key==='impression')!.text='Συνθετικό παράδειγμα. Χρειάζεται περαιτέρω διερεύνηση.';
if(legacy)assessment.fields.find(f=>f.key==='formulation')!.text='Προϋπάρχουσα κλινική σημείωση — να διατηρηθεί αυτούσια.';
const interview='Συνθετικό περιστατικό δοκιμής. Αναφέρει κόπωση, χωρίς μεταβολή του ύπνου.';
const mse=initialDocument('mse',legacy?'Παλαιότερη αφηγηματική παρατήρηση.':'');
let current={patient:{id:patientId,tester_id:'synthetic',first_name:'Συνθετικός',last_name:'Ασθενής',reported_age:36},sessions:[{id:sessionId,patient_id:patientId,tester_id:'synthetic',session_type:followup?'follow_up':'initial_assessment',status:'draft',version:1,started_at:now,updated_at:now,completed_at:null}],sections:[{id:'interview-qa',session_id:sessionId,patient_id:patientId,section_key:'interview',content:interview,source:'manual',version:1,updated_at:now},{id:'assessment-qa',session_id:sessionId,patient_id:patientId,section_key:'assessment',content:documentText(assessment),document:assessment,source:'manual',version:1,updated_at:now},{id:'mse-qa',session_id:sessionId,patient_id:patientId,section_key:'mse',content:documentText(mse),document:mse,source:'manual',version:1,updated_at:now}],risks:[],history:null,medications:[],medicationEvents:[],medicationSideEffects:[],medicationRevisions:[],proposals:[{id:'qa-approved',status:'approved',session_id:sessionId,section_key:'interview',transcript:'Αυτούσια συνθετική υπαγόρευση.',approved_text:interview,approved_at:now,created_at:now}],addenda:[],corrections:[],assessments:[],appointments:[]} as unknown as PatientBundle;
const qa={writes:[] as Record<string,unknown>[],get bundle(){return current}};
(window as unknown as {clinicalQA:typeof qa}).clinicalQA=qa;
const originalFetch=window.fetch;
window.fetch=async(input,init)=>{
 const url=String(input);
 if(url.startsWith('/api/patients/demo/runtime')&&init?.method==='POST'){
  const b=JSON.parse(String(init.body));qa.writes.push(b);
  if(b.action==='save_document'||b.action==='save_section'){
   const old=current.sections.find(s=>s.section_key===b.section_key)!;
   const section={...old,version:(old?.version||0)+1,content:b.document?documentText(b.document):b.content,...(b.document?{document:b.document}:{})};
   current={...current,sections:current.sections.filter(s=>s.section_key!==b.section_key).concat(section)};
   return Response.json({section});
  }
  throw new Error('Unexpected mutation in synthetic fixture: '+b.action);
 }
 if(url==='/api/transcribe')return Response.json({text:'Συνθετική προσθήκη για έλεγχο.'});
 if(url==='/api/clinical/polish')return Response.json({text:JSON.parse(String(init?.body)).text,model:'fixture-not-live'});
 if(url.startsWith('/api/'))return Response.json({});
 return originalFetch(input,init);
};
function Fixture(){
 const [bundle,setBundle]=useState(current),beforeNavigate=useRef<(()=>Promise<void>)|null>(null);
 async function reload(){setBundle({...current});return current}
 return <main className="qa-clinical-shell"><p className="qa-disclaimer">Συνθετικά δεδομένα — έλεγχος εμφάνισης και χειρισμών</p><section className="visit-workspace"><PatientSession bundle={bundle} reload={reload} onFinalize={async()=>{throw new Error('No real finalization in visual fixture')}} onFinishLater={async()=>{}} finalizing={false} finalizeError="" selectedSessionId={sessionId} onSelectSession={()=>{}} beforeNavigate={beforeNavigate}/></section></main>;
}
createRoot(document.getElementById('root')!).render(<Fixture/>);

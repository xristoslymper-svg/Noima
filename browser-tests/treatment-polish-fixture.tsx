import React,{useRef,useState} from 'react';
import {createRoot} from 'react-dom/client';
import LocaleProvider from '../i18n/LocaleProvider';
import el from '../i18n/messages/el.json';
import en from '../i18n/messages/en.json';
import PatientTreatment from '../components/patients/PatientTreatment';
import IntakeLauncher from '../components/intake/IntakeLauncher';
import type {PatientBundle} from '../lib/patients/demo-runtime';
import fixture from './fixtures/warm-patient.json';
import '../app/globals.css';
import '../app/noima-ui.css';
import '../app/clinical-refinement.css';
import '../app/language-controls.css';
import '../app/patient-tool-polish.css';
const query=new URLSearchParams(location.search),locale=query.get('lang')==='en'?'en':'el';
const bundle=structuredClone(fixture) as unknown as PatientBundle;
const latest=bundle.sessions.filter(s=>s.status==='completed').sort((a,b)=>Date.parse(b.started_at)-Date.parse(a.started_at))[0];
for(const key of ['plan','review']){
 const section=bundle.sections.find(s=>s.session_id===latest.id&&s.section_key===key);
 if(section)section.content=Array(5).fill('ΣΥΝΘΕΤΙΚΗ ΔΟΚΙΜΗ — '+section.content).join('\n\n');
}
function App(){
 const beforeNavigate=useRef<(()=>Promise<void>)|null>(null),[open,setOpen]=useState(query.has('assignment')),[visit,setVisit]=useState('');
 return <LocaleProvider initialLocale={locale} initialMessages={locale==='en'?en:el}><main style={{maxWidth:1080,margin:'auto',padding:20}}><p>Συνθετική οπτική δοκιμή · χωρίς βάση ή πραγματική αποστολή</p><button onClick={()=>setOpen(true)}>Open assignment</button><output data-testid="source-visit">{visit}</output><PatientTreatment bundle={bundle} reload={async()=>{}} beforeNavigate={beforeNavigate} measurementsOpen={false} selectedAssessmentId={null} onVisit={setVisit}/>{open&&<IntakeLauncher patientId={bundle.patient.id} subjectLabel="Συνθετικός ασθενής με μεγάλο ονοματεπώνυμο για έλεγχο αναδίπλωσης" patientEmail="synthetic@example.invalid" onClose={()=>setOpen(false)}/>}</main></LocaleProvider>;
}
createRoot(document.getElementById('root')!).render(<App/>);

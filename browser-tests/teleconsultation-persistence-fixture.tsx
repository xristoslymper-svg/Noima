import React,{useEffect,useRef,useState} from 'react';
import {createRoot} from 'react-dom/client';
import TeleconsultationsConnected from '../components/teleconsultations/TeleconsultationsConnected';
import PatientSession from '../components/patients/PatientSession';
import type {PatientBundle} from '../lib/patients/demo-runtime';
import '../app/globals.css';
import '../app/clinical-refinement.css';
import '../app/visit-workspace.css';
import '../app/mobile.css';
import '../app/initial-assessment.css';
import '../app/clinical-editor.css';
import '../app/noima-ui.css';
document.cookie='noima-workspace-id=10000000-0000-4000-8000-000000000126; path=/';
function Folder(){
 const [bundle,setBundle]=useState<PatientBundle|null>(null),beforeNavigate=useRef<(()=>Promise<void>)|null>(null);
 const p=new URLSearchParams(location.search),patient=p.get('patient')!,session=p.get('session')!;
 async function reload(){const r=await fetch('/api/patients/demo/runtime?patient='+patient);const d=await r.json();setBundle(d.bundle);return d.bundle}
 useEffect(()=>{void reload()},[]);
 return bundle?<section className="visit-workspace"><PatientSession bundle={bundle} reload={reload} onFinalize={async()=>{throw new Error('Use teleconsultation registration')}} onFinishLater={async()=>{}} finalizing={false} finalizeError="" selectedSessionId={session} onSelectSession={()=>{}} beforeNavigate={beforeNavigate}/></section>:<p>Φόρτωση φακέλου…</p>;
}
createRoot(document.getElementById('root')!).render(location.pathname==='/folder'?<Folder/>:<TeleconsultationsConnected/>);

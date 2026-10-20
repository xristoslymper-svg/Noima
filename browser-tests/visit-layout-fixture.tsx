import React,{useEffect,useRef,useState} from 'react';
import {createRoot} from 'react-dom/client';
import {JourneyEntry} from '../components/patients/PatientJourney';
import PatientAppointmentDialog from '../components/patients/PatientAppointmentDialog';
import VisitCanvas from '../components/patients/VisitCanvas';
import fixture from '../lib/clinical/treatment-preview.json';
import '../app/globals.css';import '../app/noima-ui.css';import '../app/clinical-refinement.css';
function App(){
 const [appointmentOpen,setAppointmentOpen]=useState(false),[notice,setNotice]=useState('');
 const [bundle,setBundle]=useState<any>(fixture);
 const session=bundle.sessions.find((s:any)=>s.status==='draft');
 const flushers=useRef(new Map<string,()=>Promise<void>>());
 const reload=async()=>{const r=await fetch('/bundle');const b=await r.json();setBundle(b);return b};
 useEffect(()=>{void reload()},[]);
 return <main><JourneyEntry bundle={bundle} disabled={false} onResume={()=>{}} onStart={()=>{}} onAppointment={()=>setAppointmentOpen(true)}/>{notice&&<p role="status">{notice}</p>}{appointmentOpen&&<PatientAppointmentDialog bundle={bundle} reload={reload} onClose={()=>setAppointmentOpen(false)} onSaved={()=>{setAppointmentOpen(false);setNotice('Το ραντεβού αποθηκεύτηκε.')}}/>}<VisitCanvas bundle={bundle} session={session} reload={reload} registerFlusher={(key,f)=>{flushers.current.set(key,f);return()=>{flushers.current.delete(key)}}} onDirtyChange={()=>{}}>
 <section data-mobile-section="notes"><label>Σημειώσεις<input/></label></section><section data-mobile-section="mse"><label>MSE<input/></label></section><section data-mobile-section="risk"><label>Κίνδυνος<input/></label></section>
 </VisitCanvas><button onClick={()=>void Promise.all([...flushers.current.values()].map(f=>f()))}>Έλεγχος αποθήκευσης</button></main>;
}
createRoot(document.getElementById('root')!).render(<App/>);

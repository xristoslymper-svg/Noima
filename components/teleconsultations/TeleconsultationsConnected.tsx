'use client';
import {useEffect,useRef,useState} from 'react';
import Link from 'next/link';
import {TeleconsultationWorkspace} from './TeleconsultationsPreview';
import TeleconsultationsLobby from './TeleconsultationsLobby';
import {recordConnection,recordForVisit,type RecordConnection} from '@/lib/teleconsultations/record-connection';
import {demoPost} from '@/lib/patients/demo-client';
import {isClinicalId} from '@/lib/clinical/identity';
import {getDemoTesterId} from '@/lib/demo-tester';
import type {PatientBundle,DemoSession} from '@/lib/patients/demo-runtime';
import type {DemoTelePatient} from '@/lib/teleconsultations/entry';
import type {FixtureRecord} from '@/lib/teleconsultations/preview';
type Appointment={id:string;patient_id:string;session_id:string|null;status:string;scheduled_start:string;scheduled_end:string};
type Listing={patients:{id:string;first_name:string;last_name:string}[];visits:DemoSession[];appointments:Appointment[]};
async function readVisit(patient:string,session:string,signal?:AbortSignal):Promise<PatientBundle>{
 const r=await fetch('/api/patients/demo/runtime?tester='+encodeURIComponent(getDemoTesterId())+'&patient='+encodeURIComponent(patient),{cache:'no-store',signal});
 const d=await r.json();if(!r.ok)throw new Error(d.error||'Δεν φορτώθηκε ο φάκελος.');
 recordForVisit(d.bundle,patient,session);return d.bundle;
}
export default function TeleconsultationsConnected(){
 const [listing,setListing]=useState<Listing|null>(null),[connection,setConnection]=useState<RecordConnection|null>(null),[record,setRecord]=useState<FixtureRecord|null>(null),[patient,setPatient]=useState<DemoTelePatient|null>(null);
 const [error,setError]=useState(''),[loading,setLoading]=useState(true),[retry,setRetry]=useState(0),[busy,setBusy]=useState(false);
 const flight=useRef(false),alive=useRef(true);
 useEffect(()=>{
  alive.current=true;const controller=new AbortController();
  async function load(){
   setLoading(true);setError('');
   try{
    const params=new URLSearchParams(location.search),p=params.get('patient'),s=params.get('session');
    if(p||s){
     if(!isClinicalId(p)||!isClinicalId(s))throw new Error('Μη έγκυρη σύνδεση επίσκεψης.');
     const bundle=await readVisit(p,s,controller.signal);
     if(controller.signal.aborted)return;
     setRecord(recordForVisit(bundle,p,s));setPatient({id:p,name:bundle.patient.first_name+' '+bundle.patient.last_name,first:bundle.patient.first_name,last:bundle.patient.last_name});
     setConnection(recordConnection(bundle,p,s,()=>readVisit(p,s),demoPost));
    }else{
     const r=await fetch('/api/teleconsultations',{cache:'no-store',signal:controller.signal}),data=await r.json();
     if(!r.ok||!Array.isArray(data.patients)||!Array.isArray(data.visits)||!Array.isArray(data.appointments))throw new Error(data.error||'Δεν φορτώθηκαν οι επισκέψεις.');
     if(!controller.signal.aborted)setListing(data);
    }
   }catch(e){if(!controller.signal.aborted)setError(e instanceof Error?e.message:'Δεν φορτώθηκε η επίσκεψη.')}
   finally{if(!controller.signal.aborted)setLoading(false)}
  }
  void load();return()=>{alive.current=false;controller.abort()};
 },[retry]);
 async function open(selected:DemoTelePatient,existing?:FixtureRecord){
  if(flight.current)return;flight.current=true;setBusy(true);setError('');
  try{
   const sessionId=existing?.sessionId||listing?.visits.find(v=>v.patient_id===selected.id&&v.status==='draft')?.id;
   if(!isClinicalId(sessionId))throw new Error('Δεν υπάρχει ανοιχτή επανεξέταση. Ανοίξτε την επίσκεψη από τον φάκελο ασθενή και επιστρέψτε εδώ.');
   const bundle=await readVisit(selected.id,sessionId!);recordForVisit(bundle,selected.id,sessionId!);
   if(alive.current)window.location.assign('/teleconsultations?patient='+encodeURIComponent(selected.id)+'&session='+encodeURIComponent(sessionId!));
  }catch(e){if(alive.current)setError(e instanceof Error?e.message:'Δεν άνοιξε η επίσκεψη.')}
  finally{flight.current=false;if(alive.current)setBusy(false)}
 }
 if(connection&&record&&patient)return <TeleconsultationWorkspace key={record.sessionId} initialRecord={record} patient={patient} connection={connection} onBack={()=>window.location.assign('/teleconsultations')} onComplete={()=>{}}/>;
 const patients=(listing?.patients||[]).map(p=>({id:p.id,name:[p.first_name,p.last_name].filter(Boolean).join(' '),first:p.first_name,last:p.last_name}));
 const rows=(listing?.visits||[]).map(visit=>{const linked=listing?.appointments.find(a=>a.session_id===visit.id);return {record:{patientId:visit.patient_id,sessionId:visit.id,version:visit.closure_version||0,notes:{transcript:'',clinical_state_summary:'',treatment_decision:'',next_review_focus:'',pinned_context:'',adherence:'',source:'manual' as const},assignments:[],appointment:{id:linked?.id||'visit:'+visit.id,patient_id:visit.patient_id,session_id:visit.id,status:visit.status==='completed'?'completed' as const:'scheduled' as const,scheduled_start:linked?.scheduled_start||visit.started_at,scheduled_end:linked?.scheduled_end||new Date(Date.parse(visit.started_at)+50*60000).toISOString()}},patient:patients.find(p=>p.id===visit.patient_id)!,completed:visit.status==='completed'};}).filter(row=>row.patient);

 return <>{loading?<main className="content" role="status">Φόρτωση επισκέψεων…</main>:error&&!listing?<main className="content" role="alert"><p>{error}</p><button className="small-button" onClick={()=>setRetry(n=>n+1)}>Δοκιμή ξανά</button><Link href="/patients">Άνοιγμα φακέλων ασθενών</Link></main>:<><TeleconsultationsLobby connected entries={rows} patients={patients} onOpen={(r,p)=>void open(p,r)} onStart={p=>void open(p)}/>{busy&&<p className="content" role="status">Άνοιγμα επίσκεψης…</p>}{error&&<p className="content" role="alert">{error}</p>}</>}</>;
}

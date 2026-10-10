'use client';
import {useEffect,useState,type MutableRefObject} from 'react';
import {mergeVisitContext,previousMseReference} from '@/lib/clinical/visit-workspace-state';
import type {DemoSession,PatientBundle} from '@/lib/patients/demo-runtime';
import {getDemoTesterId} from '@/lib/demo-tester';
import {demoPost} from '@/lib/patients/demo-client';
import PatientSession from './PatientSession';

export default function VisitWorkspace({sessionId,patientId,context,reloadContext,onFinalized,onDeferred,onSelect,beforeNavigate}:{beforeNavigate:MutableRefObject<(()=>Promise<void>)|null>;sessionId:string;patientId:string;context:PatientBundle|null;reloadContext:()=>Promise<PatientBundle|null>;onFinalized:(session:DemoSession)=>void|Promise<void>;onDeferred:(sessionId:string,reason?:string)=>void|Promise<void>;onSelect:(id?:string|null)=>void}){
 const [record,setRecord]=useState<PatientBundle|null>(null),[error,setError]=useState(''),[finalizing,setFinalizing]=useState(false),[finalizeError,setFinalizeError]=useState('');
 async function load(){const r=await fetch(`/api/patients/demo/visit?tester=${getDemoTesterId()}&patient=${patientId}&session=${sessionId}`,{cache:'no-store'});const d=await r.json();if(!r.ok)throw new Error(d.error);setRecord(d.bundle);setError('');return d.bundle as PatientBundle}
 useEffect(()=>{void load().catch(e=>setError(e instanceof Error?e.message:'Δεν φορτώθηκε η επίσκεψη.'))},[sessionId,patientId,context?.sessions.find(s=>s.id===sessionId)?.status]);
 function merged(b:PatientBundle,c=context):PatientBundle{return mergeVisitContext(b,c)}
 async function reload(){return merged(await load())}
 async function refreshContext(){const c=await reloadContext();if(!c)throw new Error('Δεν ανανεώθηκε ο φάκελος. Δοκιμάστε ξανά.');return merged(await load(),c)}
 async function finalize(_sessionId:string,closure=false,closureVersion?:number){setFinalizing(true);setFinalizeError('');let committed=false;try{const b=await load();const s=b.sessions.find(s=>s.id===sessionId&&s.status==='draft');if(!s)throw new Error('Η καταγραφή δεν είναι πλέον πρόχειρη.');const result=await demoPost({action:closure?'finalize_closure':'finalize_session',confirmed:closure,expected_closure_version:closureVersion,session_id:sessionId,expected_version:s.version}) as {session:DemoSession};committed=true;await onFinalized(result.session)}catch(e){setFinalizeError(committed?'Η καταγραφή ολοκληρώθηκε, αλλά η προβολή δεν ανανεώθηκε. Ανανεώστε τον φάκελο.':e instanceof Error?e.message:'Δεν ολοκληρώθηκε η καταγραφή.')}finally{setFinalizing(false)}}
 async function defer(targetSessionId=sessionId,reason?:string){if(targetSessionId!==sessionId)throw new Error('Η επίσκεψη έχει αλλάξει.');setFinalizeError('');try{await demoPost({action:'finish_session_later',session_id:sessionId});await onDeferred(sessionId,reason)}catch(e){const message=e instanceof Error?e.message:'Δεν αποθηκεύτηκε η πρόχειρη καταγραφή.';setFinalizeError(message);throw e}}
 return <section className="visit-workspace" aria-label="Κλινική επίσκεψη">
  {error&&<p role="alert">{error} <button onClick={()=>void load().catch(e=>setError(e.message))}>Επανάληψη</button></p>}
  {!record&&!error&&<p role="status">Άνοιγμα επίσκεψης…</p>}
  {record&&<>{!context&&<p className="visit-context-status">Το ιστορικό, η αγωγή και τα ψυχομετρικά φορτώνονται ανεξάρτητα. <button onClick={()=>void refreshContext().catch(e=>setError(e.message))}>Επανάληψη φόρτωσης</button></p>}<PatientSession beforeNavigate={beforeNavigate} previousMse={previousMseReference(context,sessionId,record.sessions[0].started_at)} key={sessionId} bundle={merged(record)} reload={reload} reloadContext={refreshContext} contextReady={Boolean(context)} onFinalize={finalize} onFinishLater={defer} finalizing={finalizing} finalizeError={finalizeError} selectedSessionId={sessionId} onSelectSession={onSelect}/></>}
 </section>;
}

'use client';
import {useEffect,useRef,useState,type MutableRefObject} from 'react';
import {previousMseReference} from '@/lib/clinical/visit-workspace-state';
import type {PatientBundle} from '@/lib/patients/demo-runtime';
import {getDemoTesterId} from '@/lib/demo-tester';
import {demoPost} from '@/lib/patients/demo-client';
import PatientSession from './PatientSession';

export default function VisitWorkspace({sessionId,patientId,context,reloadContext,onClose,onFinalized,onSelect,beforeNavigate}:{beforeNavigate:MutableRefObject<(()=>Promise<void>)|null>;sessionId:string;patientId:string;context:PatientBundle|null;reloadContext:()=>Promise<PatientBundle|null>;onClose:()=>void;onFinalized:()=>void;onSelect:(id?:string|null)=>void}){
 const dialog=useRef<HTMLDialogElement>(null);
 const [record,setRecord]=useState<PatientBundle|null>(null),[error,setError]=useState(''),[finalizing,setFinalizing]=useState(false),[finalizeError,setFinalizeError]=useState('');
 const closing=useRef(false);
 async function load(){const r=await fetch(`/api/patients/demo/visit?tester=${getDemoTesterId()}&patient=${patientId}&session=${sessionId}`,{cache:'no-store'});const d=await r.json();if(!r.ok)throw new Error(d.error);setRecord(d.bundle);setError('');return d.bundle as PatientBundle}
 useEffect(()=>{dialog.current?.showModal();const previous=document.body.style.overflow;document.body.style.overflow='hidden';return()=>{document.body.style.overflow=previous}},[]);
 useEffect(()=>{void load().catch(e=>setError(e instanceof Error?e.message:'Δεν φορτώθηκε η επίσκεψη.'))},[sessionId,patientId]);
 function merged(b:PatientBundle,c=context):PatientBundle{return {...(c||b),sessions:b.sessions,sections:b.sections,risks:b.risks,proposals:b.proposals,addenda:b.addenda}}
 async function reload(){return merged(await load())}
 async function refreshContext(){const c=await reloadContext();if(!c)throw new Error('Δεν ανανεώθηκε ο φάκελος. Δοκιμάστε ξανά.');return merged(await load(),c)}
 async function finalize(){setFinalizing(true);setFinalizeError('');try{const b=await load();const s=b.sessions.find(s=>s.id===sessionId&&s.status==='draft');if(!s)throw new Error('Η επίσκεψη δεν είναι πλέον πρόχειρη.');await demoPost({action:'finalize_session',session_id:sessionId,expected_version:s.version});onFinalized()}catch(e){setFinalizeError(e instanceof Error?e.message:'Δεν ολοκληρώθηκε η επίσκεψη.')}finally{setFinalizing(false)}}
 function requestClose(){if(closing.current)return;closing.current=true;if(record?.sessions[0]?.status==='draft'){const button=dialog.current?.querySelector<HTMLButtonElement>('[data-visit-close]');if(button){button.click();window.setTimeout(()=>{closing.current=false},500);return}}onClose()}
 function backdropClose(event:React.MouseEvent<HTMLDialogElement>){if(event.target!==dialog.current)return;const rect=dialog.current.getBoundingClientRect();const outside=event.clientX<rect.left||event.clientX>rect.right||event.clientY<rect.top||event.clientY>rect.bottom;if(outside)requestClose()}
 return <dialog ref={dialog} className="visit-dialog" aria-label="Κλινική επίσκεψη" onMouseDown={backdropClose} onCancel={e=>{e.preventDefault();requestClose()}}>
  <header className="visit-dialog-title"><strong>{(record||context)?.patient.first_name} {(record||context)?.patient.last_name}</strong><button type="button" onClick={requestClose}>{record?.sessions[0]?.status==='draft'?'Αποθήκευση & κλείσιμο':'Κλείσιμο'}</button></header>
  {error&&<p role="alert">{error} <button onClick={()=>void load().catch(e=>setError(e.message))}>Επανάληψη</button></p>}
  {!record&&!error&&<p role="status">Άνοιγμα επίσκεψης…</p>}
  {record&&<>{!context&&<p className="visit-context-status">Το ιστορικό, η αγωγή και τα ψυχομετρικά φορτώνονται ανεξάρτητα. <button onClick={()=>void refreshContext().catch(e=>setError(e.message))}>Επανάληψη φόρτωσης</button></p>}<PatientSession beforeNavigate={beforeNavigate} previousMse={previousMseReference(context,sessionId,record.sessions[0].started_at)} key={sessionId} bundle={merged(record)} reload={reload} reloadContext={refreshContext} contextReady={Boolean(context)} onFinalize={finalize} finalizing={finalizing} finalizeError={finalizeError} selectedSessionId={sessionId} onSelectSession={onSelect} onClose={onClose}/></>}
 </dialog>;
}

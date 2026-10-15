'use client';
import {useSystemMessage} from '@/i18n/system-message';

import {useTranslations} from 'next-intl';

import {useEffect,useRef,useState,type MutableRefObject} from 'react';
import {mergeVisitContext,previousMseReference} from '@/lib/clinical/visit-workspace-state';
import {assertRecordIdentity,reconcileRecord} from '@/lib/clinical/record-reconciliation';
import type {DemoSession,PatientBundle} from '@/lib/patients/demo-runtime';
import {getDemoTesterId} from '@/lib/demo-tester';
import {demoPost} from '@/lib/patients/demo-client';
import {confirmedCompletion,finalizeAndVerify} from '@/lib/clinical/finalization';
import PatientSession from './PatientSession';

type Props={beforeNavigate:MutableRefObject<(()=>Promise<void>)|null>;sessionId:string;patientId:string;context:PatientBundle|null;reloadContext:()=>Promise<PatientBundle|null>;onFinalized:(session:DemoSession)=>void|Promise<void>;onDeferred:(sessionId:string,reason?:string)=>void|Promise<void>;onSelect:(id?:string|null)=>void};
export default function VisitWorkspace({sessionId,patientId,context,reloadContext,onFinalized,onDeferred,onSelect,beforeNavigate}:Props){
 const systemMessage=useSystemMessage();

 const t=useTranslations();

 const [record,setRecord]=useState<PatientBundle|null>(null),[error,setError]=useState(''),[finalizing,setFinalizing]=useState(false),[finalizeError,setFinalizeError]=useState('');
 const recordRef=useRef<PatientBundle|null>(null),loadSequence=useRef(0),finalizeFlight=useRef<Promise<void>|null>(null);
 const pendingReads=useRef(new Set<AbortController>()),mounted=useRef(false),selected=useRef('');
 const editorBeforeNavigate=useRef<(()=>Promise<void>)|null>(null);
 selected.current=patientId+':'+sessionId;
 const safeContext=context?.patient.id===patientId?context:null;
 function accept(bundle:PatientBundle){recordRef.current=bundle;setRecord(bundle)}
 async function load():Promise<PatientBundle>{
  const sequence=++loadSequence.current,identity=patientId+':'+sessionId,controller=new AbortController();pendingReads.current.add(controller);
  try{
   const r=await fetch(`/api/patients/demo/visit?tester=${getDemoTesterId()}&patient=${encodeURIComponent(patientId)}&session=${encodeURIComponent(sessionId)}`,{cache:'no-store',signal:controller.signal});
   const d=await r.json();if(!r.ok)throw new Error(d.error||t('errors.visitLoad'));
   if(!mounted.current||identity!==selected.current)throw new DOMException(t('visits.changed'),'AbortError');
   assertRecordIdentity(d.bundle,patientId,sessionId);
   if(sequence===loadSequence.current){accept(reconcileRecord(recordRef.current,d.bundle));setError('')}
   // Verification must inspect the server response, not an optimistic projection.
   return d.bundle;
  }finally{pendingReads.current.delete(controller)}
 }
 useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;loadSequence.current++;for(const request of pendingReads.current)request.abort();pendingReads.current.clear()}},[patientId,sessionId]);
 useEffect(()=>{if(finalizeFlight.current)return;void load().catch(cause=>{if(mounted.current&&cause?.name!=='AbortError')setError(cause instanceof Error?cause.message:t('errors.visitLoad'))})},[sessionId,patientId,safeContext?.sessions.find(s=>s.id===sessionId)?.status]);
 useEffect(()=>{const guard=async()=>{if(finalizeFlight.current)throw new Error(t('visits.finalizationInProgress'));await editorBeforeNavigate.current?.()};beforeNavigate.current=guard;return()=>{if(beforeNavigate.current===guard)beforeNavigate.current=null}},[beforeNavigate]);
 function merged(bundle:PatientBundle,context=safeContext):PatientBundle{return mergeVisitContext(bundle,context)}
 async function reload(){return merged(await load())}
 async function refreshContext(){const fresh=await reloadContext();if(!fresh)throw new Error(t('errors.recordRefreshRetry'));assertRecordIdentity(fresh,patientId);return merged(await load(),fresh)}
 async function finalize(targetSessionId:string,closure=false,closureVersion?:number):Promise<void>{
  if(targetSessionId!==sessionId)throw new Error(t('visits.selectedVisitChanged'));
  if(finalizeFlight.current)return finalizeFlight.current;
  setFinalizing(true);setFinalizeError('');
  const task=(async()=>{
   try{
    await finalizeAndVerify({sessionId,patientId,closure,closureVersion,read:load,write:demoPost,
     onCommitted:(completed,baseline)=>{loadSequence.current++;accept(reconcileRecord(recordRef.current,{...baseline,sessions:baseline.sessions.map(row=>row.id===completed.id?completed:row)}))},
     onVerified:async(completed,verified)=>{accept(reconcileRecord(recordRef.current,verified));await onFinalized(completed)},
    });
   }catch(cause){if(mounted.current)setFinalizeError(cause instanceof Error?cause.message:t('errors.finalizationUnconfirmed'));throw cause}
   finally{finalizeFlight.current=null;if(mounted.current)setFinalizing(false)}
  })();
  finalizeFlight.current=task;return task;
 }
 async function checkCompletion(){
  if(finalizeFlight.current)return;
  setFinalizing(true);setFinalizeError('');
  try{const fresh=await load();const completed=confirmedCompletion(fresh.sessions.find(row=>row.id===sessionId),sessionId,patientId);await onFinalized(completed)}
  catch(cause){setFinalizeError(cause instanceof Error?cause.message:t('errors.completionUnconfirmed'))}
  finally{if(mounted.current)setFinalizing(false)}
 }
 async function defer(targetSessionId=sessionId,reason?:string){if(targetSessionId!==sessionId)throw new Error(t('visits.visitHasChanged'));setFinalizeError('');try{await demoPost({action:'finish_session_later',session_id:sessionId});await onDeferred(sessionId,reason)}catch(cause){const message=cause instanceof Error?cause.message:t('errors.draftSave');setFinalizeError(message);throw cause}}
 const currentSession=record?.sessions.find(row=>row.id===sessionId&&row.patient_id===patientId);
 return <section className="visit-workspace" aria-label={t('visits.clinicalVisit')}>
  {finalizeError&&<p role="alert">{systemMessage(finalizeError)} <button type="button" disabled={finalizing} onClick={()=>void checkCompletion()}>{t('visits.checkCompletion')}</button></p>}
  {error&&<p role="alert">{systemMessage(error)} <button type="button" onClick={()=>void load().catch(cause=>setError(cause.message))}>{t('common.repeat')}</button></p>}
  {!record&&!error&&<p role="status">{t('visits.openingVisit')}</p>}
  {record&&currentSession&&<>{!safeContext&&<p className="visit-context-status">{t('visits.independentContextLoading')} <button type="button" onClick={()=>void refreshContext().catch(cause=>setError(cause.message))}>{t('common.retryLoading')}</button></p>}<PatientSession beforeNavigate={editorBeforeNavigate} previousMse={previousMseReference(safeContext,sessionId,currentSession.started_at)} key={sessionId} bundle={merged(record)} reload={reload} reloadContext={refreshContext} contextReady={Boolean(safeContext)} onFinalize={finalize} onFinishLater={defer} finalizing={finalizing} finalizeError="" selectedSessionId={sessionId} onSelectSession={onSelect}/></>}
 </section>;
}

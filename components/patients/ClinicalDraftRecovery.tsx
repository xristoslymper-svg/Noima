'use client';
import {useTranslations} from 'next-intl';

import {useRef,useState} from 'react';
import type {ContinuityDraft} from '@/lib/clinical/continuity';
import {validContinuity} from '@/lib/clinical/continuity';
import type {PatientBundle} from '@/lib/patients/demo-runtime';
import type {useClinicalDraft} from './useClinicalDraft';
type Draft=ReturnType<typeof useClinicalDraft<ContinuityDraft>>;
export default function ClinicalDraftRecovery({draft,reload,sessionId,patientId,disabled=false}:{draft:Draft;reload:()=>Promise<unknown>;sessionId:string;patientId:string;disabled?:boolean}){
 const t=useTranslations();

 const [confirm,setConfirm]=useState(false),[discard,setDiscard]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState('');const flight=useRef(false);
 async function run(loadServer:boolean){if(flight.current||disabled||draft.saving)return;flight.current=true;setBusy(true);setError('');try{
  if(!loadServer){await draft.flush();return}
  const fresh=await reload() as PatientBundle|null;const session=fresh?.sessions.find(s=>s.id===sessionId&&s.patient_id===fresh.patient.id);
  if(fresh?.patient.id!==patientId||!session||session.patient_id!==patientId||session.status!=='draft'||!validContinuity(session.closure_draft)||!Number.isSafeInteger(session.closure_version)||(session.closure_version as number)<0)throw new Error(t('errors.recoveryInvalidDraft'));
  draft.acceptServerPreservingLocal(session.closure_draft,session.closure_version!);setConfirm(false);
 }catch(cause){setError(cause instanceof Error?cause.message:t('errors.recoveryFailed'))}finally{flight.current=false;setBusy(false)}}
 // A save temporarily clears its error. Never remove an open consent prompt.
 if(!draft.error&&!draft.olderRecovery&&!error&&!confirm&&!busy)return null;
 const blocked=disabled||busy||draft.saving;
 const labels:Record<string,string>={transcript:t('clinical.notes'),clinical_state_summary:t('clinical.currentState'),treatment_decision:t('clinical.decisionInterventions'),next_review_focus:t('clinical.review'),adherence:t('medications.adherence'),pinned_context:t('clinical.keyIssues')};
 const backup=draft.olderRecovery?Object.entries(labels).map(([key,label])=>label+'\n'+String(draft.olderRecovery?.[key as keyof ContinuityDraft]||'')).join('\n\n'):'';
 return <section className="save-state" aria-label={t('visits.recoverDraft')} onPointerDown={event=>{
  // Keep the failed field focused until the explicit recovery action runs.
  // Otherwise its blur handler retries a save and removes the clicked control
  // between pointer-down and click. Keyboard activation remains unchanged.
  if((event.target as HTMLElement).closest('button'))event.preventDefault();
 }}>
  {draft.error&&<><p role="alert">{draft.error}</p><div>
   {!draft.hasConflict&&<button type="button" disabled={blocked} onClick={()=>void run(false)}>{t('visits.retrySave')}</button>}
   <button type="button" disabled={blocked} onClick={()=>setConfirm(true)}>{t('visits.loadingSavedDraft')}</button>
  </div></>}
  {confirm&&<div role="group" aria-label={t('visits.confirmLoadDraft')}><p>{t('visits.loadDraftHelp')}</p><button type="button" disabled={blocked} onClick={()=>void run(true)}>{t('visits.backupAndLoad')}</button><button type="button" disabled={blocked} onClick={()=>setConfirm(false)}>{t('visits.cancelLoad')}</button></div>}
  {draft.olderRecovery&&<details><summary>{t('visits.unsavedBackup')}</summary><p>{t('visits.copyBeforeClose')}</p><textarea aria-label={t('visits.unsavedBackup')} rows={8} readOnly value={backup}/>{discard?<><p>{t('visits.deleteBackupConfirm')}</p><button type="button" disabled={blocked} onClick={()=>{draft.dismissOlderRecovery();setDiscard(false)}}>{t('visits.deleteBackup')}</button><button type="button" onClick={()=>setDiscard(false)}>{t('visits.keepBackup')}</button></>:<button type="button" disabled={blocked} onClick={()=>setDiscard(true)}>{t('visits.discardBackup')}</button>}</details>}
  {error&&<p role="alert">{error}</p>}
 </section>;
}

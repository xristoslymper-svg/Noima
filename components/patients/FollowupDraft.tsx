'use client';
import {useTranslations} from 'next-intl';
import {useSystemMessage} from '@/i18n/system-message';
import {createContext,useContext,useEffect,useRef,useState,type ReactNode} from 'react';
import {useClinicalDraft} from './useClinicalDraft';
import {initialFollowupDraft,followupFieldConflicts} from '@/lib/clinical/followup-fields';
import type {ContinuityDraft} from '@/lib/clinical/continuity';
import type {DemoSession,PatientBundle} from '@/lib/patients/demo-runtime';
import {demoPost} from '@/lib/patients/demo-client';
import ClinicalTextField from '@/components/dictation/ClinicalTextField';

type Tracking={registerFlusher:(key:string,flush:()=>Promise<void>)=>(()=>void);onDirtyChange:(key:string,dirty:boolean)=>void};
type Draft=ReturnType<typeof useClinicalDraft<ContinuityDraft>>;
type Conflict=ReturnType<typeof followupFieldConflicts>[number];
type Context=Tracking&{toolsDisabled?:boolean;draft:Draft;sessionId:string;checkConsistency:(bundle:PatientBundle)=>void};
const FollowupContext=createContext<Context|null>(null);
export function useFollowupDraft(){const context=useContext(FollowupContext);if(!context)throw new Error('Missing follow-up draft provider');return context;}

export function FollowupDraftProvider({bundle,session,reload,registerFlusher,onDirtyChange,children,saveClosure}:{saveClosure?:(value:ContinuityDraft,version:number|null)=>Promise<{value:ContinuityDraft;version:number}>;bundle:PatientBundle;session:DemoSession;reload:()=>Promise<unknown>;children:ReactNode}&Tracking){
 const t=useTranslations();
 const systemMessage=useSystemMessage();

 const draft=useClinicalDraft<ContinuityDraft>({storageKey:session.id+':closure',initial:initialFollowupDraft(session,bundle.sections),version:session.closure_version||0,write:async(value,version)=>{if(saveClosure)return saveClosure(value,version);const result=await demoPost({action:'save_closure',session_id:session.id,value,expected_version:version});return {value:result.session.closure_draft,version:result.session.closure_version}},onSaved:reload,onDirty:dirty=>onDirtyChange('closure',dirty)});
 useEffect(()=>registerFlusher('closure',draft.flush),[registerFlusher,draft.flush]);
 const [conflicts,setConflicts]=useState<Conflict[]>([]),[error,setError]=useState(''),[busy,setBusy]=useState(false);
 const conflictPanel=useRef<HTMLElement>(null);
 useEffect(()=>{if(conflicts.length)conflictPanel.current?.scrollIntoView({block:'start',behavior:'smooth'})},[conflicts.length]);
 useEffect(()=>registerFlusher('followup-resolution',async()=>{if(busy)throw new Error(t('visits.waitForResolutionSave'))}),[registerFlusher,busy]);
 useEffect(()=>{onDirtyChange('followup-resolution',busy);return()=>onDirtyChange('followup-resolution',false)},[onDirtyChange,busy]);
 function checkConsistency(fresh:PatientBundle){
  const found=followupFieldConflicts(draft.currentValue(),session.id,fresh.sections);
  setConflicts(found);
  if(found.length)throw new Error(t('visits.conflictingOldNotesHelp'));
 }
 async function resolve(conflict:Conflict,source:'shared'|'detailed'){
  setBusy(true);setError('');
  try{
   if(source==='detailed'){draft.change({...draft.currentValue(),[conflict.field]:conflict.section.content});await draft.flush()}
   else await demoPost({action:'save_section',session_id:session.id,section_key:conflict.key,content:draft.currentValue()[conflict.field],source:'manual',expected_version:conflict.section.version});
   const fresh=await reload() as PatientBundle;
   setConflicts(followupFieldConflicts(draft.currentValue(),session.id,fresh.sections));
  }catch(cause){setError(cause instanceof Error?cause.message:t('errors.reconcileRecords'))}finally{setBusy(false)}
 }
 const labels={interview:t('clinical.currentState'),plan:t('clinical.decisions'),review:t('clinical.nextReview'),adherence:t('medications.adherence')};
 return <FollowupContext.Provider value={{draft,toolsDisabled:Boolean(saveClosure),sessionId:session.id,registerFlusher,onDirtyChange,checkConsistency}}>
  {conflicts.length>0&&<section ref={conflictPanel} className="visit-source-conflicts" role="region" aria-label={t('visits.reconcilePrevious')}><h3>{t('visits.reconcilePrevious')}</h3><p>{t('visits.conflictComparisonHelp')}</p>{conflicts.map(conflict=><div key={conflict.key}><h4>{labels[conflict.key as keyof typeof labels]}</h4><div className="visit-related-fields"><div><strong>{t('visits.sharedRecord')}</strong><p>{draft.value[conflict.field]||t('common.emptyField')}</p><button type="button" disabled={busy} onClick={()=>void resolve(conflict,'shared')}>{t('visits.keepSharedRecord')}</button></div><div><strong>{t('visits.earlierDetailedRecord')}</strong><p>{conflict.section.content}</p><button type="button" disabled={busy} onClick={()=>void resolve(conflict,'detailed')}>{t('visits.keepDetailedRecord')}</button></div></div></div>)}{error&&<p role="alert">{systemMessage(error)}</p>}</section>}
  {children}
  {draft.error&&<p role="alert">{systemMessage(draft.error)}</p>}
 </FollowupContext.Provider>;
}

export function FollowupField({field,title,placeholder='',rows=2,onPendingChange,sectionHeading=false}:{sectionHeading?:boolean;field:keyof Omit<ContinuityDraft,'source'|'writing_provenance'>;title:string;placeholder?:string;rows?:number;onPendingChange?:(pending:boolean)=>void}){
 const t=useTranslations();

 const {draft,sessionId,registerFlusher,onDirtyChange,toolsDisabled}=useFollowupDraft();
 const current=useRef(draft);current.current=draft;
 return <ClinicalTextField toolsDisabled={toolsDisabled} sessionId={sessionId} section="closure" fieldKey={field} sectionHeading={sectionHeading} title={title} placeholder={placeholder} rows={rows} maxLength={field==='pinned_context'?2000:20000} value={draft.value[field]} onChange={text=>current.current.change({...current.current.currentValue(),[field]:text})} onBlur={()=>void current.current.flush().catch(()=>{})} registerFlusher={registerFlusher} onDirtyChange={onDirtyChange} onPendingChange={onPendingChange} onConfirm={async(text,{provenance})=>{
  await current.current.flush();const latest=current.current,value=latest.currentValue();
  if(value[field]!==provenance.original)throw new Error(t('errors.originalChanged'));
  latest.change({...value,[field]:text,source:provenance.kind==='ai'?'ai_assisted':value.source,writing_provenance:{...value.writing_provenance,[field]:provenance}});
  await latest.flush();
 }}/>;
}

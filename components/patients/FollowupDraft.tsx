'use client';
import {createContext,useContext,useCallback,useEffect,useRef,useState,type ReactNode} from 'react';
import {useClinicalDraft} from './useClinicalDraft';
import {initialFollowupDraft,followupFieldConflicts} from '@/lib/clinical/followup-fields';
import type {ContinuityDraft} from '@/lib/clinical/continuity';
import type {DemoSession,PatientBundle} from '@/lib/patients/demo-runtime';
import {demoPost} from '@/lib/patients/demo-client';
import ClinicalTextField from '@/components/dictation/ClinicalTextField';
import ClinicalDraftRecovery from './ClinicalDraftRecovery';

type Tracking={registerFlusher:(key:string,flush:()=>Promise<void>)=>(()=>void);onDirtyChange:(key:string,dirty:boolean)=>void};
type Draft=ReturnType<typeof useClinicalDraft<ContinuityDraft>>;
type Conflict=ReturnType<typeof followupFieldConflicts>[number];
type Context=Tracking&{writingPending:boolean;trackWriting:(field:string,pending:boolean)=>void;draft:Draft;sessionId:string;patientId:string;reload:()=>Promise<unknown>;checkConsistency:(bundle:PatientBundle)=>void};
const FollowupContext=createContext<Context|null>(null);
export function useFollowupDraft(){const context=useContext(FollowupContext);if(!context)throw new Error('Missing follow-up draft provider');return context;}

export function FollowupDraftProvider({bundle,session,reload,registerFlusher,onDirtyChange,children}:{bundle:PatientBundle;session:DemoSession;reload:()=>Promise<unknown>;children:ReactNode}&Tracking){
 const draft=useClinicalDraft<ContinuityDraft>({storageKey:session.id+':closure',initial:initialFollowupDraft(session,bundle.sections),version:session.closure_version||0,write:async(value,version)=>{const result=await demoPost({action:'save_closure',session_id:session.id,value,expected_version:version});return {value:result.session.closure_draft,version:result.session.closure_version}},onSaved:reload,onDirty:dirty=>onDirtyChange('closure',dirty)});
 useEffect(()=>registerFlusher('closure',draft.flush),[registerFlusher,draft.flush]);
 const [conflicts,setConflicts]=useState<Conflict[]>([]),[error,setError]=useState(''),[busy,setBusy]=useState(false);
 const [writing,setWriting]=useState<Record<string,boolean>>({});
 const trackWriting=useCallback((field:string,pending:boolean)=>setWriting(current=>current[field]===pending?current:{...current,[field]:pending}),[]);
 const conflictPanel=useRef<HTMLElement>(null);
 useEffect(()=>{setConflicts(followupFieldConflicts(draft.currentValue(),session.id,bundle.sections))},[bundle.sections,session.id,draft.value]);
 useEffect(()=>{if(conflicts.length)conflictPanel.current?.scrollIntoView({block:'start',behavior:'smooth'})},[conflicts.length]);
 useEffect(()=>registerFlusher('followup-resolution',async()=>{if(busy)throw new Error('Περιμένετε να αποθηκευτεί η επιλογή καταγραφής.')}),[registerFlusher,busy]);
 useEffect(()=>{onDirtyChange('followup-resolution',busy);return()=>onDirtyChange('followup-resolution',false)},[onDirtyChange,busy]);
 function checkConsistency(fresh:PatientBundle){
  const found=followupFieldConflicts(draft.currentValue(),session.id,fresh.sections);
  setConflicts(found);
  if(found.length)throw new Error('Υπάρχουν διαφορετικές παλαιότερες αναλυτικές σημειώσεις. Επιλέξτε ποια καταγραφή θα διατηρηθεί πριν ολοκληρώσετε.');
 }
 async function resolve(conflict:Conflict,source:'shared'|'detailed'){
  setBusy(true);setError('');
  try{
   if(source==='detailed'){draft.change({...draft.currentValue(),[conflict.field]:conflict.section.content});await draft.flush()}
   else await demoPost({action:'save_section',session_id:session.id,section_key:conflict.key,content:draft.currentValue()[conflict.field],source:'manual',expected_version:conflict.section.version});
   const fresh=await reload() as PatientBundle;
   setConflicts(followupFieldConflicts(draft.currentValue(),session.id,fresh.sections));
  }catch(cause){setError(cause instanceof Error?cause.message:'Δεν συμφωνήθηκαν οι καταγραφές.')}finally{setBusy(false)}
 }
 const labels={interview:'Κλινική εικόνα',plan:'Αποφάσεις',review:'Επόμενος έλεγχος',adherence:'Λήψη αγωγής'};
 return <FollowupContext.Provider value={{writingPending:Object.values(writing).some(Boolean),trackWriting,draft,sessionId:session.id,patientId:bundle.patient.id,reload,registerFlusher,onDirtyChange,checkConsistency}}>
  {conflicts.length>0&&<section ref={conflictPanel} className="visit-source-conflicts" role="region" aria-label="Συμφωνία παλαιότερων καταγραφών"><h3>Συμφωνία παλαιότερων καταγραφών</h3><p>Υπάρχουν δύο διαφορετικά κείμενα για το ίδιο πεδίο. Ελέγξτε τα πριν επιλέξετε.</p>{conflicts.map(conflict=><div key={conflict.key}><h4>{labels[conflict.key as keyof typeof labels]}</h4><div className="visit-related-fields"><div><strong>Κοινή καταγραφή επίσκεψης</strong><p>{draft.value[conflict.field]||'Κενό πεδίο'}</p><button type="button" disabled={busy} onClick={()=>void resolve(conflict,'shared')}>Διατήρηση κοινής καταγραφής</button></div><div><strong>Παλαιότερη αναλυτική καταγραφή</strong><p>{conflict.section.content}</p><button type="button" disabled={busy} onClick={()=>void resolve(conflict,'detailed')}>Διατήρηση αναλυτικής καταγραφής</button></div></div></div>)}{error&&<p role="alert">{error}</p>}</section>}
  {children}
  {draft.error&&<p role="alert">{draft.error}</p>}
 </FollowupContext.Provider>;
}

export function FollowupRecovery({disabled=false}:{disabled?:boolean}){
 const {draft,sessionId,patientId,reload,writingPending}=useFollowupDraft();
 return <ClinicalDraftRecovery draft={draft} sessionId={sessionId} patientId={patientId} reload={reload} disabled={disabled||writingPending}/>;
}

export function FollowupField({field,title,placeholder='',rows=2,onPendingChange,sectionHeading=false}:{sectionHeading?:boolean;field:keyof Omit<ContinuityDraft,'source'|'writing_provenance'>;title:string;placeholder?:string;rows?:number;onPendingChange?:(pending:boolean)=>void}){
 const {draft,sessionId,registerFlusher,onDirtyChange,trackWriting}=useFollowupDraft();
 const current=useRef(draft);current.current=draft;
 return <ClinicalTextField sessionId={sessionId} section="closure" fieldKey={field} sectionHeading={sectionHeading} title={title} placeholder={placeholder} rows={rows} maxLength={field==='pinned_context'?2000:20000} value={draft.value[field]} onChange={text=>current.current.change({...current.current.currentValue(),[field]:text})} onBlur={()=>void current.current.flush().catch(()=>{})} registerFlusher={registerFlusher} onDirtyChange={onDirtyChange} onPendingChange={pending=>{trackWriting(field,pending);onPendingChange?.(pending)}} onConfirm={async(text,{provenance})=>{
  await current.current.flush();const latest=current.current,value=latest.currentValue();
  if(value[field]!==provenance.original)throw new Error('Η αρχική καταγραφή άλλαξε. Ελέγξτε τη νεότερη έκδοση.');
  latest.change({...value,[field]:text,source:provenance.kind==='ai'?'ai_assisted':value.source,writing_provenance:{...value.writing_provenance,[field]:provenance}});
  await latest.flush();
 }}/>;
}

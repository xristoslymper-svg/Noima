'use client';
import {useLocale} from 'next-intl';

import {useTranslations} from 'next-intl';

import {readRecovery} from '@/lib/clinical/browser-recovery';
import {useEffect,useRef,useState} from 'react';
import ClinicalTextField,{type WritingCommit} from '@/components/dictation/ClinicalTextField';
import {narrativeWritingRecovery,type WritingPending} from '@/lib/clinical/clinical-writing';
import {useClinicalDraft} from './useClinicalDraft';
import type {ClinicalProposal} from '@/lib/clinical/core-types';
import type {DemoSection,PatientBundle} from '@/lib/patients/demo-runtime';
import {demoPost} from '@/lib/patients/demo-client';
import {formatClinicDateTime} from '@/lib/clinic-time';
const required=new Set(['interview','mse','assessment','plan','review']);

export default function SectionEditor({sessionId,definition,existing,proposals,onSaved,registerFlusher,onDirtyChange,sectionHeading=false,rows=4,placeholder}:{placeholder?:string;rows?:number;sectionHeading?:boolean;sessionId:string;definition:{key:string;title:string};existing?:DemoSection;proposals:ClinicalProposal[];onSaved:()=>Promise<unknown>;registerFlusher:(key:string,flush:()=>Promise<void>)=>(()=>void);onDirtyChange:(key:string,dirty:boolean)=>void}){
const t=useTranslations();

 const locale=useLocale();

const fmt=(value?:string|null)=>value?formatClinicDateTime(value, locale):'—';

 

 const key='section:'+definition.key;const [conflict,setConflict]=useState<DemoSection|null|undefined>(),[recoverable,setRecoverable]=useState(''),[recovery,setRecovery]=useState<WritingPending|null>(null),[pending,setPending]=useState(false);
 const draft=useClinicalDraft({storageKey:sessionId+':'+key,initial:existing?.content||'',version:existing?.version??null,write:async(content,version)=>{const d=await demoPost({action:'save_section',session_id:sessionId,section_key:definition.key,content,source:'manual',expected_version:version});return {value:d.section.content as string,version:d.section.version as number}},onSaved,onDirty:dirty=>onDirtyChange(key,dirty)});
 const current=useRef(draft);current.current=draft;
 useEffect(()=>registerFlusher(key,draft.flush),[key,registerFlusher,draft.flush]);
 useEffect(()=>{try{setRecoverable(readRecovery(sessionStorage,sessionId+':transcript:'+definition.key)||'')}catch{}},[sessionId,definition.key]);
 async function confirm(text:string,{pending,rememberProposal}:WritingCommit){
  await current.current.flush();const latest=current.current;
  if(latest.currentValue()!==pending.base)throw new Error(t('errors.originalChanged'));
  let id=pending.proposalId;
  if(!id){const r=await fetch('/api/clinical/writing',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({session_id:sessionId,section:definition.key,kind:pending.kind,original:pending.base,transcript:pending.transcript,text,model:pending.model})});const result=await r.json();if(!r.ok)throw new Error(result.error||t('errors.proposalCommit'));id=result.entry?.id;if(!id)throw new Error(t('errors.proposalCommit'));rememberProposal(id)}
  const result=await demoPost({action:'approve_proposal',proposal_id:id,text,mode:'replace',expected_version:latest.version()});
  latest.acceptServer(result.section.content,result.section.version);setRecoverable('');setRecovery(null);
  try{sessionStorage.removeItem(sessionId+':transcript:'+definition.key);sessionStorage.removeItem(`noima-proposal:${sessionId}:${definition.key}`)}catch{}
  await onSaved().catch(()=>{});
 }
 function recover(proposal?:ClinicalProposal){
  // Legacy proposals are rendered inline; recovering one never launches AI.
  let legacy;
  if(!proposal){try{const old=JSON.parse(readRecovery(sessionStorage,`noima-proposal:${sessionId}:${definition.key}`)||'null');if(old&&typeof old.text==='string')legacy={text:old.text,manual:Boolean(old.manual),mode:old.mode||'append'}}catch{}}
  setRecovery(narrativeWritingRecovery(current.current.currentValue(),proposal,recoverable,legacy));
 }
 async function compare(){const fresh=await onSaved() as PatientBundle|null;if(fresh)setConflict(fresh.sections.find(s=>s.session_id===sessionId&&s.section_key===definition.key)||null)}
 return <div className="clinical-section">
  <ClinicalTextField sessionId={sessionId} section={definition.key} fieldKey="narrative" sectionHeading={sectionHeading} placeholder={placeholder} title={definition.title+(required.has(definition.key)?' *':'')} rows={rows} className="section-editor" fullMicLabel={definition.key==='interview'} value={draft.value} onChange={draft.change} onBlur={()=>void draft.flush().catch(()=>{})} onConfirm={confirm} registerFlusher={registerFlusher} onDirtyChange={onDirtyChange} onPendingChange={setPending} recovery={recovery} onRecoveryConsumed={()=>setRecovery(null)}/>
  <div role="status">{draft.saving?t('visits.savingToDraft'):draft.error||(draft.savedAt?t('visits.draftSavedAtPrefix')+draft.savedAt:existing?t('visits.draftSavedAtPrefix'):t('clinical.notRecorded'))}</div>
  {draft.error&&<><button onClick={()=>void draft.flush().catch(()=>{})}>{t('common.repeat')}</button><button onClick={()=>void compare()}>{t('visits.compareSaved')}</button></>}
  {conflict!==undefined&&<div className="conflict-review"><h4>{t('visits.savedVersion')}</h4><p>{conflict?.content||t('clinical.emptySection')}</p><p>{t('visits.textPreservedInEditor')}</p><button disabled={pending} onClick={()=>{draft.acceptServer(conflict?.content||'',conflict?.version??null);setConflict(undefined)}}>{t('visits.useSaved')}</button><button disabled={pending} onClick={()=>{draft.resolve(draft.value,conflict?.content||'',conflict?.version??null);setConflict(undefined)}}>{t('visits.replaceWithMyText')}</button><button disabled={pending} onClick={()=>{draft.resolve([conflict?.content,draft.value].filter(Boolean).join('\n\n'),conflict?.content||'',conflict?.version??null);setConflict(undefined)}}>{t('visits.mergeBoth')}</button></div>}
  {!pending&&<>{proposals.filter(p=>p.status==='proposal').slice(0,3).map(p=><button type="button" key={p.id} onClick={()=>recover(p)}>{t('clinical.resumeProposalReviewPrefix')} {fmt(p.created_at)}</button>)}{recoverable&&<button type="button" className="text-button" onClick={()=>recover()}>{t('clinical.recoverLastTranscript')}</button>}</>}
  {proposals.some(p=>p.status==='approved')&&<details className="clinical-provenance"><summary aria-label={t('clinical.confirmedTextSource')} title={t('clinical.confirmedTextSource')}><span aria-hidden="true">›</span></summary>{proposals.filter(p=>p.status==='approved').map(p=><div key={p.id}><small>{t('clinical.approvedPrefix')} {fmt(p.approved_at)}</small><p>{t('clinical.transcriptPrefix')} {p.transcript}</p><p>{t('clinical.approvedTextPrefix')} {p.approved_text}</p></div>)}</details>}
 </div>;
}

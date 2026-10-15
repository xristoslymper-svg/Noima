'use client';
import {useSystemMessage} from '@/i18n/system-message';

import {useLocale} from 'next-intl';

import {useTranslations} from 'next-intl';


import { useCallback, useEffect, useRef, useState, type MutableRefObject } from 'react';
import { ArrowLeft, Check, CheckCircle2, RotateCcw, ShieldCheck } from 'lucide-react';
import FollowupClosure from './FollowupClosure';
import {followupFinalizationVersion,focusFollowupBlocker} from '@/lib/clinical/followup-finalization';
import VisitAdministration from './VisitAdministration';
import RiskEditor from './RiskTreeEditor';
import StructuredVisitEditor from './StructuredVisitEditor';
import CompletedRecordEditor from './CompletedRecordEditor';
import VisitHistory from './VisitHistory';
import VisitNextAppointment from './VisitNextAppointment';
import VisitScores from './VisitScores';
import MedicationTable from './MedicationTable';
import {FollowupDraftProvider,FollowupField,FollowupRecovery} from './FollowupDraft';
import {followupFields} from '@/lib/clinical/followup-fields';
import SectionEditor from './SectionEditor';
import type { DemoRisk, DemoSection, DemoSession, PatientBundle } from '@/lib/patients/demo-runtime';
import { demoPost } from '@/lib/patients/demo-client';
import { formatClinicDateTime } from '@/lib/clinic-time';
import {activeVisitPart,finalizationBlocker,visitSteps,previousMseReference,sessionClinicalTime,mseTimeline} from '@/lib/clinical/visit-workspace-state';



const required=new Set(['interview','mse','assessment','plan','review']);




type RegisterFlusher=(key:string,flush:()=>Promise<void>)=>(()=>void);
type DirtyChange=(key:string,dirty:boolean)=>void;

export default function PatientSession({
 bundle,
 reload,
 onFinalize,
 onFinishLater,
 finalizing,
 finalizeError,
 selectedSessionId,
 onSelectSession,
 contextReady=true,
 reloadContext=reload,
 onClose,
 beforeNavigate,
 previousMse,
}:{
 beforeNavigate?:MutableRefObject<(()=>Promise<void>)|null>;
 previousMse?:ReturnType<typeof previousMseReference>;
 contextReady?:boolean;
 reloadContext?:()=>Promise<unknown>;
 onClose?:()=>void;
 bundle:PatientBundle;
 reload:()=>Promise<unknown>;
 onFinalize:(sessionId:string,closure?:boolean,closureVersion?:number)=>Promise<void>;
 onFinishLater?:(sessionId:string,reason?:string)=>Promise<void>;
 finalizing:boolean;
 finalizeError:string;
 selectedSessionId:string|null;
 onSelectSession:(sessionId?:string|null)=>void;
}){
 const systemMessage=useSystemMessage();

const t=useTranslations();
const stepLabels={interview:t('visits.steps.interview'),mse:t('visits.steps.mse'),risk:t('visits.steps.risk'),history:t('visits.steps.history'),assessment:t('visits.steps.assessment'),diagnosis:t('visits.steps.diagnosis'),medication:t('visits.steps.medication'),plan:t('visits.steps.plan'),symptoms:t('visits.steps.symptoms'),adherence:t('visits.steps.adherence'),mseChanges:t('visits.steps.mseChanges'),psychometrics:t('visits.steps.psychometrics'),review:t('visits.steps.review')};

 const locale=useLocale();

const definitions=[
 ['interview',t('clinical.patientReportSymptoms'),t('clinical.patientReportHelp')],
 ['mse',t('clinical.mentalStatusExamination'),t('clinical.mseTodayHelp')],
 ['assessment',t('clinical.assessment'),t('clinical.assessmentHelp')],
 ['plan',t('clinical.treatmentPlan'),t('clinical.treatmentPlanHelp')],
 ['review',t('clinical.review'),t('clinical.reviewHelp')],
 ['functioning',t('clinical.functioning'),t('clinical.functioningHelp')],
 ['effects',t('medications.sideEffects'),t('medications.sideEffectsHelp')],
 ['adherence',t('medications.adherence'),t('medications.adherenceHelp')],
] as const;
const fmt=(value?:string|null)=>value?formatClinicDateTime(value, locale):'—';
const riskOptions=[['not_assessed',t('clinical.notAssessed')],['unknown',t('common.unknown')],['negative',t('clinical.negative')],['positive',t('clinical.positive')]] as const;
const riskLabel=(value:string)=>riskOptions.find(([key])=>key===value)?.[1]||value;

 

 const [detailed,setDetailed]=useState(false);
 const [narrativeMode,setNarrativeMode]=useState<Record<string,boolean>>({});
 const completed=bundle.sessions.filter(s=>s.status==='completed').sort((a,b)=>Date.parse(sessionClinicalTime(bundle,b))-Date.parse(sessionClinicalTime(bundle,a)));
 const requested=selectedSessionId?bundle.sessions.find(s=>s.id===selectedSessionId):undefined;
 const draft=requested?.status==='draft'?requested:(!selectedSessionId?bundle.sessions.find(s=>s.status==='draft'):undefined);
 const selected=requested?.status==='completed'?requested:undefined;
 const flushers=useRef(new Map<string,()=>Promise<void>>());
 const dirtyKeys=useRef(new Set<string>());
 const [dirtyCount,setDirtyCount]=useState(0);
 const [flushing,setFlushing]=useState(false);
 const [flushError,setFlushError]=useState('');
 const [focusError,setFocusError]=useState<unknown>(null);
 const [refreshError,setRefreshError]=useState('');
 const [showFinalizeGuidance,setShowFinalizeGuidance]=useState(false);
 const [finishingLater,setFinishingLater]=useState(false);
 const finishing=useRef(false);
 const documentRef=useRef<HTMLFieldSetElement>(null);
 const [activePart,setActivePart]=useState('interview');

 const registerFlusher=useCallback<RegisterFlusher>((key,flush)=>{
  flushers.current.set(key,flush);
  return()=>{if(flushers.current.get(key)===flush)flushers.current.delete(key)};
 },[]);

 const onDirtyChange=useCallback<DirtyChange>((key,dirty)=>{
  if(dirty)dirtyKeys.current.add(key);else dirtyKeys.current.delete(key);
  setDirtyCount(dirtyKeys.current.size);
 },[]);

 useEffect(()=>{
  const warn=(event:BeforeUnloadEvent)=>{
   if(!dirtyKeys.current.size)return;
   event.preventDefault();
   event.returnValue='';
  };
  window.addEventListener('beforeunload',warn);
  return()=>window.removeEventListener('beforeunload',warn);
 },[]);

 const flushAll=useCallback(async(requireRefresh=false)=>{
  setFlushing(true);
  setFlushError('');
  setRefreshError('');
  try{
   const pending=[...flushers.current.values()];
   await Promise.all(pending.map(flush=>flush()));
  }catch(cause){
   const message=cause instanceof Error?cause.message:t('errors.unsavedChanges');
   setFlushError(message);
   setFlushing(false);
   throw cause;
  }
  if(!requireRefresh){setFlushing(false);return null}
  try{
   const refreshed=await reload();
   if(!refreshed)throw new Error('refresh_unavailable');
   return refreshed;
  }catch(cause){
   setRefreshError(t('visits.savedRefreshFailed'));
   if(requireRefresh)throw cause;
   return null;
  }finally{
   setFlushing(false);
  }
 },[reload]);

 useEffect(()=>{if(!beforeNavigate)return;const flush=async()=>{await flushAll()};beforeNavigate.current=flush;return()=>{if(beforeNavigate.current===flush)beforeNavigate.current=null}},[beforeNavigate,flushAll]);

 useEffect(()=>{
  const root=documentRef.current;if(!root)return;
  const sections=[...root.querySelectorAll<HTMLElement>('[data-visit-part]')];
  let frame=0;
  const dialog=root.closest('dialog');
  const navigationKeys=new Set<string>(visitSteps[draft?.session_type==='initial_assessment'?'initial_assessment':'follow_up'].map(([key])=>key));
  const navigable=sections.filter(section=>navigationKeys.has(section.dataset.visitPart||''));
  const update=()=>{frame=0;const top=dialog?.getBoundingClientRect().top||0;const atBottom=dialog&&dialog.scrollTop>0&&dialog.scrollTop+dialog.clientHeight>=dialog.scrollHeight-2;setActivePart(atBottom&&navigable.length?navigable[navigable.length-1].dataset.visitPart!:activeVisitPart(navigable.map(section=>({key:section.dataset.visitPart||'interview',top:section.getBoundingClientRect().top})),top+125))};
  const schedule=()=>{if(!frame)frame=requestAnimationFrame(update)};
  const target=dialog||window;
  target.addEventListener('scroll',schedule,{passive:true});window.addEventListener('resize',schedule);
  const observer=new ResizeObserver(schedule);sections.forEach(section=>observer.observe(section));update();
  return()=>{target.removeEventListener('scroll',schedule);window.removeEventListener('resize',schedule);observer.disconnect();if(frame)cancelAnimationFrame(frame)};
 },[draft?.id,detailed]);
 function goToPart(key:string){documentRef.current?.querySelector<HTMLElement>('[data-visit-part="'+key+'"]')?.scrollIntoView({behavior:'smooth',block:'start'})}

 async function finishLater(){
  if(!draft||!onFinishLater||finishingLater)return;
  setFinishingLater(true);
  try{await flushAll();await onFinishLater(draft.id)}catch{}finally{setFinishingLater(false)}
 }
 // Wait for React to enable the editor after flush before moving focus.
 useEffect(()=>{if(!focusError||flushing||finalizing||finishingLater)return;const id=draft?.id;if(id){focusFollowupBlocker(focusError,id);setFocusError(null)}},[focusError,flushing,finalizing,finishingLater,draft?.id]);
 async function finalizeSafely(){
  if(finishing.current)return;finishing.current=true;
  try{
   const fresh=await flushAll(true) as PatientBundle;
   if(draft?.session_type==='follow_up'){await onFinalize(draft.id,true,followupFinalizationVersion(fresh,draft.id));return}
   const reference=draft?.session_type==='follow_up'?{section:{document:{kind:'mse' as const,fields:Object.values(mseTimeline(fresh,draft.id,draft.started_at).references).map(r=>r.field)}}}:null;
   const blocker=finalizationBlocker(fresh.sections.filter(s=>s.session_id===draft?.id),fresh.risks.find(r=>r.session_id===draft?.id),reference?.section.document,draft?.session_type==='initial_assessment');
   if(!draft)throw new Error(t('errors.draftNotFound'));
   if(blocker){setShowFinalizeGuidance(true);goToPart(blocker.anchor);return}
   await onFinalize(draft.id);
  }catch(cause){
   setFlushError(cause instanceof Error?cause.message:t('errors.finalizationUnconfirmed'));setFocusError(cause);
  }finally{finishing.current=false}
 }

 if(selected){
  return <><VisitAdministration bundle={bundle} sessionId={selected.id} reload={reloadContext} registerFlusher={registerFlusher} onDirtyChange={onDirtyChange} disabled={finalizing||!contextReady}/><CompletedSessionView session={selected} bundle={bundle} reload={reload} registerFlusher={registerFlusher} onDirtyChange={onDirtyChange} onBack={()=>onSelectSession(null)} /></>;
 }

 if(selectedSessionId&&!requested){
  return <section className="panel-stack"><div className="panel-heading"><div><span className="kicker">{t('visits.visitsKicker')}</span><h2>{t('visits.unavailableTitle')}</h2><p>{t('visits.unavailableHelp')}</p></div><button onClick={()=>onSelectSession(null)}>{t('visits.viewVisits')}</button></div></section>;
 }

 if(!draft){
  return <section className="panel-stack">
   <div className="panel-heading"><div><span className="kicker">{t('visits.visitsKicker')}</span><h2>{t('visits.completedVisits')}</h2><p>{t('visits.completedVisitsHelp')}</p></div></div>
   {completed.length?<CompletedList sessions={completed} onSelect={id=>void flushAll().then(()=>onSelectSession(id)).catch(()=>{})}/>:<div className="panel-empty">{t('visits.noVisits')}</div>}
  </section>;
 }

 const risk=bundle.risks.find(x=>x.session_id===draft.id);
 const sections=bundle.sections.filter(x=>x.session_id===draft.id);
 const mseReference=previousMse??previousMseReference(bundle,draft.id,draft.started_at);
 const timeline=draft.session_type==='follow_up'&&contextReady?mseTimeline(bundle,draft.id,draft.started_at):undefined;
 const sharedDraft=(view:React.ReactNode)=>draft.session_type==='follow_up'?<FollowupDraftProvider key={draft.id} bundle={bundle} session={draft} reload={reload} registerFlusher={registerFlusher} onDirtyChange={onDirtyChange}>{view}</FollowupDraftProvider>:view;
 if(draft.session_type==='follow_up'&&!detailed)return sharedDraft(<FollowupClosure key={draft.id} bundle={bundle} session={draft} reload={reload} reloadContext={reloadContext} contextReady={contextReady} onDirtyChange={onDirtyChange} registerFlusher={registerFlusher} flushAll={flushAll} onDetailed={()=>void flushAll(true).then(()=>setDetailed(true)).catch(()=>{})} onFinalize={version=>onFinalize(draft.id,true,version)} onFinishLater={onFinishLater?finishLater:undefined} finalizing={finalizing} finalizeError={finalizeError||flushError} />);
 const blocker=finalizationBlocker(sections,risk,timeline?{kind:'mse',fields:Object.values(timeline.references).map(r=>r.field)}:null,draft.session_type==='initial_assessment');
 const requiredStepState=(key:string)=>{
  if(draft.session_type==='follow_up'&&key==='plan')return Boolean(draft.closure_draft?.treatment_decision.trim()&&draft.closure_draft?.next_review_focus.trim());
  if(draft.session_type==='follow_up'&&key in followupFields)return Boolean(draft.closure_draft?.[followupFields[key as keyof typeof followupFields]]?.trim());
  if(key==='risk')return Boolean(risk&&risk.suicidal_ideation!=='not_assessed'&&(risk.suicidal_ideation!=='positive'||![risk.intent,risk.plan,risk.self_harm,risk.attempt_history].some(v=>v==='not_assessed')));
  if(key==='plan')return (draft.session_type==='initial_assessment'?['plan']:['plan','review']).every(requiredKey=>sections.some(s=>s.section_key===requiredKey&&s.content.trim()));
  return required.has(key)&&sections.some(s=>s.section_key===key&&s.content.trim());
 };
 const requiredVisitStep=(key:string)=>required.has(key)||key==='risk';

 const editor=(key:string,sectionTitle?:string,rows=2)=>{const d=definitions.find(([k])=>k===key)!;if(draft.session_type==='follow_up'&&key in followupFields)return <FollowupField sectionHeading={Boolean(sectionTitle)} field={followupFields[key as keyof typeof followupFields]} title={(sectionTitle||d[1])+(required.has(key)?' *':'')} rows={rows}/>;return <SectionEditor rows={rows} key={draft.id+':'+key} sessionId={draft.id} definition={{key,title:sectionTitle||d[1]}} sectionHeading={Boolean(sectionTitle)} existing={sections.find(s=>s.section_key===key)} proposals={bundle.proposals.filter(p=>p.session_id===draft.id&&p.section_key===key)} onSaved={reload} registerFlusher={registerFlusher} onDirtyChange={onDirtyChange}/>};
 const assessment=()=> draft.session_type==='initial_assessment'?<StructuredVisitEditor key={draft.id+':assessment'} sessionId={draft.id} kind="assessment" existing={sections.find(s=>s.section_key==='assessment')} followup={false} firstAssessment onSaved={reload} registerFlusher={registerFlusher} onDirtyChange={onDirtyChange}/>:<VisitPart anchor="assessment" number={draft.session_type==='follow_up'?'07':'05'} title={t('clinical.assessmentRequired')}>{narrativeMode.assessment?editor('assessment'):<StructuredVisitEditor key={draft.id+':assessment'} sessionId={draft.id} kind="assessment" existing={sections.find(s=>s.section_key==='assessment')} followup={draft.session_type==='follow_up'} onSaved={reload} registerFlusher={registerFlusher} onDirtyChange={onDirtyChange}/>}<button type="button" className="visit-text-button" onClick={()=>void flushAll(true).then(()=>setNarrativeMode(v=>({...v,assessment:!v.assessment}))).catch(()=>{})}>{narrativeMode.assessment?t('clinical.structuredAssessment'):t('clinical.freeTextAssessment')}</button></VisitPart>;
 return sharedDraft(<section className="session-workspace runtime-session">
  {draft.session_type==='follow_up'&&<button type="button" onClick={()=>void flushAll(true).then(()=>setDetailed(false)).catch(()=>{})}>{t('visits.compactRecord')}</button>}
  <div className="session-work-head">
   <div><h2>{draft.session_type==='initial_assessment'?t('visits.initialAssessment'):t('visits.followup')}</h2><p>{fmt(draft.started_at)}</p></div>
   <div className="session-save-overview"><span className={dirtyCount?'pending':''}>{flushing?t('visits.savingDraft'):dirtyCount?dirtyCount+t('visits.pendingChangesSuffix'):t('visits.draftSaved')}</span><small>{t('visits.startedPrefix')} {fmt(draft.started_at)}</small></div>
  </div>

  {draft.session_type==='follow_up'&&<FollowupField field="transcript" title={t('visits.visitNotes')} rows={4}/>}
  <nav className="visit-scroll-nav" aria-label={t('accessibility.visitNavigation')}>{visitSteps[draft.session_type==='initial_assessment'?'initial_assessment':'follow_up'].map(([key])=>{const isRequired=requiredVisitStep(key),complete=isRequired&&requiredStepState(key);return <button type="button" key={key} aria-current={activePart===key?'step':undefined} className={[activePart===key?'active':'',isRequired?'required':'',complete?'complete':''].filter(Boolean).join(' ')} onClick={()=>goToPart(key)}><i/>{complete&&<Check size={12} aria-hidden="true"/>}<span>{stepLabels[draft.session_type==='follow_up'?(key==='interview'?'symptoms':key==='mse'?'mseChanges':key==='plan'?'review':key):key]}{isRequired&&!complete&&<sup aria-label={t('common.required')}>*</sup>}</span></button>})}</nav>
  <fieldset ref={documentRef} disabled={flushing||finalizing||finishingLater} className={draft.session_type==='initial_assessment'?'visit-document first-assessment':'visit-document'}>
   <VisitPart anchor="interview" number="01" title={draft.session_type==='follow_up'?t('clinical.symptomsCourse'):t('clinical.presentingComplaintCurrentState')}>{editor('interview',draft.session_type==='follow_up'?t('clinical.symptomsCourse'):t('clinical.presentingComplaintCurrentState'),4)}<details className="visit-related-detail"><summary>{t('clinical.dailyLifeImpact')}{sections.find(s=>s.section_key==='functioning')?.content.trim()?t('clinical.recordExistsSuffix'):''}</summary>{editor('functioning',t('clinical.functioning'))}</details>{draft.session_type==='initial_assessment'&&bundle.patient.chief_complaint?.trim()&&<details className="visit-additional"><summary>{t('clinical.originalPresentingComplaint')}</summary><p style={{whiteSpace:'pre-wrap'}}>{bundle.patient.chief_complaint}</p></details>}</VisitPart>
   <VisitPart anchor="mse" number="02" title={draft.session_type==='follow_up'?t('clinical.mseChanges'):t('clinical.mentalStatusExamination')}>
    {draft.session_type==='follow_up'&&<details className="visit-additional mse-reference"><summary>{t('clinical.previousMseFull')}</summary>{mseReference?<><small>{fmt(sessionClinicalTime(bundle,mseReference.session))}  {t('clinical.historicalEntrySuffix')}</small><p style={{whiteSpace:'pre-wrap'}}>{mseReference.section.content}</p>{mseReference.addenda.map(a=><div key={a.id}><strong>{a.kind==='correction'?t('clinical.correction'):t('common.add')} · {fmt(a.created_at)}</strong><p>{a.reason}</p><p style={{whiteSpace:'pre-wrap'}}>{a.content}</p></div>)}</>:<p>{contextReady?t('clinical.noPreviousMse'):t('clinical.loadingPreviousMse')}</p>}<p className="visit-hint">{t('clinical.mseHistoricalHelp')}</p></details>}
    {<StructuredVisitEditor key={draft.id+':mse'} sessionId={draft.id} kind="mse" existing={sections.find(s=>s.section_key==='mse')} followup={draft.session_type==='follow_up'} timeline={timeline} baseline={draft.session_type==='follow_up'?mseReference?.section:null} onSaved={reload} registerFlusher={registerFlusher} onDirtyChange={onDirtyChange}/>}
   </VisitPart>
   <VisitPart anchor="risk" number="03" title={t('clinical.riskAssessment')}><RiskEditor key={draft.id} sessionId={draft.id} existing={risk} onSaved={reload} registerFlusher={registerFlusher} onDirtyChange={onDirtyChange}/></VisitPart>
   {draft.session_type==='initial_assessment'&&<VisitPart anchor="history" number="04" title={t('history.title')}>{contextReady?<VisitHistory bundle={bundle} sessionId={draft.id} reload={reloadContext} registerFlusher={registerFlusher} onDirtyChange={onDirtyChange}/>:<p role="status">{t('history.loadingContinue')}</p>}</VisitPart>}
   {draft.session_type==='follow_up'&&<VisitPart anchor="psychometrics" number="05" title={t('psychometrics.previousVisitComparison')}>{contextReady?<VisitScores bundle={bundle} sessionId={draft.id} reload={reloadContext}/>:<p role="status">{t('psychometrics.loading')}</p>}</VisitPart>}
   {draft.session_type==='initial_assessment'&&assessment()}
   <VisitPart anchor="medication" number="06" title={draft.session_type==='initial_assessment'?t('medications.medication'):t('medications.reviewTitle')}>{contextReady?<><p className="visit-hint">{t('medications.savedUpdateHelp')}</p><MedicationTable bundle={bundle} sessionId={draft.id} reload={reloadContext} editablePlan editableEffects firstAssessment={draft.session_type==='initial_assessment'} registerFlusher={registerFlusher} onDirtyChange={onDirtyChange}/>{draft.session_type==='initial_assessment'?<>{['adherence','effects'].filter(key=>sections.find(s=>s.section_key===key)?.content.trim()).map(key=><details key={key} className="visit-additional"><summary>{key==='adherence'?t('medications.previousAdherence'):t('medications.previousTolerability')}</summary><p style={{whiteSpace:'pre-wrap'}}>{sections.find(s=>s.section_key===key)?.content}</p></details>)}</>:<div className="visit-related-fields" data-visit-part="adherence">{editor('adherence',t('medications.adherence'))}{editor('effects',t('medications.overallTolerability'))}</div>}</>:<p role="status">{t('medications.loading')}</p>}</VisitPart>
   {draft.session_type==='follow_up'&&assessment()}
   <VisitPart anchor="plan" number={draft.session_type==='follow_up'?'08':'07'} title={draft.session_type==='initial_assessment'?t('clinical.planAndReview'):t('clinical.decisionsAndReview')}>{draft.session_type==='initial_assessment'?<><SectionEditor key={draft.id+':plan'} sessionId={draft.id} definition={{key:'plan',title:t('clinical.planAndReview')}} placeholder={t('clinical.planPlaceholder')} existing={sections.find(s=>s.section_key==='plan')} proposals={bundle.proposals.filter(p=>p.session_id===draft.id&&p.section_key==='plan')} onSaved={reload} registerFlusher={registerFlusher} onDirtyChange={onDirtyChange}/>{sections.find(s=>s.section_key==='review')?.content.trim()&&<details className="visit-additional"><summary>{t('clinical.previousReviewNote')}</summary><p style={{whiteSpace:'pre-wrap'}}>{sections.find(s=>s.section_key==='review')?.content}</p></details>}</>:<div className="visit-related-fields">{editor('plan',t('clinical.decisionsInterventions'))}{editor('review',t('clinical.reviewWhatWhen'))}</div>}</VisitPart>
   {contextReady&&<VisitPart anchor="appointment" number="09" title={t('calendar.nextAppointment')}><VisitNextAppointment bundle={bundle} sessionId={draft.id} reload={reloadContext} registerFlusher={registerFlusher} onDirtyChange={onDirtyChange} showHeading={false}/></VisitPart>}
   {draft.session_type==='follow_up'&&contextReady&&<details className="visit-additional"><summary>{t('history.completeLongitudinal')}</summary><VisitHistory bundle={bundle} sessionId={draft.id} reload={reloadContext} registerFlusher={registerFlusher} onDirtyChange={onDirtyChange}/></details>}
  </fieldset>

  <p className="visit-hint">{t('visits.autosaveFinalizeHelp')}</p>
  {draft.session_type==='follow_up'&&<FollowupRecovery disabled={flushing||finalizing||finishingLater}/> }
  <div className="finalize-bar">
   <button onClick={()=>void finalizeSafely()} aria-describedby={showFinalizeGuidance&&blocker?'visit-finalize-guidance':undefined} disabled={finalizing||flushing||finishingLater}><Check size={16}/>{flushing?t('visits.savingDraft'):finalizing?t('visits.finalizing'):t('visits.finalize')}</button>{onFinishLater&&<button type="button" className="finalize-later" disabled={finalizing||flushing||finishingLater} onClick={()=>void finishLater()}>{finishingLater?t('visits.savingDraft'):t('visits.finishLater')}</button>}
   {showFinalizeGuidance&&blocker&&<span id="visit-finalize-guidance" className="visit-finalize-guidance" role="status">{systemMessage(blocker.message)} <button type="button" onClick={()=>goToPart(blocker.anchor)}>{t('common.goTo')}</button></span>}
  </div>

  {flushError&&<div className="save-state error" role="alert"><strong>{t('visits.unsavedChanges')}</strong> {systemMessage(flushError)} <span>{t('visits.resolveBeforeFinalize')}</span></div>}
  {refreshError&&<div className="save-state" role="status">{systemMessage(refreshError)}</div>}
  {finalizeError&&<div className="save-state error" role="alert">{systemMessage(finalizeError)}</div>}

  {completed.length>0&&<div className="previous-visits"><span className="kicker">{t('visits.previousKicker')}</span><CompletedList sessions={completed} onSelect={id=>void flushAll().then(()=>onSelectSession(id)).catch(()=>{})}/></div>}
 </section>);
}

function CompletedList({sessions,onSelect}:{sessions:DemoSession[];onSelect:(id:string)=>void}){
const t=useTranslations();

 const locale=useLocale();
 const fmt=(value?:string|null)=>value?formatClinicDateTime(value,locale):'—';

 

 return <div className="completed-session-list">{sessions.map(session=><button className="completed-session-row" key={session.id} onClick={()=>onSelect(session.id)}><CheckCircle2 size={18}/><div><strong>{session.session_type==='initial_assessment'?t('visits.initialAssessment'):t('visits.followupSession')}</strong><span>{t('visits.finalizedPrefix')} {fmt(session.completed_at)}</span></div><span className="open-session-label">{t('common.open')}</span></button>)}</div>;
}

function CompletedSessionView({session,bundle,onBack,reload,registerFlusher,onDirtyChange}:{session:DemoSession;bundle:PatientBundle;onBack:()=>void;reload:()=>Promise<unknown>;registerFlusher:RegisterFlusher;onDirtyChange:DirtyChange}){
const t=useTranslations();

 const locale=useLocale();
 const fmt=(value?:string|null)=>value?formatClinicDateTime(value,locale):'—';

 

 return <>{session.continuity?.approved_at&&<section className="visit-part"><header><h3>{t('clinical.confirmedMemory')}</h3></header><p style={{whiteSpace:'pre-wrap'}}>{session.continuity.clinical_state_summary}</p><p><strong>{t('clinical.treatmentDecisionPrefix')}</strong> {session.continuity.treatment_decision}</p><p><strong>{t('clinical.nextReviewPrefix')}</strong> {session.continuity.next_review_focus}</p><p><strong>{t('medications.adherencePrefix')}</strong> {session.continuity.adherence}</p>{session.continuity.pinned_context&&<p>📌 {session.continuity.pinned_context}</p>}<p className="visit-hint">{t('clinical.confirmedPrefix')} {fmt(session.continuity.approved_at)} · {session.continuity.source==='ai_assisted'?t('clinical.aiReviewedByClinician'):t('clinical.manualEntry')}</p><details><summary>{t('clinical.originalClinicianText')}</summary><p style={{whiteSpace:'pre-wrap'}}>{session.continuity.transcript||t('clinical.noSeparateOriginal')}</p></details></section>}<CompletedRecordEditor key={session.id} session={session} bundle={bundle} reload={reload} onBack={onBack} registerFlusher={registerFlusher} onDirtyChange={onDirtyChange}/></>;
}

function VisitPart({number:_,title,children,anchor}:{number:string;title:string;children:React.ReactNode;anchor?:string}){
 // Single-field interview and structured MSE already own their content surface.
 const ownsSurface=anchor==='interview'||anchor==='mse';
 return <section className="visit-part" data-visit-part={anchor}>
  {anchor!=='interview'&&<header><h3>{title}</h3></header>}
  <div className={ownsSurface?'visit-part-content':'visit-part-surface'}>{children}</div>
 </section>;
}

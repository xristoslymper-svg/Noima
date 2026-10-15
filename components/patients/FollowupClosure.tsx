'use client';
import {useLocale} from 'next-intl';

import {useTranslations} from 'next-intl';

import {useEffect,useRef,useState} from 'react';
import {CalendarDays,ChevronRight,Pencil} from 'lucide-react';
import type {DemoSession,PatientBundle} from '@/lib/patients/demo-runtime';
import type {ContinuityDraft} from '@/lib/clinical/continuity';
import {followupFinalizationVersion,focusFollowupBlocker} from '@/lib/clinical/followup-finalization';
import ClinicalDraftRecovery from './ClinicalDraftRecovery';
import {mseTimeline,previousMseReference} from '@/lib/clinical/visit-workspace-state';
import {useFollowupDraft,FollowupField} from './FollowupDraft';
import RiskEditor from './RiskTreeEditor';
import StructuredVisitEditor from './StructuredVisitEditor';
import {MedicationModal} from './PatientPanels';
import VisitScores from './VisitScores';
import VisitNextAppointment from './VisitNextAppointment';
import {formatClinicDate,formatClinicDateTime} from '@/lib/clinic-time';
import {continuityContexts} from '@/lib/clinical/continuity-context';
import {readMedicationResponse,updateMedicationResponse,type MedicationResponse} from '@/lib/clinical/medication-response-note';
import MobileFollowupTools from '@/components/mobile/MobileFollowupTools';
import StableDetails from './StableDetails';
import {mobileV2Enabled} from '@/components/mobile/mobile-v2';
import mobileStyles from '@/components/mobile/MobileClinical.module.css';
import styles from './FollowupClosure.module.css';

type Props={bundle:PatientBundle;session:DemoSession;reload:()=>Promise<unknown>;reloadContext:()=>Promise<unknown>;contextReady:boolean;registerFlusher:(key:string,f:()=>Promise<void>)=>(()=>void);onDirtyChange:(key:string,dirty:boolean)=>void;flushAll:(requireRefresh?:boolean)=>Promise<unknown>;onDetailed:()=>void;onFinalize:(version:number)=>Promise<void>;onFinishLater?:()=>Promise<void>;finalizing:boolean;finalizeError:string};
export default function FollowupClosure(p:Props){
const t=useTranslations();

 const locale=useLocale();

 

 const {bundle,session,registerFlusher,onDirtyChange}=p;
 const {draft,checkConsistency}=useFollowupDraft();
 const [error,setError]=useState(''),[busy,setBusy]=useState(false);
 const [writing,setWriting]=useState<Record<string,boolean>>({});
 const currentDraft=useRef(draft);currentDraft.current=draft;
 const flight=useRef(false);
 const [med,setMed]=useState<{mode:'start'|'change'|'stop'|'side_effect';id?:string}|null>(null);
 useEffect(()=>registerFlusher('closure-medication',async()=>{if(med)throw new Error(t('validation.completeMedicationFirst'))}),[registerFlusher,med]);
 function change(key:keyof ContinuityDraft,value:string){const latest=currentDraft.current;latest.change({...latest.currentValue(),[key]:value})}
 function selectMedicationResponse(medication:PatientBundle['medications'][number],response:MedicationResponse){
  const value=currentDraft.current.currentValue();
  const selected=readMedicationResponse(value.clinical_state_summary,medication);
  const updated=updateMedicationResponse(value.clinical_state_summary,medication,selected===response?null:response);
  if(updated.length>20000){setError(t('validation.clinicalStateLength'));return}
  setError('');
  change('clinical_state_summary',updated);
 }
 function writingField(key:'transcript'|'clinical_state_summary'|'treatment_decision'|'next_review_focus'|'adherence'|'pinned_context',title:string,placeholder='',rows=2){return <FollowupField field={key} title={title} placeholder={placeholder} rows={rows} onPendingChange={pending=>setWriting(v=>v[key]===pending?v:{...v,[key]:pending})}/>}
 async function finalize(){if(flight.current)return;flight.current=true;setBusy(true);setError('');try{const fresh=await p.flushAll(true) as PatientBundle;checkConsistency(fresh);await p.onFinalize(followupFinalizationVersion(fresh,session.id))}catch(e){setError(e instanceof Error?e.message:t('errors.visitCompletion'));focusFollowupBlocker(e,session.id)}finally{flight.current=false;setBusy(false)}}
 const risk=bundle.risks.find(r=>r.session_id===session.id);
 const mse=bundle.sections.find(s=>s.session_id===session.id&&s.section_key==='mse');
 const reference=previousMseReference(bundle,session.id,session.started_at);
 const contextItems=continuityContexts(bundle).filter(i=>i.status==='active');
 const activeMedications=bundle.medications.filter(m=>m.status==='active');
 const medicationChanges=bundle.medicationEvents.filter(e=>e.session_id===session.id&&e.event_type==='changed'&&!(bundle.medicationRevisions||[]).some(r=>r.event_id===e.id));
 const timeline=p.contextReady?mseTimeline(bundle,session.id,session.started_at):undefined;
 return <section className={styles.closure+(mobileV2Enabled?` ${mobileStyles.followup}`:``)} data-clinical-followup="true">
  <header className={styles.heading}><div><span className="kicker">{t('visits.followupKicker')}</span><h2>{t('visits.todaysRecord')}</h2><p className={styles.cardMeta}>{formatClinicDateTime(session.started_at, locale)}  {t('visits.draftSuffix')}</p></div><button type="button" onClick={p.onDetailed} disabled={busy}>{t('visits.detailedRecord')} <ChevronRight size={15} aria-hidden="true"/></button></header>
  <MobileFollowupTools/><section className={styles.card} data-mobile-section="notes" tabIndex={mobileV2Enabled?-1:undefined} aria-label={t('visits.visitNotes')}>
   {writingField('transcript',t('visits.visitNotes'),t('clinical.patientReportPlaceholder'),4)}
  </section>
  <section className={styles.card} data-followup-clinical-group="true" data-mobile-section="clinical" tabIndex={mobileV2Enabled?-1:undefined}>
   <div className={styles.cardHeading}><h3>{t('clinical.clinicalEntry')}</h3></div>
   <div className={styles.fields+" visit-part-surface"}>
    <div>{writingField('clinical_state_summary',t('clinical.currentState'),t('clinical.statePlaceholder'))}</div>
    <div className={styles.planGroup} data-followup-plan-group="true">
     <h4>{t('clinical.treatmentDecisionReview')}</h4>
     <div className={styles.planFields}>
      <div>{writingField('treatment_decision',t('clinical.decisionInterventions'),t('clinical.decisionPlaceholder'))}</div>
      <div>{writingField('next_review_focus',t('clinical.reviewFocus'),t('clinical.reviewFocusPlaceholder'))}</div>
     </div>
    </div>
   </div>
  </section>
  <section className={styles.card} data-followup-medication-group="true" data-mobile-section="medication" tabIndex={mobileV2Enabled?-1:undefined}>
   <h3>{t('medications.current')}</h3>
   <div className="visit-part-surface">
    {medicationChanges.map(e=><p key={e.id}>{t('medications.changePrefix')} {String(e.new_state?.medication_name||t('medications.medication'))} · {String(e.previous_state?.dose??'—')} {String(e.previous_state?.unit||'')} → {String(e.new_state?.dose??'—')} {String(e.new_state?.unit||'')}  {t('medications.effectiveFromSuffix')} {formatClinicDate(e.effective_on, locale)}</p>)}
    {p.contextReady?<div className="clinical-table-wrap medication-table-editor"><table className="clinical-lean-table medication-lean-table"><caption className="sr-only">{t('medications.medication')}</caption><thead><tr><th>{t('medications.drug')}</th><th>{t('medications.dose')}</th><th>{t('medications.frequency')}</th><th>{t('medications.period')}</th><th>{t('common.status')}</th><th>{t('medications.response')}</th><th>{t('medications.sideEffects')}</th><th>{t('common.actions')}</th></tr></thead><tbody>{activeMedications.map(m=>{
     const selectedResponse=readMedicationResponse(draft.value.clinical_state_summary,m);
     const hasRecordedSideEffect=bundle.medicationSideEffects.some(e=>e.medication_id===m.id&&e.session_id===session.id);
     return <tr key={m.id} data-medication-response={m.id}>
      <th scope="row">{m.medication_name}</th><td><span className="med-dose-display">{m.dose}<b>{m.unit}</b></span></td><td>{m.frequency}</td><td>{formatClinicDate(m.started_at, locale)}</td><td><span className="med-status active">{t('medications.taking')}</span></td>
      <td><div className={styles.responseOptions} role="group" aria-label={t('medications.responseToPrefix')+m.medication_name}>
       <button type="button" aria-pressed={selectedResponse==='good'} disabled={writing.clinical_state_summary||busy||p.finalizing} onClick={()=>selectMedicationResponse(m,'good')}>{t('medications.responseGood')}</button>
       <button type="button" aria-pressed={selectedResponse==='neutral'} disabled={writing.clinical_state_summary||busy||p.finalizing} onClick={()=>selectMedicationResponse(m,'neutral')}>{t('medications.responseNeutral')}</button>
      </div></td>
      <td><div className={styles.tolerabilityOptions} role="group" aria-label={t('medications.tolerabilityPrefix')+m.medication_name}>
       <button type="button" onClick={()=>setMed({mode:'side_effect',id:m.id})}>{t('medications.sideEffect')}</button>
       {hasRecordedSideEffect&&<span className={styles.recordedEffect}>{t('medications.todayEntryExists')}</span>}
      </div></td>
      <td className="med-row-actions"><button type="button" title={t('medications.changeDoseFrequency')} aria-label={t('medications.changeDoseForPrefix')+m.medication_name} onClick={()=>setMed({mode:'change',id:m.id})}><Pencil size={16} aria-hidden="true"/>{t('common.modify')}</button></td>
     </tr>;
    })}
    <tr><td colSpan={8}><button type="button" className="med-add-row" onClick={()=>setMed({mode:'start'})}>{t('medications.addMedication')}</button></td></tr></tbody></table></div>:<p role="status">{t('medications.loading')}</p>}
    {writingField('adherence',t('medications.adherence'),t('medications.adherencePlaceholder'))}
   </div>
  </section>
  <StableDetails key={session.id+':mse'} data-mobile-section='mse' tabIndex={mobileV2Enabled?-1:undefined} className={styles.details} initialOpen={!mse?.content.trim()}><summary>MSE · {mse?.content.trim()?t('clinical.recordedReview'):t('clinical.reviewTodayRequired')}</summary><div className="visit-part-content">{p.contextReady?<StructuredVisitEditor sessionId={session.id} kind="mse" compact existing={mse} followup baseline={reference?.section} timeline={timeline} onSaved={p.reload} registerFlusher={registerFlusher} onDirtyChange={onDirtyChange}/>:<p>{t('clinical.loadingPreviousMse')}</p>}</div></StableDetails>
  <StableDetails key={session.id+':risk'} data-mobile-section='risk' tabIndex={mobileV2Enabled?-1:undefined} className={styles.details} initialOpen={!risk||risk.suicidal_ideation==='not_assessed'||risk.suicidal_ideation==='positive'}><summary>{t('clinical.riskPrefix')} {risk&&risk.suicidal_ideation!=='not_assessed'?t('visits.todaysRecord'):t('clinical.assessmentTodayRequired')}</summary><div className="visit-part-surface"><RiskEditor sessionId={session.id} existing={risk} onSaved={p.reload} registerFlusher={registerFlusher} onDirtyChange={onDirtyChange}/></div></StableDetails>
  <details className={styles.details} data-mobile-section="measures" tabIndex={mobileV2Enabled?-1:undefined}><summary>{t('psychometrics.measures')}</summary><div className="visit-part-surface">{p.contextReady&&<VisitScores bundle={bundle} sessionId={session.id} reload={p.reloadContext}/>}</div></details>
  {(contextItems.length>0||draft.value.pinned_context.trim())&&<details className={styles.details}>
   <summary>{t('clinical.previousKeyIssues')}{contextItems.length?' · '+contextItems.length:''}</summary>
   <div className="visit-part-surface">
    {contextItems.map(item=><p className={styles.contextItem} key={item.id}>{item.content}</p>)}
    {draft.value.pinned_context.trim()&&<p className={styles.contextItem}><strong>{t('visits.existingDraftNotePrefix')}</strong> {draft.value.pinned_context}</p>}
   </div>
  </details>}
  {p.contextReady&&<section className={styles.appointmentCard} aria-label={t('calendar.nextAppointment')} data-mobile-section="appointment" tabIndex={mobileV2Enabled?-1:undefined}><div className={styles.appointmentHeading}><CalendarDays size={21} aria-hidden="true"/><h3>{t('calendar.nextAppointment')}</h3></div><div className="visit-part-surface"><VisitNextAppointment bundle={bundle} sessionId={session.id} reload={p.reloadContext} registerFlusher={registerFlusher} onDirtyChange={onDirtyChange}/></div></section>}
  <p role="status">{draft.saving?t('visits.savingDraftAlternative'):draft.error||(draft.savedAt?t('visits.draftSavedPrefix')+draft.savedAt:'')}</p>
  <ClinicalDraftRecovery draft={draft} reload={p.reload} sessionId={session.id} patientId={bundle.patient.id} disabled={Object.values(writing).some(Boolean)||busy||p.finalizing}/>
  {(error||p.finalizeError)&&<p role="alert">{error||p.finalizeError}</p>}
  <div className={styles.footerActions}><button type="button" className={styles.actionPrimary} disabled={busy||p.finalizing||Boolean(med)||!p.contextReady} onClick={()=>void finalize()}>{busy||p.finalizing?t('visits.finalizing'):t('visits.finalize')}</button>{p.onFinishLater&&<button type="button" disabled={busy||p.finalizing||Boolean(med)} onClick={()=>void p.onFinishLater?.()}>{t('visits.finishLater')}</button>}</div>
  {med&&<MedicationModal bundle={bundle} sessionId={session.id} initialMode={med.mode} initialMedicationId={med.id} onClose={()=>setMed(null)} onSaved={async()=>{await p.reloadContext();setMed(null)}}/>}
 </section>;
}

'use client';
import {useUiText} from '@/i18n/use-ui-text';
import {useLocale,useTranslations} from 'next-intl';
import {useOptionLabel} from '@/i18n/option-labels';
import PatientVisualIcon from './PatientVisualIcon';
import {useEffect,useRef,useState,type MutableRefObject} from 'react';
import type {PatientBundle} from '@/lib/patients/demo-runtime';
import {treatmentPlan} from '@/lib/clinical/treatment-plan';
import {assessmentLink,assessmentLinkLabel} from '@/lib/clinical/assessment-link';
import {MedicationsPanel} from './PatientPanels';
import MedicationSaveScope from './MedicationSaveScope';
import PatientPsychometrics from './PatientPsychometrics';
import {recordDate} from './PatientRecordSummary';
import styles from './PatientRecord.module.css';
import layout from './PatientTreatment.module.css';

export default function PatientTreatment({bundle,reload,beforeNavigate,measurementsOpen,selectedAssessmentId,onVisit}:{bundle:PatientBundle;reload:()=>Promise<unknown>;beforeNavigate:MutableRefObject<(()=>Promise<void>)|null>;measurementsOpen:boolean;selectedAssessmentId:string|null;onVisit:(id:string)=>void}){
 const ui=useUiText();

 const t=useTranslations();
 const locale=useLocale();

 const {record,notes,scores,drafts}=treatmentPlan(bundle);
 const [expanded,setExpanded]=useState(measurementsOpen),[focusedAssessment,setFocusedAssessment]=useState<string|null>(null);
 const measurementsRef=useRef<HTMLDetailsElement>(null);
 useEffect(()=>{setExpanded(measurementsOpen)},[measurementsOpen,selectedAssessmentId]);
 useEffect(()=>{if(measurementsOpen&&!selectedAssessmentId)measurementsRef.current?.scrollIntoView({block:'start'})},[measurementsOpen,selectedAssessmentId]);
 return <div className={styles.record}>
  <section className={styles.section} aria-label={t('current.m037')}>
   <span className="kicker">{t('current.m036')}</span><h2><PatientVisualIcon name="plan"/>{t('current.m037')}</h2>
   {notes?<><div className={layout.planGrid}><div><h3>{t('current.m038')}</h3><p className={layout.narrative}>{notes.plan||t('polish.m048')}</p></div><div><h3>{t('clinical.nextReview')}</h3><p className={layout.narrative}>{notes.review||t('polish.m049')}</p></div></div><p className={styles.muted}>{t('polish.m050')} {recordDate(notes.date,locale)}{notes.corrected?ui(' · με καταγεγραμμένες διορθώσεις'):''} · <button type="button" className={styles.link} onClick={()=>onVisit(notes.sessionId)}>{t('current.m039')}</button></p></>:<p className={styles.muted}>{t('current.m040')}</p>}
   {drafts.length>0&&<p className={styles.muted}>{t('current.m041')}</p>}
  </section>
  <MedicationSaveScope bundle={bundle}><MedicationsPanel bundle={bundle} reload={reload} beforeNavigate={beforeNavigate} currentOnly onVisit={onVisit}/></MedicationSaveScope>
  <section className={styles.section}><span className="kicker">{t('medications.tolerabilityKicker')}</span><h2><PatientVisualIcon name="risk"/>{t('medications.activeSideEffects')}</h2>{record.activeEffects.length?<ul className={styles.list}>{record.activeEffects.map(effect=><li key={effect.id}><strong>{effect.effect_text}</strong> · {bundle.medications.find(m=>m.id===effect.medication_id)?.medication_name||t('medications.medication')}<p>{({mild:t('clinical.mild'),moderate:t('clinical.moderate'),severe:t('clinical.severe')} as const)[effect.severity]}{effect.impact?' · '+effect.impact:''}</p><p className={styles.muted}>{t('medications.sincePrefix')} {recordDate(effect.noted_on,locale)} · {effect.resolved_on?t('medications.recordedEnd',{date:recordDate(effect.resolved_on,locale)}):t('medications.noRecordedEnd')}{effect.session_id&&bundle.sessions.some(s=>s.id===effect.session_id)&&<> · <button type="button" className={styles.link} onClick={()=>onVisit(effect.session_id!)}>{t('current.m042')}</button></>}</p></li>)}</ul>:<p className={styles.muted}>{t('medications.noOpenSideEffectsHelp')}</p>}</section>
  {notes&&(notes.adherence||notes.effects)&&<section className={styles.section}><span className="kicker">{t('medications.visitReviewKicker')}</span>{notes.adherence&&<p><strong>{t('medications.adherencePrefix')}</strong> {notes.adherence}</p>}{notes.effects&&<p><strong>{t('medications.overallTolerabilityPrefix')}</strong> {notes.effects}</p>}<p className={styles.muted}>{t('polish.m051')} {recordDate(notes.date,locale)}</p></section>}
  <section className={styles.section}><div className={layout.actionRow}><div><span className="kicker">{t('psychometrics.monitoringKicker')}</span><h2><PatientVisualIcon name="measures"/>{t('psychometrics.measuresProgress')}</h2></div><button type="button" className={styles.link} onClick={()=>{setExpanded(true);requestAnimationFrame(()=>measurementsRef.current?.scrollIntoView({block:'start'}))}}>{t('current.m043')}</button></div>
   {scores.length?scores.map(({current,previous})=>{const source=assessmentLink(bundle,current);return <div key={current.id} className={layout.scoreRow}><div><strong>{current.instrument}: {previous?`${previous.score} → ${current.score}`:current.score}</strong><p className={styles.muted}>{previous?`${recordDate(previous.completed_at!,locale)} → `:''}{recordDate(current.completed_at!,locale)} · {assessmentLinkLabel(bundle,current)}</p></div><div className={layout.scoreActions}><button type="button" className={styles.link} onClick={()=>{setFocusedAssessment(current.id);setExpanded(true);requestAnimationFrame(()=>{measurementsRef.current?.querySelector<HTMLElement>('[data-assessment-id="'+current.id+'"]')?.scrollIntoView({block:'center'})})}}>{t('psychometrics.scoresAnswers')}</button>{source.session&&<button type="button" className={styles.link} onClick={()=>onVisit(source.session!.id)}>{t('current.m042')}</button>}</div></div>}):<p className={styles.muted}>{t('psychometrics.noCompletedMeasures')} {t('polish.m052')}</p>}
   <details ref={measurementsRef} key={measurementsOpen?'requested-'+(selectedAssessmentId||'all'):'default'} open={expanded||undefined} onToggle={e=>setExpanded(e.currentTarget.open)} className={styles.details} id="patient-measurements"><summary>{t('psychometrics.resultsAnswers')}</summary><PatientPsychometrics bundle={bundle} reload={reload} selectedAssessmentId={selectedAssessmentId||focusedAssessment||undefined}/></details>
  </section>
 </div>;
}

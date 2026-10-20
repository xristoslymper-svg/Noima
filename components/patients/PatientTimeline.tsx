'use client';
import {recordEventText} from '@/i18n/static-text';
import {useUiText} from '@/i18n/use-ui-text';
import {useLocale,useTranslations} from 'next-intl';
import {useOptionLabel} from '@/i18n/option-labels';
import PatientVisualIcon from './PatientVisualIcon';
import type {MutableRefObject} from 'react';
import PriorCourseSection from './PriorCourseSection';
import {useEffect,useRef,useState,type ReactNode} from 'react';
import type {PatientBundle} from '@/lib/patients/demo-runtime';
import {patientTimeline} from '@/lib/clinical/patient-record';
import {recordDate} from './PatientRecordSummary';
import styles from './PatientRecord.module.css';
import journeyStyles from './PatientJourney.module.css';

export default function PatientTimeline({bundle,selectedSessionId,onVisit,onMeasurements,onTreatment,viewer,beforeNavigate,priorCourseEnabled=false,onPriorCourseSettled,readOnly=false}:{readOnly?:boolean;beforeNavigate?:MutableRefObject<(()=>Promise<void>)|null>;priorCourseEnabled?:boolean;onPriorCourseSettled?:(warning:string)=>void;bundle:PatientBundle;selectedSessionId:string|null;onVisit:(id:string|null)=>void;onMeasurements:(id?:string)=>void;onTreatment:()=>void;viewer:ReactNode}){
 const ui=useUiText();

 const t=useTranslations();
 const locale=useLocale();

 const [filter,setFilter]=useState<'all'|'treatment'|'measurements'>('all');
 const viewerRef=useRef<HTMLDivElement>(null);
 useEffect(()=>{if(selectedSessionId)viewerRef.current?.scrollIntoView({block:'start'})},[selectedSessionId]);
 const {visits,context,unlinked}=patientTimeline(bundle);
 const events=visits.filter(e=>filter==='all'||(filter==='treatment'?context.get(e.sessionId!)!.treatment.length:context.get(e.sessionId!)!.measurements.length));
 const independent=unlinked;
 const emptyMessage=!visits.length?'Δεν έχουν καταγραφεί επισκέψεις ακόμη.':filter==='treatment'?'Δεν υπάρχουν επισκέψεις με συνδεδεμένες αλλαγές αγωγής ή παρενέργειες.':'Δεν υπάρχουν επισκέψεις με συνδεδεμένες ολοκληρωμένες μετρήσεις.';
 return <section className={styles.record+' '+journeyStyles.timeline}><span className="kicker">{t('patients.longitudinalKicker')}</span><h2><PatientVisualIcon name="timeline"/>{t('visits.title')}</h2>
  {priorCourseEnabled&&<PriorCourseSection key={bundle.patient.id} patientId={bundle.patient.id} beforeNavigate={beforeNavigate} onSettled={onPriorCourseSettled}/>}
  <div className={styles.filters} aria-label={t('accessibility.timelineFilters')}>{([['all',t('current.m056')],['treatment',t('polish.m044')],['measurements',t('polish.m045')]] as const).map(([key,label])=><button key={key} aria-pressed={filter===key} onClick={()=>setFilter(key)}>{label}</button>)}</div>
  {events.length?<ol className={styles.list} aria-label={t('current.m059')}>{events.map(event=>{
   const linked=context.get(event.sessionId!)!;
   return <li key={event.id} data-visit-row="true" data-session-id={event.sessionId} className={styles.item+' '+styles.visit+' '+styles.enrichedVisit}>
    <time dateTime={event.date}>{recordDate(event.date,locale)}</time>
    <div><strong>{recordEventText(event,ui).title}{event.draft?t('polish.m046'):''}</strong><p className={styles.muted}>{recordEventText(event,ui).detail}</p><button disabled={readOnly} className={styles.link} onClick={()=>onVisit(event.sessionId!)}>{event.draft?t('visits.continueRecord'):t('visits.openRecord')}</button></div>
    <div className={styles.visitContext} data-visit-context="true" aria-label={t('current.m060')}>
     {filter!=='measurements'&&!!linked.treatment.length&&<div><span className={styles.contextLabel}>{t('medications.medication')}</span>{linked.treatment.map(change=><button key={change.id} data-treatment-event={change.id} disabled={readOnly} className={styles.contextEntry} onClick={onTreatment}><span>{recordEventText(change,ui).title}{change.scheduled?t('calendar.scheduledSuffix'):''}</span><strong>{change.detail}</strong><small>{t('medications.effectiveFromPrefix')} {recordDate(change.date,locale)}</small></button>)}</div>}
     {filter!=='treatment'&&!!linked.measurements.length&&<div><span className={styles.contextLabel}>{t('psychometrics.measurements')}</span>{linked.measurements.map(({current,previous})=><button key={current.id} data-assessment-id={current.id} disabled={readOnly} className={styles.contextEntry} onClick={()=>onMeasurements(current.id)}><strong>{current.instrument} · {previous?previous.score+' → ':''}{current.score}</strong><small>{recordDate(current.completed_at!,locale)}{previous?t('medications.previousSuffix')+recordDate(previous.completed_at!):''}</small>{current.item9_review&&!current.item9_reviewed_at&&<span>{t('psychometrics.itemNinePendingReview')}</span>}</button>)}</div>}
    </div>
   </li>;
  })}</ol>:<div role="status"><p className={styles.muted}>{ui(emptyMessage)}</p>{visits.length>0&&filter!=='all'&&<button type="button" className={styles.link} onClick={()=>setFilter('all')}>{t('current.m056')}</button>}{independent.length>0&&<p className={styles.muted}>{t('current.m057')}</p>}</div>}
  {!!independent.length&&<details className={styles.details} data-unlinked-events="true"><summary>{t('polish.m047')} {independent.length}</summary><p className={styles.muted}>{t('current.m058')}</p><ol className={styles.list}>{independent.map(event=><li key={event.id} className={styles.item}><time dateTime={event.date}>{recordDate(event.date,locale)}</time><div><strong>{recordEventText(event,ui).title}{event.scheduled?t('calendar.scheduledSuffix'):''}</strong><p className={styles.muted}>{recordEventText(event,ui).detail}</p><button disabled={readOnly} className={styles.link} onClick={event.kind==='measurements'?()=>onMeasurements(event.assessmentId):onTreatment}>{event.kind==='measurements'?t('psychometrics.scoresAnswers'):t('medications.treatmentDetails')}</button></div></li>)}</ol></details>}
  {selectedSessionId&&bundle.sessions.some(s=>s.id===selectedSessionId&&s.status==='completed')&&<div ref={viewerRef} className={styles.viewer} role="region" aria-label={t('visits.completedRecord')}><button disabled={readOnly} className={styles.link} onClick={()=>onVisit(null)}>{t('visits.closeRecord')}</button>{viewer}</div>}
  {selectedSessionId&&!bundle.sessions.some(s=>s.id===selectedSessionId)&&<p role="status">{t('visits.recordUnavailable')}</p>}
 </section>;
}

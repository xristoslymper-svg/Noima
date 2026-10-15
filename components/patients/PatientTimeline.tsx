'use client';
import {useOptionLabel} from '@/i18n/option-labels';
import {useLocale,useTranslations} from 'next-intl';

import {useEffect,useRef,useState,type ReactNode} from 'react';
import type {PatientBundle} from '@/lib/patients/demo-runtime';
import {patientRecord,visitTimelineContext,type RecordEvent} from '@/lib/clinical/patient-record';
import {recordDate} from './PatientRecordSummary';
import styles from './PatientRecord.module.css';

export default function PatientTimeline({bundle,selectedSessionId,onVisit,onMeasurements,onTreatment,viewer}:{bundle:PatientBundle;selectedSessionId:string|null;onVisit:(id:string|null)=>void;onMeasurements:(id?:string)=>void;onTreatment:()=>void;viewer:ReactNode}){
 const t=useTranslations();
 const displayLabel=useOptionLabel();
 const locale=useLocale();

 const [filter,setFilter]=useState<'all'|RecordEvent['kind']>('all');
 const record=patientRecord(bundle,undefined,undefined,displayLabel);
 const viewerRef=useRef<HTMLDivElement>(null);
 useEffect(()=>{if(selectedSessionId)viewerRef.current?.scrollIntoView({block:'start'})},[selectedSessionId]);
 const context=visitTimelineContext(bundle,undefined,displayLabel);
 const grouped=new Set([...context.values()].flatMap(c=>[...c.treatment.map(e=>e.id),...c.measurements.map(m=>'measurement-'+m.current.id)]));
 const events=record.events.filter(e=>filter!=='all'||!grouped.has(e.id)).filter(e=>filter==='all'||e.kind===filter);
 return <section className={styles.record}><span className="kicker">{t('patients.longitudinalKicker')}</span><h2>{t('visits.title')}</h2>
  <div className={styles.filters} aria-label={t('accessibility.timelineFilters')}>{([['all',t('common.all')],['visits',t('visits.title')],['treatment',t('clinical.treatment')],['measurements',t('psychometrics.measurements')]] as const).map(([key,label])=><button key={key} aria-pressed={filter===key} onClick={()=>setFilter(key)}>{label}</button>)}</div>
  {events.length?<ol className={styles.list}>{events.map(event=><li key={event.id} className={`${styles.item} ${event.kind==='visits'?styles.visit:''} ${event.kind==='visits'&&(context.get(event.sessionId!)?.treatment.length||context.get(event.sessionId!)?.measurements.length)?styles.enrichedVisit:''}`}><time dateTime={event.date}>{recordDate(event.date,locale)}</time><div><strong>{event.title}{event.scheduled?t('calendar.scheduledSuffix'):''}</strong><p className={styles.muted}>{event.detail}</p>{event.kind==='visits'?<button className={styles.link} onClick={()=>onVisit(event.sessionId!)}>{t('visits.openRecord')}</button>:<button className={styles.link} onClick={event.kind==='measurements'?()=>onMeasurements(event.assessmentId):onTreatment}>{event.kind==='measurements'?t('psychometrics.scoresAnswers'):t('medications.treatmentDetails')}</button>}</div>{event.kind==='visits'&&(context.get(event.sessionId!)?.treatment.length||context.get(event.sessionId!)?.measurements.length)?<div className={styles.visitContext}>
   {!!context.get(event.sessionId!)!.treatment.length&&<div><span className={styles.contextLabel}>{t('medications.medication')}</span>{context.get(event.sessionId!)!.treatment.map(change=><button key={change.id} className={styles.contextEntry} onClick={onTreatment}><span>{change.title}{change.scheduled?t('calendar.scheduledSuffix'):''}</span><strong>{change.detail}</strong><small>{t('medications.effectiveFromPrefix')} {recordDate(change.date,locale)}</small></button>)}</div>}
   {!!context.get(event.sessionId!)!.measurements.length&&<div><span className={styles.contextLabel}>{t('psychometrics.measurements')}</span>{context.get(event.sessionId!)!.measurements.map(({current,previous})=><button key={current.id} className={styles.contextEntry} onClick={()=>onMeasurements(current.id)}><strong>{current.instrument} · {previous?previous.score+' → ':''}{current.score}</strong><small>{recordDate(current.completed_at!,locale)}{previous?t('medications.previousSuffix')+recordDate(previous.completed_at!,locale):''}</small>{current.item9_review&&!current.item9_reviewed_at&&<span>{t('psychometrics.itemNinePendingReview')}</span>}</button>)}</div>}
  </div>:null}</li>)}</ol>:<p className={styles.muted}>{t('patients.noTimelineMatches')}</p>}
  {selectedSessionId&&record.completed.some(s=>s.id===selectedSessionId)&&<div ref={viewerRef} className={styles.viewer} role="region" aria-label={t('visits.completedRecord')}><button className={styles.link} onClick={()=>onVisit(null)}>{t('visits.closeRecord')}</button>{viewer}</div>}
  {selectedSessionId&&!bundle.sessions.some(s=>s.id===selectedSessionId)&&<p role="status">{t('visits.recordUnavailable')}</p>}
 </section>;
}

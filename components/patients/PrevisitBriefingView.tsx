'use client';
import {useTranslations} from 'next-intl';

import {useLocale} from 'next-intl';

import Link from 'next/link';
import type {ClinicalCard} from '@/lib/clinical/clinical-card';
import {clinicalCardPreview} from '@/lib/clinical/clinical-card';
import type {BriefItem,PrevisitBriefing} from '@/lib/clinical/previsit-briefing';
import {formatClinicDate} from '@/lib/clinic-time';
import styles from './PrevisitBriefing.module.css';

/** Stable reading order; all facts and the compact safety status retain evidence. */
export default function PrevisitBriefingView({card,brief,patientId}:{card:ClinicalCard;brief:PrevisitBriefing;patientId:string}){
 const t=useTranslations();

 const locale=useLocale();

 const date=(value?:string|null)=>value?formatClinicDate(value, locale):'';
 function sources(items:Pick<BriefItem,'source_ids'>[],label=t('clinical.sources')){
  const evidence=[...new Set(items.flatMap(i=>i.source_ids))].map(id=>card.sources.find(s=>s.id===id)).filter(s=>s!==undefined);
  return evidence.length>0&&<details className={styles.sources}><summary>{label}</summary>{evidence.map(s=><Link key={s.id} href={'/patients/demo/'+encodeURIComponent(patientId)+'?tab='+s.target+(s.session_id?'&session='+encodeURIComponent(s.session_id):'')}>{s.label}</Link>)}</details>;
 }
 function row(label:string,items:BriefItem[],empty:string){return <li><strong>{label}:</strong> <span>{items.length?items.map((item,i)=><span className={styles.fact} key={i}>{item.text}{item.date&&item.date!==card.date&&<small>  {t('clinical.recordEntrySuffix')} {date(item.date)}</small>}{i<items.length-1?'; ':''}</span>):<span className={styles.empty}>{empty}</span>}</span>{sources(items)}</li>}
 function paragraphs(items:BriefItem[]){return items.map((item,i)=><p key={i}>{item.text}{item.date&&item.date!==card.date&&<small className={styles.sourceDate}>{t('clinical.recordEntry')} {date(item.date)}</small>}</p>)}
 function reading(title:string,items:BriefItem[],budget:number,detail=t('common.more')){
  if(!items.length)return null;
  const {preview,rest}=clinicalCardPreview(items,budget);
  return <section className={styles.section}><h3>{title}</h3>{paragraphs(preview)}{rest.length>0&&<details className={styles.more}><summary>{detail}</summary>{paragraphs(rest)}</details>}{sources(items)}</section>;
 }
 const ideationLabel={yes:t('common.yes'),no:t('common.no'),unknown:t('common.unknown'),not_assessed:t('clinical.notEvaluated'),missing:t('clinical.notRecorded'),review:t('clinical.toConfirm')}[brief.ideation.value];
 const riskNotes=card.alerts.filter(f=>['risk','risk-note','risk-missing'].includes(f.key));
 const otherAlerts=card.alerts.filter(f=>!['risk','risk-note','risk-missing'].includes(f.key));
 const alertLabel=(key:string,label:string)=>key.startsWith('past-attempt:')?t('clinical.recordedAttemptHistory'):key.startsWith('risk-review:')?t('clinical.riskSourceMismatch'):key.startsWith('review:')?t('psychometrics.phqItemNinePending'):key.startsWith('effect:')?t('medications.sideEffectReviewRequired'):key==='history:allergies'?t('history.recordedAllergies'):label;
 return <article className={styles.brief} aria-label={t('clinical.briefing')} data-previsit-briefing="true">
  <ul className={styles.facts} aria-label={t('clinical.diagnosisDifferentialMedication')}>
   {row(t('clinical.icdDiagnosis'),brief.diagnoses,t('clinical.notRecordedSentence'))}
   {row(t('clinical.differential'),brief.differential,t('clinical.notRecordedSentence'))}
   {row(t('medications.medication'),brief.medications,card.alerts.some(f=>f.key==='medication-refresh')?t('medications.refreshRequired'):t('medications.noActiveMedication'))}
  </ul>
  {reading(t('clinical.recordedDetailsCourse'),brief.narrative,70)}
  {brief.narrativeSynthesized&&<p className={styles.meta}>{t('clinical.aiSourcedDisclaimer')}</p>}
  {reading(t('clinical.keyContinuityIssues'),brief.context,45)}
  {reading(t('history.recordedHistory'),brief.history,40,t('history.moreHistory'))}
  {brief.mse.length>0&&<section className={styles.section} data-brief-mse="true"><h3>{t('clinical.lastRecordedMse')}</h3><p className={styles.meta}>{date(brief.mseDate)}  {t('clinical.historicalMseDisclaimer')}{brief.mseDate!==card.date?t('clinical.notReassessedLastVisit'):'.'}</p>{paragraphs(clinicalCardPreview(brief.mse,55).preview)}{clinicalCardPreview(brief.mse,55).rest.length>0&&<details className={styles.more}><summary>{t('clinical.fullMse')}</summary>{paragraphs(clinicalCardPreview(brief.mse,55).rest)}</details>}{sources(brief.mse)}</section>}
  <section className={styles.safety} data-brief-risk={brief.ideation.value} aria-label={t('clinical.suicidalIdeation')}>
   <p><strong>{t('clinical.suicidalIdeationPrefix')}</strong> <span className={styles.status}>{ideationLabel}</span>{brief.ideation.qualifier&&<span> · {brief.ideation.qualifier}</span>}{brief.ideation.date&&<small> · {date(brief.ideation.date)}</small>}</p>
   <p className={styles.meta}>{brief.ideation.date?t('clinical.lastVisitNotCurrentAssessment'):t('clinical.noCompletedRisk')}</p>
   {brief.safetyFlags.map((f,i)=><p className={styles.safetyFlag} key={i}>{f.text}</p>)}
   {(brief.ideation.source_ids.length>0||riskNotes.length>0)&&<details className={styles.more}><summary>{t('clinical.riskRecordSources')}</summary>{riskNotes.map(f=><p key={f.key}>{f.text}</p>)}{sources([brief.ideation,...riskNotes])}</details>}
  </section>
  {otherAlerts.length>0&&<section className={styles.section} aria-label={t('clinical.attentionPoints')}><h3>{t('clinical.pointsToReview')}</h3>{otherAlerts.map(f=><details className={styles.attention} key={f.key}><summary>{alertLabel(f.key,f.label)}</summary><p>{f.text}</p>{sources([f])}</details>)}</section>}
  {card.notes.some(i=>i.role==='plan')&&<section className={styles.section}><details className={styles.more}><summary>{t('clinical.recordedPlanReview')}</summary>{paragraphs(card.notes.filter(i=>i.role==='plan'))}{sources(card.notes.filter(i=>i.role==='plan'))}</details></section>}
  <p className={styles.meta}>{card.date?t('visits.lastCompletedPrefix')+date(card.date):t('visits.noCompletedVisitSentence')}</p>
 </article>;
}

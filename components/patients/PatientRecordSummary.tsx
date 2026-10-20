'use client';
import {useUiText} from '@/i18n/use-ui-text';
import {recordEventText} from '@/i18n/static-text';
import {intlLocale} from '@/i18n/config';
import type {Locale} from '@/i18n/config';
import {useLocale,useTranslations} from 'next-intl';
import {useOptionLabel} from '@/i18n/option-labels';
import {JourneyOrientation} from './PatientJourney';
import journeyStyles from './PatientJourney.module.css';
import type {PatientBundle} from '@/lib/patients/demo-runtime';
import {riskFindings,riskFindingLabel} from '@/lib/clinical/risk-findings';
import {clinicalDate,patientRecord} from '@/lib/clinical/patient-record';
import {formatClinicDateTime} from '@/lib/clinic-time';
import PatientContext from './PatientContext';
import {assessmentLinkLabel} from '@/lib/clinical/assessment-link';
import ClinicalSummary from './ClinicalSummary';
import PatientReportedHistory from './PatientReportedHistory';
import {mobileV2Enabled} from '@/components/mobile/mobile-v2';
import mobileStyles from '@/components/mobile/MobileClinical.module.css';
import styles from './PatientRecord.module.css';
export function recordDate(value:string,locale:Locale='el'){return value.length===10?new Intl.DateTimeFormat(intlLocale(locale),{day:'2-digit',month:'2-digit',year:'numeric',timeZone:'Europe/Athens'}).format(new Date(value+'T12:00:00Z')):formatClinicDateTime(value,locale)}
export default function PatientRecordSummary({bundle,reload,onVisit,onTimeline,onMeasurements,onTreatment,onHistory}:{bundle:PatientBundle;reload:()=>Promise<unknown>;onVisit:(id?:string)=>void;onTimeline:()=>void;onMeasurements:(id?:string)=>void;onTreatment:()=>void;onHistory:()=>void}){
 const ui=useUiText();
 const t=useTranslations();
 const locale=useLocale();
 const displayLabel=useOptionLabel();

 const record=patientRecord(bundle);
 const hasOpenIssues=Boolean(record.pendingSafety.length||record.activeEffects.length||record.safetyAlerts.length);
 const riskFinding=riskFindings(record.risk).find(f=>!f.previousBranch&&(f.key==='tree:wish'||f.key==='suicidal_ideation'));
 return <div className={styles.record+' '+styles.continuity+(mobileV2Enabled?' '+mobileStyles.summary:'')}>
  {hasOpenIssues&&<section className={styles.section} aria-label={t('clinical.openIssues')}><span className="kicker">{t('clinical.openIssuesKicker')}</span>
   {record.pendingSafety.map(a=><p key={a.id}><strong>{t('psychometrics.phqItemNineReview')}</strong> <button className={styles.link} onClick={()=>onMeasurements(a.id)}>{t('common.open')}</button></p>)}
   {record.activeEffects.map(e=><p key={e.id}><strong>{e.effect_text}</strong> · {bundle.medications.find(m=>m.id===e.medication_id)?.medication_name||t('medications.medication')} <button className={styles.link} onClick={onTreatment}>{t('medications.tolerability')}</button></p>)}
   {record.safetyAlerts.length>0&&<p>{record.safetyAlerts.join(' · ')}  {t('clinical.lastAssessmentSuffix')} <button className={styles.link} onClick={()=>onVisit(record.latestVisit?.id)}>{t('clinical.reviewRisk')}</button></p>}
  </section>}
  <PatientReportedHistory patientId={bundle.patient.id} compact onOpen={onHistory}/>
  <ClinicalSummary bundle={bundle} brief readOnly onSessions={onVisit} onPsychometrics={onMeasurements} onMedications={onTreatment} onHistory={onHistory}/>
  <details className={journeyStyles.details}><summary>{t('current.m049')}</summary>
  <section className={styles.section}><span className="kicker">{t('current.m050')}</span>{record.sinceLatest.length?<ul className={styles.list}>{record.sinceLatest.slice(0,4).map(event=><li key={event.id}><span className={styles.muted}>{recordDate(event.date,locale)}</span> · <strong>{recordEventText(event,ui).title}</strong> · {recordEventText(event,ui).detail}{event.assessmentId&&<> <button className={styles.link} onClick={()=>onMeasurements(event.assessmentId)}>{t('clinical.reviewAction')}</button></>}</li>)}</ul>:<p className={styles.muted}>{t('clinical.noNewEntries')}</p>}{record.sinceLatest.length>4&&<button className={styles.link} onClick={onTimeline}>{t('visits.allChangesInVisits')}</button>}</section>
  <JourneyOrientation bundle={bundle} onVisit={id=>onVisit(id)}/>
  <section className={styles.section}><span className="kicker">{t('current.m051')}</span><div className={styles.currentRows}>
   <div><strong>{t('psychometrics.measurements')}</strong><p>{record.latestScores.length?record.latestScores.map(({current,previous})=><span key={current.id}><button className={styles.link} onClick={()=>onMeasurements(current.id)}>{current.instrument} {previous?previous.score+' → ':''}{current.score}</button> <span className={styles.muted}>({recordDate(current.completed_at!,locale)}) · {assessmentLinkLabel(bundle,current,displayLabel)}</span>{' '}</span>):t('psychometrics.noCompletedMeasure')}</p></div>
   <div><strong>{t('clinical.risk')}</strong><p>{riskFinding?displayLabel(riskFinding.label)+' '+displayLabel(riskFindingLabel(riskFinding)): t('clinical.noLatestRiskAssessment')}{record.risk&&record.latestVisit&&<> <span className={styles.muted}>· {recordDate(clinicalDate(bundle,record.latestVisit))}</span> <button className={styles.link} onClick={()=>onVisit(record.latestVisit!.id)}>{t('visits.record')}</button></>}</p></div>
  </div></section>
  <PatientContext key={bundle.patient.id} bundle={bundle} reload={reload} onVisit={id=>onVisit(id)}/>
  {!hasOpenIssues&&<p className={styles.muted}>{t('clinical.noOpenIssues')}</p>}

  </details>
 </div>;
}

'use client';
import {useOptionLabel} from '@/i18n/option-labels';
import {useLocale,useTranslations} from 'next-intl';

import type {MutableRefObject} from 'react';
import type {PatientBundle} from '@/lib/patients/demo-runtime';
import {completedVisitNotes} from '@/lib/clinical/completed-visit-notes';
import {patientRecord} from '@/lib/clinical/patient-record';
import {MedicationsPanel} from './PatientPanels';
import {recordDate} from './PatientRecordSummary';
import styles from './PatientRecord.module.css';

export default function PatientTreatment({bundle,reload,beforeNavigate}:{bundle:PatientBundle;reload:()=>Promise<unknown>;beforeNavigate:MutableRefObject<(()=>Promise<void>)|null>}){
 const t=useTranslations();
 const displayLabel=useOptionLabel();
 const locale=useLocale();

 const record=patientRecord(bundle,undefined,undefined,displayLabel),notes=completedVisitNotes(bundle,record.latestVisit);
 return <div className={styles.record}><MedicationsPanel bundle={bundle} reload={reload} beforeNavigate={beforeNavigate} currentOnly/>
  <section className={styles.section}><span className="kicker">{t('medications.tolerabilityKicker')}</span><h2>{t('medications.activeSideEffects')}</h2>{record.activeEffects.length?<ul className={styles.list}>{record.activeEffects.map(effect=><li key={effect.id}><strong>{effect.effect_text}</strong> · {bundle.medications.find(m=>m.id===effect.medication_id)?.medication_name||t('medications.medication')}<p>{({mild:t('clinical.mild'),moderate:t('clinical.moderate'),severe:t('clinical.severe')} as const)[effect.severity]}{effect.impact?' · '+effect.impact:''}</p><p className={styles.muted}>{t('medications.sincePrefix')} {recordDate(effect.noted_on,locale)} · {effect.resolved_on?t('medications.recordedEnd',{date:recordDate(effect.resolved_on,locale)}):t('medications.noRecordedEnd')}</p></li>)}</ul>:<p className={styles.muted}>{t('medications.noOpenSideEffectsHelp')}</p>}</section>
  {notes&&(notes.adherence||notes.effects)&&<section className={styles.section}><span className="kicker">{t('medications.visitReviewKicker')}</span>{notes.adherence&&<p><strong>{t('medications.adherencePrefix')}</strong> {notes.adherence}</p>}{notes.effects&&<p><strong>{t('medications.overallTolerabilityPrefix')}</strong> {notes.effects}</p>}<p className={styles.muted}>{t('visits.lastCompletedPrefix')} {recordDate(notes.date,locale)}{notes.corrected?t('visits.withCorrectionsSuffix'):''}</p></section>}

 </div>;
}

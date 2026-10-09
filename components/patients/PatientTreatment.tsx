'use client';
import {useEffect,useRef,type MutableRefObject} from 'react';
import type {PatientBundle} from '@/lib/patients/demo-runtime';
import {patientRecord} from '@/lib/clinical/patient-record';
import {MedicationsPanel} from './PatientPanels';
import PatientPsychometrics from './PatientPsychometrics';
import {recordDate} from './PatientRecordSummary';
import styles from './PatientRecord.module.css';

export default function PatientTreatment({bundle,reload,beforeNavigate,measurementsOpen,selectedAssessmentId}:{bundle:PatientBundle;reload:()=>Promise<unknown>;beforeNavigate:MutableRefObject<(()=>Promise<void>)|null>;measurementsOpen:boolean;selectedAssessmentId:string|null}){
 const record=patientRecord(bundle);
 const measurementsRef=useRef<HTMLDetailsElement>(null);
 useEffect(()=>{if(measurementsOpen&&!selectedAssessmentId)measurementsRef.current?.scrollIntoView({block:'start'})},[measurementsOpen,selectedAssessmentId]);
 return <div className={styles.record}><MedicationsPanel bundle={bundle} reload={reload} beforeNavigate={beforeNavigate} currentOnly/>
  <section className={styles.section}><span className="kicker">ΑΝΟΧΗ</span><h2>Ενεργές παρενέργειες</h2>{record.activeEffects.length?<ul className={styles.list}>{record.activeEffects.map(effect=><li key={effect.id}><strong>{effect.effect_text}</strong> · {bundle.medications.find(m=>m.id===effect.medication_id)?.medication_name||'Αγωγή'}<p>{({mild:'Ήπια',moderate:'Μέτρια',severe:'Σοβαρή'} as const)[effect.severity]}{effect.impact?' · '+effect.impact:''}</p><p className={styles.muted}>Από {recordDate(effect.noted_on)} · {effect.resolved_on?`Καταγεγραμμένη λήξη ${recordDate(effect.resolved_on)}`:'Χωρίς καταγεγραμμένη λήξη'}</p></li>)}</ul>:<p className={styles.muted}>Δεν υπάρχουν καταγεγραμμένες ανοιχτές παρενέργειες. Η απουσία καταγραφής δεν τεκμηριώνει καλή ανοχή.</p>}</section>
  {record.latestVisit?.continuity?.adherence&&<section className={styles.section}><span className="kicker">ΛΗΨΗ ΑΓΩΓΗΣ</span><p>{record.latestVisit.continuity.adherence}</p><p className={styles.muted}>{recordDate(record.latestVisit.continuity.approved_at)}</p></section>}
  <section className={styles.section}><span className="kicker">ΠΑΡΑΚΟΛΟΥΘΗΣΗ</span><h2>Μετρήσεις και εξέλιξη</h2>{record.latestScores.length?record.latestScores.map(({current,previous})=><p key={current.id}><strong>{current.instrument}: {previous?`${previous.score} → ${current.score}`:current.score}</strong><br/><span className={styles.muted}>{previous?`${recordDate(previous.completed_at!)} → `:''}{recordDate(current.completed_at!)}</span></p>):<p className={styles.muted}>Δεν υπάρχουν ολοκληρωμένες μετρήσεις.</p>}
   <details ref={measurementsRef} key={measurementsOpen?'requested-'+(selectedAssessmentId||'all'):'default'} open={measurementsOpen||undefined} className={styles.details} id="patient-measurements"><summary>Αποτελέσματα και απαντήσεις ερωτηματολογίων</summary><PatientPsychometrics bundle={bundle} reload={reload} selectedAssessmentId={selectedAssessmentId||undefined}/></details>
  </section>
 </div>;
}

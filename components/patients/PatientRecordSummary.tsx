'use client';
import {useState} from 'react';
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
export function recordDate(value:string){return value.length===10?new Intl.DateTimeFormat('el-GR',{day:'2-digit',month:'2-digit',year:'numeric',timeZone:'Europe/Athens'}).format(new Date(value+'T12:00:00Z')):formatClinicDateTime(value)}
export default function PatientRecordSummary({bundle,reload,onVisit,onTimeline,onMeasurements,onTreatment,onHistory}:{bundle:PatientBundle;reload:()=>Promise<unknown>;onVisit:(id?:string)=>void;onTimeline:()=>void;onMeasurements:(id?:string)=>void;onTreatment:()=>void;onHistory:()=>void}){
 const record=patientRecord(bundle);
 const [expanded,setExpanded]=useState(false);
 const hasOpenIssues=Boolean(record.pendingSafety.length||record.activeEffects.length||record.safetyAlerts.length);
 const riskFinding=riskFindings(record.risk).find(f=>!f.previousBranch&&(f.key==='tree:wish'||f.key==='suicidal_ideation'));
 return <div className={styles.record+' '+styles.continuity+(mobileV2Enabled?' '+mobileStyles.summary:'')}>
  {hasOpenIssues&&<section className={styles.section} aria-label="Ανοιχτά θέματα"><span className="kicker">ΑΝΟΙΧΤΑ ΘΕΜΑΤΑ</span>
   {record.pendingSafety.map(a=><p key={a.id}><strong>PHQ-9 · ανασκόπηση στοιχείου 9</strong> <button className={styles.link} onClick={()=>onMeasurements(a.id)}>Άνοιγμα</button></p>)}
   {record.activeEffects.map(e=><p key={e.id}><strong>{e.effect_text}</strong> · {bundle.medications.find(m=>m.id===e.medication_id)?.medication_name||'Αγωγή'} <button className={styles.link} onClick={onTreatment}>Ανοχή</button></p>)}
   {record.safetyAlerts.length>0&&<p>{record.safetyAlerts.join(' · ')} · τελευταία καταγεγραμμένη εκτίμηση. <button className={styles.link} onClick={()=>onVisit(record.latestVisit?.id)}>Έλεγχος κινδύνου</button></p>}
  </section>}
  <JourneyOrientation bundle={bundle} onVisit={id=>onVisit(id)}/>
  <details className={journeyStyles.details} onToggle={event=>setExpanded(event.currentTarget.open)}><summary>Αναλυτική κλινική σύνθεση και πηγές</summary>{expanded&&<ClinicalSummary bundle={bundle} onSessions={onVisit} onPsychometrics={onMeasurements} onMedications={onTreatment} onHistory={onHistory}/>}</details>
  <section className={styles.section}><span className="kicker">ΤΕΛΕΥΤΑΙΑ ΚΑΤΑΓΕΓΡΑΜΜΕΝΗ ΕΙΚΟΝΑ</span><div className={styles.currentRows}>
   <div><strong>Μετρήσεις</strong><p>{record.latestScores.length?record.latestScores.map(({current,previous})=><span key={current.id}><button className={styles.link} onClick={()=>onMeasurements(current.id)}>{current.instrument} {previous?previous.score+' → ':''}{current.score}</button> <span className={styles.muted}>({recordDate(current.completed_at!)}) · {assessmentLinkLabel(bundle,current)}</span>{' '}</span>):'Δεν υπάρχει ολοκληρωμένη μέτρηση.'}</p></div>
   <div><strong>Κίνδυνος</strong><p>{riskFinding?riskFinding.label+' '+riskFindingLabel(riskFinding): 'Δεν υπάρχει εκτίμηση στην τελευταία ολοκληρωμένη επίσκεψη.'}{record.risk&&record.latestVisit&&<> <span className={styles.muted}>· {recordDate(clinicalDate(bundle,record.latestVisit))}</span> <button className={styles.link} onClick={()=>onVisit(record.latestVisit!.id)}>Καταγραφή</button></>}</p></div>
  </div></section>
  <section className={styles.section}><span className="kicker">ΝΕΟΤΕΡΕΣ ΚΑΤΑΓΡΑΦΕΣ</span>{record.sinceLatest.length?<ul className={styles.list}>{record.sinceLatest.slice(0,4).map(event=><li key={event.id}><span className={styles.muted}>{recordDate(event.date)}</span> · <strong>{event.title}</strong> · {event.detail}{event.assessmentId&&<> <button className={styles.link} onClick={()=>onMeasurements(event.assessmentId)}>Ανασκόπηση</button></>}</li>)}</ul>:<p className={styles.muted}>Δεν υπάρχουν νέες κλινικές καταχωρήσεις.</p>}{record.sinceLatest.length>4&&<button className={styles.link} onClick={onTimeline}>Όλες οι αλλαγές στις Επισκέψεις</button>}</section>
  <PatientContext key={bundle.patient.id} bundle={bundle} reload={reload} onVisit={id=>onVisit(id)}/>
  {!hasOpenIssues&&<p className={styles.muted}>Δεν υπάρχουν καταγεγραμμένα ανοιχτά κλινικά θέματα.</p>}
  <PatientReportedHistory patientId={bundle.patient.id} compact onOpen={onHistory}/>

 </div>;
}

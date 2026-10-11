'use client';
import {useState} from 'react';
import type {PatientBundle} from '@/lib/patients/demo-runtime';
import {completedVisitNotes} from '@/lib/clinical/completed-visit-notes';
import {riskFindings,riskFindingLabel} from '@/lib/clinical/risk-findings';
import {clinicalDate,patientRecord} from '@/lib/clinical/patient-record';
import {formatClinicDateTime} from '@/lib/clinic-time';
import PatientContext from './PatientContext';
import {assessmentLinkLabel} from '@/lib/clinical/assessment-link';
import ClinicalSummary from './ClinicalSummary';
import PatientReportedHistory from './PatientReportedHistory';
import styles from './PatientRecord.module.css';
export function recordDate(value:string){return value.length===10?new Intl.DateTimeFormat('el-GR',{day:'2-digit',month:'2-digit',year:'numeric',timeZone:'Europe/Athens'}).format(new Date(value+'T12:00:00Z')):formatClinicDateTime(value)}
export default function PatientRecordSummary({bundle,reload,onVisit,onTimeline,onMeasurements,onTreatment,onHistory}:{bundle:PatientBundle;reload:()=>Promise<unknown>;onVisit:(id?:string)=>void;onTimeline:()=>void;onMeasurements:(id?:string)=>void;onTreatment:()=>void;onHistory:()=>void}){
 const record=patientRecord(bundle),notes=completedVisitNotes(bundle,record.latestVisit);
 const [synthesisOpen,setSynthesisOpen]=useState(false);
 const hasOpenIssues=Boolean(record.pendingSafety.length||record.activeEffects.length||record.safetyAlerts.length);
 const riskFinding=riskFindings(record.risk).find(f=>!f.previousBranch&&(f.key==='tree:wish'||f.key==='suicidal_ideation'));
 return <div className={styles.record+' '+styles.continuity}>
  {hasOpenIssues&&<section className={styles.section} aria-label="Ανοιχτά θέματα"><span className="kicker">ΑΝΟΙΧΤΑ ΘΕΜΑΤΑ</span>
   {record.pendingSafety.map(a=><p key={a.id}><strong>PHQ-9 · ανασκόπηση στοιχείου 9</strong> <button className={styles.link} onClick={()=>onMeasurements(a.id)}>Άνοιγμα</button></p>)}
   {record.activeEffects.map(e=><p key={e.id}><strong>{e.effect_text}</strong> · {bundle.medications.find(m=>m.id===e.medication_id)?.medication_name||'Αγωγή'} <button className={styles.link} onClick={onTreatment}>Ανοχή</button></p>)}
   {record.safetyAlerts.length>0&&<p>{record.safetyAlerts.join(' · ')} · τελευταία καταγεγραμμένη εκτίμηση. <button className={styles.link} onClick={()=>onVisit(record.latestVisit?.id)}>Έλεγχος κινδύνου</button></p>}
  </section>}
  <section className={styles.section}><span className="kicker">ΚΑΤΑΓΡΑΦΗ ΤΕΛΕΥΤΑΙΑΣ ΕΠΙΣΚΕΨΗΣ</span><p className={styles.memory}>{notes?.clinical||'Δεν υπάρχει καταγεγραμμένη κλινική εικόνα σε ολοκληρωμένη επίσκεψη.'}</p>{notes&&<><p className={styles.muted}>Ολοκληρωμένη επίσκεψη · {recordDate(notes.date)}{notes.corrected?' · με καταγεγραμμένες διορθώσεις':''} <button className={styles.link} onClick={()=>onVisit(notes.sessionId)}>Προβολή επίσκεψης</button></p>{notes.functioning&&<p><strong>Λειτουργικότητα:</strong> {notes.functioning}</p>}</>}</section>
  <section className={styles.section}><span className="kicker">ΑΠΟΦΑΣΕΙΣ & ΕΠΟΜΕΝΟΣ ΕΛΕΓΧΟΣ</span>{notes?.plan&&<p className={styles.memory}><strong>Αποφάσεις / παρεμβάσεις:</strong> {notes.plan}</p>}<p className={styles.memory}><strong>Επόμενος έλεγχος:</strong> {notes?.review||'Δεν έχει καταγραφεί σε ολοκληρωμένη επίσκεψη.'}</p></section>
  <section className={styles.section}><span className="kicker">ΤΕΛΕΥΤΑΙΑ ΚΑΤΑΓΕΓΡΑΜΜΕΝΗ ΕΙΚΟΝΑ</span><div className={styles.currentRows}>
   <div><strong>Αγωγή</strong><p>{record.activeMedications.length?record.activeMedications.map(m=>m.medication_name+' '+m.dose+' '+m.unit+' · '+m.frequency).join(' / '):'Δεν υπάρχει καταγεγραμμένη ενεργή αγωγή.'} <button className={styles.link} onClick={onTreatment}>Διαχείριση</button></p></div>
   <div><strong>Μετρήσεις</strong><p>{record.latestScores.length?record.latestScores.map(({current,previous})=><span key={current.id}><button className={styles.link} onClick={()=>onMeasurements(current.id)}>{current.instrument} {previous?previous.score+' → ':''}{current.score}</button> <span className={styles.muted}>({recordDate(current.completed_at!)}) · {assessmentLinkLabel(bundle,current)}</span>{' '}</span>):'Δεν υπάρχει ολοκληρωμένη μέτρηση.'}</p></div>
   <div><strong>Κίνδυνος</strong><p>{riskFinding?riskFinding.label+' '+riskFindingLabel(riskFinding): 'Δεν υπάρχει εκτίμηση στην τελευταία ολοκληρωμένη επίσκεψη.'}{record.risk&&record.latestVisit&&<> <span className={styles.muted}>· {recordDate(clinicalDate(bundle,record.latestVisit))}</span> <button className={styles.link} onClick={()=>onVisit(record.latestVisit!.id)}>Καταγραφή</button></>}</p></div>
  </div></section>
  <section className={styles.section}><span className="kicker">ΝΕΟΤΕΡΕΣ ΚΑΤΑΓΡΑΦΕΣ</span>{record.sinceLatest.length?<ul className={styles.list}>{record.sinceLatest.slice(0,4).map(event=><li key={event.id}><span className={styles.muted}>{recordDate(event.date)}</span> · <strong>{event.title}</strong> · {event.detail}{event.assessmentId&&<> <button className={styles.link} onClick={()=>onMeasurements(event.assessmentId)}>Ανασκόπηση</button></>}</li>)}</ul>:<p className={styles.muted}>Δεν υπάρχουν νέες κλινικές καταχωρήσεις.</p>}{record.sinceLatest.length>4&&<button className={styles.link} onClick={onTimeline}>Όλες οι αλλαγές στην Πορεία</button>}</section>
  <PatientContext key={bundle.patient.id} bundle={bundle} reload={reload} onVisit={id=>onVisit(id)}/>
  {!hasOpenIssues&&<p className={styles.muted}>Δεν υπάρχουν καταγεγραμμένα ανοιχτά κλινικά θέματα.</p>}
  <PatientReportedHistory patientId={bundle.patient.id} compact onOpen={onHistory}/>
  <details className={styles.details} onToggle={event=>setSynthesisOpen(event.currentTarget.open)}><summary>Δείτε κλινική σύνθεση</summary>{synthesisOpen&&<ClinicalSummary bundle={bundle} onSessions={onVisit} onPsychometrics={onMeasurements} onMedications={onTreatment} onHistory={onHistory}/>}</details>
 </div>;
}

'use client';
import {useState} from 'react';
import type {PatientBundle} from '@/lib/patients/demo-runtime';
import {clinicalDate,patientRecord} from '@/lib/clinical/patient-record';
import {formatClinicDateTime} from '@/lib/clinic-time';
import PatientContext from './PatientContext';
import {assessmentLinkLabel} from '@/lib/clinical/assessment-link';
import ClinicalSummary from './ClinicalSummary';
import PatientReportedHistory from './PatientReportedHistory';
import styles from './PatientRecord.module.css';
export function recordDate(value:string){return value.length===10?new Intl.DateTimeFormat('el-GR',{day:'2-digit',month:'2-digit',year:'numeric',timeZone:'Europe/Athens'}).format(new Date(value+'T12:00:00Z')):formatClinicDateTime(value)}
export default function PatientRecordSummary({bundle,reload,onVisit,onMeasurements,onTreatment,onHistory}:{bundle:PatientBundle;reload:()=>Promise<unknown>;onVisit:(id?:string)=>void;onMeasurements:(id?:string)=>void;onTreatment:()=>void;onHistory:()=>void}){
 const record=patientRecord(bundle),memory=record.latestVisit?.continuity;
 const amended=Boolean(memory?.approved_at&&[...(bundle.corrections||[]),...bundle.addenda].some(c=>c.session_id===record.latestVisit?.id&&Date.parse(c.created_at)>Date.parse(memory.approved_at)));
 const [synthesisOpen,setSynthesisOpen]=useState(false);
 const riskLabels:Record<string,string>={negative:'Δεν αναφέρθηκε αυτοκτονικός ιδεασμός',positive:'Θετική καταγραφή αυτοκτονικού ιδεασμού',unknown:'Αυτοκτονικός ιδεασμός: άγνωστο',not_assessed:'Δεν διερευνήθηκε'};
 return <div className={styles.record+' '+styles.continuity}>
  <section className={styles.section}><span className="kicker">ΣΥΝΟΨΗ ΤΕΛΕΥΤΑΙΑΣ ΕΠΙΣΚΕΨΗΣ</span>{memory?.approved_at?<><p className={styles.memory}>{memory.clinical_state_summary}</p><p className={styles.muted}>Επιβεβαιώθηκε από τον κλινικό · {recordDate(memory.approved_at)} <button className={styles.link} onClick={()=>onVisit(record.latestVisit!.id)}>Προβολή επίσκεψης</button></p>{amended&&<p role="status">Υπάρχει μεταγενέστερη προσθήκη ή διόρθωση. <button className={styles.link} onClick={()=>onVisit(record.latestVisit!.id)}>Ελέγξτε την πλήρη καταγραφή</button></p>}</>:<p className={styles.muted}>{record.latestVisit?'Η τελευταία επίσκεψη δεν περιλαμβάνει επιβεβαιωμένη σύντομη κλινική μνήμη.':'Δεν έχει ολοκληρωθεί ακόμη η πρώτη επίσκεψη.'}{record.latestVisit&&<> <button className={styles.link} onClick={()=>onVisit(record.latestVisit!.id)}>Άνοιγμα καταγραφής</button></>}</p>}</section>
  <section className={styles.section}><span className="kicker">ΣΤΟΧΟΙ ΕΠΟΜΕΝΗΣ ΕΠΙΣΚΕΨΗΣ</span><p className={styles.memory}>{memory?.approved_at?memory.next_review_focus:'Δεν υπάρχει επιβεβαιωμένο σημείο επόμενου ελέγχου.'}</p></section>
  <section className={styles.section}><span className="kicker">ΝΕΟΤΕΡΕΣ ΚΑΤΑΓΡΑΦΕΣ</span>{record.sinceLatest.length?<ul className={styles.list}>{record.sinceLatest.slice(0,4).map(event=><li key={event.id}><span className={styles.muted}>{recordDate(event.date)}</span> · <strong>{event.title}</strong> · {event.detail}{event.assessmentId&&<> <button className={styles.link} onClick={()=>onMeasurements(event.assessmentId)}>Ανασκόπηση</button></>}</li>)}</ul>:<p className={styles.muted}>Δεν υπάρχουν νέες κλινικές καταχωρήσεις.</p>}{record.sinceLatest.length>4&&<button className={styles.link} onClick={()=>onVisit()}>Όλες οι αλλαγές στην Πορεία</button>}</section>
  <PatientReportedHistory patientId={bundle.patient.id} compact onOpen={onHistory}/>
  <PatientContext key={bundle.patient.id} bundle={bundle} reload={reload} onVisit={id=>onVisit(id)}/>
  <section className={styles.section}><span className="kicker">ΤΕΛΕΥΤΑΙΑ ΚΑΤΑΓΕΓΡΑΜΜΕΝΗ ΕΙΚΟΝΑ</span><div className={styles.currentRows}>
   <div><strong>Αγωγή</strong><p>{record.activeMedications.length?record.activeMedications.map(m=>m.medication_name+' '+m.dose+' '+m.unit+' · '+m.frequency).join(' / '):'Δεν υπάρχει καταγεγραμμένη ενεργή αγωγή.'} <button className={styles.link} onClick={onTreatment}>Διαχείριση</button></p></div>
   <div><strong>Μετρήσεις</strong><p>{record.latestScores.length?record.latestScores.map(({current,previous})=><span key={current.id}><button className={styles.link} onClick={()=>onMeasurements(current.id)}>{current.instrument} {previous?previous.score+' → ':''}{current.score}</button> <span className={styles.muted}>({recordDate(current.completed_at!)}) · {assessmentLinkLabel(bundle,current)}</span>{' '}</span>):'Δεν υπάρχει ολοκληρωμένη μέτρηση.'}</p></div>
   <div><strong>Κίνδυνος</strong><p>{record.risk?(riskLabels[record.risk.suicidal_ideation]||'Δεν υπάρχει εκτίμηση.'): 'Δεν υπάρχει εκτίμηση στην τελευταία ολοκληρωμένη επίσκεψη.'}{record.risk&&record.latestVisit&&<> <span className={styles.muted}>· {recordDate(clinicalDate(bundle,record.latestVisit))}</span> <button className={styles.link} onClick={()=>onVisit(record.latestVisit!.id)}>Καταγραφή</button></>}</p></div>
  </div></section>
  <section className={styles.section}><span className="kicker">ΑΝΟΙΧΤΑ ΘΕΜΑΤΑ</span>
   {record.pendingSafety.map(a=><p key={a.id}><strong>PHQ-9 · ανασκόπηση στοιχείου 9</strong> <button className={styles.link} onClick={()=>onMeasurements(a.id)}>Άνοιγμα</button></p>)}
   {record.activeEffects.map(e=><p key={e.id}><strong>{e.effect_text}</strong> · {bundle.medications.find(m=>m.id===e.medication_id)?.medication_name||'Αγωγή'} <button className={styles.link} onClick={onTreatment}>Ανοχή</button></p>)}
   {record.safetyAlerts.length>0&&<p>{record.safetyAlerts.join(' · ')} · τελευταία καταγεγραμμένη εκτίμηση. <button className={styles.link} onClick={()=>onVisit(record.latestVisit?.id)}>Έλεγχος κινδύνου</button></p>}
   {!record.pendingSafety.length&&!record.activeEffects.length&&!record.safetyAlerts.length&&<p className={styles.muted}>Δεν υπάρχουν καταγεγραμμένα ανοιχτά κλινικά θέματα.</p>}
  </section>
  <details className={styles.details} onToggle={event=>setSynthesisOpen(event.currentTarget.open)}><summary>Δείτε κλινική σύνθεση</summary>{synthesisOpen&&<ClinicalSummary bundle={bundle} onSessions={onVisit} onPsychometrics={onMeasurements} onMedications={onTreatment} onHistory={onHistory}/>}</details>
 </div>;
}

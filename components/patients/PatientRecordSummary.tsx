'use client';
import {useState} from 'react';
import type {PatientBundle} from '@/lib/patients/demo-runtime';
import {clinicalDate,patientRecord} from '@/lib/clinical/patient-record';
import {formatClinicAppointment,formatClinicDateTime} from '@/lib/clinic-time';
import ClinicalSummary from './ClinicalSummary';
import styles from './PatientRecord.module.css';

export function recordDate(value:string){return value.length===10?new Intl.DateTimeFormat('el-GR',{day:'2-digit',month:'2-digit',year:'numeric',timeZone:'Europe/Athens'}).format(new Date(value+'T12:00:00Z')):formatClinicDateTime(value)}
export default function PatientRecordSummary({bundle,onVisit,onMeasurements,onTreatment,onHistory}:{bundle:PatientBundle;onVisit:(id?:string)=>void;onMeasurements:(id?:string)=>void;onTreatment:()=>void;onHistory:()=>void}){
 const record=patientRecord(bundle);
 const [synthesisOpen,setSynthesisOpen]=useState(false);
 const riskLabels:Record<string,string>={negative:'Δεν καταγράφηκε αυτοκτονικός ιδεασμός',positive:'Καταγράφηκε αυτοκτονικός ιδεασμός',unknown:'Αυτοκτονικός ιδεασμός: άγνωστο',not_assessed:'Αυτοκτονικός ιδεασμός: δεν διερευνήθηκε'};
 return <div className={styles.record}>
  <section className={styles.section}><span className="kicker">ΑΠΟ ΤΗΝ ΤΕΛΕΥΤΑΙΑ ΕΠΙΣΚΕΨΗ</span>
   {record.latestVisit?<><p className={styles.muted}>Σημείο αναφοράς: {recordDate(clinicalDate(bundle,record.latestVisit))}</p>{record.sinceLatest.length?<ul className={styles.changes}>{record.sinceLatest.slice(0,3).map(event=><li key={event.id}><strong>{event.title}</strong><p>{event.detail}</p><span className={styles.muted}>{recordDate(event.date)}{event.sessionId===record.latestVisit.id?' · Στην τελευταία επίσκεψη':''}</span></li>)}</ul>:<p className={styles.muted}>Δεν υπάρχουν νεότερες καταγεγραμμένες αλλαγές αγωγής, παρενέργειες ή μετρήσεις.</p>}{record.sinceLatest.length>3&&<button className={styles.link} onClick={()=>onVisit()}>Όλες οι αλλαγές στην Πορεία</button>}</>:<p className={styles.muted}>Δεν έχει ολοκληρωθεί ακόμη η πρώτη κλινική επίσκεψη.</p>}
  </section>
  <section className={styles.section}><span className="kicker">ΤΩΡΑ</span><div className={styles.grid}>
   <div><h2>Τρέχουσα αγωγή</h2>{record.activeMedications.length?record.activeMedications.map(m=><p key={m.id}><strong>{m.medication_name}</strong> · {m.dose} {m.unit} · {m.frequency}<br/><span className={styles.muted}>Σε ισχύ από {recordDate(m.effective_from||m.started_at)}</span></p>):<p className={styles.muted}>Δεν υπάρχει καταγεγραμμένη ενεργή αγωγή.</p>}<button className={styles.link} onClick={onTreatment}>Θεραπεία</button></div>
   <div><h2>Τελευταίες μετρήσεις</h2>{record.latestScores.length?record.latestScores.map(({current,previous})=><p key={current.id}><strong>{current.instrument} · {current.score}</strong>{previous&&<> <span className={styles.muted}>(προηγούμενο {previous.score} · {recordDate(previous.completed_at!)})</span></>}<br/><span className={styles.muted}>{recordDate(current.completed_at!)}</span> <button className={styles.link} onClick={()=>onMeasurements(current.id)}>Σκορ και απαντήσεις</button></p>):<p className={styles.muted}>Δεν υπάρχει ολοκληρωμένη μέτρηση.</p>}<button className={styles.link} onClick={()=>onMeasurements()}>Λεπτομέρειες και παρακολούθηση</button></div>
   <div><h2>Ασφάλεια</h2><p>{record.risk?(riskLabels[record.risk.suicidal_ideation]||'Δεν υπάρχει καταγεγραμμένη αξιολόγηση αυτοκτονικού ιδεασμού.'):'Δεν υπάρχει αξιολόγηση κινδύνου στην τελευταία ολοκληρωμένη επίσκεψη.'}</p>{record.risk&&record.latestVisit&&<><p className={styles.muted}>Αξιολογήθηκε {recordDate(clinicalDate(bundle,record.latestVisit))} · Δεν αποτελεί σημερινή επανεκτίμηση.</p><button className={styles.link} onClick={()=>onVisit(record.latestVisit.id)}>Πλήρης αξιολόγηση κινδύνου</button></>}</div>
   <div><h2>Επόμενο ραντεβού</h2><p>{record.nextAppointment?formatClinicAppointment(record.nextAppointment.scheduled_start):'Δεν υπάρχει επόμενο προγραμματισμένο ραντεβού.'}</p></div>
  </div></section>
  <section className={styles.section}><span className="kicker">ΝΑ ΜΗ ΧΑΘΕΙ</span><div className={styles.alert}>
   {record.pendingSafety.map(a=><p key={a.id}><strong>PHQ-9 · εκκρεμεί ανασκόπηση στοιχείου 9</strong><br/><span className={styles.muted}>{recordDate(a.completed_at!)}</span> <button className={styles.link} onClick={()=>onMeasurements(a.id)}>Ανασκόπηση</button></p>)}
   {record.activeEffects.map(effect=><p key={effect.id}><strong>{effect.effect_text}</strong> · {bundle.medications.find(m=>m.id===effect.medication_id)?.medication_name||'Αγωγή'}<br/><span className={styles.muted}>Ανοιχτή παρενέργεια από {recordDate(effect.noted_on)}</span></p>)}
   {record.safetyAlerts.length>0&&record.latestVisit&&<p>{record.safetyAlerts.join(' · ')}: θετική καταγραφή στην αξιολόγηση {recordDate(clinicalDate(bundle,record.latestVisit))}. <button className={styles.link} onClick={()=>onVisit(record.latestVisit.id)}>Άνοιγμα αξιολόγησης</button></p>}
   {bundle.history?.allergies.trim()&&<p><strong>Αλλεργίες / δυσανεξίες</strong><br/>{bundle.history.allergies} <button className={styles.link} onClick={onHistory}>Ιστορικό</button></p>}
   {!record.pendingSafety.length&&!record.activeEffects.length&&!bundle.history?.allergies.trim()&&!record.safetyAlerts.length&&<p className={styles.muted}>Δεν υπάρχουν καταγεγραμμένα ανοιχτά στοιχεία σε αυτές τις κατηγορίες.</p>}
  </div></section>
  <details className={styles.details} onToggle={event=>setSynthesisOpen(event.currentTarget.open)}><summary>ΚΛΙΝΙΚΗ ΣΥΝΘΕΣΗ</summary>{synthesisOpen&&<ClinicalSummary bundle={bundle} onSessions={onVisit} onPsychometrics={onMeasurements} onMedications={onTreatment} onHistory={onHistory}/>}</details>
 </div>;
}

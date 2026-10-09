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
import {recordDocumentation} from '@/lib/clinical/record-documentation';
import {recordRisk} from '@/lib/clinical/record-risk';
export function recordDate(value:string){return value.length===10?new Intl.DateTimeFormat('el-GR',{day:'2-digit',month:'2-digit',year:'numeric',timeZone:'Europe/Athens'}).format(new Date(value+'T12:00:00Z')):formatClinicDateTime(value)}
export default function PatientRecordSummary({bundle,reload,onVisit,onMeasurements,onTreatment,onHistory}:{bundle:PatientBundle;reload:()=>Promise<unknown>;onVisit:(id?:string)=>void;onMeasurements:(id?:string)=>void;onTreatment:()=>void;onHistory:()=>void}){
 const record=patientRecord(bundle),memory=record.latestVisit?.continuity;
 const documentation=recordDocumentation(bundle,record.latestVisit),riskSummary=recordRisk(record.risk);
 const amended=Boolean(memory?.approved_at&&[...(bundle.corrections||[]),...bundle.addenda].some(c=>c.session_id===record.latestVisit?.id&&Date.parse(c.created_at)>Date.parse(memory.approved_at)));
 const [synthesisOpen,setSynthesisOpen]=useState(false);
 return <div className={styles.record+' '+styles.continuity}>
   <PatientReportedHistory patientId={bundle.patient.id} compact onOpen={onHistory}/>
  <section className={styles.section}><span className="kicker">ΠΟΥ ΕΙΧΑΜΕ ΜΕΙΝΕΙ</span>{memory?.approved_at?<><p className={styles.memory}>{memory.clinical_state_summary}</p><p className={styles.muted}>Επιβεβαιώθηκε από τον κλινικό · {recordDate(memory.approved_at)} <button className={styles.link} onClick={()=>onVisit(record.latestVisit!.id)}>Πλήρης επίσκεψη</button></p>{amended&&<p role="status">Υπάρχει μεταγενέστερη προσθήκη ή διόρθωση. <button className={styles.link} onClick={()=>onVisit(record.latestVisit!.id)}>Ελέγξτε την πλήρη καταγραφή</button></p>}</>:documentation?.source==='initial'?<><p className={styles.memory} style={{whiteSpace:'pre-wrap'}}>{documentation.clinicalState||'Δεν καταγράφηκε κλινική αποτίμηση στην αρχική αξιολόγηση.'}</p><p className={styles.muted}>Αρχική αξιολόγηση · {recordDate(documentation.date)} · καταγεγραμμένα ευρήματα αυτής της επίσκεψης <button className={styles.link} onClick={()=>onVisit(documentation.sessionId)}>Πλήρης επίσκεψη</button></p>{documentation.treatment&&<p style={{whiteSpace:'pre-wrap'}}><strong>Θεραπευτικό πλάνο αυτής της επίσκεψης: </strong>{documentation.treatment}</p>}</>:<p className={styles.muted}>{record.latestVisit?'Η τελευταία επίσκεψη δεν περιλαμβάνει επιβεβαιωμένη σύντομη κλινική μνήμη.':'Δεν έχει ολοκληρωθεί ακόμη η πρώτη επίσκεψη.'}{record.latestVisit&&<> <button className={styles.link} onClick={()=>onVisit(record.latestVisit!.id)}>Άνοιγμα καταγραφής</button></>}</p>}</section>
  <section className={styles.section}><span className="kicker">ΓΙΑ ΣΗΜΕΡΑ</span><p className={styles.memory}>{documentation?.reviewFocus||'Δεν καταγράφηκε συγκεκριμένο σημείο επόμενου ελέγχου.'}</p></section>
  <section className={styles.section}><span className="kicker">ΑΠΟ ΤΟΤΕ</span>{record.sinceLatest.length?<ul className={styles.list}>{record.sinceLatest.slice(0,4).map(event=><li key={event.id}><span className={styles.muted}>{recordDate(event.date)}</span> · <strong>{event.title}</strong> · {event.detail}{event.assessmentId&&<> <button className={styles.link} onClick={()=>onMeasurements(event.assessmentId)}>Ανασκόπηση</button></>}</li>)}</ul>:<p className={styles.muted}>Δεν υπάρχουν νέες κλινικές καταχωρήσεις.</p>}{record.sinceLatest.length>4&&<button className={styles.link} onClick={()=>onVisit()}>Όλες οι αλλαγές στην Πορεία</button>}</section>
  <PatientContext key={bundle.patient.id} bundle={bundle} reload={reload} onVisit={id=>onVisit(id)}/>
  <section className={styles.section}><span className="kicker">ΤΩΡΑ</span><div className={styles.currentRows}>
   <div><strong>Αγωγή</strong><p>{record.activeMedications.length?record.activeMedications.map(m=>m.medication_name+' '+m.dose+' '+m.unit+' · '+m.frequency).join(' / '):'Δεν υπάρχει καταγεγραμμένη ενεργή αγωγή.'} <button className={styles.link} onClick={onTreatment}>Διαχείριση</button></p></div>
   <div><strong>Μετρήσεις</strong><p>{record.latestScores.length?record.latestScores.map(({current,previous})=><span key={current.id}><button className={styles.link} onClick={()=>onMeasurements(current.id)}>{current.instrument} {previous?previous.score+' → ':''}{current.score}</button> <span className={styles.muted}>({recordDate(current.completed_at!)}) · {assessmentLinkLabel(bundle,current)}</span>{' '}</span>):'Δεν υπάρχει ολοκληρωμένη μέτρηση.'}</p></div>
   <div><strong>Κίνδυνος</strong><p>{riskSummary?.primary||'Δεν υπάρχει εκτίμηση στην τελευταία ολοκληρωμένη επίσκεψη.'}{record.risk&&record.latestVisit&&<> <span className={styles.muted}>· {recordDate(clinicalDate(bundle,record.latestVisit))}</span> <button className={styles.link} onClick={()=>onVisit(record.latestVisit!.id)}>Καταγραφή</button></>}</p>{riskSummary&&<details><summary>Πεδία και σημειώσεις εκτίμησης κινδύνου</summary>{riskSummary.primaryNote&&<p>{riskSummary.primaryNote}</p>}<ul>{riskSummary.domains.map(f=><li key={f.key}>{f.text}{f.note&&<p>{f.note}</p>}</li>)}{riskSummary.unassessed.map(text=><li key={text}>{text}</li>)}</ul>{riskSummary.note&&<p style={{whiteSpace:'pre-wrap'}}>{riskSummary.note}</p>}{riskSummary.protectiveFactors&&<p>Προστατευτικοί παράγοντες: {riskSummary.protectiveFactors}</p>}</details>}</div>
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

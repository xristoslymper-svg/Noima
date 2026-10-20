'use client';
import PatientVisualIcon from './PatientVisualIcon';
import {useEffect,useRef,useState,type MutableRefObject} from 'react';
import type {PatientBundle} from '@/lib/patients/demo-runtime';
import {treatmentPlan} from '@/lib/clinical/treatment-plan';
import {assessmentLink,assessmentLinkLabel} from '@/lib/clinical/assessment-link';
import {MedicationsPanel} from './PatientPanels';
import MedicationSaveScope from './MedicationSaveScope';
import PatientPsychometrics from './PatientPsychometrics';
import {recordDate} from './PatientRecordSummary';
import styles from './PatientRecord.module.css';
import layout from './PatientTreatment.module.css';

export default function PatientTreatment({bundle,reload,beforeNavigate,measurementsOpen,selectedAssessmentId,onVisit}:{bundle:PatientBundle;reload:()=>Promise<unknown>;beforeNavigate:MutableRefObject<(()=>Promise<void>)|null>;measurementsOpen:boolean;selectedAssessmentId:string|null;onVisit:(id:string)=>void}){
 const {record,notes,scores,drafts}=treatmentPlan(bundle);
 const [expanded,setExpanded]=useState(measurementsOpen),[focusedAssessment,setFocusedAssessment]=useState<string|null>(null);
 const measurementsRef=useRef<HTMLDetailsElement>(null);
 useEffect(()=>{setExpanded(measurementsOpen)},[measurementsOpen,selectedAssessmentId]);
 useEffect(()=>{if(measurementsOpen&&!selectedAssessmentId)measurementsRef.current?.scrollIntoView({block:'start'})},[measurementsOpen,selectedAssessmentId]);
 return <div className={styles.record}>
  <section className={styles.section} aria-label="Τελευταίο επιβεβαιωμένο πλάνο">
   <span className="kicker">ΘΕΡΑΠΕΥΤΙΚΗ ΚΑΤΕΥΘΥΝΣΗ</span><h2><PatientVisualIcon name="plan"/>Τελευταίο επιβεβαιωμένο πλάνο</h2>
   {notes?<><div className={layout.planGrid}><div><h3>Αποφάσεις και παρεμβάσεις</h3><p className={layout.narrative}>{notes.plan||'Δεν έχει καταγραφεί ξεχωριστό πλάνο στην τελευταία ολοκληρωμένη επίσκεψη.'}</p></div><div><h3>Επόμενος έλεγχος</h3><p className={layout.narrative}>{notes.review||'Δεν έχει καταγραφεί ξεχωριστή εστίαση επανεκτίμησης. Ελέγξτε και τις οδηγίες του πλάνου.'}</p></div></div><p className={styles.muted}>Ολοκληρωμένη επίσκεψη · {recordDate(notes.date)}{notes.corrected?' · με καταγεγραμμένες διορθώσεις':''} · <button type="button" className={styles.link} onClick={()=>onVisit(notes.sessionId)}>Άνοιγμα επίσκεψης</button></p></>:<p className={styles.muted}>Το επιβεβαιωμένο πλάνο θα εμφανιστεί μετά την ολοκλήρωση επίσκεψης. Δεν χρειάζεται να το καταχωρίσετε ξανά εδώ.</p>}
   {drafts.length>0&&<p className={styles.muted}>Υπάρχει μη ολοκληρωμένη καταγραφή επίσκεψης. Οι αποφάσεις της δεν εμφανίζονται ως επιβεβαιωμένο πλάνο.</p>}
  </section>
  <MedicationSaveScope bundle={bundle}><MedicationsPanel bundle={bundle} reload={reload} beforeNavigate={beforeNavigate} currentOnly onVisit={onVisit}/></MedicationSaveScope>
  <section className={styles.section}><span className="kicker">ΑΝΟΧΗ</span><h2><PatientVisualIcon name="risk"/>Ενεργές παρενέργειες</h2>{record.activeEffects.length?<ul className={styles.list}>{record.activeEffects.map(effect=><li key={effect.id}><strong>{effect.effect_text}</strong> · {bundle.medications.find(m=>m.id===effect.medication_id)?.medication_name||'Αγωγή'}<p>{({mild:'Ήπια',moderate:'Μέτρια',severe:'Σοβαρή'} as const)[effect.severity]}{effect.impact?' · '+effect.impact:''}</p><p className={styles.muted}>Από {recordDate(effect.noted_on)} · {effect.resolved_on?`Καταγεγραμμένη λήξη ${recordDate(effect.resolved_on)}`:'Χωρίς καταγεγραμμένη λήξη'}{effect.session_id&&bundle.sessions.some(s=>s.id===effect.session_id)&&<> · <button type="button" className={styles.link} onClick={()=>onVisit(effect.session_id!)}>Σχετική επίσκεψη</button></>}</p></li>)}</ul>:<p className={styles.muted}>Δεν υπάρχουν καταγεγραμμένες ανοιχτές παρενέργειες. Η απουσία καταγραφής δεν τεκμηριώνει καλή ανοχή.</p>}</section>
  {notes&&(notes.adherence||notes.effects)&&<section className={styles.section}><span className="kicker">ΑΝΑΣΚΟΠΗΣΗ ΑΓΩΓΗΣ ΣΤΗΝ ΕΠΙΣΚΕΨΗ</span>{notes.adherence&&<p><strong>Λήψη αγωγής:</strong> {notes.adherence}</p>}{notes.effects&&<p><strong>Συνολική ανοχή / παρενέργειες:</strong> {notes.effects}</p>}<p className={styles.muted}>Τελευταία ολοκληρωμένη επίσκεψη · {recordDate(notes.date)}</p></section>}
  <section className={styles.section}><div className={layout.actionRow}><div><span className="kicker">ΠΑΡΑΚΟΛΟΥΘΗΣΗ</span><h2><PatientVisualIcon name="measures"/>Μετρήσεις και εξέλιξη</h2></div><button type="button" className={styles.link} onClick={()=>{setExpanded(true);requestAnimationFrame(()=>measurementsRef.current?.scrollIntoView({block:'start'}))}}>Νέα μέτρηση</button></div>
   {scores.length?scores.map(({current,previous})=>{const source=assessmentLink(bundle,current);return <div key={current.id} className={layout.scoreRow}><div><strong>{current.instrument}: {previous?`${previous.score} → ${current.score}`:current.score}</strong><p className={styles.muted}>{previous?`${recordDate(previous.completed_at!)} → `:''}{recordDate(current.completed_at!)} · {assessmentLinkLabel(bundle,current)}</p></div><div className={layout.scoreActions}><button type="button" className={styles.link} onClick={()=>{setFocusedAssessment(current.id);setExpanded(true);requestAnimationFrame(()=>{measurementsRef.current?.querySelector<HTMLElement>('[data-assessment-id="'+current.id+'"]')?.scrollIntoView({block:'center'})})}}>Σκορ και απαντήσεις</button>{source.session&&<button type="button" className={styles.link} onClick={()=>onVisit(source.session!.id)}>Σχετική επίσκεψη</button>}</div></div>}):<p className={styles.muted}>Δεν υπάρχουν ολοκληρωμένες μετρήσεις. Μπορείτε να ζητήσετε συμπλήρωση από τον ασθενή.</p>}
   <details ref={measurementsRef} key={measurementsOpen?'requested-'+(selectedAssessmentId||'all'):'default'} open={expanded||undefined} onToggle={e=>setExpanded(e.currentTarget.open)} className={styles.details} id="patient-measurements"><summary>Αποτελέσματα και απαντήσεις ερωτηματολογίων</summary><PatientPsychometrics bundle={bundle} reload={reload} selectedAssessmentId={selectedAssessmentId||focusedAssessment||undefined}/></details>
  </section>
 </div>;
}

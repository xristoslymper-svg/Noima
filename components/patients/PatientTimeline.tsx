'use client';
import type {MutableRefObject} from 'react';
import PriorCourseSection from './PriorCourseSection';
import {useEffect,useRef,useState,type ReactNode} from 'react';
import type {PatientBundle} from '@/lib/patients/demo-runtime';
import {patientTimeline} from '@/lib/clinical/patient-record';
import {recordDate} from './PatientRecordSummary';
import styles from './PatientRecord.module.css';
import journeyStyles from './PatientJourney.module.css';

export default function PatientTimeline({bundle,selectedSessionId,onVisit,onMeasurements,onTreatment,viewer,beforeNavigate,priorCourseEnabled=false,onPriorCourseSettled,readOnly=false}:{readOnly?:boolean;beforeNavigate?:MutableRefObject<(()=>Promise<void>)|null>;priorCourseEnabled?:boolean;onPriorCourseSettled?:(warning:string)=>void;bundle:PatientBundle;selectedSessionId:string|null;onVisit:(id:string|null)=>void;onMeasurements:(id?:string)=>void;onTreatment:()=>void;viewer:ReactNode}){
 const [filter,setFilter]=useState<'all'|'treatment'|'measurements'>('all');
 const viewerRef=useRef<HTMLDivElement>(null);
 useEffect(()=>{if(selectedSessionId)viewerRef.current?.scrollIntoView({block:'start'})},[selectedSessionId]);
 const {visits,context,unlinked}=patientTimeline(bundle);
 const events=visits.filter(e=>filter==='all'||(filter==='treatment'?context.get(e.sessionId!)!.treatment.length:context.get(e.sessionId!)!.measurements.length));
 const independent=unlinked;
 const emptyMessage=!visits.length?'Δεν έχουν καταγραφεί επισκέψεις ακόμη.':filter==='treatment'?'Δεν υπάρχουν επισκέψεις με συνδεδεμένες αλλαγές αγωγής ή παρενέργειες.':'Δεν υπάρχουν επισκέψεις με συνδεδεμένες ολοκληρωμένες μετρήσεις.';
 return <section className={styles.record+' '+journeyStyles.timeline}><span className="kicker">ΔΙΑΧΡΟΝΙΚΟΣ ΦΑΚΕΛΟΣ</span><h2>Επισκέψεις</h2>
  {priorCourseEnabled&&<PriorCourseSection key={bundle.patient.id} patientId={bundle.patient.id} beforeNavigate={beforeNavigate} onSettled={onPriorCourseSettled}/>}
  <div className={styles.filters} aria-label="Φίλτρα πορείας">{([['all','Όλες οι επισκέψεις'],['treatment','Με αλλαγές αγωγής'],['measurements','Με μετρήσεις']] as const).map(([key,label])=><button key={key} aria-pressed={filter===key} onClick={()=>setFilter(key)}>{label}</button>)}</div>
  {events.length?<ol className={styles.list} aria-label="Επισκέψεις με συνδεδεμένη αγωγή και μετρήσεις">{events.map(event=>{
   const linked=context.get(event.sessionId!)!;
   return <li key={event.id} data-visit-row="true" data-session-id={event.sessionId} className={styles.item+' '+styles.visit+' '+styles.enrichedVisit}>
    <time dateTime={event.date}>{recordDate(event.date)}</time>
    <div><strong>{event.title}{event.draft?' · Πρόχειρη':''}</strong><p className={styles.muted}>{event.detail}</p><button disabled={readOnly} className={styles.link} onClick={()=>onVisit(event.sessionId!)}>{event.draft?'Συνέχεια προχείρου':'Άνοιγμα καταγραφής'}</button></div>
    <div className={styles.visitContext} data-visit-context="true" aria-label="Συνδεδεμένη αγωγή και μετρήσεις">
     {filter!=='measurements'&&!!linked.treatment.length&&<div><span className={styles.contextLabel}>Αγωγή</span>{linked.treatment.map(change=><button key={change.id} data-treatment-event={change.id} disabled={readOnly} className={styles.contextEntry} onClick={onTreatment}><span>{change.title}{change.scheduled?' · Προγραμματισμένο':''}</span><strong>{change.detail}</strong><small>Ισχύει από {recordDate(change.date)}</small></button>)}</div>}
     {filter!=='treatment'&&!!linked.measurements.length&&<div><span className={styles.contextLabel}>Μετρήσεις</span>{linked.measurements.map(({current,previous})=><button key={current.id} data-assessment-id={current.id} disabled={readOnly} className={styles.contextEntry} onClick={()=>onMeasurements(current.id)}><strong>{current.instrument} · {previous?previous.score+' → ':''}{current.score}</strong><small>{recordDate(current.completed_at!)}{previous?' · προηγούμενο '+recordDate(previous.completed_at!):''}</small>{current.item9_review&&!current.item9_reviewed_at&&<span>Στοιχείο 9 · εκκρεμεί ανασκόπηση</span>}</button>)}</div>}
    </div>
   </li>;
  })}</ol>:<div role="status"><p className={styles.muted}>{emptyMessage}</p>{visits.length>0&&filter!=='all'&&<button type="button" className={styles.link} onClick={()=>setFilter('all')}>Όλες οι επισκέψεις</button>}{independent.length>0&&<p className={styles.muted}>Οι καταγραφές χωρίς σύνδεση με επίσκεψη παραμένουν διαθέσιμες παρακάτω.</p>}</div>}
  {!!independent.length&&<details className={styles.details} data-unlinked-events="true"><summary>Καταγραφές χωρίς σύνδεση με επίσκεψη · {independent.length}</summary><p className={styles.muted}>Εμφανίζονται ανεξάρτητα από το φίλτρο επισκέψεων. Δεν αντιστοιχίζονται σε επίσκεψη μόνο βάσει ημερομηνίας.</p><ol className={styles.list}>{independent.map(event=><li key={event.id} className={styles.item}><time dateTime={event.date}>{recordDate(event.date)}</time><div><strong>{event.title}{event.scheduled?' · Προγραμματισμένο':''}</strong><p className={styles.muted}>{event.detail}</p><button disabled={readOnly} className={styles.link} onClick={event.kind==='measurements'?()=>onMeasurements(event.assessmentId):onTreatment}>{event.kind==='measurements'?'Σκορ και απαντήσεις':'Λεπτομέρειες θεραπείας'}</button></div></li>)}</ol></details>}
  {selectedSessionId&&bundle.sessions.some(s=>s.id===selectedSessionId&&s.status==='completed')&&<div ref={viewerRef} className={styles.viewer} role="region" aria-label="Ολοκληρωμένη καταγραφή"><button disabled={readOnly} className={styles.link} onClick={()=>onVisit(null)}>Κλείσιμο καταγραφής</button>{viewer}</div>}
  {selectedSessionId&&!bundle.sessions.some(s=>s.id===selectedSessionId)&&<p role="status">Η συγκεκριμένη καταγραφή δεν είναι διαθέσιμη στον φάκελο.</p>}
 </section>;
}

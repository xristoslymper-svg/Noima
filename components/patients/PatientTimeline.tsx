'use client';
import {useEffect,useRef,useState,type ReactNode} from 'react';
import type {PatientBundle} from '@/lib/patients/demo-runtime';
import {patientRecord,visitTimelineContext,type RecordEvent} from '@/lib/clinical/patient-record';
import {recordDate} from './PatientRecordSummary';
import styles from './PatientRecord.module.css';

export default function PatientTimeline({bundle,selectedSessionId,onVisit,onMeasurements,onTreatment,onPriorCourse,viewer}:{bundle:PatientBundle;selectedSessionId:string|null;onVisit:(id:string|null)=>void;onMeasurements:(id?:string)=>void;onTreatment:()=>void;onPriorCourse:()=>void;viewer:ReactNode}){
 const [filter,setFilter]=useState<'all'|RecordEvent['kind']>('all');
 const record=patientRecord(bundle);
 const viewerRef=useRef<HTMLDivElement>(null);
 useEffect(()=>{if(selectedSessionId)viewerRef.current?.scrollIntoView({block:'start'})},[selectedSessionId]);
 const context=visitTimelineContext(bundle);
 const grouped=new Set([...context.values()].flatMap(c=>[...c.treatment.map(e=>e.id),...c.measurements.map(m=>'measurement-'+m.current.id)]));
 const events=record.events.filter(e=>filter!=='all'||!grouped.has(e.id)).filter(e=>filter==='all'||e.kind===filter);
 return <section className={styles.record}><span className="kicker">ΔΙΑΧΡΟΝΙΚΟΣ ΦΑΚΕΛΟΣ</span><h2>Επισκέψεις</h2>
  <div className={styles.priorTimeline}><strong>Πριν από το NOIMA · Προηγούμενη κλινική πορεία</strong><p>{bundle.priorCourse?.content||'Μεταφέρετε συνοπτικά την προηγούμενη παρακολούθηση, χωρίς να δημιουργήσετε παλιές επισκέψεις.'}</p>{bundle.priorCourse?.period_label&&<small>{bundle.priorCourse.period_label}</small>}<button type="button" className={styles.link} onClick={onPriorCourse}>{bundle.priorCourse?'Επεξεργασία προηγούμενης πορείας':'Προσθήκη προηγούμενης πορείας'}</button></div>
  <div className={styles.filters} aria-label="Φίλτρα πορείας">{([['all','Όλα'],['visits','Επισκέψεις'],['treatment','Θεραπεία'],['measurements','Μετρήσεις']] as const).map(([key,label])=><button key={key} aria-pressed={filter===key} onClick={()=>setFilter(key)}>{label}</button>)}</div>
  {events.length?<ol className={styles.list}>{events.map(event=><li key={event.id} className={`${styles.item} ${event.kind==='visits'?styles.visit:''} ${event.kind==='visits'&&(context.get(event.sessionId!)?.treatment.length||context.get(event.sessionId!)?.measurements.length)?styles.enrichedVisit:''}`}><time dateTime={event.date}>{recordDate(event.date)}</time><div><strong>{event.title}{event.scheduled?' · Προγραμματισμένο':''}</strong><p className={styles.muted}>{event.detail}</p>{event.kind==='visits'?<button className={styles.link} onClick={()=>onVisit(event.sessionId!)}>Άνοιγμα καταγραφής</button>:<button className={styles.link} onClick={event.kind==='measurements'?()=>onMeasurements(event.assessmentId):onTreatment}>{event.kind==='measurements'?'Σκορ και απαντήσεις':'Λεπτομέρειες θεραπείας'}</button>}</div>{event.kind==='visits'&&(context.get(event.sessionId!)?.treatment.length||context.get(event.sessionId!)?.measurements.length)?<div className={styles.visitContext}>
   {!!context.get(event.sessionId!)!.treatment.length&&<div><span className={styles.contextLabel}>Αγωγή</span>{context.get(event.sessionId!)!.treatment.map(change=><button key={change.id} className={styles.contextEntry} onClick={onTreatment}><span>{change.title}{change.scheduled?' · Προγραμματισμένο':''}</span><strong>{change.detail}</strong><small>Ισχύει από {recordDate(change.date)}</small></button>)}</div>}
   {!!context.get(event.sessionId!)!.measurements.length&&<div><span className={styles.contextLabel}>Μετρήσεις</span>{context.get(event.sessionId!)!.measurements.map(({current,previous})=><button key={current.id} className={styles.contextEntry} onClick={()=>onMeasurements(current.id)}><strong>{current.instrument} · {previous?previous.score+' → ':''}{current.score}</strong><small>{recordDate(current.completed_at!)}{previous?' · προηγούμενο '+recordDate(previous.completed_at!):''}</small>{current.item9_review&&!current.item9_reviewed_at&&<span>Στοιχείο 9 · εκκρεμεί ανασκόπηση</span>}</button>)}</div>}
  </div>:null}</li>)}</ol>:<p className={styles.muted}>Δεν υπάρχουν καταγεγραμμένα γεγονότα για αυτό το φίλτρο.</p>}
  {selectedSessionId&&record.completed.some(s=>s.id===selectedSessionId)&&<div ref={viewerRef} className={styles.viewer} role="region" aria-label="Ολοκληρωμένη καταγραφή"><button className={styles.link} onClick={()=>onVisit(null)}>Κλείσιμο καταγραφής</button>{viewer}</div>}
  {selectedSessionId&&!bundle.sessions.some(s=>s.id===selectedSessionId)&&<p role="status">Η συγκεκριμένη καταγραφή δεν είναι διαθέσιμη στον φάκελο.</p>}
 </section>;
}

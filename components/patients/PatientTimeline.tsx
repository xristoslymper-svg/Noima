'use client';
import {useEffect,useRef,useState,type ReactNode} from 'react';
import type {PatientBundle} from '@/lib/patients/demo-runtime';
import {patientRecord,type RecordEvent} from '@/lib/clinical/patient-record';
import {recordDate} from './PatientRecordSummary';
import styles from './PatientRecord.module.css';

export default function PatientTimeline({bundle,selectedSessionId,onVisit,onMeasurements,onTreatment,viewer}:{bundle:PatientBundle;selectedSessionId:string|null;onVisit:(id:string|null)=>void;onMeasurements:(id?:string)=>void;onTreatment:()=>void;viewer:ReactNode}){
 const [filter,setFilter]=useState<'all'|RecordEvent['kind']>('all');
 const record=patientRecord(bundle);
 const viewerRef=useRef<HTMLDivElement>(null);
 useEffect(()=>{if(selectedSessionId)viewerRef.current?.scrollIntoView({block:'start'})},[selectedSessionId]);
 const events=record.events.filter(e=>filter==='all'||e.kind===filter);
 return <section className={styles.record}><span className="kicker">ΔΙΑΧΡΟΝΙΚΟΣ ΦΑΚΕΛΟΣ</span><h2>Πορεία</h2>
  <div className={styles.filters} aria-label="Φίλτρα πορείας">{([['all','Όλα'],['visits','Επισκέψεις'],['treatment','Θεραπεία'],['measurements','Μετρήσεις']] as const).map(([key,label])=><button key={key} aria-pressed={filter===key} onClick={()=>setFilter(key)}>{label}</button>)}</div>
  {events.length?<ol className={styles.list}>{events.map(event=><li key={event.id} className={`${styles.item} ${event.kind==='visits'?styles.visit:''}`}><time dateTime={event.date}>{recordDate(event.date)}</time><div><strong>{event.title}{event.scheduled?' · Προγραμματισμένο':''}</strong><p className={styles.muted}>{event.detail}</p>{event.kind==='visits'?<button className={styles.link} onClick={()=>onVisit(event.sessionId!)}>Άνοιγμα καταγραφής</button>:<button className={styles.link} onClick={event.kind==='measurements'?()=>onMeasurements(event.assessmentId):onTreatment}>{event.kind==='measurements'?'Σκορ και απαντήσεις':'Λεπτομέρειες θεραπείας'}</button>}</div></li>)}</ol>:<p className={styles.muted}>Δεν υπάρχουν καταγεγραμμένα γεγονότα για αυτό το φίλτρο.</p>}
  {selectedSessionId&&record.completed.some(s=>s.id===selectedSessionId)&&<div ref={viewerRef} className={styles.viewer} role="region" aria-label="Ολοκληρωμένη καταγραφή"><button className={styles.link} onClick={()=>onVisit(null)}>Κλείσιμο καταγραφής</button>{viewer}</div>}
  {selectedSessionId&&!bundle.sessions.some(s=>s.id===selectedSessionId)&&<p role="status">Η συγκεκριμένη καταγραφή δεν είναι διαθέσιμη στον φάκελο.</p>}
 </section>;
}

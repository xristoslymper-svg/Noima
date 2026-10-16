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
  <div className={styles.priorTimeline}><strong>Πριν από το NOIMA · Προηγούμενη κλινική πορεία</strong><p>{���q�^
'use client';
import {useEffect,useRef,useState} from 'react';
import {useLocale,useTranslations} from 'next-intl';
import {Plus} from 'lucide-react';
import type {PatientBundle} from '@/lib/patients/demo-runtime';
import type {Assessment} from '@/lib/clinical/core-types';
import {completedMeasurements} from '@/lib/clinical/patient-record';
import {formatClinicDate} from '@/lib/clinic-time';
import PatientPsychometrics from './PatientPsychometrics';
import HistoricalScoreForm from './HistoricalScoreForm';
import styles from './PatientMeasurements.module.css';

export default function PatientMeasurements({bundle,reload,onSaved,requested=false,selectedAssessmentId}:{bundle:PatientBundle;reload:()=>Promise<unknown>;onSaved:(measurement:Assessment)=>Promise<unknown>;requested?:boolean;selectedAssessmentId?:string|null}){
 const t=useTranslations(),locale=useLocale();
 const [editor,setEditor]=useState<Assessment|'new'|null>(null),[notice,setNotice]=useState('');
 const section=useRef<HTMLElement>(null);
 useEffect(()=>{if(requested&&!selectedAssessmentId)section.current?.scrollIntoView({block:'start'})},[requested,selectedAssessmentId]);
 const measurements=completedMeasurements(bundle);
 async function saved(value:Assessment){await onSaved(value);setNotice(t('historical.saved'))}
 return <section ref={section} className={styles.section} id="patient-measurements">
  <div className={styles.heading}><h2>{t('psychometrics.measurements')}</h2><button type="button" className={styles.action} onClick={()=>{setEditor('new');setNotice('')}}><Plus size={15}/>{t('historical.addScore')}</button></div>
  {editor&&<HistoricalScoreForm key={editor==='new'?'new':editor.id} patientId={bundle.patient.id} initial={editor==='new'?undefined:editor} onClose={()=>setEditor(null)} onSaved={saved}/>}
  {notice&&<p className={styles.notice} role="status">{notice}</p>}
  {!measurements.length?<p className={styles.muted}>{t('historical.noScores')}</p>:<div className={styles.charts}>{(['PHQ-9','GAD-7'] as const).map(instrument=>{
   const scores=measurements.filter(item=>item.instrument===instrument).toSorted((a,b)=>Date.parse(a.completed_at!)-Date.parse(b.completed_at!)||a.id.localeCompare(b.id));
   if(!scores.length)return null;
   const max=instrument==='PHQ-9'?27:21,first=Date.parse(scores[0].completed_at!),last=Date.parse(scores.at(-1)!.completed_at!);
   const x=(item:Assessment)=>last===first?175:35+280*(Date.parse(item.completed_at!)-first)/(last-first);
   const y=(item:Assessment)=>104-78*item.score!/max;
   const description=scores.map(item=>formatClinicDate(item.completed_at!,locale)+': '+item.score).join('; ');
   return <figure className={styles.chart} key={instrument}><figcaption>{instrument}</figcaption><svg viewBox="0 0 350 136" role="img" aria-label={instrument+' — '+description}>
    <line x1="35" x2="315" y1="104" y2="104" stroke="currentColor" opacity=".17"/><line x1="35" x2="315" y1="26" y2="26" stroke="currentColor" opacity=".1"/>
    <text x="24" y="108" textAnchor="end">0</text><text x="24" y="30" textAnchor="end">{max}</text>
    {scores.length>1&&<polyline points={scores.map(item=>x(item)+','+y(item)).join(' ')} fill="none" stroke="currentColor" strokeWidth="1.8"/>}
    {scores.map((item,index)=><g key={item.id}><circle cx={x(item)} cy={y(item)} r="3.5" fill="currentColor"><title>{formatClinicDate(item.completed_at!,locale)+' · '+item.score+(item.measurement_source?' · '+t('historical.source'):'')}</title></circle>{(scores.length<=6||index===0||index===scores.length-1)&&<text className={styles.score} x={x(item)} y={y(item)-10} textAnchor="middle">{item.score}</text>}</g>)}
    <text x="35" y="130">{formatClinicDate(scores[0].completed_at!,locale)}</text>{last!==first&&<text x="315" y="130" textAnchor="end">{formatClinicDate(scores.at(-1)!.completed_at!,locale)}</text>}
   </svg></figure>;
  })}</div>}
  {bundle.assessments.length>0&&<details className={styles.details} key={selectedAssessmentId||'all'} open={Boolean(selectedAssessmentId)||undefined}><summary>{t('historical.results')}</summary><PatientPsychometrics bundle={bundle} reload={reload} selectedAssessmentId={selectedAssessmentId||undefined} resultsOnly onEditHistorical={value=>setEditor(value)}/></details>}
 </section>;
}

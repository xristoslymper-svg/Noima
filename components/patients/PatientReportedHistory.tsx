'use client';
import {useLocale} from 'next-intl';

import {useTranslations} from 'next-intl';

import {useSyntheticChart} from './SyntheticChartContext';
import {useEffect,useState} from 'react';
import {getDemoTesterId} from '@/lib/demo-tester';
import {historyDraftFromAnswers} from '@/lib/intake/history';
import {normalizedPatientHistory,patientReportedHighlights,receivedPatientHistories,type ReceivedHistory} from '@/lib/intake/patient-report';



export default function PatientReportedHistory({patientId,compact=false,onOpen}:{patientId:string;compact?:boolean;onOpen?:()=>void}){
const t=useTranslations();

 const locale=useLocale();

const fields=[['psychiatric_history',t('history.psychiatric')],['medical_history',t('history.medical')],['previous_treatments',t('history.treatmentsMedication')],['hospitalizations',t('history.hospitalizations')],['family_history',t('history.family')],['substance_history',t('history.substances')],['social_functioning',t('history.social')],['allergies',t('history.allergies')]] as const;
const dateLabel=(value:string|null)=>value?new Intl.DateTimeFormat(locale,{timeZone:'Europe/Athens',day:'numeric',month:'short',year:'numeric'}).format(new Date(value)):'';

 

 const synthetic=useSyntheticChart();
 const [data,setData]=useState<ReceivedHistory[]>([]);
 const [loading,setLoading]=useState(true);
 const [error,setError]=useState(false);
 const [retry,setRetry]=useState(0);
 useEffect(()=>{
  if(synthetic){setData([]);setLoading(false);setError(false);return;}
  const controller=new AbortController();
  setLoading(true);setError(false);setData([]);
  let inFlight=false;
  let viewed=false;
  const load=async(silent=false)=>{
   if(inFlight||controller.signal.aborted)return;
   inFlight=true;
   try{
    const response=await fetch('/api/intake',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'list',tester:getDemoTesterId(),patient_id:patientId}),signal:controller.signal,cache:'no-store'});
    if(!response.ok)throw new Error('intake_list_failed');
    const result=await response.json();
    const received=receivedPatientHistories((result.intakes||[]) as ReceivedHistory[]);
    if(!controller.signal.aborted){setData(received);setError(false)}
    if(!compact&&received.length&&!viewed&&!controller.signal.aborted){
     // Passive read receipt only. Original self-report and clinician review
     // state are untouched, and no extra confirmation is shown.
     try{
      const seen=await fetch('/api/intake',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'mark_viewed',tester:getDemoTesterId(),patient_id:patientId}),signal:controller.signal});
      if(seen.ok)viewed=true;
     }catch{/* read receipt is optional; the answers remain accessible */}
    }
   }catch{if(!controller.signal.aborted&&!silent)setError(true)}
   finally{inFlight=false;if(!controller.signal.aborted&&!silent)setLoading(false)}
  };
  void load();
  // New patient answers appear without manual refresh or approval, including
  // when the doctor returns to an already open patient folder.
  const refresh=()=>{if(document.visibilityState==='visible')void load(true)};
  window.addEventListener('focus',refresh);
  const timer=window.setInterval(refresh,60_000);
  return()=>{controller.abort();window.removeEventListener('focus',refresh);window.clearInterval(timer)};
 },[patientId,retry,compact,synthetic]);
 if(loading)return compact?null:<p className="patient-reported-muted">{t('history.loadingAnswers')}</p>;
 if(error)return compact?null:<p role="alert">{t('errors.patientAnswersLoad')} <button type="button" className="patient-reported-link" onClick={()=>setRetry(x=>x+1)}>{t('common.repeat')}</button></p>;
 if(!data.length)return compact?null:<p className="patient-reported-muted">{t('history.noReturnedForm')}</p>;
 const latest=data[0], h=normalizedPatientHistory(latest.history_answers);
 const overview=patientReportedHighlights(h);
 if(compact)return <section className="patient-reported-summary" aria-label={t('history.patientHistory')}>
  <span className="kicker">{t('history.patientAnswersKicker')}</span>
  <h2>{t('history.patientCompleted')}</h2>
  <p className="patient-reported-muted">{t('history.answersFromPrefix')} {dateLabel(latest.submitted_at)}  {t('history.selfReportDisclaimer')}</p>
  {overview.length>0&&<ul>{overview.slice(0,3).map(item=><li key={item}>{item}</li>)}</ul>}
  {onOpen&&<button type="button" className="patient-reported-link" onClick={onOpen}>{t('history.allAnswersLink')}</button>}
 </section>;
 return <section className="patient-reported-section" aria-label={t('history.patientHistoryAnswers')}>
  <div><span className="kicker">{t('history.patientHistoryKicker')}</span><h2>{t('history.answersByPatient')}</h2><p className="patient-reported-muted">{t('history.answersSeparateHelp')}</p></div>
  {data.map((item,index)=>{
   const answers=normalizedPatientHistory(item.history_answers),report=historyDraftFromAnswers(answers),highlights=patientReportedHighlights(answers);
   return <article key={item.id} className="patient-reported-card">
    <div className="patient-reported-card-head"><strong>{index===0?t('history.latestHistory'):t('history.previousHistory')} · {dateLabel(item.submitted_at)}</strong><span>{item.channel==='email'?'Email':item.channel==='tablet'?'Tablet':t('psychometrics.questionnaire')}  {t('history.patientReportSuffix')}</span></div>
    {highlights.length>0&&<ul>{highlights.map(fact=><li key={fact}>{fact}</li>)}</ul>}
    <details><summary>{t('history.allAnswers')}</summary><div className="patient-reported-answers">{fields.map(([key,label])=><div key={key}><strong>{label}</strong><p>{report[key]}</p></div>)}</div></details>
   </article>;
  })}
 </section>;
}

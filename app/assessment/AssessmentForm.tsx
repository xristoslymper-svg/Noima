'use client';
import {useSystemMessage} from '@/i18n/system-message';

import {useTranslations} from 'next-intl';

import {useEffect,useState} from 'react';
import {instruments,answerLabels} from '@/lib/psychometrics/instruments';
export default function AssessmentPage(){
 const systemMessage=useSystemMessage();

 const t=useTranslations();

 const [token,setToken]=useState(''),[instrument,setInstrument]=useState<keyof typeof instruments|null>(null),[answers,setAnswers]=useState<Record<number,number>>({}),[done,setDone]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState('');
 useEffect(()=>{const t=location.hash.slice(1);setToken(t);try{const a=sessionStorage.getItem('assessment:'+t);if(a)setAnswers(JSON.parse(a))}catch{};void call({action:'open',token:t}).then(d=>{if(d.status==='completed')setDone(true);else if(d.instrument in instruments)setInstrument(d.instrument)}).catch(e=>setError(e.message))},[]);
 async function call(body:Record<string,unknown>){const r=await fetch('/api/psychometrics',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});const d=await r.json();if(!r.ok)throw new Error(d.error);return d}
 async function submit(){if(!instrument)return;setBusy(true);setError('');try{await call({action:'submit',token,answers:instruments[instrument].items.map((_,i)=>answers[i])});setDone(true);try{sessionStorage.removeItem('assessment:'+token)}catch{}}catch(e){setError(e instanceof Error?e.message:t('errors.assessmentSubmitFailed'))}finally{setBusy(false)}}
 return <main className="assessment-page"><h1>Ψ-space · {instrument||t('psychometrics.questionnaire')}</h1>{done?<p role="status">{t('psychometrics.submissionReceived')}</p>:instrument?<><p>{t('psychometrics.twoWeeksQuestion')}</p><p>{t('psychometrics.originalInstrumentLanguage')}</p><p>{t('psychometrics.syntheticDisclaimer')}</p>{instruments[instrument].items.map((q,i)=><fieldset lang="el" key={i} disabled={busy}><legend>{i+1}. {q}</legend>{answerLabels.map((label,n)=><label key={n}><input type="radio" name={'q'+i} checked={answers[i]===n} onChange={()=>{const next={...answers,[i]:n};setAnswers(next);try{sessionStorage.setItem('assessment:'+token,JSON.stringify(next))}catch{}}}/>{label}</label>)}</fieldset>)}<button disabled={busy||Object.keys(answers).length!==instruments[instrument].items.length} onClick={()=>void submit()}>{busy?t('common.submitting'):t('psychometrics.submitAnswers')}</button></>:!error?<p>{t('common.loading')}</p>:null}{error&&<p role="alert">{systemMessage(error)}</p>}</main>
}

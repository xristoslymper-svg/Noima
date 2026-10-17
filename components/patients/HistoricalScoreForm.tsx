'use client';
import {useEffect,useRef,useState} from 'react';
import {useTranslations} from 'next-intl';
import {X} from 'lucide-react';
import {getDemoTesterId} from '@/lib/demo-tester';
import {readRecovery,writeRecovery} from '@/lib/clinical/browser-recovery';
import {clinicalToday,validAdministrationDate,validHistoricalScore} from '@/lib/clinical/historical-measurements';
import type {Assessment} from '@/lib/clinical/core-types';
import styles from './HistoricalScoreForm.module.css';

type Draft={instrument:'PHQ-9'|'GAD-7';score:string;date:string;note:string;reason:string;requestId:string};
export default function HistoricalScoreForm({patientId,onClose,onSaved,initial,defaultInstrument='PHQ-9'}:{patientId:string;onClose:()=>void;onSaved:(measurement:Assessment)=>Promise<unknown>;initial?:Assessment;defaultInstrument?:'PHQ-9'|'GAD-7'}){
 const t=useTranslations();
 const empty=():Draft=>({instrument:initial?.instrument||defaultInstrument,score:initial?.score==null?'':String(initial.score),date:initial?.administered_on||'',note:initial?.note||'',reason:'',requestId:''});
 const [draft,setDraft]=useState<Draft>(empty),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const form=useRef<HTMLFormElement>(null),flight=useRef(false),key=useRef(''),current=useRef(draft),mounted=useRef(true);
 current.current=draft;
 useEffect(()=>{
  mounted.current=true;
  const opener=document.activeElement;
  key.current=['noima',getDemoTesterId(),patientId,'historical-score',initial?.id||'new'].join(':');
  try{
   const saved=readRecovery(sessionStorage,key.current);
   if(saved){const value=JSON.parse(saved);if(value&&['PHQ-9','GAD-7'].includes(value.instrument)&&['score','date','note','reason','requestId'].every(k=>typeof value[k]==='string')){current.current=value;setDraft(value)}}
  }catch{/* An unavailable session store never prevents manual entry. */}
  form.current?.querySelector<HTMLElement>(initial?'input[name="score"]':'select')?.focus();
  return()=>{mounted.current=false;if(opener instanceof HTMLElement&&opener.isConnected)opener.focus({preventScroll:true})};
 },[patientId,initial?.id]);
 function change(patch:Partial<Draft>){
  const next={...current.current,...patch};current.current=next;setDraft(next);setError('');
  try{writeRecovery(sessionStorage,key.current,JSON.stringify(next))}catch{/* Keep the in-memory form. */}
 }
 async function save(){
  if(flight.current)return;
  const score=Number(current.current.score),value=current.current;
  if(!value.score.trim()||!validHistoricalScore(value.instrument,score)||!validAdministrationDate(value.date)||initial&&!value.reason.trim()){setError(t('historical.invalid'));return}
  flight.current=true;setBusy(true);setError('');
  const requestId=value.requestId||crypto.randomUUID();change({requestId});
  try{
   const response=await fetch('/api/patients/demo/measurements',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({tester:getDemoTesterId(),patient_id:patientId,request_id:requestId,instrument:value.instrument,score,administered_on:value.date,note:value.note,supersedes_id:initial?.id,reason:value.reason})});
   const result=await response.json().catch(()=>({}));
   if(!response.ok)throw new Error(result.code==='measurement_unavailable'?t('historical.unavailable'):result.code==='measurement_conflict'?t('historical.conflict'):result.code==='invalid_measurement'?t('historical.invalid'):t('historical.saveFailed'));
   if(!result.measurement||result.measurement.patient_id!==patientId||result.measurement.id!==requestId)throw new Error(t('historical.saveFailed'));
   try{sessionStorage.removeItem(key.current);sessionStorage.removeItem(key.current+':expires')}catch{/* Saved canonical data takes precedence. */}
   await onSaved(result.measurement);
   if(mounted.current)onClose();
  }catch(cause){if(mounted.current)setError(cause instanceof Error?cause.message:t('historical.saveFailed'))}
  finally{flight.current=false;if(mounted.current)setBusy(false)}
 }
 return <form ref={form} className={styles.form} onSubmit={event=>{event.preventDefault();void save()}} onKeyDown={event=>{if(event.key==='Escape'&&!busy){event.preventDefault();event.stopPropagation();onClose()}}} aria-label={initial?t('historical.correctScore'):t('historical.addScore')}>
  <div className={styles.head}><h3>{initial?t('historical.correctScore'):t('historical.score')}</h3><button className={styles.close} type="button" disabled={busy} onClick={onClose} aria-label={t('common.close')}><X size={17}/></button></div>
  <div className={styles.fields}>
   <label>{t('historical.instrument')}<select value={draft.instrument} disabled={busy||Boolean(initial)} onChange={event=>change({instrument:event.target.value as Draft['instrument']})}><option>PHQ-9</option><option>GAD-7</option></select></label>
   <label>{t('historical.score')}<input name="score" type="number" inputMode="numeric" required min={0} max={draft.instrument==='PHQ-9'?27:21} step={1} value={draft.score} disabled={busy} onChange={event=>change({score:event.target.value})}/></label>
   <label>{t('historical.administeredOn')}<input type="date" required min="1900-01-01" max={clinicalToday()} value={draft.date} disabled={busy} onChange={event=>change({date:event.target.value})}/></label>
  </div>
  {initial&&<label className={styles.correction}>{t('historical.correctionReason')}<input required maxLength={500} value={draft.reason} disabled={busy} onChange={event=>change({reason:event.target.value})}/></label>}
  <details><summary>{t('historical.optionalNote')}</summary><label><span className="sr-only">{t('historical.note')}</span><textarea rows={2} maxLength={2000} value={draft.note} disabled={busy} onChange={event=>change({note:event.target.value})}/></label></details>
  <div className={styles.actions}><button className={styles.save} disabled={busy} type="submit">{busy?t('common.saving'):t('common.save')}</button></div>
  {error&&<p className={styles.error} role="alert">{error}</p>}
 </form>;
}

'use client';
import {useTranslations} from 'next-intl';

import {useEffect,useId,useState} from 'react';
import type {DiagnosisCode} from '@/lib/clinical/visit-document';
export default function ICD10Picker({value,onChange,showValues=true}:{value:DiagnosisCode[];onChange:(codes:DiagnosisCode[])=>void;showValues?:boolean}){
 const t=useTranslations();

 const [query,setQuery]=useState(''),[results,setResults]=useState<DiagnosisCode[]>([]),[error,setError]=useState(''),[busy,setBusy]=useState(false);const id=useId();
 useEffect(()=>{const c=new AbortController();setResults([]);setError('');if(query.trim().length<2){setBusy(false);return}setBusy(true);const timer=setTimeout(()=>{void fetch('/api/clinical/icd10?q='+encodeURIComponent(query.trim()),{signal:c.signal}).then(async r=>{const d=await r.json();if(!r.ok)throw new Error(d.error);setResults(d.results)}).catch(e=>{if(!c.signal.aborted)setError(e.message)}).finally(()=>{if(!c.signal.aborted)setBusy(false)})},350);return()=>{clearTimeout(timer);c.abort()}},[query]);
 return <div className="visit-code-picker">{showValues&&<div className="visit-code-values">{value.map(c=><span key={c.code}><strong>{c.code}</strong> {c.label}<button type="button" aria-label={t('common.removePrefix')+c.code} onClick={()=>onChange(value.filter(x=>x.code!==c.code))}>×</button></span>)}</div>}<label htmlFor={id}>WHO ICD-10 · 2019<input id={id} value={query} onChange={e=>setQuery(e.target.value)} placeholder={t('clinical.icdSearchPlaceholder')} autoComplete="off" aria-describedby={id+'-status'}/></label><small id={id+'-status'} role="status">{busy?t('clinical.icdSearching'):error|| (query.length>1&&!results.length?t('common.noResults'):t('clinical.icdSource'))}</small>{results.length>0&&<ul aria-label={t('accessibility.icdResults')}>{results.map(c=><li key={c.code}><button type="button" disabled={value.some(x=>x.code===c.code)} onClick={()=>{onChange([...value,c]);setQuery('');setResults([])}}><strong>{c.code}</strong> {c.label}</button></li>)}</ul>}</div>;
}

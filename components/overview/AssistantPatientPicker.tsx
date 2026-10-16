'use client';
import {useEffect,useId,useRef,useState} from 'react';
import {Search} from 'lucide-react';
import {useTranslations} from 'next-intl';
import {getDemoTesterId} from '@/lib/demo-tester';
import type {SearchPatient} from '@/lib/overview/record-search';
import styles from './AssistantPatientPicker.module.css';

type Props={
 selected:SearchPatient|null;
 fallbackLabel:string;
 disabled?:boolean;
 onChoose:(patient:SearchPatient)=>void;
};
const label=(patient:SearchPatient|null)=>patient?(patient.first_name+' '+patient.last_name).trim():'';
export default function AssistantPatientPicker({selected,fallbackLabel,disabled=false,onChoose}:Props){
 const t=useTranslations();
 const id=useId();
 const root=useRef<HTMLDivElement|null>(null);
 const input=useRef<HTMLInputElement|null>(null);
 const [query,setQuery]=useState(()=>label(selected));
 const [open,setOpen]=useState(false);
 const [results,setResults]=useState<SearchPatient[]>([]);
 const [active,setActive]=useState(0);
 const [status,setStatus]=useState<'idle'|'loading'|'empty'|'error'>('idle');
 const ready=query.trim().replace(/\s/g,'').length>=2;
 useEffect(()=>{setQuery(label(selected));setOpen(false);setResults([])},[selected?.id,selected?.first_name,selected?.last_name]);
 useEffect(()=>{
  if(!open)return;
  const outside=(event:PointerEvent)=>{
   if(root.current&&!root.current.contains(event.target as Node)){
    setOpen(false);setQuery(label(selected));
   }
  };
  const escape=(event:KeyboardEvent)=>{
   if(event.key==='Escape'){setOpen(false);setQuery(label(selected));event.stopPropagation()}
  };
  document.addEventListener('pointerdown',outside);
  document.addEventListener('keydown',escape);
  return()=>{document.removeEventListener('pointerdown',outside);document.removeEventListener('keydown',escape)};
 },[open,selected]);
 useEffect(()=>{
  if(!open||!ready){setResults([]);setStatus('idle');return;}
  const controller=new AbortController();
  const timer=setTimeout(async()=>{
   setStatus('loading');
   try{
    const params=new URLSearchParams({q:query.trim(),tester:getDemoTesterId()});
    const response=await fetch('/api/records/search?'+params,{signal:controller.signal,cache:'no-store'});
    if(!response.ok)throw Error('search unavailable');
    const payload=await response.json() as {patients?:SearchPatient[]};
    if(controller.signal.aborted)return;
    const matches=Array.isArray(payload.patients)?payload.patients.slice(0,8):[];
    setResults(matches);setActive(0);setStatus(matches.length?'idle':'empty');
   }catch{if(!controller.signal.aborted){setResults([]);setStatus('error')}}
  },250);
  return()=>{clearTimeout(timer);controller.abort()};
 },[query,ready,open]);
 function choose(patient:SearchPatient){
  onChoose(patient);setOpen(false);setQuery(label(patient));setResults([]);setStatus('idle');
 }
 return <div className={styles.root} ref={root} onKeyDown={event=>{
   if(event.key==='Escape'&&open){event.stopPropagation();setOpen(false);setQuery(label(selected))}
  }}>
  <div className={styles.searchField}>
   <span className={styles.dot} aria-hidden="true"/>
   <input ref={input} type="search" autoComplete="off" maxLength={100} disabled={disabled}
    value={query} aria-label={t('patients.searchPatient')} placeholder={fallbackLabel}
    className={styles.input} role="combobox" aria-autocomplete="list"
    aria-expanded={open&&ready} aria-controls={open&&ready?id+'-list':undefined}
    aria-activedescendant={open&&ready&&results.length?id+'-option-'+active:undefined}
    onFocus={event=>{event.currentTarget.select();setOpen(false)}}
    onChange={event=>{setQuery(event.target.value);setActive(0);setResults([]);setOpen(true)}}
    onKeyDown={event=>{
     if(!open||!ready||!results.length)return;
     if(event.key==='ArrowDown'){event.preventDefault();setActive(i=>(i+1)%results.length)}
     else if(event.key==='ArrowUp'){event.preventDefault();setActive(i=>(i+results.length-1)%results.length)}
     else if(event.key==='Enter'){event.preventDefault();choose(results[active])}
    }}
   />
   <Search size={16} className={styles.searchIcon} aria-hidden="true"/>
  </div>
  {open&&ready&&<div className={styles.results} role="listbox" id={id+'-list'} aria-label={t('patients.searchPatient')}>
   {results.map((patient,i)=><button type="button" role="option" aria-selected={i===active}
    className={i===active?styles.active:styles.option} key={patient.id} id={id+'-option-'+i}
    onMouseEnter={()=>setActive(i)} onClick={()=>choose(patient)}>
    {patient.first_name} {patient.last_name}
   </button>)}
   {status==='loading'&&<p role="status">{t('common.searching')}</p>}
   {status==='empty'&&<p role="status">{t('patients.noPatientFound')}</p>}
   {status==='error'&&<p role="status">{t('errors.patientSearchUnavailable')}</p>}
  </div>}
 </div>;
}

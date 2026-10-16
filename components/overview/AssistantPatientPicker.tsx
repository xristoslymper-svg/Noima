'use client';
import {useEffect,useId,useRef,useState} from 'react';
import {ChevronDown,Search} from 'lucide-react';
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
export default function AssistantPatientPicker({selected,fallbackLabel,disabled=false,onChoose}:Props){
 const t=useTranslations();
 const id=useId();
 const root=useRef<HTMLDivElement|null>(null),input=useRef<HTMLInputElement|null>(null);
 const [open,setOpen]=useState(false),[query,setQuery]=useState(''),[results,setResults]=useState<SearchPatient[]>([]),[active,setActive]=useState(0),[state,setState]=useState<'idle'|'loading'|'empty'|'error'>('idle');
 const ready=query.trim().length>=2;
 useEffect(()=>{
  if(!open)return;
  const dismiss=(event:PointerEvent)=>{if(root.current&&!root.current.contains(event.target as Node))setOpen(false)};
  const escape=(event:KeyboardEvent)=>{if(event.key==='Escape'){setOpen(false);event.stopPropagation();}};
  document.addEventListener('pointerdown',dismiss);document.addEventListener('keydown',escape);
  return()=>{document.removeEventListener('pointerdown',dismiss);document.removeEventListener('keydown',escape)};
 },[open]);
 useEffect(()=>{
  if(!open||!ready){setResults([]);setState('idle');return}
  const controller=new AbortController();
  const timer=setTimeout(async()=>{
   setState('loading');
   try{
    const params=new URLSearchParams({q:query.trim(),tester:getDemoTesterId()});
    const response=await fetch('/api/records/search?'+params,{signal:controller.signal,cache:'no-store'});
    if(!response.ok)throw Error('unavailable');
    const data=await response.json() as {patients?:SearchPatient[]};
    if(controller.signal.aborted)return;
    const choices=Array.isArray(data.patients)?data.patients.slice(0,8):[];
    setResults(choices);setActive(0);setState(choices.length?'idle':'empty');
   }catch{if(!controller.signal.aborted){setResults([]);setState('error')}}
  },250);
  return()=>{clearTimeout(timer);controller.abort()};
 },[query,ready,open]);
 function choose(p:SearchPatient){onChoose(p);setOpen(false);setQuery('');setResults([]);setState('idle')}
 return <div className={styles.root} ref={root} onKeyDown={event=>{if(event.key==='Escape'&&open){event.stopPropagation();setOpen(false)}}}>
  <button type="button" className={styles.trigger} disabled={disabled} aria-expanded={open} aria-controls={open?id:undefined}
   onClick={()=>{setOpen(old=>!old);if(!open)requestAnimationFrame(()=>input.current?.focus())}}>
   <span className={styles.dot} aria-hidden="true"/>
   <span className={styles.name}>{selected?selected.first_name+' '+selected.last_name:fallbackLabel}</span>
   <ChevronDown size={15} aria-hidden="true" className={styles.chevron}/>
  </button>
  {open&&<div className={styles.popup} id={id}>
   <div className={styles.inputWrap}><Search size={15} aria-hidden="true"/>
    <input ref={input} type="search" autoComplete="off" value={query} maxLength={100}
     aria-label={t('patients.searchPatient')} placeholder={t('patients.searchSinglePlaceholder')}
     role="combobox" aria-expanded={ready&&results.length>0} aria-controls={id+'-list'}
     aria-activedescendant={ready&&results.length?id+'-option-'+active:undefined}
     onChange={event=>{setQuery(event.target.value);setActive(0);setResults([])}}
     onKeyDown={event=>{
      if(!results.length)return;
      if(event.key==='ArrowDown'){event.preventDefault();setActive(i=>(i+1)%results.length)}
      if(event.key==='ArrowUp'){event.preventDefault();setActive(i=>(i+results.length-1)%results.length)}
      if(event.key==='Enter'){event.preventDefault();choose(results[active])}
     }}
    />
   </div>
   <div className={styles.results} role="listbox" id={id+'-list'} aria-label={t('patients.searchPatient')}>
    {results.map((p,i)=><button type="button" id={id+'-option-'+i} role="option" aria-selected={i===active}
      key={p.id} onMouseEnter={()=>setActive(i)} className={i===active?styles.active:styles.option} onClick={()=>choose(p)}>
      {p.first_name} {p.last_name}
     </button>)}
    {state==='loading'&&<p role="status">{t('common.searching')}</p>}
    {state==='empty'&&<p role="status">{t('patients.noPatientFound')}</p>}
    {state==='error'&&<p role="status">{t('errors.patientSearchUnavailable')}</p>}
    {!ready&&<p>{t('patients.searchSinglePlaceholder')}</p>}
   </div>
  </div>}
 </div>;
}

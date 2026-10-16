'use client';
import {useEffect,useId,useMemo,useRef,useState} from 'react';
import Link from 'next/link';
import {Search} from 'lucide-react';
import {useTranslations} from 'next-intl';
import {suggestedPatients,type SearchablePatient} from '@/lib/calendar/patient-search';
import styles from './CalendarPatientSearch.module.css';

export default function CalendarPatientSearch({patients}:{patients:readonly SearchablePatient[]}){
 const t=useTranslations();
 const listId=useId();
 const root=useRef<HTMLDivElement|null>(null);
 const [value,setValue]=useState('');
 const [open,setOpen]=useState(false);
 const [active,setActive]=useState(0);
 const matches=useMemo(()=>suggestedPatients(patients,value),[patients,value]);
 const ready=value.trim().replace(/\s/g,'').length>=2;
 const visible=ready&&open;
 useEffect(()=>{
  if(!open)return;
  const outside=(event:PointerEvent)=>{if(root.current&&!root.current.contains(event.target as Node))setOpen(false)};
  const escape=(event:KeyboardEvent)=>{if(event.key==='Escape')setOpen(false)};
  document.addEventListener('pointerdown',outside);
  document.addEventListener('keydown',escape);
  return()=>{document.removeEventListener('pointerdown',outside);document.removeEventListener('keydown',escape)};
 },[open]);
 return <div className={styles.root} ref={root}>
  <Search aria-hidden="true" className={styles.icon} size={17}/>
  <input type="search" autoComplete="off" value={value}
   placeholder={t('patients.searchSinglePlaceholder')} aria-label={t('patients.search')}
   role="combobox" aria-autocomplete="list" aria-expanded={visible}
   aria-controls={visible?listId:undefined}
   aria-activedescendant={visible&&matches.length?`${listId}-option-${active}`:undefined}
   className={styles.input}
   onFocus={()=>{if(ready)setOpen(true)}}
   onChange={event=>{setValue(event.target.value);setActive(0);setOpen(true)}}
   onKeyDown={event=>{
    if(!visible||matches.length===0)return;
    if(event.key==='ArrowDown'){event.preventDefault();setActive(i=>(i+1)%matches.length)}
    else if(event.key==='ArrowUp'){event.preventDefault();setActive(i=>(i+matches.length-1)%matches.length)}
    else if(event.key==='Enter'){event.preventDefault();window.location.assign('/patients/demo/'+encodeURIComponent(matches[active].id))}
   }}
  />
  {visible&&<div id={listId} className={styles.results} role="listbox" aria-label={t('patients.search')}>
   {matches.length?matches.map((patient,index)=><Link
      id={`${listId}-option-${index}`}
      href={'/patients/demo/'+encodeURIComponent(patient.id)}
      key={patient.id} role="option" aria-selected={index===active}
      className={index===active?styles.active:styles.option}
      onMouseEnter={()=>setActive(index)}
      onClick={()=>setOpen(false)}>
      {patient.first_name} {patient.last_name}
     </Link>):<p className={styles.empty} role="status">{t('patients.noPatientFound')}</p>}
  </div>}
 </div>;
}

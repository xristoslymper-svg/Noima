'use client';
import {useTranslations} from 'next-intl';
import {useEffect,useRef,useState} from 'react';
import Link from 'next/link';
import {CalendarDays,ChevronDown,PanelsTopLeft} from 'lucide-react';
import styles from './CalendarConnectionMenu.module.css';
export default function CalendarConnectionMenu(){
 const t=useTranslations();

 const [open,setOpen]=useState(false);const root=useRef<HTMLDivElement>(null),trigger=useRef<HTMLButtonElement>(null);
 useEffect(()=>{
  if(!open)return;
  const outside=(event:PointerEvent)=>{if(!root.current?.contains(event.target as Node))setOpen(false)};
  const escape=(event:KeyboardEvent)=>{if(event.key==='Escape'){setOpen(false);trigger.current?.focus()}};
  document.addEventListener('pointerdown',outside);document.addEventListener('keydown',escape);
  return()=>{document.removeEventListener('pointerdown',outside);document.removeEventListener('keydown',escape)};
 },[open]);
 return <div ref={root} className={styles.root}><button ref={trigger} type="button" className={styles.trigger} aria-expanded={open} aria-controls="calendar-provider-options" onClick={()=>setOpen(value=>!value)}><CalendarDays size={16} aria-hidden="true"/><span>{t('current.m184')}</span><ChevronDown size={14} aria-hidden="true"/></button>{open&&<div id="calendar-provider-options" className={styles.options}><Link href="/calendar/google-preview" onClick={()=>setOpen(false)}><CalendarDays size={18} aria-hidden="true"/><span><strong>Google Calendar</strong><small>{t('current.m185')}</small></span></Link><button type="button" disabled><PanelsTopLeft size={18} aria-hidden="true"/><span><strong>Outlook / Hotmail</strong><small>{t('current.m186')}</small></span></button><p>{t('current.m187')}</p></div>}</div>
}

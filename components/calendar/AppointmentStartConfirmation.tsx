'use client';
import {useLocale} from 'next-intl';

import {useTranslations} from 'next-intl';

import {useEffect,useRef} from 'react';
import {formatClinicDateTime} from '@/lib/clinic-time';

export default function AppointmentStartConfirmation({scheduledStart,onCancel,onConfirm}:{scheduledStart:string;onCancel:()=>void;onConfirm:()=>void}){
const t=useTranslations();

 const locale=useLocale();

 

 const dialog=useRef<HTMLDialogElement>(null);
 useEffect(()=>{dialog.current?.showModal()},[]);
 return <dialog ref={dialog} className="entry-modal appointment-start-confirm" aria-labelledby="appointment-start-title" aria-describedby="appointment-start-description" onKeyDown={e=>{if(e.key==='Escape')e.stopPropagation()}} onCancel={e=>{e.preventDefault();onCancel()}}>
  <span className="kicker">{t('visits.visitDateKicker')}</span>
  <h2 id="appointment-start-title">{t('visits.startTodayQuestion')}</h2>
  <p id="appointment-start-description">{t('calendar.appointmentAtPrefix')} <strong>{formatClinicDateTime(scheduledStart, locale)}</strong>  {t('calendar.athensTimeParenthetical')}</p>
  <p>{t('visits.startTodayHelp')}</p>
  <footer className="entry-footer"><button autoFocus onClick={onCancel}>{t('common.cancel')}</button><button className="entry-primary" onClick={onConfirm}>{t('visits.startToday')}</button></footer>
 </dialog>;
}

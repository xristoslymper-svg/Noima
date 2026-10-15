'use client';
import {useLocale} from 'next-intl';

import {useTranslations} from 'next-intl';

import {useRef} from 'react';
import {CalendarDays,ChevronDown,ChevronLeft,ChevronRight,Filter,RefreshCw} from 'lucide-react';
import styles from './MobileClinical.module.css';

type Day={key:string;day:string;date:string};
type Props={date:string;today:string;days:Day[];view:'day'|'week';filter:string;onDate:(value:string)=>void;onPrevious:()=>void;onNext:()=>void;onView:(value:'day'|'week')=>void;onFilter:(value:string)=>void;onRefresh:()=>void;onNew:()=>void};
export default function MobileCalendarControls(p:Props){
const t=useTranslations();

 const locale=useLocale();

 

 const menu=useRef<HTMLDetailsElement>(null);
 const title=new Intl.DateTimeFormat(locale,{timeZone:'Europe/Athens',weekday:'short',day:'numeric',month:'short'}).format(new Date(p.date+'T12:00:00Z'));
 return <div className={styles.calendarControls}>
  <div className={styles.calendarDateRow}>
   <button type="button" aria-label={t('accessibility.previousDate')} onClick={p.onPrevious}><ChevronLeft size={20}/></button>
   <button type="button" className={styles.calendarNewAppointment} onClick={p.onNew}>{t('calendar.addAppointment')}</button>
   <button type="button" aria-label={t('accessibility.nextDate')} onClick={p.onNext}><ChevronRight size={20}/></button>
  </div>
  <div className={styles.calendarViewRow}>
   <div role="group" aria-label={t('accessibility.calendarView')}><button type="button" aria-pressed={p.view==='day'} onClick={()=>p.onView('day')}>{t('calendar.day')}</button><button type="button" aria-pressed={p.view==='week'} onClick={()=>p.onView('week')}>{t('calendar.week')}</button></div>
   <details ref={menu} className={styles.calendarOptions}>
    <summary aria-label={t('accessibility.calendarDateFilters')} title={title}><CalendarDays size={17}/>{p.filter!=='all'&&<Filter size={14} aria-label={t('accessibility.activeFilter')}/>}<ChevronDown size={14}/></summary>
    <div className={styles.calendarOptionsPanel}>
     <label>{t('calendar.goToDate')}<input aria-label={t('calendar.goToDate')} type="date" value={p.date} onInput={e=>{if(e.currentTarget.value)p.onDate(e.currentTarget.value)}}/></label>
     <label>{t('calendar.appointmentStatus')}<select aria-label={t('calendar.appointmentStatus')} value={p.filter} onChange={e=>p.onFilter(e.currentTarget.value)}>
      <option value="current">{t('calendar.currentFilter')}</option><option value="scheduled">{t('calendar.scheduledFilter')}</option><option value="completed">{t('calendar.completedFilter')}</option><option value="cancelled">{t('calendar.cancelledFilter')}</option><option value="all">{t('calendar.allFilter')}</option>
     </select></label>
     <div><button type="button" onClick={()=>{p.onDate(p.today);if(menu.current)menu.current.open=false}}>{t('calendar.today')}</button><button type="button" aria-label={t('accessibility.refreshCalendar')} onClick={p.onRefresh}><RefreshCw size={16}/>{t('common.refresh')}</button><button type="button" aria-label={t('accessibility.closeCalendarSettings')} onClick={()=>{if(menu.current)menu.current.open=false}}>{t('common.done')}</button></div>
    </div>
   </details>
   {p.date!==p.today&&<button type="button" onClick={()=>p.onDate(p.today)}>{t('calendar.today')}</button>}
  </div>
  {p.view==='day'&&<div className={styles.calendarDayStrip} role="group" aria-label={t('accessibility.calendarDays')}>{p.days.map(day=><button type="button" key={day.key} aria-label={day.day+' '+day.date} aria-pressed={day.key===p.date} onClick={()=>{if(day.key===p.date&&menu.current)menu.current.open=!menu.current.open;else p.onDate(day.key)}}><span>{day.day}</span><strong>{Number(day.key.slice(-2))}</strong></button>)}</div>}
 </div>;
}

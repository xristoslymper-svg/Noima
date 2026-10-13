'use client';
import {useRef} from 'react';
import {CalendarDays,ChevronDown,ChevronLeft,ChevronRight,Filter,RefreshCw} from 'lucide-react';
import styles from './MobileClinical.module.css';

type Day={key:string;day:string;date:string};
type Props={date:string;today:string;days:Day[];view:'day'|'week';filter:string;onDate:(value:string)=>void;onPrevious:()=>void;onNext:()=>void;onView:(value:'day'|'week')=>void;onFilter:(value:string)=>void;onRefresh:()=>void;onNew:()=>void};
export default function MobileCalendarControls(p:Props){
 const menu=useRef<HTMLDetailsElement>(null);
 const title=new Intl.DateTimeFormat('el-GR',{weekday:'short',day:'numeric',month:'short'}).format(new Date(p.date+'T12:00:00Z'));
 return <div className={styles.calendarControls}>
  <div className={styles.calendarDateRow}>
   <button type="button" aria-label="Προηγούμενη ημερομηνία" onClick={p.onPrevious}><ChevronLeft size={20}/></button>
   <button type="button" className={styles.calendarNewAppointment} onClick={p.onNew}>+ Νέο ραντεβού</button>
   <button type="button" aria-label="Επόμενη ημερομηνία" onClick={p.onNext}><ChevronRight size={20}/></button>
  </div>
  <div className={styles.calendarViewRow}>
   <div role="group" aria-label="Προβολή ημερολογίου"><button type="button" aria-pressed={p.view==='day'} onClick={()=>p.onView('day')}>Ημέρα</button><button type="button" aria-pressed={p.view==='week'} onClick={()=>p.onView('week')}>Εβδομάδα</button></div>
   <details ref={menu} className={styles.calendarOptions}>
    <summary aria-label="Επιλογή ημερομηνίας και φίλτρων" title={title}><CalendarDays size={17}/>{p.filter!=='all'&&<Filter size={14} aria-label="Ενεργό φίλτρο"/>}<ChevronDown size={14}/></summary>
    <div className={styles.calendarOptionsPanel}>
     <label>Μετάβαση σε ημερομηνία<input aria-label="Μετάβαση σε ημερομηνία" type="date" value={p.date} onInput={e=>{if(e.currentTarget.value)p.onDate(e.currentTarget.value)}}/></label>
     <label>Κατάσταση ραντεβού<select aria-label="Κατάσταση ραντεβού" value={p.filter} onChange={e=>p.onFilter(e.currentTarget.value)}>
      <option value="current">Πρόγραμμα & ολοκληρωμένα</option><option value="scheduled">Προγραμματισμένα</option><option value="completed">Ολοκληρωμένα</option><option value="cancelled">Ακυρωμένα</option><option value="all">Όλα τα ραντεβού</option>
     </select></label>
     <div><button type="button" onClick={()=>{p.onDate(p.today);if(menu.current)menu.current.open=false}}>Σήμερα</button><button type="button" aria-label="Ανανέωση ημερολογίου" onClick={p.onRefresh}><RefreshCw size={16}/>Ανανέωση</button><button type="button" aria-label="Κλείσιμο ρυθμίσεων ημερολογίου" onClick={()=>{if(menu.current)menu.current.open=false}}>Έτοιμο</button></div>
    </div>
   </details>
   {p.date!==p.today&&<button type="button" onClick={()=>p.onDate(p.today)}>Σήμερα</button>}
  </div>
  {p.view==='day'&&<div className={styles.calendarDayStrip} role="group" aria-label="Ημέρες ημερολογίου">{p.days.map(day=><button type="button" key={day.key} aria-label={day.day+' '+day.date} aria-pressed={day.key===p.date} onClick={()=>{if(day.key===p.date&&menu.current)menu.current.open=!menu.current.open;else p.onDate(day.key)}}><span>{day.day}</span><strong>{Number(day.key.slice(-2))}</strong></button>)}</div>}
 </div>;
}

'use client';
import {useEffect,useId,useMemo,useRef,useState} from 'react';
import {CalendarDays,CalendarPlus} from 'lucide-react';
import {getDemoTesterId} from '@/lib/demo-tester';
import {clinicLocalToIso,formatClinicAppointment} from '@/lib/clinic-time';
import type {PatientBundle} from '@/lib/patients/demo-runtime';
import {upcomingAppointments} from '@/lib/clinical/patient-record';
import styles from './VisitNextAppointment.module.css';
export default function VisitNextAppointment({bundle,reload,registerFlusher,onDirtyChange,showHeading=true}:{bundle:PatientBundle;reload:()=>Promise<unknown>;registerFlusher:(k:string,f:()=>Promise<void>)=>(()=>void);onDirtyChange:(k:string,d:boolean)=>void;showHeading?:boolean}){
 const [date,setDate]=useState(''),[time,setTime]=useState('09:00'),[duration,setDuration]=useState('50'),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const [smsReminder,setSmsReminder]=useState(true);
 const [expanded,setExpanded]=useState(false),[notice,setNotice]=useState('');
 const formId=useId(),dateRef=useRef<HTMLInputElement>(null),triggerRef=useRef<HTMLButtonElement>(null);
 const appointments=upcomingAppointments(bundle),next=appointments[0];
 const formOpen=expanded||Boolean(date)||busy;
 const saveRef=useRef(false);
 const mobile=bundle.patient.phone?.replace(/[^+0-9]/g,'')||'';
 const hasMobile=/^(\+30|0030)?69\d{8}$/.test(mobile);
 const quickDates=useMemo(()=>[2,3,4].map(weeks=>{const d=new Date();d.setDate(d.getDate()+weeks*7);return{weeks,value:new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Athens',year:'numeric',month:'2-digit',day:'2-digit'}).format(d)}}),[]);
 useEffect(()=>{onDirtyChange('appointment',Boolean(date));return()=>onDirtyChange('appointment',false)},[date,onDirtyChange]);
 useEffect(()=>registerFlusher('appointment',async()=>{if(date||busy){
  setExpanded(true);
  dateRef.current?.scrollIntoView({block:'center'});
  dateRef.current?.focus({preventScroll:true});
  throw new Error('Αποθηκεύστε ή ακυρώστε το επόμενο ραντεβού πριν ολοκληρώσετε.');
 }}),[registerFlusher,date,busy]);
 useEffect(()=>{if(expanded)dateRef.current?.focus();else if(notice)triggerRef.current?.focus()},[expanded,notice]);
 async function save(){if(saveRef.current)return;saveRef.current=true;setBusy(true);setError('');setNotice('');let committed=false;try{const start=clinicLocalToIso(date,time);const r=await fetch('/api/calendar/command/apply',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({tester:getDemoTesterId(),action:'create',patient_id:bundle.patient.id,start_iso:start,end_iso:new Date(Date.parse(start)+Number(duration)*60000).toISOString(),appointment_type:'follow_up',sms_reminder_enabled:smsReminder&&hasMobile})});const d=await r.json();if(!r.ok)throw new Error(d.error);committed=true;setDate('');try{const refreshed=await reload();if(!refreshed)setError('Το ραντεβού αποθηκεύτηκε, αλλά η προβολή δεν ανανεώθηκε. Ανανεώστε τον φάκελο.');else{setExpanded(false);setNotice('Το ραντεβού αποθηκεύτηκε.')}}catch{setError('Το ραντεβού αποθηκεύτηκε, αλλά η προβολή δεν ανανεώθηκε. Ανανεώστε τον φάκελο.')}}catch(e){setError(committed?'Το ραντεβού αποθηκεύτηκε, αλλά η προβολή δεν ανανεώθηκε. Ανανεώστε τον φάκελο.':e instanceof Error?e.message:'Δεν αποθηκεύτηκε το ραντεβού')}finally{saveRef.current=false;setBusy(false)}}
 function cancel(){setDate('');setExpanded(false);setError('');setNotice('');requestAnimationFrame(()=>triggerRef.current?.focus())}
 return <div className={'visit-next '+styles.root}>
  {showHeading&&<div className="visit-next-heading"><strong>Επόμενο ραντεβού</strong></div>}
  <div className={styles.summary}>
   <span className={styles.summaryIcon} aria-hidden="true"><CalendarDays size={19}/></span>
   <div className={styles.summaryText}>
    {next?<><strong>{formatClinicAppointment(next.scheduled_start)}</strong><span>Προγραμματισμένο</span></>:<span>Δεν έχει προγραμματιστεί επόμενο ραντεβού.</span>}
   </div>
  </div>
  {appointments.length>1&&<details className={styles.others}><summary>Άλλα προγραμματισμένα · {appointments.length-1}</summary>{appointments.slice(1).map(a=><p key={a.id}><strong>{formatClinicAppointment(a.scheduled_start)}</strong> · Προγραμματισμένο</p>)}</details>}
  <button type="button" className={styles.trigger} ref={triggerRef} hidden={formOpen} aria-expanded={formOpen} aria-controls={formId} onClick={()=>{setNotice('');setExpanded(true)}}><CalendarPlus size={16} aria-hidden="true"/>{next?'Νέο ραντεβού':'Προγραμματισμός'}</button>
  {/* The form must stay mounted when visually collapsed, preserving dirty/save guards. */}
  <div id={formId} className={styles.form} hidden={!formOpen}>
   <div className={styles.quickDates}>{quickDates.map(item=><button type="button" key={item.weeks} className={date===item.value?styles.quickSelected:undefined} aria-pressed={date===item.value} onClick={()=>setDate(item.value)} disabled={busy}>Σε {item.weeks} εβδομάδες</button>)}</div>
   <div className={styles.fields}>
    <label className={styles.field}>Ημερομηνία<input ref={dateRef} type="date" value={date} onInput={e=>setDate(e.currentTarget.value)} disabled={busy}/></label>
    <label className={styles.field}>Ώρα Αθήνας<input type="time" value={time} onInput={e=>setTime(e.currentTarget.value)} disabled={busy}/></label>
    <label className={styles.field}>Διάρκεια<select value={duration} onChange={e=>setDuration(e.target.value)} disabled={busy}><option value="30">30′</option><option value="50">50′</option><option value="60">60′</option></select></label>
   </div>
   <div className={styles.actions}>
    <button type="button" className={styles.save} disabled={!date||busy} onClick={()=>void save()}><CalendarPlus size={16} aria-hidden="true"/>{busy?'Αποθήκευση…':'Προγραμματισμός'}</button>
    <button type="button" className={styles.cancel} disabled={busy} onClick={cancel}>Ακύρωση</button>
   </div>
   <details className={styles.reminders}><summary>Επιλογές υπενθύμισης</summary><label><input type="checkbox" checked={smsReminder&&hasMobile} disabled={busy||!hasMobile} onChange={e=>setSmsReminder(e.target.checked)}/> Υπενθύμιση SMS · 24 ώρες πριν</label><small>{hasMobile?'Κινητό …'+mobile.slice(-4)+' · Προσομοίωση αποστολής':'Χρειάζεται έγκυρο κινητό στον φάκελο ασθενή.'} Δεν αποστέλλεται πραγματικό SMS.</small></details>
  </div>
  {notice&&<p className={styles.feedback} role="status">{notice}</p>}
  {error&&<p className={styles.error} role="alert">{error}</p>}
 </div>;
}

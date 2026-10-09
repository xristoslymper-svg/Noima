'use client';
import {useEffect,useId,useMemo,useRef,useState} from 'react';
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
  {next?<p><strong>{formatClinicAppointment(next.scheduled_start)}</strong> · Προγραμματισμένο</p>:<p>Δεν έχει προγραμματιστεί επόμενο ραντεβού.</p>}
  {appointments.length>1&&<details className={styles.others}><summary>Άλλα προγραμματισμένα · {appointments.length-1}</summary>{appointments.slice(1).map(a=><p key={a.id}><strong>{formatClinicAppointment(a.scheduled_start)}</strong> · Προγραμματισμένο</p>)}</details>}
  <button type="button" ref={triggerRef} hidden={formOpen} aria-expanded={formOpen} aria-controls={formId} onClick={()=>{setNotice('');setExpanded(true)}}>{next?'Νέο ραντεβού':'Προγραμματισμός'}</button>
  {/* Keep the form mounted: collapsing presentation must not unregister its save guard. */}
  <div id={formId} hidden={!formOpen}>
   <div className="visit-next-quick">{quickDates.map(item=><button type="button" key={item.weeks} className={date===item.value?'active':''} onClick={()=>setDate(item.value)} disabled={busy}>Σε {item.weeks} εβδομάδες</button>)}</div>
   <div className="visit-inline-fields"><label>Ημερομηνία<input ref={dateRef} type="date" value={date} onInput={e=>setDate(e.currentTarget.value)} disabled={busy}/></label><label>Ώρα Αθήνας<input type="time" value={time} onInput={e=>setTime(e.currentTarget.value)} disabled={busy}/></label><label>Διάρκεια<select value={duration} onChange={e=>setDuration(e.target.value)} disabled={busy}><option value="30">30′</option><option value="50">50′</option><option value="60">60′</option></select></label><button type="button" disabled={!date||busy} onClick={()=>void save()}>{busy?'Αποθήκευση…':'Προγραμματισμός'}</button><button type="button" disabled={busy} onClick={cancel}>Ακύρωση</button></div>
   <details className="calendar-sms-setting"><summary>Επιλογές υπενθύμισης</summary><label><input type="checkbox" checked={smsReminder&&hasMobile} disabled={busy||!hasMobile} onChange={e=>setSmsReminder(e.target.checked)}/> Υπενθύμιση SMS · 24 ώρες πριν</label><small>{hasMobile?'Κινητό …'+mobile.slice(-4)+' · Προσομοίωση αποστολής':'Χρειάζεται έγκυρο κινητό στον φάκελο ασθενή.'} Δεν αποστέλλεται πραγματικό SMS.</small></details>
  </div>
  {notice&&<p role="status">{notice}</p>}
  {error&&<p role="alert">{error}</p>}
 </div>;
}

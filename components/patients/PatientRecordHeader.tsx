'use client';
import {useEffect,useRef,useState} from 'react';
import {CalendarDays,MoreHorizontal,Plus} from 'lucide-react';
import type {PatientBundle} from '@/lib/patients/demo-runtime';
import {formatClinicAppointment} from '@/lib/clinic-time';

export default function PatientRecordHeader({
 bundle,
 actionLabel,
 actionMeta,
 onPrimaryAction,
 onHistory,
 onExport,
 busy=false,
}:{
 bundle:PatientBundle;
 actionLabel:string;
 actionMeta?:string;
 onPrimaryAction:()=>void;
 onHistory:()=>void;
 onExport:()=>void;
 busy?:boolean;
}){
 const [open,setOpen]=useState(false);
 const menuRef=useRef<HTMLDivElement>(null);
 useEffect(()=>{
  if(!open)return;
  const close=(event:MouseEvent)=>{if(!menuRef.current?.contains(event.target as Node))setOpen(false)};
  const escape=(event:KeyboardEvent)=>{if(event.key==='Escape')setOpen(false)};
  document.addEventListener('mousedown',close);document.addEventListener('keydown',escape);
  return()=>{document.removeEventListener('mousedown',close);document.removeEventListener('keydown',escape)};
 },[open]);
 const now=Date.now();
 const next=bundle.appointments
  .filter(a=>a.status==='scheduled'&&Date.parse(a.scheduled_end)>=now)
  .sort((a,b)=>Date.parse(a.scheduled_start)-Date.parse(b.scheduled_start))[0];
 const p=bundle.patient;
 return <header className="patient-record-header">
  <div className="patient-record-identity">
   <span className="kicker">FICTIONAL TEST DATA</span>
   <h1>{p.first_name} {p.last_name}{p.reported_age?<> <em>· {p.reported_age} ετών</em></>:null}</h1>
   <div className="patient-record-header-meta">
    <span>Κλινικός φάκελος</span>
    {next&&<span className="patient-next-appointment"><CalendarDays size={13}/>{formatClinicAppointment(next.scheduled_start)}</span>}
   </div>
  </div>
  <div className="patient-record-header-actions">
   <button className="patient-record-primary" onClick={onPrimaryAction} disabled={busy}>
    <Plus size={17}/><span><strong>{actionLabel}</strong>{actionMeta&&<small>{actionMeta}</small>}</span>
   </button>
   <div className="patient-record-more" ref={menuRef}>
    <button className="patient-record-more-trigger" aria-label="Περισσότερες ενέργειες" aria-expanded={open} onClick={()=>setOpen(v=>!v)}><MoreHorizontal size={19}/></button>
    {open&&<div className="patient-record-more-menu">
     <button onClick={()=>{setOpen(false);onHistory()}}>Στοιχεία / ιστορικό ασθενή</button>
     <button onClick={()=>{setOpen(false);onExport()}}>Εξαγωγή φακέλου</button>
    </div>}
   </div>
  </div>
 </header>;
}

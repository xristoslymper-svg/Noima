'use client';

import Link from 'next/link';
import {CalendarDays,FolderOpen} from 'lucide-react';
import {agendaNeedsScroll,sortedAgenda} from '@/lib/overview/agenda-layout';

export type DailyAppointment={
  id:string;
  patient_id:string|null;
  patient_name:string;
  appointment_type:string;
  scheduled_start:string;
  status:string;
  readiness:string;
  readiness_label:string;
  detail:string;
};

type Props={
  events:DailyAppointment[];
  selectedPatientId:string|null;
  state:'loading'|'ready'|'error';
  onSelectPatient:(id:string)=>void;
};

const time=(value:string)=>new Intl.DateTimeFormat('el-GR',{
  timeZone:'Europe/Athens',hour:'2-digit',minute:'2-digit',hourCycle:'h23'
}).format(new Date(value));

const statusText=(event:DailyAppointment)=>{
  if(event.status==='completed')return 'Ολοκληρώθηκε';
  if(event.readiness==='waiting')return event.readiness_label||'Σε αναμονή';
  return event.readiness_label||event.detail||'Προγραμματισμένο';
};

export default function DailyAgenda({events,selectedPatientId,state,onSelectPatient}:Props){
  const sorted=sortedAgenda(events);
  const scroll=agendaNeedsScroll(sorted.length);
  return <div className="overview-agenda">
    <div className="overview-agenda-header">
      <div>
        <span className="kicker sessions-title">ΠΡΟΓΡΑΜΜΑ ΗΜΕΡΑΣ</span>
        {state==='ready'&&<span className="overview-agenda-count">{sorted.length} ραντεβού σήμερα</span>}
      </div>
      {scroll&&<Link href="/calendar" className="overview-agenda-calendar-link">Ημερολόγιο <span aria-hidden="true">↗</span></Link>}
    </div>
    {state==='loading'?<div className="overview-agenda-empty" role="status">Φόρτωση προγράμματος…</div>:
     state==='error'?<div className="overview-agenda-empty" role="alert">Το πρόγραμμα δεν είναι προσωρινά διαθέσιμο.</div>:
     sorted.length===0?<div className="overview-agenda-empty"><CalendarDays size={22} aria-hidden="true"/><strong>Δεν υπάρχουν ραντεβού σήμερα.</strong><span>Το πρόγραμμά σας είναι ελεύθερο.</span></div>:
     <div className={'overview-agenda-list'+(scroll?' is-scrollable':'')} role="list" aria-label={'Πρόγραμμα ημέρας, '+sorted.length+' ραντεβού'}>
       {sorted.map(event=>{
         const selected=Boolean(event.patient_id&&selectedPatientId===event.patient_id);
         const available=Boolean(event.patient_id);
         return <div className={'overview-appointment'+(selected?' is-selected':'')} role="listitem" key={event.id}>
           <button type="button" className="overview-appointment-select"
             onClick={()=>event.patient_id&&onSelectPatient(event.patient_id)}
             disabled={!available}
             aria-pressed={available?selected:undefined}
             aria-label={time(event.scheduled_start)+' · '+event.patient_name+' · '+(event.appointment_type==='initial_assessment'?'Αρχική αξιολόγηση':'Επανεξέταση')+' · '+statusText(event)}>
             <time dateTime={event.scheduled_start} className="overview-appointment-time">{time(event.scheduled_start)}</time>
             <span className="overview-appointment-avatar" aria-hidden="true">{event.patient_name.trim().slice(0,1)||'Α'}</span>
             <span className="overview-appointment-info">
               <strong className="overview-appointment-name" title={event.patient_name}>{event.patient_name}</strong>
               <span className="overview-appointment-metadata">
                 <span className={'overview-appointment-type'+(event.appointment_type==='initial_assessment'?' is-initial':'')}>{event.appointment_type==='initial_assessment'?'Αρχική αξιολόγηση':'Επανεξέταση'}</span>
                 <span className="overview-appointment-status">{statusText(event)}</span>
               </span>
             </span>
           </button>
           <Link href={event.patient_id?'/patients/demo/'+event.patient_id+'?appointment='+event.id:'/patients'}
             className="overview-appointment-folder" aria-label={'Άνοιγμα φακέλου '+event.patient_name} title="Άνοιγμα φακέλου">
             <FolderOpen size={18} aria-hidden="true"/>
           </Link>
         </div>
       })}
     </div>}
  </div>;
}

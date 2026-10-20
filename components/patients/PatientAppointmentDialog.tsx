'use client';
import {useCallback,useEffect,useRef,useState} from 'react';
import {X} from 'lucide-react';
import {useCalendarDialog} from '@/components/calendar/useCalendarDialog';
import type {PatientBundle} from '@/lib/patients/demo-runtime';
import VisitNextAppointment from './VisitNextAppointment';
const registerFlusher=()=>()=>{};
export default function PatientAppointmentDialog({bundle,reload,onClose,onSaved}:{bundle:PatientBundle;reload:()=>Promise<unknown>;onClose:()=>void;onSaved:()=>void}){
 const [busy,setBusy]=useState(false);
 const dirty=useRef(false);
 useEffect(()=>()=>{document.querySelector<HTMLButtonElement>('.patient-voice-cta')?.focus()},[]);
 const onDirtyChange=useCallback((_key:string,value:boolean)=>{dirty.current=value},[]);
 const close=()=>{if(!busy&&(!dirty.current||window.confirm('Να κλείσει χωρίς να προγραμματιστεί το ραντεβού;')))onClose()};
 const dialog=useCalendarDialog(close,busy);
 return <div className="entry-modal-backdrop"><section ref={dialog} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby="patient-appointment-title" className="entry-modal appointment-choice-modal">
  <button type="button" className="entry-close" onClick={close} disabled={busy} aria-label="Κλείσιμο"><X size={19}/></button>
  <h2 id="patient-appointment-title">Νέο ραντεβού</h2>
  <p>{bundle.patient.first_name} {bundle.patient.last_name}</p>
  <VisitNextAppointment bundle={bundle} reload={reload} registerFlusher={registerFlusher} onDirtyChange={onDirtyChange} showHeading={false} initialExpanded onSaved={onSaved} onCancel={close} onBusyChange={setBusy} appointmentType={bundle.sessions.length?'follow_up':'initial_assessment'}/>
 </section></div>;
}

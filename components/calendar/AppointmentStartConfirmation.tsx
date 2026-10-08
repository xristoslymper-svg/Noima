'use client';
import {useEffect,useRef} from 'react';
import {useOverlayDismiss} from '@/components/useOverlayDismiss';
import {formatClinicDateTime} from '@/lib/clinic-time';

export default function AppointmentStartConfirmation({scheduledStart,onCancel,onConfirm}:{scheduledStart:string;onCancel:()=>void;onConfirm:()=>void}){
 const dialog=useRef<HTMLDialogElement>(null);
 useOverlayDismiss(onCancel);
 useEffect(()=>{dialog.current?.showModal()},[]);
 return <dialog ref={dialog} className="entry-modal appointment-start-confirm" aria-labelledby="appointment-start-title" aria-describedby="appointment-start-description" onClick={e=>{if(e.target!==e.currentTarget)return;const rect=e.currentTarget.getBoundingClientRect();if(e.clientX<rect.left||e.clientX>rect.right||e.clientY<rect.top||e.clientY>rect.bottom)onCancel()}} onKeyDown={e=>{if(e.key==='Escape')e.stopPropagation()}} onCancel={e=>{e.preventDefault();onCancel()}}>
  <span className="kicker">ΗΜΕΡΟΜΗΝΙΑ ΕΠΙΣΚΕΨΗΣ</span>
  <h2 id="appointment-start-title">Έναρξη επίσκεψης σήμερα;</h2>
  <p id="appointment-start-description">Το ραντεβού είναι στις <strong>{formatClinicDateTime(scheduledStart)}</strong> (ώρα Αθήνας).</p>
  <p>Η επίσκεψη θα καταγραφεί με τη σημερινή ημερομηνία και θα συνδεθεί με αυτό το ραντεβού. Η υπενθύμισή του θα ακυρωθεί.</p>
  <footer className="entry-footer"><button autoFocus onClick={onCancel}>Ακύρωση</button><button className="entry-primary" onClick={onConfirm}>Έναρξη σήμερα</button></footer>
 </dialog>;
}

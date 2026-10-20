'use client';
import {useEffect,useRef,type ReactNode} from 'react';
import styles from './PatientRecord.module.css';
export default function VisitDialog({open,onClose,children}:{open:boolean;onClose:()=>void|Promise<unknown>;children:ReactNode}){
 const ref=useRef<HTMLDialogElement>(null),close=useRef(onClose);close.current=onClose;
 useEffect(()=>{
  const dialog=ref.current;if(!dialog)return;
  if(open&&!dialog.open)dialog.showModal();
  if(!open&&dialog.open)dialog.close();
  if(!open)return;
  const previous=document.body.style.overflow;document.body.style.overflow='hidden';
  return()=>{document.body.style.overflow=previous;if(dialog.open)dialog.close();document.querySelector<HTMLButtonElement>('.patient-voice-cta')?.focus()};
 },[open]);
 return <dialog ref={ref} className={styles.recordDialog} aria-labelledby="record-dialog-title" onCancel={event=>{event.preventDefault();void close.current()}}>{children}</dialog>;
}

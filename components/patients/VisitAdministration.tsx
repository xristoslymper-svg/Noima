'use client';
import {useSystemMessage} from '@/i18n/system-message';

import {useTranslations} from 'next-intl';

import {useEffect,useRef,useState} from 'react';
import {getDemoTesterId} from '@/lib/demo-tester';
import type {PatientBundle} from '@/lib/patients/demo-runtime';
import VisitNextAppointment from './VisitNextAppointment';
import styles from './VisitAdministration.module.css';
type Payment='unknown'|'pending'|'paid'|'not_applicable';

export default function VisitAdministration({bundle,sessionId,reload,registerFlusher,onDirtyChange,disabled=false}:{bundle:PatientBundle;sessionId:string;reload:()=>Promise<unknown>;registerFlusher:(key:string,flush:()=>Promise<void>)=>(()=>void);onDirtyChange:(key:string,dirty:boolean)=>void;disabled?:boolean}){
 const systemMessage=useSystemMessage();

const t=useTranslations();

const choices:[Payment,string][]=[['paid',t('billing.paid')],['pending',t('common.pending')],['not_applicable',t('billing.noCharge')],['unknown',t('billing.unrecorded')]];

 

 const linked=bundle.appointments.filter(a=>a.session_id===sessionId&&(!a.patient_id||a.patient_id===bundle.patient.id));const appointment=linked.length===1?linked[0]:undefined;
 const [confirmed,setConfirmed]=useState<{id:string;status:Payment;updatedAt:string}|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState('');const flight=useRef(false),mounted=useRef(true);
 useEffect(()=>{mounted.current=true;return()=>{mounted.current=false}},[]);
 useEffect(()=>registerFlusher('visit-payment',async()=>{if(flight.current)throw new Error(t('billing.paymentInProgress'))}),[registerFlusher]);
 useEffect(()=>{onDirtyChange('visit-payment',busy);return()=>onDirtyChange('visit-payment',false)},[busy,onDirtyChange]);
 const hasConfirmedPayment=confirmed&&appointment&&confirmed.id===appointment.id&&(!appointment.updated_at||Date.parse(confirmed.updatedAt)>=Date.parse(appointment.updated_at));
 const status=hasConfirmedPayment?confirmed!.status:appointment?.payment_status;
 async function save(next:Payment){if(!appointment||flight.current||disabled||next===status)return;flight.current=true;setBusy(true);setError('');let committed=false;
  try{const response=await fetch('/api/calendar/payment',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({tester:getDemoTesterId(),event_id:appointment.id,status:next})});const data=await response.json();if(!response.ok)throw new Error(data.error||t('errors.paymentSave'));const event=data.event;
   if(!event||event.id!==appointment.id||event.patient_id!==bundle.patient.id||event.session_id!==sessionId||event.payment_status!==next||!Number.isFinite(Date.parse(event.updated_at)))throw new Error(t('billing.appointmentPaymentUnconfirmed'));
   committed=true;if(mounted.current)setConfirmed({id:event.id,status:next,updatedAt:event.updated_at});const fresh=await reload();if(!fresh)throw new Error('refresh_unavailable');
  }catch(cause){if(mounted.current)setError(committed?t('billing.savedRefreshFailed'):cause instanceof Error?cause.message:t('errors.paymentUnconfirmed'));}
  finally{flight.current=false;if(mounted.current)setBusy(false)}
 }
 return <section className="visit-part" aria-label={t('visits.administration')} aria-busy={disabled||busy}><header><h3>{t('visits.administration')}</h3></header><div className="visit-part-surface">
  <p className="visit-hint">{t('visits.administrationHelp')}</p>
  <fieldset disabled={disabled||busy} style={{border:0,padding:0,margin:0,minWidth:0}}><div className="visit-related-fields"><section aria-label={t('billing.visitPayment')}><h4>{t('billing.payment')}</h4>
   {appointment?<><p role="status">{busy?t('billing.savingPayment'):choices.find(([value])=>value===status)?.[1]||t('billing.refreshingPayment')}</p><div className={styles.paymentOptions} role="group" aria-label={t('billing.paymentStatus')}>{choices.map(([value,label])=><button type="button" key={value} aria-pressed={status===value} onClick={()=>void save(value)}>{label}</button>)}</div></>:<p>{linked.length>1?t('billing.verifyAppointmentLink'):t('billing.noLinkedAppointment')}</p>}
   {error&&<p role="alert">{systemMessage(error)}</p>}
  </section><VisitNextAppointment bundle={bundle} sessionId={sessionId} reload={reload} registerFlusher={registerFlusher} onDirtyChange={onDirtyChange}/></div></fieldset>
 </div></section>;
}

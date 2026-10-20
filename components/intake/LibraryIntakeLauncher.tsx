'use client';
import {useTranslations} from 'next-intl';
import Link from 'next/link';
import {useEffect,useId,useMemo,useRef,useState} from 'react';
import {Check,Search,UserRound,X} from 'lucide-react';
import {getDemoTesterId} from '@/lib/demo-tester';
import {useAccountSession} from '@/components/AccountSessionBoundary';
import {isClinicalId} from '@/lib/clinical/identity';
import styles from './QuickIntakeAssignment.module.css';

type Patient={id:string;first_name:string;last_name:string;email?:string};
type Device={id:string;label:string;active:boolean};
type Channel='email'|'tablet'|'print';
type Receipt={id:string;token:string;printLink:string};
const normalize=(value:string)=>value.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase('el-GR').trim();
const toolName=(tool:string)=>tool==='history'?'Αρχικό ιστορικό':tool;
export default function LibraryIntakeLauncher({defaultTools=['history'],initialChannel='email',onClose,onDone}:{defaultTools?:string[];initialChannel?:Channel;lockTools?:boolean;onClose:()=>void;onDone?:()=>void}){
 const t=useTranslations();

 const tools=defaultTools,channel=initialChannel,account=useAccountSession(),id=useId();
 const [patients,setPatients]=useState<Patient[]>([]),[devices,setDevices]=useState<Device[]>([]),[deviceId,setDeviceId]=useState('');
 const [query,setQuery]=useState(''),[patient,setPatient]=useState<Patient|null>(null),[isNew,setIsNew]=useState(false),[first,setFirst]=useState(''),[last,setLast]=useState(''),[email,setEmail]=useState('');
 const [loading,setLoading]=useState(true),[ready,setReady]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState(''),[done,setDone]=useState(''),[manual,setManual]=useState(''),[unknown,setUnknown]=useState(false),[prepared,setPrepared]=useState(false),[reload,setReload]=useState(0);
 const [showMatches,setShowMatches]=useState(false),[active,setActive]=useState(-1);
 const dialog=useRef<HTMLElement|null>(null),search=useRef<HTMLInputElement|null>(null),flight=useRef(false),receipt=useRef<Receipt|null>(null),alive=useRef(false);
 const terms=normalize(query).split(/\s+/).filter(Boolean);
 const matches=useMemo(()=>terms.join('').length<2?[]:patients.filter(p=>terms.every(term=>normalize(p.first_name+' '+p.last_name).includes(term))).slice(0,6),[query,patients]);
 const listOpen=showMatches&&query.trim().length>=2;
 const locked=busy||prepared||Boolean(done)||unknown;
 const validTools=tools.length>0&&tools.length<=3&&new Set(tools).size===tools.length&&tools.every(tool=>['history','PHQ-9','GAD-7'].includes(tool));
 const valid=ready&&validTools&&(patient||isNew&&first.trim()&&last.trim())&&(channel!=='email'||/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()))&&(channel!=='tablet'||deviceId);
 useEffect(()=>{alive.current=true;const previous=document.activeElement as HTMLElement|null;const overflow=document.body.style.overflow;document.body.style.overflow='hidden';search.current?.focus();return()=>{alive.current=false;document.body.style.overflow=overflow;previous?.focus()}},[]);
 useEffect(()=>{
  const controller=new AbortController();setLoading(true);setReady(false);setError('');
  void (async()=>{
   const response=await fetch('/api/patients/demo/runtime?tester='+encodeURIComponent(getDemoTesterId()),{cache:'no-store',signal:controller.signal});const data=await response.json();if(!response.ok||!Array.isArray(data.patients))throw new Error('Δεν φορτώθηκαν οι ασθενείς.');
   if(controller.signal.aborted)return;setPatients(data.patients);
   if(channel==='tablet'){const r=await fetch('/api/intake',{method:'POST',headers:{'Content-Type':'application/json'},signal:controller.signal,body:JSON.stringify({action:'devices',tester:getDemoTesterId()})});const d=await r.json();if(!r.ok)throw new Error('Δεν φορτώθηκαν οι συσκευές.');const available=(d.devices||[]).filter((device:Device)=>device.active);setDevices(available);setDeviceId(available[0]?.id||'')}
   if(!controller.signal.aborted)setReady(true);
  })().catch(cause=>{if(!controller.signal.aborted)setError(cause instanceof Error?cause.message:'Δεν φορτώθηκαν οι επιλογές αποστολής.')}).finally(()=>{if(!controller.signal.aborted)setLoading(false)});
  return()=>controller.abort();
 },[channel,reload]);
 function choose(p:Patient){setPatient(p);setIsNew(false);setQuery((p.first_name+' '+p.last_name).trim());setEmail(p.email||'');setShowMatches(false);setActive(-1);setError('')}
 function chooseNew(){const parts=query.trim().split(/\s+/).filter(Boolean);setFirst(parts[0]||'');setLast(parts.slice(1).join(' '));setPatient(null);setIsNew(true);setEmail('');setShowMatches(false);setError('')}
 function close(){if(!flight.current)onClose()}
 async function send(){
  if(flight.current||!valid||unknown||done)return;flight.current=true;setBusy(true);setError('');
  let printWindow:Window|null=null;
  try{
   if(!receipt.current){
    if(channel==='print')printWindow=window.open('about:blank','_blank');
    const response=await fetch('/api/intake',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'assign',tester:getDemoTesterId(),patient_id:patient?.id||null,appointment_id:null,provisional_identity:isNew?{first_name:first.trim(),last_name:last.trim(),email:email.trim()}:null,tools,channel,device_id:channel==='tablet'?deviceId:null})});
    const data=await response.json();
    if(!response.ok){if(response.status>=500)setUnknown(true);throw new Error(data.error||'Δεν δημιουργήθηκε η ανάθεση.')}
    if(!isClinicalId(data.intake?.id)||typeof data.intakeToken!=='string'||!/^[a-f0-9]{64}$/.test(data.intakeToken)||(patient&&data.intake.patient_id&&data.intake.patient_id!==patient.id)){setUnknown(true);throw new Error('Δεν επιβεβαιώθηκε η ανάθεση. Μην την επαναλάβετε πριν ελεγχθεί.')}
    receipt.current={id:data.intake.id,token:data.intakeToken,printLink:String(data.printLink||'')};setPrepared(true);
   }
   const assignment=receipt.current;
   if(channel==='email'){
    const response=await fetch('/api/intake/email',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({intake_id:assignment.id,token:assignment.token,to:email.trim(),tools,doctor_name:account?.identity?.full_name||''})});const data=await response.json();
    if(!response.ok){
     if(data.code==='connect'&&typeof data.fallback?.subject==='string'&&typeof data.fallback?.body==='string'){
      const href='mailto:'+encodeURIComponent(email.trim())+'?'+new URLSearchParams({subject:data.fallback.subject,body:data.fallback.body}).toString().replaceAll('+','%20');setManual(href);setDone('Το email είναι έτοιμο. Πατήστε Αποστολή στο δικό σας πρόγραμμα email.');onDone?.();return;
     }
     throw new Error(data.error||'Δεν επιβεβαιώθηκε η αποστολή. Η ίδια ανάθεση θα χρησιμοποιηθεί στην επανάληψη.');
    }
    if(data.status!=='accepted')throw new Error('Δεν επιβεβαιώθηκε η αποστολή.');
    setDone('Το email έγινε δεκτό για αποστολή.');
   }else if(channel==='tablet')setDone('Το έντυπο είναι έτοιμο στο tablet.');
   else{const url=new URL(assignment.printLink,window.location.origin);if(url.origin!==window.location.origin||url.pathname!=='/intake')throw new Error('Μη έγκυρος σύνδεσμος εκτύπωσης.');if(printWindow)printWindow.location.href=url.href;else window.open(url.href,'_blank');setDone('Το έντυπο είναι έτοιμο για εκτύπωση.')}
   onDone?.();
  }catch(cause){printWindow?.close();if(alive.current){if(!receipt.current&&!(cause instanceof Error&&cause.message==='Δεν δημιουργήθηκε η ανάθεση.'))setUnknown(true);setError(cause instanceof Error?cause.message:'Η ενέργεια δεν επιβεβαιώθηκε.')}}
  finally{flight.current=false;if(alive.current)setBusy(false)}
 }
 return <div className="intake-launcher-backdrop" onClick={()=>{setShowMatches(false);if(!query&&!patient&&!isNew)close()}}>
  <section ref={dialog} className={styles.modal} role="dialog" aria-modal="true" aria-labelledby={id+'-title'} onClick={event=>event.stopPropagation()} onKeyDown={event=>{
   if(event.key==='Escape'){event.preventDefault();event.stopPropagation();if(listOpen)setShowMatches(false);else close()}
   if(event.key==='Tab'){const elements=Array.from(dialog.current?.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled),select:not(:disabled),a[href]')||[]).filter(el=>el.getClientRects().length>0);const firstElement=elements[0],lastElement=elements[elements.length-1];if(event.shiftKey&&document.activeElement===firstElement){event.preventDefault();lastElement?.focus()}else if(!event.shiftKey&&document.activeElement===lastElement){event.preventDefault();firstElement?.focus()}}
  }}>
   <button className={styles.close} type="button" onClick={close} disabled={busy} aria-label={t('common.close')}><X size={19}/></button>
   <header className={styles.header}><p>{t('navigation.library')}</p><h2 id={id+'-title'}>{tools.map(toolName).join(' · ')} · {channel==='email'?'Email':channel==='tablet'?'Tablet':'Εκτύπωση'}</h2></header>
   <form onSubmit={event=>{event.preventDefault();void send()}}>
    <fieldset disabled={locked} style={{border:0,padding:0,margin:0,minWidth:0}}><div className={styles.fields}>
     <div className={styles.field}><label htmlFor={id+'-patient'}>{t('patients.patient')}</label><div className={styles.patientSearch}><Search size={17} aria-hidden="true"/><input ref={search} id={id+'-patient'} type="search" autoComplete="off" value={query} placeholder={t('current.m113')} role="combobox" aria-autocomplete="list" aria-expanded={listOpen} aria-controls={id+'-results'} aria-activedescendant={listOpen&&active>=0?id+'-option-'+active:undefined} onFocus={()=>{if(query.trim().length>=2)setShowMatches(true)}} onChange={event=>{setQuery(event.target.value);setPatient(null);setIsNew(false);setEmail('');setShowMatches(true);setActive(-1)}} onKeyDown={event=>{if(event.key==='ArrowDown'&&matches.length){event.preventDefault();setShowMatches(true);setActive(value=>Math.min(value+1,matches.length-1))}else if(event.key==='ArrowUp'){event.preventDefault();setActive(value=>Math.max(0,value-1))}else if(event.key==='Enter'&&listOpen&&active>=0&&matches[active]){event.preventDefault();choose(matches[active])}else if(event.key==='Escape'&&listOpen){event.preventDefault();event.stopPropagation();setShowMatches(false)}}}/></div>
      {listOpen&&<div className={styles.suggestions} id={id+'-results'} role="listbox" aria-label={t('navigation.patients')}>{matches.map((p,index)=><button type="button" id={id+'-option-'+index} role="option" aria-selected={active===index} key={p.id} onClick={()=>choose(p)}>{p.first_name} {p.last_name}</button>)}{!matches.length&&<p>{t('current.m105')}</p>}</div>}
      {!patient&&<button type="button" className={styles.newEntry} onClick={chooseNew}><UserRound size={15}/>{t('current.m106')}</button>}
      {patient&&<small className={styles.selectedPatient}><Check size={13}/>{patient.first_name} {patient.last_name}</small>}
      {isNew&&<div className={styles.newFields}><label>{t('patients.firstNameRequired')}<input required maxLength={120} value={first} onChange={event=>setFirst(event.target.value)}/></label><label>{t('current.m107')}<input required maxLength={120} value={last} onChange={event=>setLast(event.target.value)}/></label><p>{t('current.m108')}</p></div>}
     </div>
     {channel==='email'&&<div className={styles.field}><label htmlFor={id+'-email'}>{t('notifications.recipientEmail')}</label><input id={id+'-email'} type="email" required autoComplete="off" value={email} onChange={event=>setEmail(event.target.value)}/></div>}
     {channel==='tablet'&&<div className={styles.field}><label htmlFor={id+'-device'}>{t('history.device')}</label>{devices.length?<select id={id+'-device'} value={deviceId} onChange={event=>setDeviceId(event.target.value)}>{devices.map(device=><option key={device.id} value={device.id}>{device.label}</option>)}</select>:<p>{t('current.m109')}<Link href="/tablet" target="_blank" rel="noopener noreferrer">{t('current.m110')}</Link></p>}</div>}
    </div></fieldset>
    {loading&&<p role="status">{t('common.loading')}</p>}{error&&<p className={styles.error} role="alert">{error}{!ready&&!loading&&<button type="button" onClick={()=>setReload(value=>value+1)}>{t('common.retryLoading')}</button>}</p>}{unknown&&<p className={styles.error}>{t('current.m111')}</p>}{done&&<p className={styles.success} role="status"><Check size={16}/>{done}</p>}{manual&&<a className={styles.submit} href={manual}>{t('current.m112')}</a>}
    <footer className={styles.footer}><button type="button" onClick={close} disabled={busy}>{t('common.close')}</button><button type="submit" className={styles.submit} disabled={busy||!valid||Boolean(done)||unknown}>{busy?'Προετοιμασία…':prepared?'Επανάληψη ίδιας αποστολής':channel==='email'?'Αποστολή email':channel==='tablet'?'Αποστολή στο tablet':'Εκτύπωση'}</button></footer>
   </form>
  </section>
 </div>;
}

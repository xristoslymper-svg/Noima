'use client';
import {useMobileNavigation} from '@/components/useMobileNavigation';
import MobileClinicalNav from '@/components/mobile/MobileClinicalNav';
import {mobileV2Enabled} from '@/components/mobile/mobile-v2';
import mobileStyles from '@/components/mobile/MobileClinical.module.css';
import PilotProfile from '@/components/PilotProfile';
import AppointmentStartConfirmation from '@/components/calendar/AppointmentStartConfirmation';
import PatientRecordSummary from './PatientRecordSummary';
import PatientTimeline from './PatientTimeline';
import PatientTreatment from './PatientTreatment';
import styles from './PatientRecord.module.css';
import {patientRecord} from '@/lib/clinical/patient-record';
import VisitWorkspace from './VisitWorkspace';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import {hasCompletedClinicalHistory,workspaceHeroAction,workspaceMeasurementSearch,workspaceSelectedAssessment,workspaceMeasurementsRequested,workspaceLocation,workspaceTransitionSearch,type WorkspaceTab} from '@/lib/clinical/visit-workspace-state';
import { BookOpen, CalendarDays, FileText, History as HistoryIcon, Home, Menu, Pill, Printer, Plus, Users, X } from 'lucide-react';
import { getDemoTesterId } from '@/lib/demo-tester';
import type { PatientBundle } from '@/lib/patients/demo-runtime';
import { demoPost } from '@/lib/patients/demo-client';
import {assertRecordIdentity,reconcileRecord} from '@/lib/clinical/record-reconciliation';
import {confirmedCompletion} from '@/lib/clinical/finalization';
import { HistoryPanel } from '@/components/patients/PatientPanels';
import { formatClinicAppointment } from '@/lib/clinic-time';

type Tab=WorkspaceTab;
export default function PatientWorkspace({patientRef,previewBundle}:{patientRef:string;previewBundle?:PatientBundle}){
 const [pendingStart,setPendingStart]=useState<{appointment:PatientBundle['appointments'][number];type:'initial_assessment'|'follow_up'}|null>(null);
 const recordDialog=useRef<HTMLDialogElement|null>(null);
 const [backgroundTab,setBackgroundTab]=useState<Exclude<Tab,'record'>>('summary');
 const backgroundTabRef=useRef<Exclude<Tab,'record'>>('summary');
 function rememberBackground(next:Tab){if(next!=='record'){backgroundTabRef.current=next;setBackgroundTab(next)}}
 const visitBeforeNavigate=useRef<(()=>Promise<void>)|null>(null);
 const sectionBeforeNavigate=useRef<(()=>Promise<void>)|null>(null);
 const beforeNavigate=useRef<(()=>Promise<void>)|null>(null);
 beforeNavigate.current=async()=>{await visitBeforeNavigate.current?.();await sectionBeforeNavigate.current?.()};
 const currentUrl=useRef('');
 const historyIndex=useRef(0);const restoringHistory=useRef(false);
 const historyRead=useRef<()=>Promise<void>>(async()=>{});
 const navigationSequence=useRef(0);
 const startingRef=useRef(false);
 const shellLoadSequence=useRef(0);const fullLoadSequence=useRef(0);
 const activePatientRef=useRef(patientRef);activePatientRef.current=patientRef;
 const [contextReady,setContextReady]=useState(false); const [visitId,setVisitId]=useState<string|null>(null); const [visitType,setVisitType]=useState<'initial_assessment'|'follow_up'>('initial_assessment'); const [bundle,setBundleState]=useState<PatientBundle|null>(null); const [loading,setLoading]=useState(true); const [error,setError]=useState(''); const [tab,setTabState]=useState<Tab>('summary'); const [mobileNav,setMobileNav]=useMobileNavigation(); const [starting,setStarting]=useState(false);
 const bundleRef=useRef<PatientBundle|null>(null);
 function setBundle(value:PatientBundle|null|((current:PatientBundle|null)=>PatientBundle|null)){const next=typeof value==='function'?value(bundleRef.current):value;bundleRef.current=next;setBundleState(next)}
 const [measurementsOpen,setMeasurementsOpen]=useState(false);
 const [selectedAssessmentId,setSelectedAssessmentId]=useState<string|null>(null);
 const [recordNotice,setRecordNotice]=useState(''); const [appointmentChoices,setAppointmentChoices]=useState<PatientBundle['appointments']>([]);
 async function loadShell(){
  if(previewBundle){setBundle(previewBundle);setLoading(false);return previewBundle}
  const requestedPatient=patientRef,sequence=++shellLoadSequence.current;
  try{
   const response=await fetch('/api/patients/demo/visit?tester='+getDemoTesterId()+'&patient='+encodeURIComponent(requestedPatient),{cache:'no-store'});
   const data=await response.json();if(activePatientRef.current!==requestedPatient||sequence!==shellLoadSequence.current)return null;
   if(!response.ok)throw new Error(data.error||'Δεν φορτώθηκε ο φάκελος.');
   assertRecordIdentity(data.bundle,requestedPatient);const fresh=reconcileRecord(bundleRef.current,data.bundle,'shell');setBundle(fresh);setLoading(false);return fresh;
  }catch(cause){if(activePatientRef.current===requestedPatient&&sequence===shellLoadSequence.current)setError(cause instanceof Error?cause.message:'Δεν φορτώθηκε ο φάκελος.');return null}
 }
 async function load(){
  if(previewBundle){setBundle(previewBundle);setContextReady(true);setLoading(false);setError('');return previewBundle}
  const requestedPatient=patientRef,sequence=++fullLoadSequence.current;
  try{
   const response=await fetch('/api/patients/demo/runtime?tester='+getDemoTesterId()+'&patient='+encodeURIComponent(requestedPatient),{cache:'no-store'});
   const data=await response.json();if(activePatientRef.current!==requestedPatient||sequence!==fullLoadSequence.current)return null;
   if(!response.ok)throw new Error(data.error||'Δεν φορτώθηκε ο φάκελος.');
   assertRecordIdentity(data.bundle,requestedPatient);const fresh=reconcileRecord(bundleRef.current,data.bundle);setBundle(fresh);setContextReady(true);setError('');return fresh;
  }catch(cause){if(activePatientRef.current===requestedPatient&&sequence===fullLoadSequence.current)setError(cause instanceof Error?cause.message:'Δεν φορτώθηκε η καρτέλα.');return null}
  finally{if(activePatientRef.current===requestedPatient&&sequence===fullLoadSequence.current)setLoading(false)}
 }
 function applyLocation(search:string){const location=workspaceLocation(search);if(previewBundle&&location.tab==='record'){setTabState('summary');rememberBackground('summary');setVisitId(null);return;}setMeasurementsOpen(workspaceMeasurementsRequested(search));setSelectedAssessmentId(workspaceSelectedAssessment(search));setPendingStart(null);setAppointmentChoices([]);rememberBackground(location.tab);setTabState(location.tab);setVisitId(location.sessionId)}
 function applyTab(next:Tab,sessionId?:string|null,options:{clearAppointment?:boolean}={}){setMeasurementsOpen(false);setSelectedAssessmentId(null);setError('');setPendingStart(null);setAppointmentChoices([]);const selected=sessionId===undefined?visitId:sessionId;setVisitId(selected||null);rememberBackground(next);setTabState(next);const search=workspaceTransitionSearch(window.location.search,next,selected,options);const target=window.location.pathname+search+window.location.hash;const current=window.location.pathname+window.location.search+window.location.hash;if(target!==current){historyIndex.current++;window.history.pushState({...window.history.state,noimaPatientIndex:historyIndex.current},'',target)}currentUrl.current=window.location.href}
 historyRead.current=async()=>{if(restoringHistory.current){restoringHistory.current=false;return}const targetIndex=window.history.state?.noimaPatientIndex;const sequence=++navigationSequence.current;const target=window.location.href;try{await beforeNavigate.current?.();if(sequence!==navigationSequence.current)return;const targetSearch=new URL(target).search;if(sequence!==navigationSequence.current)return;applyLocation(targetSearch);if(typeof targetIndex==='number')historyIndex.current=targetIndex;currentUrl.current=target}catch(cause){if(sequence!==navigationSequence.current)return;setError(cause instanceof Error?cause.message:'Δεν αποθηκεύτηκε η πρόχειρη καταγραφή.');if(typeof targetIndex==='number'&&targetIndex!==historyIndex.current){restoringHistory.current=true;window.history.go(historyIndex.current-targetIndex)}else window.history.replaceState({...window.history.state,noimaPatientIndex:historyIndex.current},'',currentUrl.current)}};
 useEffect(()=>{navigationSequence.current++;shellLoadSequence.current++;fullLoadSequence.current++;visitBeforeNavigate.current=null;sectionBeforeNavigate.current=null;setBundle(null);setContextReady(false);setVisitId(null);setTabState('summary');rememberBackground('summary');setError('');setRecordNotice('');setLoading(true);currentUrl.current=window.location.href;historyIndex.current=window.history.state?.noimaPatientIndex??0;window.history.replaceState({...window.history.state,noimaPatientIndex:historyIndex.current},'',currentUrl.current);applyLocation(window.location.search);void loadShell();void load();const read=()=>{void historyRead.current()};window.addEventListener('popstate',read);return()=>window.removeEventListener('popstate',read)},[patientRef]);
 useEffect(()=>{const refresh=()=>{if(document.visibilityState==='visible'&&['summary','history'].includes(tab))void load()};const timer=setInterval(refresh,30000);window.addEventListener('focus',refresh);return()=>{clearInterval(timer);window.removeEventListener('focus',refresh)}},[patientRef,tab]);
 async function setTab(next:Tab,sessionId?:string|null){if(previewBundle&&next==='record'){setError('Η συνθετική δοκιμή επιτρέπει ανάγνωση και συνομιλία. Η επεξεργασία επίσκεψης είναι απενεργοποιημένη.');return false;}if(next==='record'&&sessionId===undefined&&!visitId){const open=bundle?.sessions.filter(s=>s.status==='draft')||[];sessionId=open.length===1?open[0].id:null}const sequence=++navigationSequence.current;try{await beforeNavigate.current?.()}catch(cause){if(sequence===navigationSequence.current)setError(cause instanceof Error?cause.message:'Δεν αποθηκεύτηκαν οι αλλαγές.');return false}if(sequence!==navigationSequence.current)return false;if(next!=='record'&&!await load())return false;if(sequence!==navigationSequence.current)return false;applyTab(next,sessionId);if(!sessionId)window.scrollTo({top:0});return true}
 useEffect(()=>{const dialog=recordDialog.current;if(!dialog)return;if(tab==='record'){if(!dialog.open)dialog.showModal();const overflow=document.body.style.overflow;document.body.style.overflow='hidden';return()=>{document.body.style.overflow=overflow;if(dialog.open)dialog.close()}}if(dialog.open)dialog.close()},[tab,bundle?.patient.id]);
 async function closeRecord(){await setTab(backgroundTabRef.current)}
 async function showMeasurements(assessmentId?:string){if(!await setTab('treatment'))return;const search=workspaceMeasurementSearch(window.location.search,assessmentId);window.history.replaceState({...window.history.state},'',window.location.pathname+search+window.location.hash);currentUrl.current=window.location.href;setSelectedAssessmentId(assessmentId||null);setMeasurementsOpen(true)}
 async function startSession(appointmentId?:string,type=visitType,confirmed=false){
  if(previewBundle||!bundle||startingRef.current)return;
  startingRef.current=true;setStarting(true);setVisitType(type);
  try{
   await beforeNavigate.current?.();
   const activeBundle=await loadShell();
   if(!activeBundle)throw new Error('Δεν ανανεώθηκε ο φάκελος πριν τη δημιουργία της καταγραφής.');
   const drafts=activeBundle.sessions.filter(s=>s.status==='draft');const draft=drafts.length===1?drafts[0]:undefined;
   const requestedId=appointmentId||new URLSearchParams(window.location.search).get('appointment');
   const requested=requestedId?activeBundle.appointments.find(a=>a.id===requestedId):undefined;
   if(requestedId&&!requested){const clean=workspaceTransitionSearch(window.location.search,tab,visitId,{clearAppointment:true});window.history.replaceState({...window.history.state},'',window.location.pathname+clean+window.location.hash);throw new Error('Το συγκεκριμένο ραντεβού δεν ανήκει πλέον στον φάκελο.');}
   if(requested&&requested.status!=='scheduled'&&!requested.session_id){const clean=workspaceTransitionSearch(window.location.search,tab,visitId,{clearAppointment:true});window.history.replaceState({...window.history.state},'',window.location.pathname+clean+window.location.hash);throw new Error('Το συγκεκριμένο ραντεβού δεν είναι πλέον ενεργό.');}
   if(requested?.session_id){navigationSequence.current++;applyTab('record',requested.session_id,{clearAppointment:true});return}
   if(drafts.length>1&&!requested){navigationSequence.current++;applyTab('record',null);return}
   if(draft&&!requested){navigationSequence.current++;applyTab('record',draft.id,{clearAppointment:true});return}
   const today=new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Athens',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
   const sameDay=activeBundle.appointments.filter(a=>a.status==='scheduled'&&!a.session_id&&new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Athens',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(a.scheduled_start))===today);
   if(!requestedId&&sameDay.length>1){setAppointmentChoices(sameDay);return}
   const appointment=requested||(sameDay.length===1?sameDay[0]:undefined);
   if(appointment&&!appointment.session_id&&new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Athens',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(appointment.scheduled_start))!==today&&!confirmed){setPendingStart({appointment,type});return}
   setError('');
   const result=await demoPost({action:'start_session',patient_id:activeBundle.patient.id,session_type:appointment?.appointment_type||type,appointment_id:appointment?.id||null}) as {session?:{id?:string}};
   fullLoadSequence.current++;
   setAppointmentChoices([]);const id=result.session?.id;if(!id)throw new Error('Δεν επιστράφηκε συνεδρία.');
   const shell=await loadShell();if(!shell)throw new Error('Η καταγραφή δημιουργήθηκε αλλά ο φάκελος δεν ανανεώθηκε.');navigationSequence.current++;applyTab('record',id,{clearAppointment:true});void load();
  }catch(cause){setError(cause instanceof Error?cause.message:'Δεν δημιουργήθηκε η καταγραφή.')}
  finally{startingRef.current=false;setStarting(false)}
 }
 async function handleFinalized(session:PatientBundle['sessions'][number]){
  const current=bundleRef.current;
  if(!current||current.patient.id!==activePatientRef.current)throw new Error('Ο φάκελος άλλαξε κατά την οριστικοποίηση.');
  confirmedCompletion(session,session.id,current.patient.id);
  shellLoadSequence.current++;fullLoadSequence.current++;navigationSequence.current++;setRecordNotice('');
  setBundle(reconcileRecord(current,{...current,sessions:current.sessions.map(row=>row.id===session.id?session:row)}));
  const fresh=await load();if(!fresh)throw new Error('Η καταγραφή οριστικοποιήθηκε, αλλά ο φάκελος δεν ανανεώθηκε.');
  confirmedCompletion(fresh.sessions.find(row=>row.id===session.id),session.id,current.patient.id);
  applyTab('record',session.id,{clearAppointment:true});setRecordNotice('Η καταγραφή οριστικοποιήθηκε.');
 }
 if(loading)return <main className="clinical-page"><div className="record-state">Φόρτωση κλινικού φακέλου…</div></main>; if(error&&!bundle)return <main className="clinical-page"><Link href="/patients" className="back">← Ασθενείς</Link><div className="record-state error" role="alert">{error}</div></main>; if(!bundle)return null;
 async function exportTechnicalRecord(){if(previewBundle)return;try{const r=await fetch('/api/patients/demo/export?tester='+getDemoTesterId()+'&patient='+bundle!.patient.id);if(!r.ok)throw new Error('Δεν έγινε εξαγωγή.');const url=URL.createObjectURL(await r.blob());const link=document.createElement('a');link.href=url;link.download='noima-patient-'+bundle!.patient.id+'.txt';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000)}catch(cause){setError(cause instanceof Error?cause.message:'Δεν έγινε εξαγωγή.')}}
 const appointmentRef=typeof window!=='undefined'?new URLSearchParams(window.location.search).get('appointment'):null;
 const intended=bundle.appointments.find(a=>a.id===appointmentRef&&(a.status==='scheduled'||Boolean(a.session_id)));
 const record=patientRecord(bundle); const p=bundle.patient; const drafts=bundle.sessions.filter(s=>s.status==='draft'); const draft=drafts.length===1?drafts[0]:undefined; const draftAppointment=draft?bundle.appointments.find(a=>a.session_id===draft.id):undefined; const heroAppointment=intended||(draft?draftAppointment:undefined); const isEstablished=hasCompletedClinicalHistory(bundle); const heroAction=workspaceHeroAction(isEstablished,Boolean(draft),Boolean(heroAppointment));
 return <main className={`app-shell secondary-shell ${styles.patientShell}${mobileV2Enabled?` ${mobileStyles.scope}`:``}`} onClickCapture={e=>{const link=(e.target as HTMLElement).closest('a');if(previewBundle&&link?.closest('.patient-workspace-content')){e.preventDefault();e.stopPropagation();setError('Η συνθετική δοκιμή επιτρέπει ανάγνωση και συνομιλία. Οι αλλαγές και η εξαγωγή είναι απενεργοποιημένες.');return;}if(!link||e.defaultPrevented||e.button!==0||e.metaKey||e.ctrlKey||e.shiftKey||e.altKey||link.target==='_blank'||link.hasAttribute('download'))return;const url=new URL(link.href);if(url.origin!==window.location.origin||!beforeNavigate.current)return;e.preventDefault();e.stopPropagation();const sequence=++navigationSequence.current;void beforeNavigate.current!().then(()=>{if(sequence===navigationSequence.current)window.location.assign(url.href)}).catch(cause=>{if(sequence===navigationSequence.current)setError(cause instanceof Error?cause.message:'Δεν αποθηκεύτηκαν οι αλλαγές.')})}}><MobileClinicalNav active="patients"/><aside id="app-navigation" role={mobileNav?"dialog":undefined} aria-modal={mobileNav||undefined} aria-label="Κύρια πλοήγηση" className={mobileNav?'sidebar mobile-open':'sidebar'}><button className="mobile-nav-close" onClick={()=>setMobileNav(false)} aria-label="Κλείσιμο μενού"><X size={20}/></button><div className="brand"><Link href="/" className="brand-mark" aria-label="Μετάβαση στην Επισκόπηση" title="Επισκόπηση">Ψ</Link><div className="brand-copy"><div className="brand-sub">Για μια οργανωμένη κλινική πράξη</div></div></div><nav className="nav"><Link href="/" className="nav-item"><Home size={19}/><span>Επισκόπηση</span></Link><Link href="/calendar" className="nav-item"><CalendarDays size={19}/><span>Ημερολόγιο</span></Link><Link href="/patients" className="nav-item active"><Users size={19}/><span>Ασθενείς</span></Link><Link href="/psychometrics" className="nav-item"><BookOpen size={19}/><span>Βιβλιοθήκη</span></Link></nav></aside>{mobileNav&&<button className="mobile-nav-backdrop" tabIndex={-1} aria-label="Κλείσιμο μενού" onClick={()=>setMobileNav(false)}/>}<section className={`workspace ${styles.workspace}`}><header className="topbar"><button className="mobile-menu-button" aria-expanded={mobileNav} aria-controls="app-navigation" onClick={()=>setMobileNav(true)} aria-label="Άνοιγμα μενού"><Menu size={21}/></button><PilotProfile/></header><div className="generic-patient-page">
  {previewBundle&&<p className="record-state" role="status">Συνθετική ασθενής · Κανονική καρτέλα για δοκιμή του Βοηθού Ψ · Μόνο ανάγνωση</p>}
  <div className={`patient-hero compact ${styles.identity} ${styles.hero}`}><div><span className="kicker">FICTIONAL TEST DATA</span><h1>{p.first_name} {p.last_name}</h1><p className="patient-record-context">Κλινικός φάκελος{p.reported_age!==null?` · ${p.reported_age} ετών`:``}{!isEstablished?` · Νέος ασθενής`:``}{p.amka?` · ΑΜΚΑ ••••${p.amka.slice(-4)}`:``}</p>{record.latestVisit&&<p className={styles.headerNote}>Τελευταία επίσκεψη · {formatClinicAppointment(record.latestVisit.started_at)}</p>}{record.nextAppointment&&<p className={styles.headerNote}>Επόμενο ραντεβού · {formatClinicAppointment(record.nextAppointment.scheduled_start)}</p>}</div><button className={`patient-voice-cta ${heroAction==='new_initial'?styles.compactHeroAction:''}`} onClick={()=>void startSession(heroAppointment?.id,draft?(draft.session_type==='initial_assessment'?'initial_assessment':'follow_up'):isEstablished?'follow_up':'initial_assessment')} disabled={starting||Boolean(previewBundle)}><span className="patient-voice-icon"><Plus size={19}/></span><span><strong>{heroAction==='resume'?(draft?'Συνέχεια πρόχειρης επίσκεψης':heroAppointment?.session_id?'Άνοιγμα καταγραφής':'Νέα καταγραφή'):heroAction==='new_initial'?'Έναρξη αρχικής αξιολόγησης':'Νέα επανεξέταση'}</strong>{heroAction!=='new_initial'&&<small>{draft?'Πρόχειρο · αποθηκευμένο':heroAppointment?formatClinicAppointment(heroAppointment.scheduled_start):isEstablished?'Επανεξέταση':'Αρχική αξιολόγηση'}</small>}</span></button></div>{error&&<div className="record-state error" role="alert">{error}</div>}
  {recordNotice&&<div className="record-state saved-draft" role="status">{recordNotice}</div>}<div className={`patient-workspace-shell ${styles.shell}`}><nav className={styles.tabs} aria-label="Καρτέλες φακέλου"><Nav active={backgroundTab==='summary'} onClick={()=>void setTab('summary')} icon={<FileText size={16}/>} label="Σύνοψη"/><Nav active={backgroundTab==='timeline'} onClick={()=>void setTab('timeline')} icon={<HistoryIcon size={16}/>} label="Επισκέψεις"/><Nav active={backgroundTab==='treatment'} onClick={()=>void setTab('treatment')} icon={<Pill size={16}/>} label="Θεραπευτικό πλάνο"/><Nav active={backgroundTab==='history'} onClick={()=>void setTab('history')} icon={<BookOpen size={16}/>} label="Στοιχεία & ιστορικό"/>{!previewBundle&&<details className={styles.more}><summary aria-label="Περισσότερες επιλογές εξαγωγής" title="Περισσότερα">⋯</summary><div className={styles.exportMenu}><a className={styles.menuItem} href={'/api/patients/demo/export?tester='+encodeURIComponent(getDemoTesterId())+'&patient='+encodeURIComponent(bundle.patient.id)+'&format=print'} target="_blank" rel="noopener noreferrer" aria-label="Εκτυπώσιμος κλινικός φάκελος και αποθήκευση ως PDF"><Printer size={16}/><span>Εκτύπωση / PDF</span></a><button type="button" onClick={()=>void exportTechnicalRecord()} aria-label="Πλήρες τεχνικό αντίγραφο δεδομένων TXT"><FileText size={16}/><span>Αντίγραφο δεδομένων (TXT)</span></button></div></details>}</nav>
   <div className={`patient-workspace-content ${styles.contentSurface}`}><fieldset disabled={Boolean(previewBundle)} style={{border:0,padding:0,margin:0,minWidth:0}}>{!contextReady&&<p role="status">Φόρτωση διαχρονικού φακέλου…</p>}{contextReady&&<>
    {backgroundTab==='summary'&&<PatientRecordSummary bundle={bundle} reload={load} onTimeline={()=>void setTab('timeline')} onVisit={(id)=>void setTab('record',id)} onMeasurements={(id)=>void showMeasurements(id)} onTreatment={()=>void setTab('treatment')} onHistory={()=>void setTab('history')}/>}
    {backgroundTab==='timeline'&&<PatientTimeline bundle={bundle} selectedSessionId={null} onVisit={(id)=>void setTab('record',id)} onMeasurements={(id)=>void showMeasurements(id)} onTreatment={()=>void setTab('treatment')} viewer={null} beforeNavigate={sectionBeforeNavigate} priorCourseEnabled={!previewBundle}/>}
    {backgroundTab==='treatment'&&<PatientTreatment bundle={bundle} reload={load} beforeNavigate={sectionBeforeNavigate} measurementsOpen={measurementsOpen} selectedAssessmentId={selectedAssessmentId}/>}
    {backgroundTab==='history'&&<HistoryPanel bundle={bundle} reload={load} beforeNavigate={sectionBeforeNavigate}/>}

   </>}</fieldset></div><dialog ref={recordDialog} className={styles.recordDialog} aria-labelledby="record-dialog-title" onCancel={e=>{e.preventDefault();void closeRecord()}}><header className={styles.recordDialogHeader}><div><h2 id="record-dialog-title">Καταγραφή επίσκεψης</h2><p>{p.first_name} {p.last_name}</p></div><button type="button" onClick={()=>void closeRecord()} aria-label="Κλείσιμο καταγραφής και επιστροφή στον φάκελο"><X size={22}/></button></header>{error&&<div className="record-state error" role="alert">{error}</div>}{recordNotice&&<div className="record-state saved-draft" role="status">{recordNotice}</div>}    {tab==='record'&&!visitId&&<section className="record-entry"><h2>Καταγραφή</h2>{intended?.session_id?<button onClick={()=>void setTab('record',intended.session_id)}>Άνοιγμα καταγραφής · {formatClinicAppointment(intended.scheduled_start)}</button>:drafts.length>0?<><p>Συνέχιση πρόχειρης καταγραφής</p>{drafts.map(s=><button key={s.id} onClick={()=>void setTab('record',s.id)}>{s.session_type==='initial_assessment'?'Αρχική αξιολόγηση':'Επανεξέταση'} · {formatClinicAppointment(s.started_at)}</button>)}</>:<button disabled={starting} onClick={()=>void startSession(intended?.id,isEstablished?'follow_up':'initial_assessment')}>{isEstablished?'Νέα επανεξέταση':'Νέα αρχική αξιολόγηση'}</button>}</section>}<div> {visitId&&<VisitWorkspace beforeNavigate={visitBeforeNavigate} key={visitId} sessionId={visitId} patientId={p.id} context={contextReady?bundle:null} reloadContext={load} onDeferred={async(_,reason)=>{navigationSequence.current++;setRecordNotice('Η καταγραφή αποθηκεύτηκε ως πρόχειρη και προστέθηκε στις εκκρεμότητές σας.'+(reason?' '+reason:''));applyTab('summary',visitId,{clearAppointment:true})}} onFinalized={handleFinalized} onSelect={(id)=>void setTab('record',id)}/>}
</div></dialog></div>
 </div></section>
 {pendingStart&&<AppointmentStartConfirmation scheduledStart={pendingStart.appointment.scheduled_start} onCancel={()=>setPendingStart(null)} onConfirm={()=>{const pending=pendingStart;setPendingStart(null);void startSession(pending.appointment.id,pending.type,true)}}/>}
 {appointmentChoices.length>1&&<div className="entry-modal-backdrop" onClick={()=>setAppointmentChoices([])}><section className="entry-modal appointment-choice-modal" onClick={e=>e.stopPropagation()}><button className="entry-close" onClick={()=>setAppointmentChoices([])} aria-label="Κλείσιμο"><X size={19}/></button><span className="kicker">ΝΕΑ ΚΑΤΑΓΡΑΦΗ</span><h2>Ποιο σημερινό ραντεβού;</h2><p>Υπάρχουν περισσότερα από ένα προγραμματισμένα ραντεβού για τον ίδιο ασθενή. Επιλέξτε σε ποιο ραντεβού ανήκει η καταγραφή.</p><div className="appointment-choice-list">{appointmentChoices.map(a=><button key={a.id} disabled={starting} onClick={()=>void startSession(a.id)}><strong>{formatClinicAppointment(a.scheduled_start)}</strong><span>{a.appointment_type==='initial_assessment'?'Αρχική αξιολόγηση':a.appointment_type==='other'?'Άλλο':'Επανεξέταση'}</span></button>)}</div><button disabled={starting} onClick={()=>setAppointmentChoices([])}>Ακύρωση</button></section></div>}

 </main>
}
function Nav({active,onClick,icon,label,badge}:{active:boolean;onClick:()=>void;icon:React.ReactNode;label:string;badge?:string}){return <button data-record-tab={label==='Καταγραφή'?true:undefined} aria-current={active?'page':undefined} onClick={onClick}>{icon}<span>{label}</span>{badge&&<i>{badge}</i>}</button>}


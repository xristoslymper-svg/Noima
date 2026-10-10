'use client';
import {useEffect,useRef,useState} from 'react';
import {createPortal} from 'react-dom';
import {Check,Mic2,Pause,Play,RotateCcw,Sparkles,X} from 'lucide-react';
import {ClinicalWriting,recoverWriting,writingBusy,type WritingPending,type WritingProvenance,type WritingSnapshot} from '@/lib/clinical/clinical-writing';
import {FieldRecorder} from '@/lib/clinical/field-recorder';
import {recorderDockPosition} from '@/lib/clinical/recorder-layout';
import styles from './ClinicalTextField.module.css';
export type WritingCommit={pending:WritingPending;provenance:WritingProvenance;rememberProposal:(id:string)=>void};
type Props={sessionId:string;section:string;fieldKey:string;title:string;value:string;onChange:(text:string)=>void;onConfirm:(text:string,commit:WritingCommit)=>Promise<void>;onBlur?:()=>void;rows?:number;placeholder?:string;maxLength?:number;className?:string;fullMicLabel?:boolean;registerFlusher:(key:string,flush:()=>Promise<void>)=>(()=>void);onDirtyChange:(key:string,dirty:boolean)=>void;onPendingChange?:(pending:boolean)=>void;recovery?:WritingPending|null;onRecoveryConsumed?:()=>void};
let activeCapture:symbol|null=null;
export default function ClinicalTextField(p:Props){
 const [snapshot,setSnapshot]=useState<WritingSnapshot>({phase:'idle',pending:null,error:'',confirmed:p.value});
 const [seconds,setSeconds]=useState(0),[undo,setUndo]=useState<{before:string;after:string;expires:number}|null>(null);
 const [cancelOpen,setCancelOpen]=useState(false);
 const controller=useRef<ClinicalWriting|null>(null);if(!controller.current)controller.current=new ClinicalWriting(p.value,setSnapshot);const machine=controller.current;
 const lease=useRef<symbol|null>(null);
 const latest=useRef(p);latest.current=p;
 const recorder=useRef<FieldRecorder|null>(null),request=useRef<AbortController|null>(null),audio=useRef<Blob|null>(null),textarea=useRef<HTMLTextAreaElement>(null),mounted=useRef(false),dock=useRef<HTMLDivElement>(null);
 const key='writing:'+p.section+':'+p.fieldKey,storageKey='noima-writing:'+p.sessionId+':'+p.section+':'+p.fieldKey;
 const busy=writingBusy(snapshot.phase),pending=Boolean(snapshot.pending),awaitingAudio=Boolean(audio.current),floating=['permission','recording','paused','transcribing'].includes(snapshot.phase);
 useEffect(()=>{machine.sync(p.value)},[machine,p.value]);
 useEffect(()=>{
  mounted.current=true;
  try{const stored=sessionStorage.getItem(storageKey);const recovered=stored&&recoverWriting(JSON.parse(stored));if(recovered)machine.recover(recovered)}catch{}
  return()=>{mounted.current=false;request.current?.abort();recorder.current?.cancel();if(activeCapture===lease.current)activeCapture=null;machine.stop()};
 },[machine,storageKey]);
 useEffect(()=>{if(!p.recovery||machine.snapshot.pending||writingBusy(machine.snapshot.phase))return;machine.recover(p.recovery);p.onRecoveryConsumed?.()},[machine,p.recovery,p.onRecoveryConsumed]);
 useEffect(()=>{try{if(snapshot.pending)sessionStorage.setItem(storageKey,JSON.stringify(snapshot.pending));else if(mounted.current)sessionStorage.removeItem(storageKey)}catch{}},[snapshot.pending,storageKey]);
 useEffect(()=>p.registerFlusher(key,async()=>{try{if(audio.current)throw new Error();machine.assertSafe()}catch{textarea.current?.focus();throw new Error('Ολοκληρώστε τον έλεγχο στο πεδίο «'+latest.current.title+'» πριν συνεχίσετε.')}}),[machine,key,p.registerFlusher]);
 useEffect(()=>{latest.current.onDirtyChange(key,pending||busy||awaitingAudio);latest.current.onPendingChange?.(pending||busy||awaitingAudio);return()=>{latest.current.onDirtyChange(key,false);latest.current.onPendingChange?.(false)}},[key,pending,busy,awaitingAudio]);
 useEffect(()=>{if(!pending&&!busy&&!awaitingAudio)return;const warn=(e:BeforeUnloadEvent)=>{e.preventDefault();e.returnValue=''};window.addEventListener('beforeunload',warn);return()=>window.removeEventListener('beforeunload',warn)},[pending,busy,awaitingAudio]);
 useEffect(()=>{
  if(!floating)return;
  document.body.classList.add('clinical-recording-active');
  let frame=0;
  const footers=[...document.querySelectorAll<HTMLElement>('.finalize-bar')];
  const position=()=>{
   frame=0;const el=dock.current;if(!el)return;
   const viewport=window.visualViewport;
   const placement=recorderDockPosition({layoutHeight:window.innerHeight,viewport:{left:viewport?.offsetLeft??0,top:viewport?.offsetTop??0,width:viewport?.width??window.innerWidth,height:viewport?.height??window.innerHeight},dock:{width:el.offsetWidth,height:el.offsetHeight},footers:footers.filter(f=>f.getClientRects().length>0&&getComputedStyle(f).visibility!=='hidden').map(f=>f.getBoundingClientRect())});
   el.style.left=placement.left+'px';el.style.right='auto';el.style.bottom=`calc(${placement.bottom}px + env(safe-area-inset-bottom, 0px))`;el.style.maxWidth=placement.maxWidth+'px';
   document.documentElement.style.setProperty('--clinical-recorder-clearance',(placement.bottom+el.offsetHeight+16)+'px');
  };
  const schedule=()=>{if(!frame)frame=requestAnimationFrame(position)};
  const observer=typeof ResizeObserver==='undefined'?null:new ResizeObserver(schedule);
  if(dock.current)observer?.observe(dock.current);footers.forEach(f=>observer?.observe(f));
  window.addEventListener('resize',schedule);window.addEventListener('scroll',schedule,true);window.visualViewport?.addEventListener('resize',schedule);window.visualViewport?.addEventListener('scroll',schedule);position();
  return()=>{if(frame)cancelAnimationFrame(frame);observer?.disconnect();window.removeEventListener('resize',schedule);window.removeEventListener('scroll',schedule,true);window.visualViewport?.removeEventListener('resize',schedule);window.visualViewport?.removeEventListener('scroll',schedule);document.body.classList.remove('clinical-recording-active');document.documentElement.style.removeProperty('--clinical-recorder-clearance')};
 },[floating]);
 useEffect(()=>{if(!undo)return;const timer=setTimeout(()=>setUndo(null),Math.max(0,undo.expires-Date.now()));return()=>clearTimeout(timer)},[undo]);
 function releaseCapture(token:symbol|null){if(activeCapture===token)activeCapture=null;if(lease.current===token)lease.current=null}
 function stop(){request.current?.abort();recorder.current?.cancel();recorder.current=null;audio.current=null;releaseCapture(lease.current);setCancelOpen(false);machine.stop()}
 function retryTranscription(){if(activeCapture||writingBusy(machine.snapshot.phase)){machine.error('Ολοκληρώστε πρώτα την ενεργή υπαγόρευση.');return}const blob=audio.current;if(!blob)return;machine.stop();const ticket=machine.start('permission');if(ticket!==null){const token=Symbol('clinical-capture');activeCapture=token;lease.current=token;setCancelOpen(false);void transcribe(blob,ticket,token)}}
 async function transcribe(blob:Blob,id:number,token:symbol){
  if(!mounted.current||!machine.current(id)){releaseCapture(token);return}audio.current=blob;machine.phase('transcribing');const abort=new AbortController();request.current=abort;const timeout=setTimeout(()=>abort.abort(),95000);
  try{const form=new FormData();form.set('audio',blob,blob.type.includes('mp4')?'dictation.m4a':'dictation.webm');const r=await fetch('/api/transcribe',{method:'POST',body:form,signal:abort.signal});const result=await r.json();if(!r.ok||typeof result.text!=='string'||!result.text.trim())throw new Error(result.error||'Δεν προέκυψε μεταγραφή. Δοκιμάστε ξανά.');if(mounted.current&&machine.current(id)){machine.transcribed(id,result.text);audio.current=null;setCancelOpen(false);textarea.current?.focus()}}
  catch(e){if(mounted.current&&machine.current(id))machine.fail(id,e instanceof Error&&e.name!=='AbortError'?e.message:'Η μεταγραφή δεν ολοκληρώθηκε. Ο ήχος παραμένει διαθέσιμος για νέα προσπάθεια.')}
  finally{clearTimeout(timeout);releaseCapture(token)}
 }
 async function record(){
  if(writingBusy(machine.snapshot.phase))return;
  if(activeCapture){machine.error('Ολοκληρώστε πρώτα την ενεργή υπαγόρευση.');return}
  if(audio.current){machine.error('Υπάρχει ήχος προς μεταγραφή. Δοκιμάστε ξανά ή απορρίψτε τον πρώτα.');return}
  const id=machine.start('permission');if(id===null)return;const token=Symbol('clinical-capture');activeCapture=token;lease.current=token;setCancelOpen(false);setUndo(null);audio.current=null;setSeconds(0);
  const capture=new FieldRecorder((state,time)=>{if(mounted.current&&machine.current(id)){setSeconds(time);machine.phase(state)}},blob=>void transcribe(blob,id,token),error=>{releaseCapture(token);if(mounted.current)machine.fail(id,error)});recorder.current=capture;
  try{await capture.start()}catch(e){releaseCapture(token);if(mounted.current)machine.fail(id,e instanceof Error?e.message:'Δεν ήταν δυνατή η πρόσβαση στο μικρόφωνο.')}
 }
 async function polish(){
  if(audio.current)return;
  const base=machine.snapshot.confirmed;if(base.trim().length<2)return;const id=machine.start('ai');if(id===null)return;setUndo(null);const abort=new AbortController();request.current=abort;const timeout=setTimeout(()=>abort.abort(),60000);
  try{const r=await fetch('/api/clinical/polish',{method:'POST',headers:{'Content-Type':'application/json'},signal:abort.signal,body:JSON.stringify({session_id:p.sessionId,section:p.section,field_key:p.fieldKey,text:base})});const result=await r.json();if(!r.ok)throw new Error(result.error||'Δεν δημιουργήθηκε πρόταση.');if(typeof result.text!=='string'||!result.text.trim())throw new Error('Η πρόταση δεν ήταν έγκυρη.');if(mounted.current){machine.polished(id,base,result.text,result.model);textarea.current?.focus()}}
  catch(e){if(mounted.current)machine.fail(id,e instanceof Error&&e.name!=='AbortError'?e.message:'Η βελτίωση ακυρώθηκε. Το αρχικό κείμενο διατηρείται.')}
  finally{clearTimeout(timeout)}
 }
 async function accept(){
  if(writingBusy(machine.snapshot.phase)||audio.current)return;
  try{const candidate=machine.assertReview();if(candidate.text.length>(p.maxLength??20000))throw new Error('Το κείμενο υπερβαίνει το επιτρεπόμενο μήκος.');machine.phase('saving');const provenance:WritingProvenance={kind:candidate.kind,original:candidate.base,transcript:candidate.transcript,reviewed_text:candidate.text,model:candidate.model,reviewed_at:new Date().toISOString()};await latest.current.onConfirm(candidate.text,{pending:candidate,provenance,rememberProposal:id=>machine.proposalId(id)});if(!mounted.current)return;machine.accepted(candidate.text);if(candidate.kind==='ai')setUndo({before:candidate.base,after:candidate.text,expires:Date.now()+10000});textarea.current?.focus()}
  catch(e){machine.error(e instanceof Error?e.message:'Δεν αποθηκεύτηκε το κείμενο. Ελέγξτε την καταγραφή και δοκιμάστε ξανά.')}
 }
 async function confirm(){await accept()}
 function askCancel(){if(snapshot.phase==='permission'){stop();return}if(snapshot.phase==='recording')recorder.current?.pause();setCancelOpen(true)}
 function focusField(){textarea.current?.scrollIntoView({block:'center',behavior:'smooth'});textarea.current?.focus({preventScroll:true})}
 const id=p.sessionId+'-'+p.section+'-'+p.fieldKey;
 const aiHint=awaitingAudio&&!busy?'Μεταγράψτε ή απορρίψτε πρώτα τον αποθηκευμένο ήχο.':busy?'Ολοκληρώστε πρώτα την ενεργή ενέργεια.':pending?'Επιβεβαιώστε πρώτα το κείμενο.':snapshot.confirmed.trim().length<2?'Γράψτε ή υπαγορεύστε κείμενο πρώτα.':'Βελτίωση διατύπωσης';
 const micHint=awaitingAudio&&!floating?'Μεταγράψτε ή απορρίψτε πρώτα τον αποθηκευμένο ήχο.':floating?'Η υπαγόρευση είναι ενεργή σε αυτό το πεδίο.':busy?'Ολοκληρώστε πρώτα την ενεργή ενέργεια.':snapshot.pending?.kind==='ai'?'Αποδεχτείτε ή απορρίψτε πρώτα την πρόταση AI.':'Υπαγόρευση';
 const status=snapshot.phase==='permission'?'Μικρόφωνο…':snapshot.phase==='transcribing'?'Μεταγραφή…':snapshot.phase==='paused'?'Σε παύση':'Ηχογράφηση';
 return <div className={styles.field} data-capture={floating||undefined}>
  <div className={styles.heading}><label htmlFor={id}>{p.title}</label><div className={styles.tools}>
   <button type="button" title={micHint} aria-label={'Υπαγόρευση: '+p.title} aria-pressed={floating} className={styles.mic} disabled={busy||awaitingAudio||snapshot.pending?.kind==='ai'} onClick={()=>void record()}><Mic2 size={15} aria-hidden="true"/>{p.fullMicLabel&&' Υπαγόρευση'}</button>
   <button type="button" title={aiHint} aria-label={'Βελτίωση διατύπωσης: '+p.title} disabled={busy||pending||awaitingAudio||snapshot.confirmed.trim().length<2} onClick={()=>void polish()}><Sparkles size={15} aria-hidden="true"/></button>
  </div></div>
  <textarea ref={textarea} id={id} className={p.className} rows={p.rows??2} maxLength={p.maxLength??20000} placeholder={p.placeholder} value={snapshot.pending?.text??p.value} readOnly={snapshot.phase==='saving'} onChange={e=>{machine.edit(e.target.value);if(!machine.snapshot.pending)latest.current.onChange(e.target.value);setUndo(null)}} onBlur={p.onBlur}/>
  {pending&&<div className={styles.review}><span>{snapshot.pending?.kind==='ai'?'Πρόταση AI':seconds>=60?'Όριο 1 λεπτού · συνέχεια με το μικρόφωνο':'Μεταγραφή προς έλεγχο'}</span><button type="button" disabled={busy||awaitingAudio} onClick={()=>void confirm()}><Check size={14} aria-hidden="true"/>{snapshot.pending?.kind==='ai'?'Αποδοχή':'Επιβεβαίωση'}</button><button type="button" disabled={busy} onClick={()=>{stop();machine.cancel();textarea.current?.focus()}}><RotateCcw size={14} aria-hidden="true"/>{snapshot.pending?.kind==='ai'?'Διατήρηση αρχικού':'Ακύρωση'}</button></div>}
  {snapshot.phase==='ai'&&<div role="status" className={styles.review}>Βελτίωση διατύπωσης…<button type="button" onClick={stop}>Ακύρωση</button></div>}
  {snapshot.error&&<div role="alert" className={styles.error}>{snapshot.error}{audio.current&&<button type="button" onClick={retryTranscription}>Νέα προσπάθεια μεταγραφής</button>}<button type="button" onClick={()=>audio.current?askCancel():stop()}>{audio.current?'Απόρριψη ήχου':'Κλείσιμο'}</button>{cancelOpen&&!floating&&<span> Απόρριψη του αποθηκευμένου ήχου; <button type="button" onClick={stop}>Απόρριψη</button><button type="button" onClick={()=>setCancelOpen(false)}>Πίσω</button></span>}</div>}
  {undo&&undo.after===p.value&&<button type="button" className={styles.undo} onClick={()=>{latest.current.onChange(undo.before);machine.sync(undo.before);setUndo(null)}}><RotateCcw size={13} aria-hidden="true"/> Αναίρεση</button>}
  {floating&&typeof document!=='undefined'&&createPortal(<div ref={dock} className={styles.recorder} role="region" aria-label={'Υπαγόρευση: '+p.title} aria-controls={id}>
   {cancelOpen?<><span className={styles.cancelPrompt}>Απόρριψη ήχου;</span><button type="button" onClick={stop}>Απόρριψη</button><button type="button" onClick={()=>setCancelOpen(false)}>Πίσω</button></>:<>
    <button type="button" className={styles.recordStatus} title={'Μετάβαση στο πεδίο: '+p.title} aria-label={'Μετάβαση στο πεδίο: '+p.title} onClick={focusField}><span className={styles.indicator} data-paused={snapshot.phase!=='recording'} aria-hidden="true"/><span role="status">{status}</span></button>
    {(snapshot.phase==='recording'||snapshot.phase==='paused')&&<><time className={styles.timer}>{Math.floor(seconds/60)}:{String(seconds%60).padStart(2,'0')}</time><button type="button" title={snapshot.phase==='paused'?'Συνέχιση':'Παύση'} aria-label={snapshot.phase==='paused'?'Συνέχιση υπαγόρευσης':'Παύση υπαγόρευσης'} onClick={()=>snapshot.phase==='paused'?recorder.current?.resume():recorder.current?.pause()}>{snapshot.phase==='paused'?<Play size={16} aria-hidden="true"/>:<Pause size={16} aria-hidden="true"/>}</button><button type="button" className={styles.finish} aria-label="Ολοκλήρωση υπαγόρευσης" title="Ολοκλήρωση και μεταγραφή" onClick={()=>{machine.phase('transcribing');recorder.current?.finish()}}><Check size={16} aria-hidden="true"/>Τέλος</button></>}
    <button type="button" aria-label="Ακύρωση ηχογράφησης" title="Ακύρωση ηχογράφησης" onClick={askCancel}><X size={16} aria-hidden="true"/></button>
   </>}
  </div>,document.body)}
 </div>;
}

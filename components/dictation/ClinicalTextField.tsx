'use client';
import {useEffect,useRef,useState} from 'react';
import {Check,Mic2,Pause,Play,RotateCcw,Sparkles,Square,X} from 'lucide-react';
import {ClinicalWriting,recoverWriting,writingBusy,type WritingPending,type WritingProvenance,type WritingSnapshot} from '@/lib/clinical/clinical-writing';
import {FieldRecorder} from '@/lib/clinical/field-recorder';
import styles from './ClinicalTextField.module.css';
export type WritingCommit={pending:WritingPending;provenance:WritingProvenance;rememberProposal:(id:string)=>void};
type Props={sessionId:string;section:string;fieldKey:string;title:string;value:string;onChange:(text:string)=>void;onConfirm:(text:string,commit:WritingCommit)=>Promise<void>;onBlur?:()=>void;rows?:number;placeholder?:string;maxLength?:number;className?:string;fullMicLabel?:boolean;registerFlusher:(key:string,flush:()=>Promise<void>)=>(()=>void);onDirtyChange:(key:string,dirty:boolean)=>void;onPendingChange?:(pending:boolean)=>void;recovery?:WritingPending|null;onRecoveryConsumed?:()=>void};
let activeCapture:symbol|null=null;
export default function ClinicalTextField(p:Props){
 const [snapshot,setSnapshot]=useState<WritingSnapshot>({phase:'idle',pending:null,error:'',confirmed:p.value});
 const [seconds,setSeconds]=useState(0),[undo,setUndo]=useState<{before:string;after:string;expires:number}|null>(null);
 const controller=useRef<ClinicalWriting|null>(null);if(!controller.current)controller.current=new ClinicalWriting(p.value,setSnapshot);const machine=controller.current;
 const lease=useRef(Symbol('clinical-microphone'));
 const latest=useRef(p);latest.current=p;
 const recorder=useRef<FieldRecorder|null>(null),request=useRef<AbortController|null>(null),audio=useRef<Blob|null>(null),textarea=useRef<HTMLTextAreaElement>(null),mounted=useRef(false);
 const key='writing:'+p.section+':'+p.fieldKey,storageKey='noima-writing:'+p.sessionId+':'+p.section+':'+p.fieldKey;
 const busy=writingBusy(snapshot.phase),pending=Boolean(snapshot.pending),floating=['permission','recording','paused','transcribing'].includes(snapshot.phase);
 useEffect(()=>{machine.sync(p.value)},[machine,p.value]);
 useEffect(()=>{
  mounted.current=true;
  try{const stored=sessionStorage.getItem(storageKey);const recovered=stored&&recoverWriting(JSON.parse(stored));if(recovered)machine.recover(recovered)}catch{}
  return()=>{mounted.current=false;request.current?.abort();recorder.current?.cancel();if(activeCapture===lease.current)activeCapture=null;machine.stop()};
 },[machine,storageKey]);
 useEffect(()=>{if(!p.recovery||machine.snapshot.pending||writingBusy(machine.snapshot.phase))return;machine.recover(p.recovery);p.onRecoveryConsumed?.()},[machine,p.recovery,p.onRecoveryConsumed]);
 useEffect(()=>{try{if(snapshot.pending)sessionStorage.setItem(storageKey,JSON.stringify(snapshot.pending));else if(mounted.current)sessionStorage.removeItem(storageKey)}catch{}},[snapshot.pending,storageKey]);
 useEffect(()=>p.registerFlusher(key,async()=>{try{machine.assertSafe()}catch{textarea.current?.focus();throw new Error('Ολοκληρώστε τον έλεγχο στο πεδίο «'+latest.current.title+'» πριν συνεχίσετε.')}}),[machine,key,p.registerFlusher]);
 useEffect(()=>{latest.current.onDirtyChange(key,pending||busy);latest.current.onPendingChange?.(pending||busy);return()=>{latest.current.onDirtyChange(key,false);latest.current.onPendingChange?.(false)}},[key,pending,busy]);
 useEffect(()=>{if(!pending&&!busy)return;const warn=(e:BeforeUnloadEvent)=>{e.preventDefault();e.returnValue=''};window.addEventListener('beforeunload',warn);return()=>window.removeEventListener('beforeunload',warn)},[pending,busy]);
 useEffect(()=>{if(!floating)return;document.body.classList.add('clinical-recording-active');return()=>document.body.classList.remove('clinical-recording-active')},[floating]);
 useEffect(()=>{if(!undo)return;const timer=setTimeout(()=>setUndo(null),Math.max(0,undo.expires-Date.now()));return()=>clearTimeout(timer)},[undo]);
 function stop(){request.current?.abort();recorder.current?.cancel();recorder.current=null;audio.current=null;if(activeCapture===lease.current)activeCapture=null;machine.stop()}
 function retryTranscription(){if(activeCapture||writingBusy(machine.snapshot.phase)){machine.error('Ολοκληρώστε πρώτα την ενεργή υπαγόρευση.');return}const blob=audio.current;if(!blob)return;machine.stop();const ticket=machine.start('permission');if(ticket!==null){activeCapture=lease.current;void transcribe(blob,ticket)}}
 async function transcribe(blob:Blob,id:number){
  if(!mounted.current||!machine.current(id))return;audio.current=blob;machine.phase('transcribing');const abort=new AbortController();request.current=abort;const timeout=setTimeout(()=>abort.abort(),95000);
  try{const form=new FormData();form.set('audio',blob,blob.type.includes('mp4')?'dictation.m4a':'dictation.webm');const r=await fetch('/api/transcribe',{method:'POST',body:form,signal:abort.signal});const result=await r.json();if(!r.ok||typeof result.text!=='string'||!result.text.trim())throw new Error(result.error||'Δεν προέκυψε μεταγραφή. Δοκιμάστε ξανά.');if(mounted.current&&machine.current(id)){machine.transcribed(id,result.text);audio.current=null;textarea.current?.focus()}}
  catch(e){if(mounted.current&&machine.current(id))machine.fail(id,e instanceof Error&&e.name!=='AbortError'?e.message:'Η μεταγραφή δεν ολοκληρώθηκε. Ο ήχος παραμένει διαθέσιμος για νέα προσπάθεια.')}
  finally{clearTimeout(timeout);if(activeCapture===lease.current)activeCapture=null}
 }
 async function record(){
  if(writingBusy(machine.snapshot.phase))return;
  if(activeCapture){machine.error('Ολοκληρώστε πρώτα την ενεργή υπαγόρευση.');return}
  const id=machine.start('permission');if(id===null)return;activeCapture=lease.current;setUndo(null);audio.current=null;setSeconds(0);
  const capture=new FieldRecorder((state,time)=>{if(mounted.current&&machine.current(id)){setSeconds(time);machine.phase(state)}},blob=>void transcribe(blob,id),error=>{if(activeCapture===lease.current)activeCapture=null;if(mounted.current)machine.fail(id,error)});recorder.current=capture;
  try{await capture.start()}catch(e){if(activeCapture===lease.current)activeCapture=null;machine.fail(id,e instanceof Error?e.message:'Δεν ήταν δυνατή η πρόσβαση στο μικρόφωνο.')}
 }
 async function polish(){
  const base=machine.snapshot.confirmed;if(base.trim().length<2)return;const id=machine.start('ai');if(id===null)return;setUndo(null);const abort=new AbortController();request.current=abort;const timeout=setTimeout(()=>abort.abort(),60000);
  try{const r=await fetch('/api/clinical/polish',{method:'POST',headers:{'Content-Type':'application/json'},signal:abort.signal,body:JSON.stringify({session_id:p.sessionId,section:p.section,field_key:p.fieldKey,text:base})});const result=await r.json();if(!r.ok)throw new Error(result.error||'Δεν δημιουργήθηκε πρόταση.');if(typeof result.text!=='string'||!result.text.trim())throw new Error('Η πρόταση δεν ήταν έγκυρη.');if(mounted.current){machine.polished(id,base,result.text,result.model);textarea.current?.focus()}}
  catch(e){if(mounted.current)machine.fail(id,e instanceof Error&&e.name!=='AbortError'?e.message:'Η βελτίωση ακυρώθηκε. Το αρχικό κείμενο διατηρείται.')}
  finally{clearTimeout(timeout)}
 }
 async function accept(){
  if(writingBusy(machine.snapshot.phase))return;
  try{const candidate=machine.assertReview();if(candidate.text.length>(p.maxLength??20000))throw new Error('Το κείμενο υπερβαίνει το επιτρεπόμενο μήκος.');machine.phase('saving');const provenance:WritingProvenance={kind:candidate.kind,original:candidate.base,transcript:candidate.transcript,reviewed_text:candidate.text,model:candidate.model,reviewed_at:new Date().toISOString()};await latest.current.onConfirm(candidate.text,{pending:candidate,provenance,rememberProposal:id=>machine.proposalId(id)});if(!mounted.current)return;machine.accepted(candidate.text);if(candidate.kind==='ai')setUndo({before:candidate.base,after:candidate.text,expires:Date.now()+10000});textarea.current?.focus()}
  catch(e){machine.error(e instanceof Error?e.message:'Δεν αποθηκεύτηκε το κείμενο. Ελέγξτε την καταγραφή και δοκιμάστε ξανά.')}
 }
 // Approval failures must keep the review and surface the draft's conflict.
 async function confirm(){await accept()}
 const id=p.sessionId+'-'+p.section+'-'+p.fieldKey;
 return <div className={styles.field}>
  <div className={styles.heading}><label htmlFor={id}>{p.title}</label><div className={styles.tools}>
   <button type="button" title="Υπαγόρευση" aria-label={'Υπαγόρευση: '+p.title} className={styles.mic} disabled={busy||snapshot.pending?.kind==='ai'} onClick={()=>void record()}><Mic2 size={15} aria-hidden="true"/>{p.fullMicLabel&&' Υπαγόρευση'}</button>
   <button type="button" title="Βελτίωση διατύπωσης" aria-label={'Βελτίωση διατύπωσης: '+p.title} disabled={busy||pending||snapshot.confirmed.trim().length<2} onClick={()=>void polish()}><Sparkles size={15} aria-hidden="true"/></button>
  </div></div>
  <textarea ref={textarea} id={id} className={p.className} rows={p.rows??2} maxLength={p.maxLength??20000} placeholder={p.placeholder} value={snapshot.pending?.text??p.value} readOnly={snapshot.phase==='saving'} onChange={e=>{machine.edit(e.target.value);if(!machine.snapshot.pending)latest.current.onChange(e.target.value);setUndo(null)}} onBlur={p.onBlur}/>
  {pending&&<div className={styles.review}><span>{snapshot.pending?.kind==='ai'?'Πρόταση AI':seconds>=60?'Όριο 1 λεπτού · συνέχεια με το μικρόφωνο':'Μεταγραφή προς έλεγχο'}</span><button type="button" disabled={busy} onClick={()=>void confirm()}><Check size={14} aria-hidden="true"/>{snapshot.pending?.kind==='ai'?'Αποδοχή':'Επιβεβαίωση'}</button><button type="button" disabled={busy} onClick={()=>{stop();machine.cancel();textarea.current?.focus()}}><RotateCcw size={14} aria-hidden="true"/>{snapshot.pending?.kind==='ai'?'Διατήρηση αρχικού':'Ακύρωση'}</button></div>}
  {snapshot.phase==='ai'&&<div role="status" className={styles.review}>Βελτίωση διατύπωσης…<button type="button" onClick={stop}>Ακύρωση</button></div>}
  {snapshot.error&&<div role="alert" className={styles.error}>{snapshot.error}{audio.current&&<button type="button" onClick={retryTranscription}>Νέα προσπάθεια μεταγραφής</button>}<button type="button" onClick={stop}>Κλείσιμο</button></div>}
  {undo&&undo.after===p.value&&<button type="button" className={styles.undo} onClick={()=>{latest.current.onChange(undo.before);machine.sync(undo.before);setUndo(null)}}><RotateCcw size={13} aria-hidden="true"/> Αναίρεση</button>}
  {floating&&<div className={styles.recorder} role="region" aria-label={'Υπαγόρευση: '+p.title}><span className={styles.recordTitle}>{p.title}</span><span className={styles.indicator} data-paused={snapshot.phase!=='recording'}/><span role="status">{snapshot.phase==='permission'?'Μικρόφωνο…':snapshot.phase==='transcribing'?'Μεταγραφή…':`${snapshot.phase==='paused'?'Παύση · ':''}${Math.floor(seconds/60)}:${String(seconds%60).padStart(2,'0')}`}</span>
   {(snapshot.phase==='recording'||snapshot.phase==='paused')&&<><button type="button" title={snapshot.phase==='paused'?'Συνέχιση':'Παύση'} aria-label={snapshot.phase==='paused'?'Συνέχιση υπαγόρευσης':'Παύση υπαγόρευσης'} onClick={()=>snapshot.phase==='paused'?recorder.current?.resume():recorder.current?.pause()}>{snapshot.phase==='paused'?<Play size={15}/>:<Pause size={15}/>}</button><button type="button" aria-label="Ολοκλήρωση υπαγόρευσης" title="Ολοκλήρωση" onClick={()=>{machine.phase('transcribing');recorder.current?.finish()}}><Square size={14}/></button></>}
   <button type="button" aria-label="Ακύρωση ηχογράφησης" title="Ακύρωση" onClick={stop}><X size={16}/></button>
  </div>}
 </div>;
}

'use client';
import {languageNames} from '@/i18n/config';
import {useSystemMessage} from '@/i18n/system-message';

import {useLocale,useTranslations} from 'next-intl';

import {readRecovery,writeRecovery} from '@/lib/clinical/browser-recovery';
import {useEffect,useRef,useState} from 'react';
import {Check,Mic,Pause,Play,RotateCcw,Sparkles,X} from 'lucide-react';
import {ClinicalWriting,recoverWriting,writingBusy,type WritingPending,type WritingProvenance,type WritingSnapshot} from '@/lib/clinical/clinical-writing';
import {FieldRecorder} from '@/lib/clinical/field-recorder';
import styles from './ClinicalTextField.module.css';
export type WritingCommit={pending:WritingPending;provenance:WritingProvenance;rememberProposal:(id:string)=>void};
type Props={toolsDisabled?:boolean;sessionId:string;section:string;fieldKey:string;title:string;value:string;onChange:(text:string)=>void;onConfirm:(text:string,commit:WritingCommit)=>Promise<void>;onBlur?:()=>void;rows?:number;placeholder?:string;maxLength?:number;className?:string;fullMicLabel?:boolean;sectionHeading?:boolean;registerFlusher:(key:string,flush:()=>Promise<void>)=>(()=>void);onDirtyChange:(key:string,dirty:boolean)=>void;onPendingChange?:(pending:boolean)=>void;recovery?:WritingPending|null;onRecoveryConsumed?:()=>void};
let activeCapture:symbol|null=null;

// Keep recording controls next to their field in the patient workspace.
export default function ClinicalTextField(p:Props){
 const t=useTranslations();
 const systemMessage=useSystemMessage();
 const locale=useLocale();

 const synthetic=Boolean(p.toolsDisabled);
 const [snapshot,setSnapshot]=useState<WritingSnapshot>({phase:'idle',pending:null,error:'',confirmed:p.value});
 const [seconds,setSeconds]=useState(0),[undo,setUndo]=useState<{before:string;after:string;expires:number}|null>(null);
 const [cancelOpen,setCancelOpen]=useState(false);
 const controller=useRef<ClinicalWriting|null>(null);if(!controller.current)controller.current=new ClinicalWriting(p.value,setSnapshot);const machine=controller.current;
 const lease=useRef<symbol|null>(null);
 const latest=useRef(p);latest.current=p;
 const recorder=useRef<FieldRecorder|null>(null),request=useRef<AbortController|null>(null),audio=useRef<Blob|null>(null),textarea=useRef<HTMLTextAreaElement>(null),mounted=useRef(false),controls=useRef<HTMLDivElement>(null);
 const key='writing:'+p.section+':'+p.fieldKey,storageKey='noima-writing:'+p.sessionId+':'+p.section+':'+p.fieldKey;
 const busy=writingBusy(snapshot.phase),pending=Boolean(snapshot.pending),awaitingAudio=Boolean(audio.current),capturing=['permission','recording','paused','transcribing'].includes(snapshot.phase);
 useEffect(()=>{machine.sync(p.value)},[machine,p.value]);
 useEffect(()=>{
  mounted.current=true;
  const leave=()=>{recorder.current?.cancel();if(activeCapture===lease.current)activeCapture=null;machine.stop()};window.addEventListener('pagehide',leave);
  try{const stored=readRecovery(sessionStorage,storageKey);const recovered=stored&&recoverWriting(JSON.parse(stored));if(recovered)machine.recover(recovered)}catch{}
  return()=>{window.removeEventListener('pagehide',leave);mounted.current=false;request.current?.abort();recorder.current?.cancel();if(activeCapture===lease.current)activeCapture=null;machine.stop()};
 },[machine,storageKey]);
 useEffect(()=>{if(!p.recovery||machine.snapshot.pending||writingBusy(machine.snapshot.phase))return;machine.recover(p.recovery);p.onRecoveryConsumed?.()},[machine,p.recovery,p.onRecoveryConsumed]);
 useEffect(()=>{try{if(snapshot.pending)writeRecovery(sessionStorage,storageKey,JSON.stringify(snapshot.pending));else if(mounted.current)sessionStorage.removeItem(storageKey)}catch{}},[snapshot.pending,storageKey]);
 useEffect(()=>p.registerFlusher(key,async()=>{try{if(audio.current)throw new Error();machine.assertSafe()}catch{textarea.current?.focus();revealControls();throw new Error(t('clinical.reviewFieldPrefix')+latest.current.title+t('clinical.reviewFieldSuffix'))}}),[machine,key,p.registerFlusher]);
 useEffect(()=>{latest.current.onDirtyChange(key,pending||busy||awaitingAudio);latest.current.onPendingChange?.(pending||busy||awaitingAudio);return()=>{latest.current.onDirtyChange(key,false);latest.current.onPendingChange?.(false)}},[key,pending,busy,awaitingAudio]);
 useEffect(()=>{if(!pending&&!busy&&!awaitingAudio)return;const warn=(e:BeforeUnloadEvent)=>{e.preventDefault();e.returnValue=''};window.addEventListener('beforeunload',warn);return()=>window.removeEventListener('beforeunload',warn)},[pending,busy,awaitingAudio]);
 // Scroll only when starting or resizing, never on timer updates or user scroll.
 useEffect(()=>{
  if(!capturing)return;
  let frame=0;const reveal=()=>{cancelAnimationFrame(frame);frame=requestAnimationFrame(revealControls)};
  reveal();window.addEventListener('resize',reveal);window.visualViewport?.addEventListener('resize',reveal);
  return()=>{cancelAnimationFrame(frame);window.removeEventListener('resize',reveal);window.visualViewport?.removeEventListener('resize',reveal)};
 },[capturing]);
 useEffect(()=>{if(!undo)return;const timer=setTimeout(()=>setUndo(null),Math.max(0,undo.expires-Date.now()));return()=>clearTimeout(timer)},[undo]);
 function revealControls(){
  const bar=controls.current;if(!bar)return;
  bar.scrollIntoView({block:'nearest',inline:'nearest'});
  const scroller=bar.closest<HTMLElement>('.visit-dialog');
  const footer=scroller?.querySelector<HTMLElement>('.finalize-bar');
  if(!scroller||!footer)return;
  const a=bar.getBoundingClientRect(),b=footer.getBoundingClientRect();
  if(b.height>0&&b.top<window.innerHeight&&a.right>b.left&&a.left<b.right&&a.bottom>b.top-12&&a.top<b.bottom)scroller.scrollTop+=a.bottom-b.top+12;
 }
 function releaseCapture(token:symbol|null){if(activeCapture===token)activeCapture=null;if(lease.current===token)lease.current=null}
 function stop(){request.current?.abort();recorder.current?.cancel();recorder.current=null;audio.current=null;releaseCapture(lease.current);setCancelOpen(false);machine.stop()}
 function retryTranscription(){if(activeCapture||writingBusy(machine.snapshot.phase)){machine.error(t('clinical.finishActiveDictation'));return}const blob=audio.current;if(!blob)return;machine.stop();const ticket=machine.start('permission');if(ticket!==null){const token=Symbol('clinical-capture');activeCapture=token;lease.current=token;setCancelOpen(false);void transcribe(blob,ticket,token)}}
 async function transcribe(blob:Blob,id:number,token:symbol){
  if(!mounted.current||!machine.current(id)){releaseCapture(token);return}audio.current=blob;machine.phase('transcribing');const abort=new AbortController();request.current=abort;const timeout=setTimeout(()=>abort.abort(),95000);
  try{const form=new FormData();form.set('audio',blob,blob.type.includes('mp4')?'dictation.m4a':'dictation.webm');const r=await fetch('/api/transcribe',{method:'POST',body:form,signal:abort.signal});const result=await r.json();if(!r.ok||typeof result.text!=='string'||!result.text.trim())throw new Error(result.error||t('errors.emptyTranscript'));if(mounted.current&&machine.current(id)){machine.transcribed(id,result.text);audio.current=null;setCancelOpen(false);textarea.current?.focus()}}
  catch(e){if(mounted.current&&machine.current(id))machine.fail(id,e instanceof Error&&e.name!=='AbortError'?e.message:t('errors.transcriptAudioPreserved'))}
  finally{clearTimeout(timeout);releaseCapture(token)}
 }
 async function record(){
  if(writingBusy(machine.snapshot.phase))return;
  if(activeCapture){machine.error(t('clinical.finishActiveDictation'));return}
  if(audio.current){machine.error(t('clinical.pendingAudioHelp'));return}
  const id=machine.start('permission');if(id===null)return;const token=Symbol('clinical-capture');activeCapture=token;lease.current=token;setCancelOpen(false);setUndo(null);audio.current=null;setSeconds(0);
  const capture=new FieldRecorder((state,time)=>{if(mounted.current&&machine.current(id)){setSeconds(time);machine.phase(state)}},blob=>void transcribe(blob,id,token),error=>{releaseCapture(token);if(mounted.current)machine.fail(id,error)});recorder.current=capture;
  try{await capture.start()}catch(e){releaseCapture(token);if(mounted.current)machine.fail(id,e instanceof Error?e.message:t('errors.microphoneAccess'))}
 }
 async function polish(){
  if(audio.current)return;
  const base=machine.snapshot.confirmed;if(base.trim().length<2)return;const id=machine.start('ai');if(id===null)return;setUndo(null);const abort=new AbortController();request.current=abort;const timeout=setTimeout(()=>abort.abort(),60000);
  try{const r=await fetch('/api/clinical/polish',{method:'POST',headers:{'Content-Type':'application/json'},signal:abort.signal,body:JSON.stringify({session_id:p.sessionId,section:p.section,field_key:p.fieldKey,text:base})});const result=await r.json();if(!r.ok)throw new Error(result.error||t('errors.suggestionCreate'));if(typeof result.text!=='string'||!result.text.trim())throw new Error(t('errors.suggestionInvalid'));if(mounted.current){machine.polished(id,base,result.text,result.model);textarea.current?.focus()}}
  catch(e){if(mounted.current)machine.fail(id,e instanceof Error&&e.name!=='AbortError'?e.message:t('clinical.writingCancelled'))}
  finally{clearTimeout(timeout)}
 }
 async function accept(){
  if(writingBusy(machine.snapshot.phase)||audio.current)return;
  try{const candidate=machine.assertReview();if(candidate.text.length>(p.maxLength??20000))throw new Error(t('validation.textTooLong'));machine.phase('saving');const provenance:WritingProvenance={kind:candidate.kind,original:candidate.base,transcript:candidate.transcript,reviewed_text:candidate.text,model:candidate.model,reviewed_at:new Date().toISOString()};await latest.current.onConfirm(candidate.text,{pending:candidate,provenance,rememberProposal:id=>machine.proposalId(id)});if(!mounted.current)return;machine.accepted(candidate.text);if(candidate.kind==='ai')setUndo({before:candidate.base,after:candidate.text,expires:Date.now()+10000});textarea.current?.focus()}
  catch(e){machine.error(e instanceof Error?e.message:t('errors.clinicalTextSave'))}
 }
 async function confirm(){await accept()}
 function askCancel(){if(snapshot.phase==='permission'){stop();return}if(snapshot.phase==='recording')recorder.current?.pause();setCancelOpen(true)}
 const id=p.sessionId+'-'+p.section+'-'+p.fieldKey;
 const aiHint=(awaitingAudio&&!busy?t('clinical.transcribeOrDiscardFirst'):busy?t('clinical.completeActiveAction'):pending?t('clinical.confirmTextFirst'):snapshot.confirmed.trim().length<2?t('clinical.enterTextFirst'):t('clinical.improveWording'))+' · '+t('clinical.newAiLanguage',{language:languageNames[locale]});
 const micHint=awaitingAudio&&!capturing?t('clinical.transcribeOrDiscardFirst'):capturing?t('clinical.dictationActiveField'):busy?t('clinical.completeActiveAction'):snapshot.pending?.kind==='ai'?t('clinical.reviewAiFirst'):t('clinical.dictation');
 const status=snapshot.phase==='permission'?t('clinical.microphoneLoading'):snapshot.phase==='transcribing'?t('clinical.transcriptionLoading'):snapshot.phase==='paused'?t('clinical.paused'):t('clinical.recording');
 return <div className={styles.field} data-capture={capturing||undefined}>
  <div className={styles.heading}>{p.sectionHeading?<h3 className="clinical-field-section-title"><label htmlFor={id}>{p.title}</label></h3>:<label htmlFor={id}>{p.title}</label>}<div className={styles.tools}>
   <button type="button" title={micHint} aria-label={t('accessibility.dictationPrefix')+p.title} aria-pressed={capturing} className={styles.mic} disabled={synthetic||busy||awaitingAudio||snapshot.pending?.kind==='ai'} onClick={()=>void record()}><Mic size={15} aria-hidden="true"/>{p.fullMicLabel&&t('clinical.dictation')}</button>
   <button type="button" title={aiHint} aria-label={t('accessibility.improveWordingPrefix')+p.title} disabled={synthetic||busy||pending||awaitingAudio||snapshot.confirmed.trim().length<2} onClick={()=>void polish()}><Sparkles size={15} aria-hidden="true"/><span>{t('clinical.aiWording')}</span></button>
  </div></div>
  <div className={styles.editor} data-writing-editor="true">
   <textarea ref={textarea} id={id} className={[styles.textarea,p.className].filter(Boolean).join(' ')} rows={p.rows??2} maxLength={p.maxLength??20000} placeholder={p.placeholder} value={snapshot.pending?.text??p.value} readOnly={snapshot.phase==='saving'} onChange={e=>{machine.edit(e.target.value);if(!machine.snapshot.pending)latest.current.onChange(e.target.value);setUndo(null)}} onBlur={p.onBlur}/>
   {capturing&&<div ref={controls} className={styles.recorder} data-writing-recorder="inline" role="region" aria-label={t('accessibility.dictationPrefix')+p.title} aria-controls={id}>
    {cancelOpen?<><span className={styles.recordStatus}>{t('clinical.discardAudioQuestion')}</span><div className={styles.actions}><button type="button" onClick={stop}>{t('common.discard')}</button><button type="button" onClick={()=>setCancelOpen(false)}>{t('common.goBack')}</button></div></>:<>
     <span className={styles.recordStatus} role="status"><span className={styles.indicator} data-paused={snapshot.phase!=='recording'} aria-hidden="true"/>{status}</span>
     <div className={styles.actions}>
      {(snapshot.phase==='recording'||snapshot.phase==='paused')&&<><time className={styles.timer}>{Math.floor(seconds/60)}:{String(seconds%60).padStart(2,'0')}</time><button type="button" title={snapshot.phase==='paused'?t('common.resume'):t('common.pause')} aria-label={snapshot.phase==='paused'?t('accessibility.resumeDictation'):t('accessibility.pauseDictation')} onClick={()=>snapshot.phase==='paused'?recorder.current?.resume():recorder.current?.pause()}>{snapshot.phase==='paused'?<Play size={16} aria-hidden="true"/>:<Pause size={16} aria-hidden="true"/>}</button><button type="button" className={styles.finish} aria-label={t('accessibility.finishDictation')} title={t('clinical.finishAndTranscribe')} onClick={()=>{machine.phase('transcribing');recorder.current?.finish()}}><Check size={16} aria-hidden="true"/>{t('common.finish')}</button></>}
      <button type="button" aria-label={t('accessibility.cancelRecording')} title={t('accessibility.cancelRecording')} onClick={askCancel}><X size={16} aria-hidden="true"/></button>
     </div>
    </>}
   </div>}
   {pending&&!capturing&&<div className={styles.review}><span>{snapshot.pending?.kind==='ai'?t('clinical.aiSuggestion'):seconds>=60?t('clinical.dictationLimit'):t('clinical.transcriptForReview')}</span><button type="button" disabled={busy||awaitingAudio} onClick={()=>void confirm()}><Check size={14} aria-hidden="true"/>{snapshot.pending?.kind==='ai'?t('common.accept'):t('common.confirm')}</button><button type="button" disabled={busy} onClick={()=>{stop();machine.cancel();textarea.current?.focus()}}><RotateCcw size={14} aria-hidden="true"/>{snapshot.pending?.kind==='ai'?t('clinical.keepOriginal'):t('common.cancel')}</button></div>}
   {snapshot.phase==='ai'&&<div role="status" className={styles.review}><span>{t('clinical.improvingWording')}</span><button type="button" onClick={stop}>{t('common.cancel')}</button></div>}
   {snapshot.error&&<div role="alert" className={styles.error}>{systemMessage(snapshot.error)}{audio.current&&<button type="button" onClick={retryTranscription}>{t('clinical.retryTranscription')}</button>}<button type="button" onClick={()=>audio.current?askCancel():stop()}>{audio.current?t('clinical.discardAudio'):t('common.close')}</button>{cancelOpen&&!capturing&&<span>  {t('clinical.discardSavedAudioQuestion')} <button type="button" onClick={stop}>{t('common.discard')}</button><button type="button" onClick={()=>setCancelOpen(false)}>{t('common.goBack')}</button></span>}</div>}
   {undo&&undo.after===p.value&&<div className={styles.review}><button type="button" className={styles.undo} onClick={()=>{latest.current.onChange(undo.before);machine.sync(undo.before);setUndo(null)}}><RotateCcw size={13} aria-hidden="true"/>  {t('common.undo')}</button></div>}
  </div>
 </div>;
}

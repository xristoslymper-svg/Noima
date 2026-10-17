'use client';
import {useCallback,useEffect,useLayoutEffect,useId,useRef,useState,type MutableRefObject} from 'react';
import {Check,Mic,Plus,Square,X} from 'lucide-react';
import {getDemoTesterId} from '@/lib/demo-tester';
import {readRecovery,writeRecovery} from '@/lib/clinical/browser-recovery';
import {FieldRecorder} from '@/lib/clinical/field-recorder';
import {confirmedPriorCourse,priorCourseInput,type PriorCourseRecord} from '@/lib/clinical/prior-course-record';
import styles from './PriorCourseSection.module.css';

type Props={patientId:string;beforeNavigate?:MutableRefObject<(()=>Promise<void>)|null>};
type Draft={version:number;period:string;content:string};
const fromRecord=(record:PriorCourseRecord|null):Draft=>({version:record?.version||0,period:record?.period_label||'',content:record?.content||''});
export default function PriorCourseSection({patientId,beforeNavigate}:Props){
 const tester=getDemoTesterId(),key='noima-prior-course:'+tester+':'+patientId,titleId=useId();
 const [record,setRecord]=useState<PriorCourseRecord|null>(null),[draft,setDraft]=useState<Draft>({version:0,period:'',content:''});
 const [ready,setReady]=useState(false),[loading,setLoading]=useState(true),[open,setOpen]=useState(false),[saving,setSaving]=useState(false),[error,setError]=useState(''),[saved,setSaved]=useState(false),[conflict,setConflict]=useState(false);
 const [phase,setPhase]=useState<'idle'|'permission'|'recording'|'paused'|'transcribing'>('idle'),[hasAudio,setHasAudio]=useState(false);
 const [seconds,setSeconds]=useState(0);
 const alive=useRef(false),latest=useRef(draft),savingRef=useRef(false),request=useRef<{signature:string;id:string}|null>(null),audio=useRef<Blob|null>(null),recorder=useRef<FieldRecorder|null>(null),transcription=useRef<AbortController|null>(null),loadAbort=useRef<AbortController|null>(null),textarea=useRef<HTMLTextAreaElement|null>(null);
 latest.current=draft;
 const initial=fromRecord(record),dirty=draft.content!==initial.content||draft.period!==initial.period;
 const voiceBusy=phase!=='idle';
 const pending=saving||voiceBusy||hasAudio||open&&dirty;
 const pendingRef=useRef(pending);pendingRef.current=pending;
 const guard=useCallback(async()=>{if(pendingRef.current)throw new Error('Αποθηκεύστε ή ακυρώστε την προηγούμενη κλινική πορεία πριν αλλάξετε περιοχή.')},[]);
 useLayoutEffect(()=>{if(!beforeNavigate)return;beforeNavigate.current=guard;return()=>{if(beforeNavigate.current===guard)beforeNavigate.current=null}});
 useEffect(()=>{alive.current=true;return()=>{alive.current=false;loadAbort.current?.abort();transcription.current?.abort();recorder.current?.cancel()}},[]);
 function clearDraft(){try{sessionStorage.removeItem(key)}catch{}}
 async function load(restore=true){
  loadAbort.current?.abort();const controller=new AbortController();loadAbort.current=controller;setLoading(true);setError('');
  try{
   const response=await fetch('/api/patients/demo/prior-course?'+new URLSearchParams({tester,patient_id:patientId}),{cache:'no-store',signal:controller.signal});
   const data=await response.json();if(!response.ok)throw new Error(data.error||'Δεν φορτώθηκε η προηγούμενη πορεία.');
   if(controller.signal.aborted||!alive.current)return;
   const row=data.priorCourse?confirmedPriorCourse(data.priorCourse,patientId,tester):null;setRecord(row);let next=fromRecord(row);let recovered=false;
   if(restore){try{const raw=readRecovery(sessionStorage,key);const value=raw?JSON.parse(raw):null;if(value&&Number.isSafeInteger(value.version)&&typeof value.period==='string'&&value.period.length<=120&&typeof value.content==='string'&&value.content.length<=12000&&(value.content!==next.content||value.period!==next.period)){next=value;recovered=true;if(value.version!==(row?.version||0)){setConflict(true);setError('Υπάρχει νεότερη αποθηκευμένη έκδοση. Το πρόχειρό σας διατηρήθηκε.')}}}catch{}}
   setDraft(next);setOpen(recovered);setReady(true);
  }catch(cause){if(!controller.signal.aborted&&alive.current){setReady(false);setError(cause instanceof Error?cause.message:'Δεν φορτώθηκε η προηγούμενη πορεία.')}}
  finally{if(!controller.signal.aborted&&alive.current)setLoading(false)}
 }
 useEffect(()=>{void load();return()=>loadAbort.current?.abort()},[patientId,tester]);
 useEffect(()=>{if(!ready||!open||!dirty)return;try{writeRecovery(sessionStorage,key,JSON.stringify(draft))}catch{/* Navigation remains guarded even when recovery storage is unavailable. */}},[key,draft,ready,open,dirty]);
 useEffect(()=>{if(!pending)return;const warn=(event:BeforeUnloadEvent)=>{event.preventDefault();event.returnValue=''};window.addEventListener('beforeunload',warn);return()=>window.removeEventListener('beforeunload',warn)},[pending]);
 useEffect(()=>{if(open)textarea.current?.focus()},[open]);
 function change(patch:Partial<Draft>){setDraft(value=>({...value,...patch}));setSaved(false)}
 function cancel(){if(savingRef.current||voiceBusy)return;if((dirty||hasAudio)&&!window.confirm('Να απορριφθεί το μη αποθηκευμένο πρόχειρο;'))return;recorder.current?.cancel();audio.current=null;setHasAudio(false);setDraft(fromRecord(record));setOpen(false);setError('');setConflict(false);request.current=null;clearDraft()}
 async function reloadSaved(){if(pending&&!window.confirm('Να φορτωθεί η αποθηκευμένη έκδοση; Το μη αποθηκευμένο πρόχειρο θα απορριφθεί.'))return;clearDraft();setConflict(false);request.current=null;await load(false)}
 async function save(){
  if(savingRef.current||!ready||voiceBusy||hasAudio||conflict)return;
  const signature=JSON.stringify(draft);if(request.current?.signature!==signature)request.current={signature,id:crypto.randomUUID()};
  let input;try{input=priorCourseInput({tester,patient_id:patientId,request_id:request.current.id,expected_version:draft.version,period_label:draft.period,content:draft.content})}catch{setError('Συμπληρώστε την προηγούμενη πορεία (15–12.000 χαρακτήρες).');return}
  savingRef.current=true;setSaving(true);setError('');
  try{
   const response=await fetch('/api/patients/demo/prior-course',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(input)});const data=await response.json();
   if(!response.ok){if(data.code==='stale_prior_course')setConflict(true);throw new Error(data.error||'Δεν επιβεβαιώθηκε η αποθήκευση. Δοκιμάστε ξανά.')}
   const row=confirmedPriorCourse(data.priorCourse,patientId,tester,input);if(!alive.current)return;
   setRecord(row);setDraft(fromRecord(row));setOpen(false);setSaved(true);clearDraft();request.current=null;
  }catch(cause){if(alive.current)setError(cause instanceof Error?cause.message:'Δεν επιβεβαιώθηκε η αποθήκευση. Το πρόχειρό σας διατηρείται.')}
  finally{savingRef.current=false;if(alive.current)setSaving(false)}
 }
 async function transcribe(blob:Blob){
  if(!alive.current)return;audio.current=blob;setHasAudio(true);setPhase('transcribing');setError('');const controller=new AbortController();transcription.current=controller;const timer=setTimeout(()=>controller.abort(),95000);
  try{const body=new FormData();body.set('audio',blob,blob.type.includes('mp4')?'course.m4a':'course.webm');const response=await fetch('/api/transcribe',{method:'POST',body,signal:controller.signal});const data=await response.json();if(!response.ok||typeof data.text!=='string'||!data.text.trim())throw new Error(data.error||'Δεν αναγνωρίστηκε κείμενο.');if(!alive.current)return;const next=[latest.current.content.trim(),data.text.trim()].filter(Boolean).join('\n');if(next.length>12000)throw new Error('Το κείμενο υπερβαίνει τους 12.000 χαρακτήρες. Συντομεύστε το και επαναλάβετε τη μεταγραφή.');change({content:next});audio.current=null;setHasAudio(false);textarea.current?.focus()}
  catch(cause){if(alive.current)setError(cause instanceof Error&&cause.name!=='AbortError'?cause.message:'Η μεταγραφή δεν ολοκληρώθηκε. Ο ήχος διατηρήθηκε για επανάληψη.')}
  finally{clearTimeout(timer);if(alive.current)setPhase('idle')}
 }
 async function recordAudio(){
  if(phase==='recording'||phase==='paused'){recorder.current?.finish();return}
  if(voiceBusy||savingRef.current||hasAudio)return;setPhase('permission');setError('');
  const capture=new FieldRecorder((state,time)=>{if(alive.current){setPhase(state);setSeconds(time)}},blob=>void transcribe(blob),message=>{if(alive.current){setPhase('idle');setError(message)}});recorder.current=capture;
  try{await capture.start()}catch(cause){if(alive.current){setPhase('idle');setError(cause instanceof Error?cause.message:'Δεν υπάρχει πρόσβαση στο μικρόφωνο.')}}
 }
 const status=<>{loading&&<p className={styles.meta} role="status">Φόρτωση προηγούμενης πορείας…</p>}{saved&&<p className={styles.success} role="status">Η προηγούμενη πορεία αποθηκεύτηκε.</p>}{error&&<p className={styles.error} role="alert">{error}{!ready&&!loading&&<button className={styles.secondary+' '+styles.retry} onClick={()=>void load()}>Επανάληψη</button>}{conflict&&<button className={styles.secondary+' '+styles.retry} onClick={()=>void reloadSaved()}>Φόρτωση αποθηκευμένης έκδοσης</button>}</p>}</>;
 return <section className={styles.section} data-prior-pending={pending} aria-label="Προηγούμενη κλινική πορεία">
  {!open&&<>{record?<div className={styles.read}><div className={styles.heading}><h3>Προηγούμενη κλινική πορεία</h3><button type="button" className={styles.action} onClick={()=>{setOpen(true);setSaved(false)}} disabled={!ready}>Επεξεργασία</button></div><p className={styles.meta}>Πριν από το NOIMA{record.period_label?' · '+record.period_label:''} · Αναδρομική καταχώριση</p><p className={styles.content}>{record.content}</p><small className={styles.meta}>Καταχωρίστηκε {new Intl.DateTimeFormat('el-GR',{dateStyle:'short',timeStyle:'short',timeZone:'Europe/Athens'}).format(new Date(record.created_at))}</small></div>:<button type="button" className={styles.action} disabled={!ready} onClick={()=>{setOpen(true);setSaved(false)}}><Plus size={16}/> Προηγούμενη κλινική πορεία</button>}{status}</>}
  {open&&<div className={styles.form} onKeyDown={event=>{if(event.key==='Escape'&&!voiceBusy&&!saving){event.preventDefault();event.stopPropagation();cancel()}}}>
   <div className={styles.heading}><div><span className={styles.meta}>ΠΡΙΝ ΑΠΟ ΤΟ NOIMA</span><h3 id={titleId}>Προηγούμενη κλινική πορεία</h3></div></div>
   <fieldset disabled={saving} style={{border:0,padding:0,margin:0,minWidth:0}}>
    <label className={styles.field}>Περίοδος προηγούμενης παρακολούθησης <small>Προαιρετικό</small><input maxLength={120} value={draft.period} onChange={event=>change({period:event.target.value})} placeholder="π.χ. 2020–2025 ή περίπου 1 έτος"/></label>
    <div className={styles.field}><label htmlFor={titleId+'-text'}>Κλινική πορεία</label><textarea id={titleId+'-text'} ref={textarea} rows={6} maxLength={12000} value={draft.content} onChange={event=>change({content:event.target.value})} placeholder="Αρχική εικόνα, σημαντικές μεταβολές, ανταπόκριση στη θεραπεία και πρόσφατη κατάσταση…"/></div>
    <div className={styles.actions}><button type="button" className={styles.secondary} onClick={()=>void recordAudio()} disabled={phase==='permission'||phase==='transcribing'||hasAudio} aria-pressed={phase==='recording'||phase==='paused'}>{phase==='recording'||phase==='paused'?<Square size={16}/>:<Mic size={16}/>} {phase==='permission'?'Άνοιγμα μικροφώνου…':phase==='transcribing'?'Μεταγραφή…':phase==='recording'||phase==='paused'?'Τέλος υπαγόρευσης':'Υπαγόρευση'}</button>{(phase==='recording'||phase==='paused')&&<span className={styles.recording}>{seconds}″ <button type="button" className={styles.secondary} onClick={()=>{recorder.current?.cancel();setPhase('idle')}}>Ακύρωση ήχου</button></span>}{hasAudio&&phase==='idle'&&<><button type="button" className={styles.secondary} onClick={()=>{if(audio.current)void transcribe(audio.current)}}>Επανάληψη μεταγραφής</button><button type="button" className={styles.secondary} onClick={()=>{audio.current=null;setHasAudio(false);setError('')}}>Απόρριψη ήχου</button></>}<button type="button" className={styles.secondary} onClick={cancel} disabled={voiceBusy}><X size={15}/> Ακύρωση</button><button type="button" className={styles.primary} onClick={()=>void save()} disabled={!ready||voiceBusy||hasAudio||conflict||draft.content.trim().length<15}><Check size={16}/>{saving?'Αποθήκευση…':'Αποθήκευση πορείας'}</button></div>
   </fieldset>{status}<p className={styles.note}>Αναδρομική καταγραφή θεράποντος, χωρίς δημιουργία επισκέψεων. Η αγωγή και η εκτίμηση κινδύνου δεν αλλάζουν.</p>
  </div>}
 </section>;
}

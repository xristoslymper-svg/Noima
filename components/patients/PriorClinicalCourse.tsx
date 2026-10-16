'use client';
import {useEffect,useRef,useState} from 'react';
import {Mic,Square,X,Check} from 'lucide-react';
import {getDemoTesterId} from '@/lib/demo-tester';
import type {PatientBundle} from '@/lib/patients/demo-runtime';
import styles from './PriorClinicalCourse.module.css';

export default function PriorClinicalCourse({bundle,reload,onClose}:{bundle:PatientBundle;reload:()=>Promise<unknown>;onClose:()=>void}){
 const initial=bundle.priorCourse;
 const [content,setContent]=useState(initial?.content||'');
 const [period,setPeriod]=useState(initial?.period_label||'');
 const [saving,setSaving]=useState(false),[error,setError]=useState(''),[recording,setRecording]=useState(false),[transcribing,setTranscribing]=useState(false);
 const recorder=useRef<MediaRecorder|null>(null),stream=useRef<MediaStream|null>(null);
 const busy=useRef(false);
 const saveRequestId=useRef<string|null>(null);
 const dirty=content!==(initial?.content||'')||period!==(initial?.period_label||'');
 function closeEditor(){if(dirty&&!window.confirm('Υπάρχουν μη αποθηκευμένες αλλαγές. Θέλετε να τις απορρίψετε;'))return;onClose();}
 useEffect(()=>{const onLeave=(e:BeforeUnloadEvent)=>{if(content!==(initial?.content||'')||period!==(initial?.period_label||'')){e.preventDefault();e.returnValue=''}};window.addEventListener('beforeunload',onLeave);return()=>window.removeEventListener('beforeunload',onLeave)},[content,period,initial]);
 useEffect(()=>()=>{recorder.current?.stop();stream.current?.getTracks().forEach(t=>t.stop())},[]);
 async function save(){
  if(busy.current)return;busy.current=true;setSaving(true);setError('');
  try{const response=await fetch('/api/patients/demo/prior-course',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({tester:getDemoTesterId(),patient_id:bundle.patient.id,request_id:saveRequestId.current||(saveRequestId.current=crypto.randomUUID()),expected_version:initial?.version||0,content,period_label:period})});
   const result=await response.json();if(!response.ok)throw new Error(result.error||'Αποτυχία αποθήκευσης.');
   await reload();onClose();
  }catch(e){setError(e instanceof Error?e.message:'Δεν αποθηκεύτηκε η προηγούμενη πορεία.')}
  finally{busy.current=false;setSaving(false)}
 }
 async function toggleRecording(){
  if(recording){recorder.current?.stop();setRecording(false);return}
  if(transcribing||saving)return;
  try{const audio=await navigator.mediaDevices.getUserMedia({audio:true});stream.current=audio;
    const chunks:Blob[]=[];const capture=new MediaRecorder(audio);recorder.current=capture;
    capture.ondataavailable=e=>{if(e.data.size)chunks.push(e.data)};
    capture.onstop=async()=>{audio.getTracks().forEach(t=>t.stop());setRecording(false);if(!chunks.length)return;setTranscribing(true);
      try{const body=new FormData();body.set('audio',new Blob(chunks,{type:capture.mimeType}),capture.mimeType.includes('mp4')?'course.m4a':'course.webm');
        const r=await fetch('/api/transcribe',{method:'POST',body});const data=await r.json();if(!r.ok||!data.text)throw new Error(data.error||'Η μεταγραφή απέτυχε.');
        saveRequestId.current=null;setContent(old=>[old.trim(),data.text.trim()].filter(Boolean).join('\n'));
      }catch(e){setError(e instanceof Error?e.message:'Η μεταγραφή απέτυχε.')}finally{setTranscribing(false)}
    };
    capture.start();setRecording(true);
  }catch{setError('Δεν ήταν δυνατή η πρόσβαση στο μικρόφωνο. Μπορείτε να πληκτρολογήσετε.')}
 }
 return <section className={styles.editor} aria-labelledby="prior-course-title">
  <header className={styles.head}><div><span className="kicker">ΠΡΙΝ ΑΠΟ ΤΟ NOIMA</span><h2 id="prior-course-title">Προηγούμενη κλινική πορεία</h2><p>Καταγράψτε συνοπτικά την παρακολούθηση έως σήμερα. Δεν δημιουργούνται αναδρομικές επισκέψεις.</p></div><button type="button" onClick={closeEditor} disabled={saving||recording||transcribing} aria-label="Κλείσιμο"><X size={19}/></button></header>
  <label className={styles.field}>Διάρκεια προηγούμενης παρακολούθησης <span>(προαιρετικό)</span><input maxLength={120} value={period} onChange={e=>{saveRequestId.current=null;setPeriod(e.target.value)}} placeholder="π.χ. περίπου 1 έτος"/></label>
  <label className={styles.field}>Κλινική πορεία<textarea rows={7} maxLength={12000} value={content} onChange={e=>{saveRequestId.current=null;setContent(e.target.value)}} placeholder="Αρχική εικόνα, σημαντικές μεταβολές, θεραπευτική ανταπόκριση, κρίσιμο ιστορικό και πρόσφατη κατάσταση…"/></label>
  <div className={styles.actions}><button type="button" className={styles.mic} onClick={()=>void toggleRecording()} disabled={saving||transcribing} aria-pressed={recording}>{recording?<Square size={16}/>:<Mic size={17}/>} {transcribing?'Μεταγραφή…':recording?'Τερματισμός ηχογράφησης':'Υπαγόρευση'}</button><button type="button" onClick={()=>void save()} disabled={saving||recording||transcribing||content.trim().length<15||content.length>12000} className={styles.save}><Check size={17}/>{saving?'Αποθήκευση…':'Αποθήκευση πορείας'}</button></div>
  {error&&<p role="alert" className={styles.error}>{error}</p>}
  <small className={styles.hint}>Καταγραφή θεράποντος, όχι ανεξάρτητη τεκμηρίωση παλαιότερων συνεδριών. Φάρμακα και εκτιμήσεις κινδύνου δεν ενημερώνονται αυτόματα.</small>
 </section>;
}

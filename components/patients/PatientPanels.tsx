'use client';
import { useCallback, useEffect, useState, useRef, type MutableRefObject } from 'react';
import { Check, X } from 'lucide-react';
import type { PatientBundle } from '@/lib/patients/demo-runtime';
import {useClinicalDraft} from './useClinicalDraft';
import MedicationTimeline from './MedicationTimeline';
import MedicationTable from './MedicationTable';
import { demoPost } from '@/lib/patients/demo-client';
import {getDemoTesterId} from '@/lib/demo-tester';
import {historyDraftFromAnswers,type HistoryAnswers} from '@/lib/intake/history';
import {useOverlayDismiss} from '@/components/useOverlayDismiss';

const date=(value?:string|null)=>value?new Intl.DateTimeFormat('el-GR',{day:'2-digit',month:'short',year:'numeric'}).format(new Date(value)):'—';
const historyFields=[['psychiatric_history','Ψυχιατρικό ιστορικό'],['medical_history','Σωματικό ιστορικό'],['previous_treatments','Προηγούμενες θεραπείες'],['hospitalizations','Νοσηλείες'],['family_history','Οικογενειακό ιστορικό'],['substance_history','Ουσίες'],['social_functioning','Κοινωνική λειτουργικότητα'],['allergies','Αλλεργίες']] as const;
export function HistoryPanel({bundle,reload,beforeNavigate}:{bundle:PatientBundle;reload:()=>Promise<unknown>;beforeNavigate:MutableRefObject<(()=>Promise<void>)|null>}){
 const initial=Object.fromEntries(historyFields.map(([key])=>[key,bundle.history?.[key]||''])) as Record<string,string>;
 const patientInitial=()=>({first_name:bundle.patient.first_name,last_name:bundle.patient.last_name,age:bundle.patient.reported_age==null?'':String(bundle.patient.reported_age),phone:bundle.patient.phone||'',landline:bundle.patient.landline||'',contact_phone:bundle.patient.contact_phone||'',amka:bundle.patient.amka||'',address:bundle.patient.address||'',email:bundle.patient.email||'',chief_complaint:bundle.patient.chief_complaint||''});
 const dirty=useRef(false);
 const draft=useClinicalDraft<Record<string,string>>({storageKey:bundle.patient.id+':history',initial,version:bundle.history?.version??0,write:async(history,version)=>{const d=await demoPost({action:'save_history',patient_id:bundle.patient.id,history,expected_version:version});return {value:Object.fromEntries(historyFields.map(([key])=>[key,d.history[key]||''])),version:d.history.version}},onSaved:reload,onDirty:d=>{dirty.current=d}});
 const values=draft.value,saving=draft.saving,state=draft.error||(draft.savedAt?'Αποθηκεύτηκε '+draft.savedAt+' · Αθήνα':'');
 const [conflict,setConflict]=useState<PatientBundle|null>(null);
 const [reported,setReported]=useState<Array<{id:string;channel:string;status:string;submitted_at:string|null;reviewed_at:string|null;history_answers:HistoryAnswers}>>([]);
 const [reviewIntake,setReviewIntake]=useState<{id:string;channel:string;submitted_at:string|null;history_answers:HistoryAnswers}|null>(null);
 const [reviewPatch,setReviewPatch]=useState<Record<string,string>>({});
 const [reviewSelected,setReviewSelected]=useState<Record<string,boolean>>({});
 const [reviewBusy,setReviewBusy]=useState(false);const [reviewError,setReviewError]=useState('');
 const reviewBaseline=useRef('');
 const reviewDirty=Boolean(reviewIntake)&&JSON.stringify([reviewPatch,reviewSelected])!==reviewBaseline.current;
 const reviewDirtyRef=useRef(false);reviewDirtyRef.current=reviewDirty;
 const closeReview=()=>{if(!reviewBusy&&(!reviewDirty||window.confirm('Υπάρχουν αλλαγές στον έλεγχο ιστορικού. Να ακυρωθούν;')))setReviewIntake(null)};
 useOverlayDismiss(closeReview,{active:Boolean(reviewIntake),busy:reviewBusy});
 const loadReported=useCallback(async()=>{try{const r=await fetch('/api/intake',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'list',tester:getDemoTesterId(),patient_id:bundle.patient.id})});const d=await r.json();if(r.ok)setReported((d.intakes||[]).filter((x:{tools?:string[]})=>x.tools?.includes('history')))}catch{/* folder history remains available */}},[bundle.patient.id]);
 useEffect(()=>{void loadReported()},[loadReported,bundle.history?.version]);
 function beginReview(item:{id:string;channel:string;submitted_at:string|null;history_answers:HistoryAnswers}){
  const proposed=historyDraftFromAnswers(item.history_answers);const current=Object.fromEntries(historyFields.map(([k])=>[k,bundle.history?.[k]||''])) as Record<string,string>;const dateLabel=item.submitted_at?new Intl.DateTimeFormat('el-GR',{day:'numeric',month:'short',year:'numeric'}).format(new Date(item.submitted_at)):'';
  if(dirty.current){setReviewError('Αποθηκεύστε πρώτα τις αλλαγές ιστορικού.');return}
  const patch=Object.fromEntries(historyFields.map(([k])=>[k,current[k]?current[k]+'\n\nΑναφορά ασθενούς'+(dateLabel?' · '+dateLabel:'')+':\n'+proposed[k]:proposed[k]]));const selected=Object.fromEntries(historyFields.map(([k])=>[k,true]));reviewBaseline.current=JSON.stringify([patch,selected]);setReviewPatch(patch);setReviewSelected(selected);setReviewError('');setReviewIntake(item)
 }
 async function integrateReported(){
  if(!reviewIntake||reviewBusy)return;setReviewBusy(true);setReviewError('');
  try{const patch=Object.fromEntries(historyFields.filter(([k])=>reviewSelected[k]).map(([k])=>[k,reviewPatch[k]||'']));const r=await fetch('/api/intake',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'review',tester:getDemoTesterId(),id:reviewIntake.id,patch,expected_history_version:bundle.history?.version??0})});const d=await r.json();if(!r.ok)throw new Error(d.error||'Δεν ολοκληρώθηκε η ενσωμάτωση.');setReviewIntake(null);await reload();await loadReported()}catch(cause){setReviewError(cause instanceof Error?cause.message:'Δεν ολοκληρώθηκε η ενσωμάτωση.')}finally{setReviewBusy(false)}
 }
 const [patientOpen,setPatientOpen]=useState(false);
 const [patientValues,setPatientValues]=useState(patientInitial);
 const [patientSaving,setPatientSaving]=useState(false);
 const [patientState,setPatientState]=useState('');
 const patientDirty=useRef(false);
 const patientFlight=useRef<Promise<void>|null>(null);

 useEffect(()=>{if(!patientDirty.current)setPatientValues(patientInitial())},[bundle.patient.updated_at]);
 async function save(){await draft.flush()}
 async function savePatient(){
  if(patientFlight.current)return patientFlight.current;
  const task=(async()=>{
   setPatientSaving(true);setPatientState('');
   let committed=false;
   try{
    const age=patientValues.age.trim()===''?null:Number(patientValues.age);
    await demoPost({action:'update_patient',patient_id:bundle.patient.id,first_name:patientValues.first_name,last_name:patientValues.last_name,age,phone:patientValues.phone,landline:patientValues.landline,contact_phone:patientValues.contact_phone,amka:patientValues.amka,address:patientValues.address,email:patientValues.email,chief_complaint:patientValues.chief_complaint,expected_updated_at:bundle.patient.updated_at});
    committed=true;patientDirty.current=false;setPatientState('Αποθηκεύτηκε');
    const refreshed=await reload();
    if(!refreshed){setPatientState('Τα στοιχεία αποθηκεύτηκαν, αλλά η προβολή δεν ανανεώθηκε.');return}
    setPatientOpen(false);
   }catch(cause){
    if(committed){setPatientState('Τα στοιχεία αποθηκεύτηκαν, αλλά η προβολή δεν ανανεώθηκε.');return}
    const message=cause instanceof Error?cause.message:'Δεν αποθηκεύτηκαν τα στοιχεία ασθενή';setPatientState(message);
    if(/άλλαξε σε άλλη καρτέλα|Επαναφορτώστε|stale/i.test(message)){try{await reload()}catch{/* keep the user's local fields; retry remains explicit */}}
    throw cause;
   }finally{setPatientSaving(false)}
  })();
  patientFlight.current=task;try{await task}finally{patientFlight.current=null}
 }
 const flushRef=useRef<()=>Promise<void>>(async()=>{});
 flushRef.current=async()=>{if(reviewDirty||reviewBusy)throw new Error('Ολοκληρώστε ή ακυρώστε τον έλεγχο ιστορικού.');await draft.flush();if(patientDirty.current)await savePatient()};
 useEffect(()=>{const flush=()=>flushRef.current();beforeNavigate.current=flush;const leave=(e:BeforeUnloadEvent)=>{if(dirty.current||patientDirty.current||reviewDirtyRef.current){e.preventDefault();e.returnValue=''}};window.addEventListener('beforeunload',leave);return()=>{if(beforeNavigate.current===flush)beforeNavigate.current=null;window.removeEventListener('beforeunload',leave)}},[beforeNavigate]);
 const incomplete=bundle.patient.reported_age==null||!bundle.patient.phone||!bundle.patient.amka||!bundle.patient.address;
 return <section className="panel-stack">
  <div className="panel-heading"><div><span className="kicker">ΙΣΤΟΡΙΚΟ</span><h2>Στοχευμένη καταγραφή ιστορικού</h2><p>Κενό πεδίο σημαίνει «δεν έχει καταγραφεί» — ποτέ αρνητικό εύρημα.</p></div><button className="record compact" onClick={()=>void save().catch(()=>{})} disabled={saving}>{saving?'Αποθήκευση…':'Αποθήκευση ιστορικού'}</button></div>{reported.filter(x=>x.status==='submitted'&&!x.reviewed_at).map(item=><div className="reported-history-card" key={item.id}><div><span className="kicker">ΙΣΤΟΡΙΚΟ ΑΠΟ ΤΟΝ ΑΣΘΕΝΗ</span><strong>{item.channel==='tablet'?'Tablet ιατρείου':item.channel==='email'?'Email':'Έντυπο'}{item.submitted_at?' · '+new Intl.DateTimeFormat('el-GR',{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'}).format(new Date(item.submitted_at)):''}</strong><small>Αναμένει έλεγχο · η αρχική απάντηση παραμένει αποθηκευμένη.</small></div><button onClick={()=>beginReview(item)}>Έλεγχος & ενσωμάτωση</button></div>)}
  {reviewError&&!reviewIntake&&<div role="alert" className="save-state error">{reviewError}</div>}
  {state&&<div role={draft.error?'alert':'status'} className={draft.error?'save-state error':'save-state ok'}>{state}</div>}
  {draft.error&&<div className="conflict-review"><button onClick={()=>void reload().then(b=>{if(b)setConflict(b as PatientBundle)})}>Σύγκριση εκδόσεων</button>{conflict&&<><pre>{historyFields.map(([key,label])=>label+': '+(conflict.history?.[key]||'—')).join('\n')}</pre><button onClick={()=>{draft.acceptServer(Object.fromEntries(historyFields.map(([key])=>[key,conflict.history?.[key]||''])),conflict.history?.version??0);setConflict(null)}}>Χρήση αποθηκευμένου</button><button onClick={()=>{draft.resolve(values,Object.fromEntries(historyFields.map(([key])=>[key,conflict.history?.[key]||''])),conflict.history?.version??0);setConflict(null)}}>Ρητή αντικατάσταση με τη δική μου</button></>}</div>}
  <section className={incomplete?'patient-details-card incomplete':'patient-details-card'}>
   <div className="patient-details-head"><div><strong>Στοιχεία ασθενή</strong><span>{incomplete?'Υπάρχουν βασικά στοιχεία που δεν έχουν ακόμη συμπληρωθεί.':'Τα βασικά στοιχεία του φακέλου είναι συμπληρωμένα.'}</span></div><button onClick={()=>{if(patientOpen&&patientDirty.current){void savePatient().catch(()=>{});return}setPatientOpen(open=>!open);setPatientState('')}}>{patientOpen?'Κλείσιμο':'Επεξεργασία στοιχείων'}</button></div>
   {!patientOpen&&<div className="record-contact-strip"><span>{bundle.patient.reported_age==null?'Χωρίς ηλικία':bundle.patient.reported_age+' ετών'}</span><span>{bundle.patient.phone||'Χωρίς κινητό'}</span><span>{bundle.patient.amka?'ΑΜΚΑ '+bundle.patient.amka:'Χωρίς ΑΜΚΑ'}</span><span>{bundle.patient.address||'Χωρίς διεύθυνση'}</span><span>{bundle.patient.email||'Χωρίς email'}</span><span>{bundle.patient.chief_complaint||'Χωρίς καταγεγραμμένο λόγο προσέλευσης'}</span></div>}
   {patientOpen&&<div className="patient-details-form">
    <div className="patient-details-grid"><label>Όνομα<input disabled={patientSaving} value={patientValues.first_name} onChange={e=>{patientDirty.current=true;setPatientValues(v=>({...v,first_name:e.target.value}))}}/></label><label>Επώνυμο<input disabled={patientSaving} value={patientValues.last_name} onChange={e=>{patientDirty.current=true;setPatientValues(v=>({...v,last_name:e.target.value}))}}/></label><label>Ηλικία<input disabled={patientSaving} inputMode="numeric" value={patientValues.age} onChange={e=>{patientDirty.current=true;setPatientValues(v=>({...v,age:e.target.value.replace(/\D/g,'')}))}}/></label><label>Κινητό<input disabled={patientSaving} value={patientValues.phone} onChange={e=>{patientDirty.current=true;setPatientValues(v=>({...v,phone:e.target.value}))}}/></label><label>Σταθερό<input disabled={patientSaving} value={patientValues.landline} onChange={e=>{patientDirty.current=true;setPatientValues(v=>({...v,landline:e.target.value}))}}/></label><label>Επιπλέον τηλ. επικοινωνίας<input disabled={patientSaving} value={patientValues.contact_phone} onChange={e=>{patientDirty.current=true;setPatientValues(v=>({...v,contact_phone:e.target.value}))}}/></label><label>ΑΜΚΑ<input disabled={patientSaving} inputMode="numeric" value={patientValues.amka} onChange={e=>{patientDirty.current=true;setPatientValues(v=>({...v,amka:e.target.value.replace(/\D/g,'').slice(0,11)}))}}/></label><label className="span-two">Διεύθυνση<input disabled={patientSaving} value={patientValues.address} onChange={e=>{patientDirty.current=true;setPatientValues(v=>({...v,address:e.target.value}))}}/></label><label>Email<input disabled={patientSaving} type="email" value={patientValues.email} onChange={e=>{patientDirty.current=true;setPatientValues(v=>({...v,email:e.target.value}))}}/></label><label className="span-two">Λόγος προσέλευσης<textarea disabled={patientSaving} rows={2} value={patientValues.chief_complaint} onChange={e=>{patientDirty.current=true;setPatientValues(v=>({...v,chief_complaint:e.target.value}))}}/></label></div>
    {patientState&&<div className={patientState==='Αποθηκεύτηκε'?'save-state ok':'save-state error'}>{patientState}</div>}
    <button className="record compact" disabled={patientSaving||!patientValues.first_name.trim()} onClick={()=>void savePatient().catch(()=>{})}>{patientSaving?'Αποθήκευση…':'Αποθήκευση στοιχείων'}</button>
   </div>}
  </section>
  <div className="history-editor-grid">{historyFields.map(([key,label])=><label key={key}>{label}<textarea rows={4} value={values[key]} onChange={e=>draft.change({...values,[key]:e.target.value})} onBlur={()=>void draft.flush().catch(()=>{})} placeholder="Δεν έχει καταγραφεί"/></label>)}</div>
  {reviewIntake&&<div className="intake-review-backdrop" onClick={closeReview}><section className="intake-review" onClick={e=>e.stopPropagation()}><button className="intake-launcher-close" onClick={closeReview} disabled={reviewBusy}><X size={17}/></button><span className="kicker">PATIENT-REPORTED · ΑΝΑΜΕΝΕΙ ΕΛΕΓΧΟ</span><h2>Έλεγχος & ενσωμάτωση ιστορικού</h2><p>Το αρχικό self-report διατηρείται. Επιλέξτε τι θα ενσωματωθεί στο κλινικό ιστορικό και διορθώστε το κείμενο όπου χρειάζεται.</p><div className="intake-review-fields">{historyFields.map(([key,label])=><label key={key} className={reviewSelected[key]?'selected':''}><span><input type="checkbox" checked={Boolean(reviewSelected[key])} onChange={e=>setReviewSelected(v=>({...v,[key]:e.target.checked}))}/><strong>{label}</strong></span><textarea rows={4} disabled={!reviewSelected[key]} value={reviewPatch[key]||''} onChange={e=>setReviewPatch(v=>({...v,[key]:e.target.value}))}/></label>)}</div>{reviewError&&<div className="save-state error">{reviewError}</div>}<footer><button onClick={closeReview} disabled={reviewBusy}>Ακύρωση</button><button className="record compact" onClick={()=>void integrateReported()} disabled={reviewBusy}>{reviewBusy?'Ενσωμάτωση…':'Ενσωμάτωση επιλεγμένων'}</button></footer></section></div>}
 </section>
}

export function MedicationsPanel({bundle,reload,beforeNavigate}:{bundle:PatientBundle;reload:()=>Promise<unknown>;beforeNavigate?:MutableRefObject<(()=>Promise<void>)|null>}){
 const flushers=useRef(new Map<string,()=>Promise<void>>()),dirty=useRef(new Set<string>());
 const registerFlusher=useCallback((key:string,flush:()=>Promise<void>)=>{flushers.current.set(key,flush);return()=>{if(flushers.current.get(key)===flush)flushers.current.delete(key)}},[]);
 const onDirtyChange=useCallback((key:string,value:boolean)=>{if(value)dirty.current.add(key);else dirty.current.delete(key)},[]);
 useEffect(()=>{if(!beforeNavigate)return;const flush=async()=>{await Promise.all([...flushers.current.values()].map(fn=>fn()))};beforeNavigate.current=flush;return()=>{if(beforeNavigate.current===flush)beforeNavigate.current=null}},[beforeNavigate]);
 useEffect(()=>{const warn=(event:BeforeUnloadEvent)=>{if(!dirty.current.size)return;event.preventDefault();event.returnValue=''};window.addEventListener('beforeunload',warn);return()=>window.removeEventListener('beforeunload',warn)},[]);
 return <section className="panel-stack medication-record">
  <div className="panel-heading medication-record-head">
   <div><span className="kicker">ΑΓΩΓΗ</span><h2>Αγωγή</h2></div>
  </div>
  <MedicationTable bundle={bundle} reload={reload} editablePlan editableEffects registerFlusher={registerFlusher} onDirtyChange={onDirtyChange}/>
  <details className="medication-history-details">
   <summary>Ιστορικό αλλαγών <span>{bundle.medicationEvents.length||''}</span></summary>
   <MedicationTimeline bundle={bundle} reload={reload} registerFlusher={registerFlusher} onDirtyChange={onDirtyChange}/>
  </details>
 </section>
}

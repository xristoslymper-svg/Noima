'use client';
import { useCallback, useEffect, useMemo, useState, useRef, type MutableRefObject } from 'react';
import { Check, X } from 'lucide-react';
import type { PatientBundle } from '@/lib/patients/demo-runtime';
import {useClinicalDraft} from './useClinicalDraft';
import MedicationTimeline from './MedicationTimeline';
import MedicationTable from './MedicationTable';
import { demoPost } from '@/lib/patients/demo-client';
import {getDemoTesterId} from '@/lib/demo-tester';
import {historyDraftFromAnswers,type HistoryAnswers} from '@/lib/intake/history';

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
 const loadReported=useCallback(async()=>{try{const r=await fetch('/api/intake',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'list',tester:getDemoTesterId(),patient_id:bundle.patient.id})});const d=await r.json();if(r.ok)setReported((d.intakes||[]).filter((x:{tools?:string[]})=>x.tools?.includes('history')))}catch{/* folder history remains available */}},[bundle.patient.id]);
 useEffect(()=>{void loadReported()},[loadReported,bundle.history?.version]);
 function beginReview(item:{id:string;channel:string;submitted_at:string|null;history_answers:HistoryAnswers}){
  const proposed=historyDraftFromAnswers(item.history_answers);const current=Object.fromEntries(historyFields.map(([k])=>[k,bundle.history?.[k]||''])) as Record<string,string>;const dateLabel=item.submitted_at?new Intl.DateTimeFormat('el-GR',{day:'numeric',month:'short',year:'numeric'}).format(new Date(item.submitted_at)):'';
  const patch=Object.fromEntries(historyFields.map(([k])=>[k,current[k]?current[k]+'\n\nΑναφορά ασθενούς'+(dateLabel?' · '+dateLabel:'')+':\n'+proposed[k]:proposed[k]]));setReviewPatch(patch);setReviewSelected(Object.fromEntries(historyFields.map(([k])=>[k,true])));setReviewError('');setReviewIntake(item)
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
 flushRef.current=async()=>{if(!draft.preserveConflictForNavigation())await draft.flush();if(patientDirty.current)await savePatient()};
 useEffect(()=>{const flush=()=>flushRef.current();beforeNavigate.current=flush;const leave=(e:BeforeUnloadEvent)=>{if(dirty.current||patientDirty.current){e.preventDefault();e.returnValue=''}};window.addEventListener('beforeunload',leave);return()=>{if(beforeNavigate.current===flush)beforeNavigate.current=null;window.removeEventListener('beforeunload',leave)}},[beforeNavigate]);
 const incomplete=bundle.patient.reported_age==null||!bundle.patient.phone||!bundle.patient.amka||!bundle.patient.address;
 return <section className="panel-stack">
  <div className="panel-heading"><div><span className="kicker">ΙΣΤΟΡΙΚΟ</span><h2>Στοχευμένη καταγραφή ιστορικού</h2><p>Κενό πεδίο σημαίνει «δεν έχει καταγραφεί» — ποτέ αρνητικό εύρημα.</p></div><button className="record compact" onClick={()=>void save().catch(()=>{})} disabled={saving}>{saving?'Αποθήκευση…':'Αποθήκευση ιστορικού'}</button></div>{reported.filter(x=>x.status==='submitted'&&!x.reviewed_at).map(item=><div className="reported-history-card" key={item.id}><div><span className="kicker">ΙΣΤΟΡΙΚΟ ΑΠΟ ΤΟΝ ΑΣΘΕΝΗ</span><strong>{item.channel==='tablet'?'Tablet ιατρείου':item.channel==='email'?'Email':'Έντυπο'}{item.submitted_at?' · '+new Intl.DateTimeFormat('el-GR',{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'}).format(new Date(item.submitted_at)):''}</strong><small>Αναμένει έλεγχο · η αρχική απάντηση παραμένει αποθηκευμένη.</small></div><button onClick={()=>beginReview(item)}>Έλεγχος & ενσωμάτωση</button></div>)}
  {state&&<div role={draft.error?'alert':'status'} className={draft.error?'save-state error':'save-state ok'}>{state}</div>}
  {draft.error&&<div className="conflict-review"><p>Η αποθηκευμένη έκδοση του ιστορικού ενημερώθηκε. Το μη αποθηκευμένο κείμενό σας διατηρείται προσωρινά σε αυτή τη συσκευή. Μπορείτε να αλλάξετε καρτέλα χωρίς να αντικαταστήσετε τα εγκεκριμένα στοιχεία και να επιστρέψετε για σύγκριση.</p><button onClick={()=>void reload().then(b=>{if(b)setConflict(b as PatientBundle)})}>Σύγκριση εκδόσεων</button>{conflict&&<><pre>{historyFields.map(([key,label])=>label+': '+(conflict.history?.[key]||'—')).join('\n')}</pre><button onClick={()=>{draft.acceptServer(Object.fromEntries(historyFields.map(([key])=>[key,conflict.history?.[key]||''])),conflict.history?.version??0);setConflict(null)}}>Χρήση αποθηκευμένου</button><button onClick={()=>{draft.resolve(values,Object.fromEntries(historyFields.map(([key])=>[key,conflict.history?.[key]||''])),conflict.history?.version??0);setConflict(null)}}>Ρητή αντικατάσταση με τη δική μου</button></>}</div>}
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
  {reviewIntake&&<div className="intake-review-backdrop" onClick={()=>!reviewBusy&&setReviewIntake(null)}><section className="intake-review" onClick={e=>e.stopPropagation()}><button className="intake-launcher-close" onClick={()=>setReviewIntake(null)} disabled={reviewBusy}><X size={17}/></button><span className="kicker">PATIENT-REPORTED · ΑΝΑΜΕΝΕΙ ΕΛΕΓΧΟ</span><h2>Έλεγχος & ενσωμάτωση ιστορικού</h2><p>Το αρχικό self-report διατηρείται. Επιλέξτε τι θα ενσωματωθεί στο κλινικό ιστορικό και διορθώστε το κείμενο όπου χρειάζεται.</p><div className="intake-review-fields">{historyFields.map(([key,label])=><label key={key} className={reviewSelected[key]?'selected':''}><span><input type="checkbox" checked={Boolean(reviewSelected[key])} onChange={e=>setReviewSelected(v=>({...v,[key]:e.target.checked}))}/><strong>{label}</strong></span><textarea rows={4} disabled={!reviewSelected[key]} value={reviewPatch[key]||''} onChange={e=>setReviewPatch(v=>({...v,[key]:e.target.value}))}/></label>)}</div>{reviewError&&<div className="save-state error">{reviewError}</div>}<footer><button onClick={()=>setReviewIntake(null)} disabled={reviewBusy}>Ακύρωση</button><button className="record compact" onClick={()=>void integrateReported()} disabled={reviewBusy}>{reviewBusy?'Ενσωμάτωση…':'Ενσωμάτωση επιλεγμένων'}</button></footer></section></div>}
 </section>
}

export function MedicationsPanel({bundle,reload,beforeNavigate,currentOnly=false}:{bundle:PatientBundle;reload:()=>Promise<unknown>;beforeNavigate?:MutableRefObject<(()=>Promise<void>)|null>;currentOnly?:boolean}){
 const flushers=useRef(new Map<string,()=>Promise<void>>()),dirty=useRef(new Set<string>());
 const registerFlusher=useCallback((key:string,flush:()=>Promise<void>)=>{flushers.current.set(key,flush);return()=>{if(flushers.current.get(key)===flush)flushers.current.delete(key)}},[]);
 const onDirtyChange=useCallback((key:string,value:boolean)=>{if(value)dirty.current.add(key);else dirty.current.delete(key)},[]);
 useEffect(()=>{if(!beforeNavigate)return;const flush=async()=>{await Promise.all([...flushers.current.values()].map(fn=>fn()))};beforeNavigate.current=flush;return()=>{if(beforeNavigate.current===flush)beforeNavigate.current=null}},[beforeNavigate]);
 useEffect(()=>{const warn=(event:BeforeUnloadEvent)=>{if(!dirty.current.size)return;event.preventDefault();event.returnValue=''};window.addEventListener('beforeunload',warn);return()=>window.removeEventListener('beforeunload',warn)},[]);
 return <section className="panel-stack medication-record">
  <div className="panel-heading medication-record-head">
   <div><span className="kicker">ΑΓΩΓΗ</span><h2>{currentOnly?'Τρέχουσα αγωγή':'Αγωγή'}</h2></div>
  </div>
  <MedicationTable bundle={currentOnly?{...bundle,medications:bundle.medications.filter(m=>m.status==='active'||m.status==='planned')}:bundle} reload={reload} editablePlan editableEffects registerFlusher={registerFlusher} onDirtyChange={onDirtyChange}/>
  {currentOnly&&bundle.medications.some(m=>m.status!=='active'&&m.status!=='planned')&&<details className="medication-history-details"><summary>Παλαιότερη αγωγή</summary><MedicationTable bundle={{...bundle,medications:bundle.medications.filter(m=>m.status!=='active'&&m.status!=='planned')}} reload={reload} editableEffects registerFlusher={registerFlusher} onDirtyChange={onDirtyChange}/></details>}
  <details className="medication-history-details">
   <summary>Ιστορικό αλλαγών <span>{bundle.medicationEvents.length||''}</span></summary>
   <MedicationTimeline bundle={bundle} reload={reload} registerFlusher={registerFlusher} onDirtyChange={onDirtyChange}/>
  </details>
 </section>
}
export function MedicationModal({bundle,onClose,onSaved,sessionId,initialMode,initialMedicationId}:{bundle:PatientBundle;sessionId?:string;initialMode?:'start'|'history'|'change'|'stop'|'side_effect';initialMedicationId?:string;onClose:()=>void;onSaved:()=>Promise<unknown>}){
 const active=bundle.medications.filter(x=>x.status==='active');
 const [mode,setMode]=useState<'start'|'history'|'change'|'stop'|'side_effect'>(initialMode||(active.length?'change':'start'));
 const selectable=mode==='side_effect'?bundle.medications:bundle.medications.filter(x=>x.status==='active'||x.status==='planned');
 const [medId,setMedId]=useState(initialMedicationId||active[0]?.id||selectable[0]?.id||'');
 const selected=useMemo(()=>selectable.find(x=>x.id===medId),[selectable,medId]);
 const [name,setName]=useState('');
 const [dose,setDose]=useState(mode==='change'&&selected?String(selected.dose):'');
 const [unit,setUnit]=useState(selected?.unit||'mg');
 const [frequency,setFrequency]=useState(mode==='change'?selected?.frequency||'':'');
 const athensToday=new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Athens',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
 const [effective,setEffective]=useState(athensToday);
 const [stopped,setStopped]=useState(athensToday);
 const [reason,setReason]=useState('');
 const [effect,setEffect]=useState('');
 const [severity,setSeverity]=useState<'mild'|'moderate'|'severe'>('moderate');
 const [impact,setImpact]=useState('');
 const [saving,setSaving]=useState(false);
 const [touched,setTouched]=useState(false);
 const savingRef=useRef(false);
 const [error,setError]=useState('');
 const [correctSameDay,setCorrectSameDay]=useState(false);
 const sameDayEvent=(mode==='change')?bundle.medicationEvents.find(e=>e.medication_id===medId&&e.effective_on===effective&&!bundle.medicationRevisions.some(r=>r.event_id===e.id)):undefined;
 useEffect(()=>setCorrectSameDay(false),[medId,effective,mode]);

 useEffect(()=>{if(mode==='change'&&selected){setDose(String(selected.dose));setUnit(selected.unit);setFrequency(selected.frequency)}},[selected,mode]);

 async function save(){
  if(savingRef.current)return;
  if((mode==='start'||mode==='history')&&(!name.trim()||!dose||!frequency.trim())){setError('Συμπληρώστε φάρμακο, δόση και συχνότητα.');return}
  if(sameDayEvent&&(!correctSameDay||!reason.trim())){setError('Επιβεβαιώστε τη διόρθωση της ίδιας ημέρας και καταγράψτε την αιτία.');return}
  if(mode==='change'&&(!selected||!dose||!frequency.trim())){setError('Επιλέξτε φάρμακο και συμπληρώστε νέα δόση και συχνότητα.');return}
  if((mode==='stop'||mode==='side_effect')&&!selected){setError('Επιλέξτε φάρμακο.');return}
  if(mode==='side_effect'&&!effect.trim()){setError('Καταγράψτε την παρενέργεια.');return}
  savingRef.current=true;setSaving(true);setError('');
  let committed=false;
  try{
   const draft=bundle.sessions.find(x=>sessionId?x.id===sessionId&&x.status==='draft':x.status==='draft');
   if(sessionId&&!draft)throw new Error('Το συγκεκριμένο πρόχειρο δεν είναι διαθέσιμο.');
   if(mode==='history')await demoPost({action:'medication_history',patient_id:bundle.patient.id,session_id:draft?.id||null,name,dose:Number(dose),unit,frequency,started_on:effective,stopped_on:stopped,reason});
   if(mode==='start')await demoPost({action:'medication_start',patient_id:bundle.patient.id,session_id:draft?.id||null,name,dose:Number(dose),unit,frequency,effective_on:effective,reason});
   if(mode==='change')await demoPost({action:'medication_event',replace_id:sameDayEvent?.id||null,event_type:sameDayEvent?.event_type||'changed',expected_version:selected?.plan_version,medication_id:medId,session_id:draft?.id||null,dose:Number(dose),unit,frequency,effective_on:effective,reason});
   if(mode==='stop')await demoPost({action:'medication_event',event_type:'stopped',expected_version:selected?.plan_version,medication_id:medId,session_id:draft?.id||null,effective_on:effective,reason});
   if(mode==='side_effect')await demoPost({action:'medication_side_effect',medication_id:medId,session_id:draft?.id||null,effect,severity,impact,noted_on:effective,note:reason});
   committed=true;
   try{await onSaved()}catch{/* mutation is committed; the folder can refresh independently */}
   setTouched(false);onClose();
  }catch(cause){if(!committed)setError(cause instanceof Error?cause.message:'Δεν αποθηκεύτηκε η αλλαγή.')}finally{savingRef.current=false;setSaving(false)}
 }

 function safeClose(){if(saving)return;if(touched&&!window.confirm('Υπάρχουν μη αποθηκευμένες αλλαγές. Κλείσιμο χωρίς αποθήκευση;'))return;onClose()}
  const title=mode==='history'?'Προηγούμενη αγωγή':mode==='start'?'Καταχώριση φαρμάκου':mode==='change'?'Αλλαγή δόσης':mode==='stop'?'Διακοπή αγωγής':'Καταγραφή παρενέργειας';
 return <div className="entry-modal-backdrop" onClick={safeClose}><section className="entry-modal medication-runtime-modal" onClick={e=>e.stopPropagation()} onChangeCapture={()=>setTouched(true)}>
  <button className="entry-close" onClick={safeClose} aria-label="Κλείσιμο"><X size={19}/></button><span className="kicker">ΔΙΑΧΕΙΡΙΣΗ ΑΓΩΓΗΣ</span><h2>{title}</h2>
  <div className="mode-switch medication-modes">
   <button className={mode==='change'?'active':''} disabled={!active.length} onClick={()=>{setMedId(active[0]?.id||'');setMode('change')}}>Αλλαγή δόσης</button>
   <button className={mode==='start'||mode==='history'?'active':''} onClick={()=>{setMode('start');setName('');setDose('');setFrequency('')}}>Προσθήκη φαρμάκου</button>
   <button className={mode==='stop'?'active':''} disabled={!active.length} onClick={()=>{setMedId(active[0]?.id||'');setMode('stop')}}>Διακοπή</button>
   <button className={mode==='side_effect'?'active':''} disabled={!bundle.medications.length} onClick={()=>{setMedId(active[0]?.id||bundle.medications[0]?.id||'');setMode('side_effect')}}>Παρενέργεια</button>
  </div>

  {mode!=='start'&&mode!=='history'&&<><label>Φάρμακο<select value={medId} onChange={e=>setMedId(e.target.value)}>{selectable.map(m=><option key={m.id} value={m.id}>{m.medication_name}{m.status==='planned'?' · προγραμματισμένη':m.status==='stopped'?' · διακοπείσα':''}</option>)}</select></label>{selected&&<div className="current-dose">{selected.status==='stopped'?'Τελευταία δόση πριν τη διακοπή':selected.status==='planned'?'Προγραμματισμένη αγωγή':'Τρέχουσα αγωγή'} <strong>{selected.dose} {selected.unit} · {selected.frequency}</strong></div>}</>}
  {(mode==='start'||mode==='history')&&<label>Κατάσταση λήψης<select value={mode} onChange={e=>setMode(e.target.value as 'start'|'history')}><option value="start">Λαμβάνει τώρα / προγραμματισμένη έναρξη</option><option value="history">Έχει διακοπεί · προηγούμενη αγωγή</option></select></label>}
  {(mode==='start'||mode==='history')&&<label>Φάρμακο<input value={name} onChange={e=>setName(e.target.value)} placeholder="π.χ. Sertraline"/></label>}

  {(mode==='start'||mode==='history'||mode==='change')&&<div className="med-form-grid"><label>{mode==='change'?'Νέα δόση':'Δόση'}<input inputMode="decimal" value={dose} onChange={e=>setDose(e.target.value.replace(',','.'))}/></label><label>Μονάδα<input value={unit} onChange={e=>setUnit(e.target.value)}/></label><label>Συχνότητα<input value={frequency} onChange={e=>setFrequency(e.target.value)} placeholder="π.χ. 1× πρωί"/></label><label>Έναρξη<input type="date" value={effective} onChange={e=>setEffective(e.target.value)}/></label></div>}
  {mode==='history'&&<label>Έχει διακοπεί από<input type="date" value={stopped} onChange={e=>setStopped(e.target.value)} max={athensToday}/></label>}
  {mode==='stop'&&<label>Ημερομηνία διακοπής<input type="date" value={effective} onChange={e=>setEffective(e.target.value)}/></label>}
  {mode==='side_effect'&&<><label>Παρενέργεια<input value={effect} onChange={e=>setEffect(e.target.value)} placeholder="π.χ. μειωμένη libido"/></label><div className="med-form-grid side-effect-grid"><label>Βαρύτητα<select value={severity} onChange={e=>setSeverity(e.target.value as 'mild'|'moderate'|'severe')}><option value="mild">Ήπια</option><option value="moderate">Μέτρια</option><option value="severe">Σοβαρή</option></select></label><label>Ημερομηνία<input type="date" value={effective} onChange={e=>setEffective(e.target.value)}/></label><label className="span-two">Επίδραση στη λειτουργικότητα<input value={impact} onChange={e=>setImpact(e.target.value)} placeholder="Προαιρετικό"/></label></div></>}

  <label>{mode==='side_effect'?'Κλινική σημείωση':'Λόγος / σημείωση'}<textarea rows={3} value={reason} onChange={e=>setReason(e.target.value)} placeholder="Προαιρετική κλινική σημείωση"/></label>

  <div className="med-preview"><span>ΠΡΟΕΠΙΣΚΟΠΗΣΗ</span><p>{
   mode==='change'&&selected?selected.medication_name+': '+selected.dose+' '+selected.unit+' → '+(dose||'—')+' '+unit+' · '+(frequency||'—')+' · από '+effective:
   mode==='history'?(name||'Προηγούμενη αγωγή')+': '+dose+' '+unit+' · '+frequency+' · '+effective+' έως '+stopped+' · Διακοπείσα':
   mode==='start'?(name||'Νέα αγωγή')+': '+(dose||'—')+' '+unit+' · '+(frequency||'—')+' · από '+effective:
   mode==='stop'&&selected?'Διακοπή '+selected.medication_name+' από '+effective:
   selected?(effect||'Παρενέργεια')+' · '+selected.medication_name+' · '+effective:'—'
  }</p>{(mode==='change'||mode==='stop')&&effective>athensToday&&<small>Η αλλαγή είναι μελλοντική και δεν θα μεταβάλει την ενεργή αγωγή πριν από αυτή την ημερομηνία.</small>}</div>
  {sameDayEvent&&<div className="current-dose"><p>Υπάρχει ήδη καταγραφή αγωγής στις {effective}. Η διόρθωση κρατά την αρχική καταγραφή στο ιστορικό· δεν καταγράφει δεύτερη αλλαγή μέσα στην ίδια ημέρα.</p><label><input type="checkbox" checked={correctSameDay} onChange={e=>setCorrectSameDay(e.target.checked)}/> Διόρθωση καταγραφής ίδιας ημέρας</label><small>Συμπληρώστε την αιτία διόρθωσης.</small></div>}
  {error&&<div className="save-state error" role="alert">{error}</div>}
  <footer className="entry-footer"><button onClick={safeClose}>Ακύρωση</button><button className="entry-primary" onClick={()=>void save().catch(()=>{})} disabled={saving}><Check size={15}/>{saving?'Αποθήκευση…':'Αποθήκευση'}</button></footer>
 </section></div>
}

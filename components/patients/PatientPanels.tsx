'use client';
import { useCallback, useEffect, useMemo, useState, useRef, useId, type MutableRefObject } from 'react';
import { Check, Pencil, X } from 'lucide-react';
import type { PatientBundle } from '@/lib/patients/demo-runtime';
import {useClinicalDraft} from './useClinicalDraft';
import MedicationTimeline from './MedicationTimeline';
import MedicationTable from './MedicationTable';
import {medicationSessionId} from '@/lib/clinical/treatment-plan';
import MedicationFrequency from './MedicationFrequency';
import { demoPost } from '@/lib/patients/demo-client';
import PatientReportedHistory from './PatientReportedHistory';
import readingStyles from './PatientReading.module.css';

const date=(value?:string|null)=>value?new Intl.DateTimeFormat('el-GR',{day:'2-digit',month:'short',year:'numeric'}).format(new Date(value)):'—';
const historyFields=[['psychiatric_history','Ψυχιατρικό ιστορικό'],['medical_history','Σωματικό ιστορικό'],['previous_treatments','Προηγούμενες θεραπείες'],['hospitalizations','Νοσηλείες'],['family_history','Οικογενειακό ιστορικό'],['substance_history','Ουσίες'],['social_functioning','Κοινωνική λειτουργικότητα'],['allergies','Αλλεργίες']] as const;
export function HistoryPanel({bundle,reload,beforeNavigate}:{bundle:PatientBundle;reload:()=>Promise<unknown>;beforeNavigate:MutableRefObject<(()=>Promise<void>)|null>}){
 const sectionId=useId();
 const [editingHistory,setEditingHistory]=useState(false);
 const initial=Object.fromEntries(historyFields.map(([key])=>[key,bundle.history?.[key]||''])) as Record<string,string>;
 const patientInitial=()=>({first_name:bundle.patient.first_name,last_name:bundle.patient.last_name,age:bundle.patient.reported_age==null?'':String(bundle.patient.reported_age),phone:bundle.patient.phone||'',landline:bundle.patient.landline||'',contact_phone:bundle.patient.contact_phone||'',amka:bundle.patient.amka||'',address:bundle.patient.address||'',email:bundle.patient.email||'',chief_complaint:bundle.patient.chief_complaint||''});
 const dirty=useRef(false);
 const draft=useClinicalDraft<Record<string,string>>({storageKey:bundle.patient.id+':history',initial,version:bundle.history?.version??0,quietRecovery:true,write:async(history,version)=>{const d=await demoPost({action:'save_history',patient_id:bundle.patient.id,history,expected_version:version});return {value:Object.fromEntries(historyFields.map(([key])=>[key,d.history[key]||''])),version:d.history.version}},onSaved:reload,onDirty:d=>{dirty.current=d}});
 const values=draft.value,saving=draft.saving,state=draft.error||(draft.savedAt?'Αποθηκεύτηκε '+draft.savedAt+' · Αθήνα':'');
 const [editingPatientField,setEditingPatientField]=useState<keyof ReturnType<typeof patientInitial>|null>(null);
 const patientFields=[['first_name','Όνομα'],['last_name','Επώνυμο'],['age','Ηλικία'],['phone','Κινητό'],['landline','Σταθερό'],['contact_phone','Επιπλέον τηλ. επικοινωνίας'],['amka','ΑΜΚΑ'],['address','Διεύθυνση'],['email','Email'],['chief_complaint','Λόγος προσέλευσης']] as const;
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
    const current={...patientInitial(),...(editingPatientField?{[editingPatientField]:patientValues[editingPatientField]}:{})};
    const age=current.age.trim()===''?null:Number(current.age);
    await demoPost({action:'update_patient',patient_id:bundle.patient.id,first_name:current.first_name,last_name:current.last_name,age,phone:current.phone,landline:current.landline,contact_phone:current.contact_phone,amka:current.amka,address:current.address,email:current.email,chief_complaint:current.chief_complaint,expected_updated_at:bundle.patient.updated_at});
    committed=true;patientDirty.current=false;setPatientState('Αποθηκεύτηκε');
    const refreshed=await reload();
    if(!refreshed){setPatientState('Τα στοιχεία αποθηκεύτηκαν, αλλά η προβολή δεν ανανεώθηκε.');return}
    setEditingPatientField(null);
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
 flushRef.current=async()=>{if(!draft.preserveConflictForNavigation())await draft.flush();if(patientDirty.current||patientFlight.current)throw new Error('Αποθηκεύστε ή ακυρώστε την αλλαγή στα στοιχεία ασθενή πριν συνεχίσετε.')};
 useEffect(()=>{const flush=()=>flushRef.current();beforeNavigate.current=flush;const leave=(e:BeforeUnloadEvent)=>{if(dirty.current||patientDirty.current){e.preventDefault();e.returnValue=''}};window.addEventListener('beforeunload',leave);return()=>{if(beforeNavigate.current===flush)beforeNavigate.current=null;window.removeEventListener('beforeunload',leave)}},[beforeNavigate]);
 const incomplete=bundle.patient.reported_age==null||!bundle.patient.phone||!bundle.patient.amka||!bundle.patient.address;
 return <section className="panel-stack">
  <div className="panel-heading"><div><span className="kicker">ΦΑΚΕΛΟΣ ΑΣΘΕΝΟΥΣ</span><h2>Στοιχεία & ιστορικό</h2><p>Οι απαντήσεις του ασθενούς εμφανίζονται εδώ μόλις υποβληθούν.</p></div></div>
  <nav className={readingStyles.sectionLinks} aria-label="Ενότητες στοιχείων και ιστορικού">
   <a className="patient-reported-link" href={'#'+sectionId+'-details'}>Στοιχεία ασθενή</a>
   <a className="patient-reported-link" href={'#'+sectionId+'-reported'}>Απαντήσεις ασθενούς</a>
   <a className="patient-reported-link" href={'#'+sectionId+'-notes'}>Κλινικό ιστορικό</a>
  </nav>
  <section id={sectionId+'-details'} className={'patient-details-card patient-demographics'+(incomplete?' incomplete':'')}>
   <div className="patient-details-head"><div><strong>Στοιχεία ασθενή</strong><span>{incomplete?'Υπάρχουν βασικά στοιχεία που δεν έχουν ακόμη συμπληρωθεί.':'Τα βασικά στοιχεία του φακέλου είναι συμπληρωμένα.'}</span></div></div>
   <div className={readingStyles.contactLine} aria-label="Στοιχεία επικοινωνίας"><span><strong>Κινητό:</strong> {bundle.patient.phone||'Δεν έχει καταγραφεί'}</span><span><strong>Email:</strong> {bundle.patient.email||'Δεν έχει καταγραφεί'}</span></div>
   <dl className="patient-demographics-list">{patientFields.map(([key,label])=>{
    const editing=editingPatientField===key,value=patientInitial()[key];
    const change=(value:string)=>{patientDirty.current=true;setPatientValues(v=>({...v,[key]:key==='age'?value.replace(/\D/g,''):key==='amka'?value.replace(/\D/g,'').slice(0,11):value}))};
    const cancel=()=>{patientDirty.current=false;setPatientValues(patientInitial());setEditingPatientField(null);setPatientState('')};
    return <div className="patient-demographics-row" key={key}>
     <dt><label htmlFor={editing?'patient-detail-'+key:undefined}>{label}</label></dt>
     <dd>{editing?<form className="patient-demographics-editor" onSubmit={event=>{event.preventDefault();void savePatient().catch(()=>{})}} onKeyDown={event=>{if(event.key==='Escape'&&!patientSaving){event.preventDefault();cancel()}}}>
      {key==='chief_complaint'?<textarea id={'patient-detail-'+key} autoFocus disabled={patientSaving} rows={2} value={patientValues[key]} onChange={event=>change(event.target.value)}/>:<input id={'patient-detail-'+key} autoFocus disabled={patientSaving} required={key==='first_name'} type={key==='email'?'email':'text'} inputMode={key==='age'||key==='amka'?'numeric':key==='phone'||key==='landline'||key==='contact_phone'?'tel':undefined} value={patientValues[key]} onChange={event=>change(event.target.value)}/>}
      <div className="patient-demographics-actions"><button type="submit" disabled={patientSaving} aria-label={'Αποθήκευση: '+label} title="Αποθήκευση"><Check size={17}/></button><button type="button" disabled={patientSaving} onClick={cancel} aria-label={'Ακύρωση: '+label} title="Ακύρωση"><X size={17}/></button></div>
     </form>:<><span className={value?'patient-demographics-value':'patient-demographics-empty'}>{value?(key==='age'?value+' ετών':value):'Δεν έχει καταγραφεί'}</span><button type="button" className="patient-demographics-pencil" disabled={editingPatientField!==null||patientSaving} aria-label={'Επεξεργασία: '+label} title={'Επεξεργασία: '+label} onClick={()=>{setPatientValues(patientInitial());setEditingPatientField(key);setPatientState('')}}><Pencil size={15}/></button></>}</dd>
    </div>
   })}</dl>
   {patientState&&<div role={patientState==='Αποθηκεύτηκε'?'status':'alert'} className={patientState==='Αποθηκεύτηκε'?'save-state ok':'save-state error'}>{patientState}</div>}
  </section>
  <section id={sectionId+'-reported'} className={readingStyles.anchor} aria-label="Αυτοαναφορές ασθενούς"><PatientReportedHistory patientId={bundle.patient.id}/></section>
  <section id={sectionId+'-notes'} className={readingStyles.anchor}><details className="patient-doctor-notes">
   <summary>Κλινικές σημειώσεις ιστορικού <span>{historyFields.some(([key])=>values[key]?.trim())?'Υπάρχει καταγραφή':'Προαιρετικά'}</span></summary>
   <p className="patient-reported-muted">Οι ίδιες κλινικές σημειώσεις είναι διαθέσιμες και στην καταγραφή επίσκεψης. Οι απαντήσεις του ασθενούς παραμένουν αποθηκευμένες χωριστά.</p>
   {state&&<div role={draft.error?'alert':'status'} className={draft.error?'save-state error':'save-state ok'}>{state}</div>}
   {draft.olderRecovery&&<details className="patient-older-notes">
    <summary>Υπάρχει παλαιότερο μη αποθηκευμένο πρόχειρο</summary>
    <p className="patient-reported-muted">Διατηρείται μόνο σε αυτόν τον browser. Δεν αντικαθιστά το αποθηκευμένο ιστορικό.</p>
    <div className="patient-reported-answers">{historyFields.filter(([key])=>draft.olderRecovery?.[key]?.trim()).map(([key,label])=><div key={key}><strong>{label}</strong><p>{draft.olderRecovery?.[key]}</p></div>)}</div>
    <button type="button" className="patient-reported-link" onClick={draft.dismissOlderRecovery}>Απόκρυψη παλιού προχείρου</button>
   </details>}
   {!editingHistory?<><div className={readingStyles.notesReading}>{historyFields.map(([key,label])=><article key={key}><strong>{label}</strong><p>{values[key]?.trim()||'Δεν έχει καταγραφεί κλινική σημείωση.'}</p></article>)}</div><button type="button" className="patient-reported-link" onClick={()=>setEditingHistory(true)}>Επεξεργασία κλινικού ιστορικού</button></>:<>
   <div className="history-editor-grid">{historyFields.map(([key,label])=><label key={key}>{label}<textarea rows={4} value={values[key]} onChange={e=>draft.change({...values,[key]:e.target.value})} onBlur={event=>{if(!(event.relatedTarget instanceof HTMLElement&&event.relatedTarget.dataset.historySave))void draft.flush().catch(()=>{})}} placeholder="Προσθέστε μια κλινική σημείωση, αν χρειάζεται"/></label>)}</div>
   <button type="button" className="record compact" data-history-save="true" onClick={()=>void save().then(()=>{if(!dirty.current&&!draft.hasConflict)setEditingHistory(false)}).catch(()=>{})} disabled={saving}>{saving?'Αποθήκευση…':'Αποθήκευση σημειώσεων'}</button>
   </>}
  </details></section>
 </section>
}

export function MedicationsPanel({bundle,reload,beforeNavigate,currentOnly=false,sessionId,onVisit}:{onVisit?:(id:string)=>void;bundle:PatientBundle;reload:()=>Promise<unknown>;beforeNavigate?:MutableRefObject<(()=>Promise<void>)|null>;currentOnly?:boolean;sessionId?:string}){
 const flushers=useRef(new Map<string,()=>Promise<void>>()),dirty=useRef(new Set<string>());
 const registerFlusher=useCallback((key:string,flush:()=>Promise<void>)=>{flushers.current.set(key,flush);return()=>{if(flushers.current.get(key)===flush)flushers.current.delete(key)}},[]);
 const onDirtyChange=useCallback((key:string,value:boolean)=>{if(value)dirty.current.add(key);else dirty.current.delete(key)},[]);
 useEffect(()=>{if(!beforeNavigate)return;const flush=async()=>{await Promise.all([...flushers.current.values()].map(fn=>fn()))};beforeNavigate.current=flush;return()=>{if(beforeNavigate.current===flush)beforeNavigate.current=null}},[beforeNavigate]);
 useEffect(()=>{const warn=(event:BeforeUnloadEvent)=>{if(!dirty.current.size)return;event.preventDefault();event.returnValue=''};window.addEventListener('beforeunload',warn);return()=>window.removeEventListener('beforeunload',warn)},[]);
 return <section className="panel-stack medication-record">
  <div className="panel-heading medication-record-head">
   <div><span className="kicker">ΑΓΩΓΗ</span><h2>{currentOnly?'Τρέχουσα αγωγή':'Αγωγή'}</h2></div>
  </div>
  <MedicationTable bundle={currentOnly?{...bundle,medications:bundle.medications.filter(m=>m.status==='active'||m.status==='planned')}:bundle} reload={reload} sessionId={sessionId} editablePlan editableEffects registerFlusher={registerFlusher} onDirtyChange={onDirtyChange}/>
  {currentOnly&&bundle.medications.some(m=>m.status!=='active'&&m.status!=='planned')&&<details className="medication-history-details"><summary>Παλαιότερη αγωγή</summary><MedicationTable bundle={{...bundle,medications:bundle.medications.filter(m=>m.status!=='active'&&m.status!=='planned')}} reload={reload} editableEffects registerFlusher={registerFlusher} onDirtyChange={onDirtyChange}/></details>}
  <details className="medication-history-details">
   <summary>Ιστορικό αλλαγών <span>{bundle.medicationEvents.length||''}</span></summary>
   <MedicationTimeline bundle={bundle} reload={reload} sessionId={sessionId} onVisit={onVisit} registerFlusher={registerFlusher} onDirtyChange={onDirtyChange}/>
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
   const linkedSession=medicationSessionId(bundle,sessionId);
   if(mode==='history')await demoPost({action:'medication_history',patient_id:bundle.patient.id,session_id:linkedSession,name,dose:Number(dose),unit,frequency,started_on:effective,stopped_on:stopped,reason});
   if(mode==='start')await demoPost({action:'medication_start',patient_id:bundle.patient.id,session_id:linkedSession,name,dose:Number(dose),unit,frequency,effective_on:effective,reason});
   if(mode==='change')await demoPost({action:'medication_event',replace_id:sameDayEvent?.id||null,event_type:sameDayEvent?.event_type||'changed',expected_version:selected?.plan_version,medication_id:medId,session_id:linkedSession,dose:Number(dose),unit,frequency,effective_on:effective,reason});
   if(mode==='stop')await demoPost({action:'medication_event',event_type:'stopped',expected_version:selected?.plan_version,medication_id:medId,session_id:linkedSession,effective_on:effective,reason});
   if(mode==='side_effect')await demoPost({action:'medication_side_effect',medication_id:medId,session_id:linkedSession,effect,severity,impact,noted_on:effective,note:reason});
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

  {(mode==='start'||mode==='history'||mode==='change')&&<div className="med-form-grid"><label>{mode==='change'?'Νέα δόση':'Δόση'}<input inputMode="decimal" value={dose} onChange={e=>setDose(e.target.value.replace(',','.'))}/></label><label>Μονάδα<input value={unit} onChange={e=>setUnit(e.target.value)}/></label><div><span>Συχνότητα</span><MedicationFrequency value={frequency} onChange={setFrequency}/></div><label>Έναρξη<input type="date" value={effective} onChange={e=>setEffective(e.target.value)}/></label></div>}
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

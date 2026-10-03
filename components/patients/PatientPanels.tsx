'use client';
import { useEffect, useMemo, useState, useRef } from 'react';
import { Check, Plus, X } from 'lucide-react';
import type { PatientBundle } from '@/lib/patients/demo-runtime';
import MedicationTimeline from './MedicationTimeline';
import { demoPost } from '@/lib/patients/demo-client';

const date=(value?:string|null)=>value?new Intl.DateTimeFormat('el-GR',{day:'2-digit',month:'short',year:'numeric'}).format(new Date(value)):'—';
const historyFields=[['psychiatric_history','Ψυχιατρικό ιστορικό'],['medical_history','Σωματικό ιστορικό'],['previous_treatments','Προηγούμενες θεραπείες'],['hospitalizations','Νοσηλείες'],['family_history','Οικογενειακό ιστορικό'],['substance_history','Ουσίες'],['social_functioning','Κοινωνική λειτουργικότητα'],['allergies','Αλλεργίες']] as const;
export function HistoryPanel({bundle,reload}:{bundle:PatientBundle;reload:()=>Promise<unknown>}){
 const initial=Object.fromEntries(historyFields.map(([key])=>[key,bundle.history?.[key]||''])) as Record<string,string>;
 const patientInitial=()=>({first_name:bundle.patient.first_name,last_name:bundle.patient.last_name,age:bundle.patient.reported_age==null?'':String(bundle.patient.reported_age),phone:bundle.patient.phone||'',email:bundle.patient.email||'',chief_complaint:bundle.patient.chief_complaint||''});
 const [values,setValues]=useState(initial);
 const [saving,setSaving]=useState(false);
 const [state,setState]=useState('');
 const dirty=useRef(false);
 const [patientOpen,setPatientOpen]=useState(false);
 const [patientValues,setPatientValues]=useState(patientInitial);
 const [patientSaving,setPatientSaving]=useState(false);
 const [patientState,setPatientState]=useState('');
 const patientDirty=useRef(false);
 useEffect(()=>{if(!dirty.current)setValues(Object.fromEntries(historyFields.map(([key])=>[key,bundle.history?.[key]||''])))},[bundle.history]);
 useEffect(()=>{if(!patientDirty.current)setPatientValues(patientInitial())},[bundle.patient.updated_at]);
 async function save(){
  setSaving(true);setState('');
  try{
   await demoPost({action:'save_history',patient_id:bundle.patient.id,history:values,expected_version:bundle.history?.version??0});
   dirty.current=false;setState('Αποθηκεύτηκε');await reload();
  }catch(cause){setState(cause instanceof Error?cause.message:'Αποτυχία αποθήκευσης')}finally{setSaving(false)}
 }
 async function savePatient(){
  setPatientSaving(true);setPatientState('');
  try{
   const age=patientValues.age.trim()===''?null:Number(patientValues.age);
   await demoPost({action:'update_patient',patient_id:bundle.patient.id,first_name:patientValues.first_name,last_name:patientValues.last_name,age,phone:patientValues.phone,email:patientValues.email,chief_complaint:patientValues.chief_complaint,expected_updated_at:bundle.patient.updated_at});
   patientDirty.current=false;setPatientState('Αποθηκεύτηκε');await reload();setPatientOpen(false);
  }catch(cause){setPatientState(cause instanceof Error?cause.message:'Δεν αποθηκεύτηκαν τα στοιχεία ασθενή')}finally{setPatientSaving(false)}
 }
 const incomplete=bundle.patient.reported_age==null||!bundle.patient.phone||!bundle.patient.email||!bundle.patient.chief_complaint;
 return <section className="panel-stack">
  <div className="panel-heading"><div><span className="kicker">ΙΣΤΟΡΙΚΟ</span><h2>Στοχευμένη καταγραφή ιστορικού</h2><p>Κενό πεδίο σημαίνει «δεν έχει καταγραφεί» — ποτέ αρνητικό εύρημα.</p></div><button className="record compact" onClick={()=>void save()} disabled={saving}>{saving?'Αποθήκευση…':'Αποθήκευση ιστορικού'}</button></div>
  {state&&<div className={state==='Αποθηκεύτηκε'?'save-state ok':'save-state error'}>{state}</div>}
  <section className={incomplete?'patient-details-card incomplete':'patient-details-card'}>
   <div className="patient-details-head"><div><strong>Στοιχεία ασθενή</strong><span>{incomplete?'Υπάρχουν βασικά στοιχεία που δεν έχουν ακόμη συμπληρωθεί.':'Τα βασικά στοιχεία του φακέλου είναι συμπληρωμένα.'}</span></div><button onClick={()=>{setPatientOpen(open=>!open);setPatientState('')}}>{patientOpen?'Κλείσιμο':'Επεξεργασία στοιχείων'}</button></div>
   {!patientOpen&&<div className="record-contact-strip"><span>{bundle.patient.reported_age==null?'Χωρίς ηλικία':bundle.patient.reported_age+' ετών'}</span><span>{bundle.patient.phone||'Χωρίς τηλέφωνο'}</span><span>{bundle.patient.email||'Χωρίς email'}</span><span>{bundle.patient.chief_complaint||'Χωρίς καταγεγραμμένο λόγο προσέλευσης'}</span></div>}
   {patientOpen&&<div className="patient-details-form">
    <div className="patient-details-grid"><label>Όνομα<input disabled={patientSaving} value={patientValues.first_name} onChange={e=>{patientDirty.current=true;setPatientValues(v=>({...v,first_name:e.target.value}))}}/></label><label>Επώνυμο<input disabled={patientSaving} value={patientValues.last_name} onChange={e=>{patientDirty.current=true;setPatientValues(v=>({...v,last_name:e.target.value}))}}/></label><label>Ηλικία<input disabled={patientSaving} inputMode="numeric" value={patientValues.age} onChange={e=>{patientDirty.current=true;setPatientValues(v=>({...v,age:e.target.value.replace(/\D/g,'')}))}}/></label><label>Τηλέφωνο<input disabled={patientSaving} value={patientValues.phone} onChange={e=>{patientDirty.current=true;setPatientValues(v=>({...v,phone:e.target.value}))}}/></label><label>Email<input disabled={patientSaving} type="email" value={patientValues.email} onChange={e=>{patientDirty.current=true;setPatientValues(v=>({...v,email:e.target.value}))}}/></label><label className="span-two">Λόγος προσέλευσης<textarea disabled={patientSaving} rows={2} value={patientValues.chief_complaint} onChange={e=>{patientDirty.current=true;setPatientValues(v=>({...v,chief_complaint:e.target.value}))}}/></label></div>
    {patientState&&<div className={patientState==='Αποθηκεύτηκε'?'save-state ok':'save-state error'}>{patientState}</div>}
    <button className="record compact" disabled={patientSaving||!patientValues.first_name.trim()} onClick={()=>void savePatient()}>{patientSaving?'Αποθήκευση…':'Αποθήκευση στοιχείων'}</button>
   </div>}
  </section>
  <div className="history-editor-grid">{historyFields.map(([key,label])=><label key={key}>{label}<textarea disabled={saving} rows={4} value={values[key]} onChange={e=>{dirty.current=true;setValues(v=>({...v,[key]:e.target.value}))}} placeholder="Δεν έχει καταγραφεί"/></label>)}</div>
 </section>
}

export function MedicationsPanel({bundle,onAdd,reload}:{bundle:PatientBundle;onAdd:()=>void;reload:()=>Promise<unknown>}){
 const active=bundle.medications.filter(x=>x.status==='active');
 const today=new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Athens',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
 const medName=(id:string)=>bundle.medications.find(m=>m.id===id)?.medication_name||'Αγωγή';
 const doseText=(state:Record<string,unknown>|null)=>state&&state.dose!=null?String(state.dose)+' '+String(state.unit||''):'—';
 return <section className="panel-stack">
  <div className="panel-heading"><div><span className="kicker">ΑΓΩΓΗ</span><h2>Τρέχουσα αγωγή & ιστορικό αλλαγών</h2><p>Η ενεργή δόση εμφανίζεται χωριστά από τις προγραμματισμένες αλλαγές.</p></div><button className="record compact" onClick={onAdd}><Plus size={15}/> Διαχείριση αγωγής</button></div>
  {active.length?<div className="med-runtime-list">{active.map(m=><article key={m.id}><div><span className="kicker">ΕΝΕΡΓΟ</span><h3>{m.medication_name}</h3></div><strong>{m.dose} {m.unit}</strong><span>{m.frequency}</span><small>Από {date(m.effective_from)}</small></article>)}</div>:<div className="panel-empty">Δεν υπάρχει ενεργή αγωγή.</div>}
  <MedicationTimeline bundle={bundle} reload={reload}/>
  <div className="med-side-effects"><h3>Καταγεγραμμένες παρενέργειες</h3>{bundle.medicationSideEffects.length?bundle.medicationSideEffects.map(effect=><article key={effect.id} className={effect.resolved_on?'resolved':''}><div><strong>{effect.effect_text}</strong><span>{medName(effect.medication_id)} · {date(effect.noted_on)}</span></div><i className={'severity '+effect.severity}>{effect.severity==='mild'?'Ήπια':effect.severity==='severe'?'Σοβαρή':'Μέτρια'}</i><p>{effect.impact||effect.note||'Δεν καταγράφηκε επίδραση στη λειτουργικότητα.'}</p>{effect.resolved_on?<small>Επιλύθηκε {date(effect.resolved_on)}</small>:<button onClick={async()=>{await demoPost({action:'medication_side_effect_resolve',side_effect_id:effect.id,resolved_on:today});await reload()}}>Σήμανση ως επιλυμένη</button>}</article>):<p>Δεν έχουν καταγραφεί παρενέργειες.</p>}</div>
 </section>
}

export function MedicationModal({bundle,onClose,onSaved,sessionId}:{bundle:PatientBundle;sessionId?:string;onClose:()=>void;onSaved:()=>Promise<unknown>}){
 const active=bundle.medications.filter(x=>x.status==='active');
 const [mode,setMode]=useState<'start'|'history'|'change'|'stop'|'side_effect'>(active.length?'change':'start');
 const selectable=mode==='side_effect'?bundle.medications:bundle.medications.filter(x=>x.status==='active'||x.status==='planned');
 const [medId,setMedId]=useState(active[0]?.id||selectable[0]?.id||'');
 const selected=useMemo(()=>selectable.find(x=>x.id===medId),[selectable,medId]);
 const [name,setName]=useState('');
 const [dose,setDose]=useState(selected?String(selected.dose):'');
 const [unit,setUnit]=useState(selected?.unit||'mg');
 const [frequency,setFrequency]=useState(selected?.frequency||'');
 const athensToday=new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Athens',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
 const [effective,setEffective]=useState(athensToday);
 const [stopped,setStopped]=useState(athensToday);
 const [reason,setReason]=useState('');
 const [effect,setEffect]=useState('');
 const [severity,setSeverity]=useState<'mild'|'moderate'|'severe'>('moderate');
 const [impact,setImpact]=useState('');
 const [saving,setSaving]=useState(false);
 const [error,setError]=useState('');

 useEffect(()=>{if(selected){setDose(String(selected.dose));setUnit(selected.unit);setFrequency(selected.frequency)}},[selected]);

 async function save(){
  if((mode==='start'||mode==='history')&&(!name.trim()||!dose||!frequency.trim())){setError('Συμπληρώστε φάρμακο, δόση και συχνότητα.');return}
  if(mode==='change'&&(!selected||!dose||!frequency.trim())){setError('Επιλέξτε φάρμακο και συμπληρώστε νέα δόση και συχνότητα.');return}
  if((mode==='stop'||mode==='side_effect')&&!selected){setError('Επιλέξτε φάρμακο.');return}
  if(mode==='side_effect'&&!effect.trim()){setError('Καταγράψτε την παρενέργεια.');return}
  setSaving(true);setError('');
  try{
   const draft=bundle.sessions.find(x=>sessionId?x.id===sessionId&&x.status==='draft':x.status==='draft');
   if(sessionId&&!draft)throw new Error('Το συγκεκριμένο πρόχειρο δεν είναι διαθέσιμο.');
   if(mode==='history')await demoPost({action:'medication_history',patient_id:bundle.patient.id,session_id:draft?.id||null,name,dose:Number(dose),unit,frequency,started_on:effective,stopped_on:stopped,reason});
   if(mode==='start')await demoPost({action:'medication_start',patient_id:bundle.patient.id,session_id:draft?.id||null,name,dose:Number(dose),unit,frequency,effective_on:effective,reason});
   if(mode==='change')await demoPost({action:'medication_event',event_type:'changed',expected_version:selected?.plan_version,medication_id:medId,session_id:draft?.id||null,dose:Number(dose),unit,frequency,effective_on:effective,reason});
   if(mode==='stop')await demoPost({action:'medication_event',event_type:'stopped',expected_version:selected?.plan_version,medication_id:medId,session_id:draft?.id||null,effective_on:effective,reason});
   if(mode==='side_effect')await demoPost({action:'medication_side_effect',medication_id:medId,session_id:draft?.id||null,effect,severity,impact,noted_on:effective,note:reason});
   await onSaved();onClose();
  }catch(cause){setError(cause instanceof Error?cause.message:'Δεν αποθηκεύτηκε η αλλαγή.')}finally{setSaving(false)}
 }

 const title=mode==='history'?'Προηγούμενη αγωγή':mode==='start'?'Νέα αγωγή':mode==='change'?'Αλλαγή δόσης':mode==='stop'?'Διακοπή αγωγής':'Καταγραφή παρενέργειας';
 return <div className="entry-modal-backdrop" onClick={()=>{if(!saving)onClose()}}><section className="entry-modal medication-runtime-modal" onClick={e=>e.stopPropagation()}>
  <button className="entry-close" onClick={()=>{if(!saving)onClose()}} aria-label="Κλείσιμο"><X size={19}/></button><span className="kicker">ΔΙΑΧΕΙΡΙΣΗ ΑΓΩΓΗΣ</span><h2>{title}</h2>
  <div className="mode-switch medication-modes">
   <button className={mode==='change'?'active':''} disabled={!active.length} onClick={()=>{setMedId(active[0]?.id||'');setMode('change')}}>Αλλαγή δόσης</button>
   <button className={mode==='start'?'active':''} onClick={()=>setMode('start')}>Νέα αγωγή</button>
   <button className={mode==='history'?'active':''} onClick={()=>setMode('history')}>Προηγούμενη αγωγή</button>
   <button className={mode==='stop'?'active':''} disabled={!active.length} onClick={()=>{setMedId(active[0]?.id||'');setMode('stop')}}>Διακοπή</button>
   <button className={mode==='side_effect'?'active':''} disabled={!bundle.medications.length} onClick={()=>{setMedId(active[0]?.id||bundle.medications[0]?.id||'');setMode('side_effect')}}>Παρενέργεια</button>
  </div>

  {mode!=='start'&&mode!=='history'&&<><label>Φάρμακο<select value={medId} onChange={e=>setMedId(e.target.value)}>{selectable.map(m=><option key={m.id} value={m.id}>{m.medication_name}{m.status==='planned'?' · προγραμματισμένη':m.status==='stopped'?' · διακοπείσα':''}</option>)}</select></label>{selected&&<div className="current-dose">{selected.status==='stopped'?'Τελευταία δόση πριν τη διακοπή':selected.status==='planned'?'Προγραμματισμένη αγωγή':'Τρέχουσα αγωγή'} <strong>{selected.dose} {selected.unit} · {selected.frequency}</strong></div>}</>}
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
  {error&&<div className="save-state error" role="alert">{error}</div>}
  <footer className="entry-footer"><button onClick={()=>{if(!saving)onClose()}}>Ακύρωση</button><button className="entry-primary" onClick={()=>void save()} disabled={saving}><Check size={15}/>{saving?'Αποθήκευση…':'Αποθήκευση'}</button></footer>
 </section></div>
}

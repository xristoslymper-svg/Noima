'use client';
import {useSystemMessage} from '@/i18n/system-message';

import {useTranslations} from 'next-intl';

import { useCallback, useEffect, useMemo, useState, useRef, type MutableRefObject } from 'react';
import { Check, Pencil, X } from 'lucide-react';
import type { PatientBundle } from '@/lib/patients/demo-runtime';
import {useClinicalDraft} from './useClinicalDraft';
import MedicationTimeline from './MedicationTimeline';
import MedicationTable from './MedicationTable';
import MedicationFrequency from './MedicationFrequency';
import { demoPost } from '@/lib/patients/demo-client';
import PatientReportedHistory from './PatientReportedHistory';
import type {Assessment} from '@/lib/clinical/core-types';
import HistoryAddMenu,{type HistoryAddAction} from './HistoryAddMenu';
import HistoricalScoreForm from './HistoricalScoreForm';
import {PatientDocumentsSection} from './PatientDocuments';


export function HistoryPanel({bundle,reload,beforeNavigate,onMeasurementSaved,onPriorCourse}:{bundle:PatientBundle;reload:()=>Promise<unknown>;beforeNavigate:MutableRefObject<(()=>Promise<void>)|null>;onMeasurementSaved?:(measurement:Assessment)=>Promise<unknown>;onPriorCourse?:()=>void}){
const t=useTranslations();
 const [addAction,setAddAction]=useState<HistoryAddAction|null>(null);
 const [addedNotice,setAddedNotice]=useState('');
 const systemMessage=useSystemMessage();

const historyFields=[['psychiatric_history',t('history.psychiatric')],['medical_history',t('history.medical')],['previous_treatments',t('history.previousTreatments')],['hospitalizations',t('history.hospitalizations')],['family_history',t('history.family')],['substance_history',t('history.substances')],['social_functioning',t('history.socialFunctioning')],['allergies',t('history.allergies')]] as const;

 

 const initial=Object.fromEntries(historyFields.map(([key])=>[key,bundle.history?.[key]||''])) as Record<string,string>;
 const patientInitial=()=>({first_name:bundle.patient.first_name,last_name:bundle.patient.last_name,age:bundle.patient.reported_age==null?'':String(bundle.patient.reported_age),phone:bundle.patient.phone||'',landline:bundle.patient.landline||'',contact_phone:bundle.patient.contact_phone||'',amka:bundle.patient.amka||'',address:bundle.patient.address||'',email:bundle.patient.email||'',chief_complaint:bundle.patient.chief_complaint||''});
 const dirty=useRef(false);
 const draft=useClinicalDraft<Record<string,string>>({storageKey:bundle.patient.id+':history',initial,version:bundle.history?.version??0,quietRecovery:true,write:async(history,version)=>{const d=await demoPost({action:'save_history',patient_id:bundle.patient.id,history,expected_version:version});return {value:Object.fromEntries(historyFields.map(([key])=>[key,d.history[key]||''])),version:d.history.version}},onSaved:reload,onDirty:d=>{dirty.current=d}});
 const values=draft.value,saving=draft.saving,state=draft.error||(draft.savedAt?t('common.saved')+draft.savedAt+t('common.athensSuffix'):'');
 const [editingPatientField,setEditingPatientField]=useState<keyof ReturnType<typeof patientInitial>|null>(null);
 const patientFields=[['first_name',t('patients.firstName')],['last_name',t('patients.lastName')],['age',t('patients.age')],['phone',t('patients.mobile')],['landline',t('patients.landline')],['contact_phone',t('patients.additionalPhone')],['amka',t('patients.amka')],['address',t('patients.address')],['email','Email'],['chief_complaint',t('clinical.presentingComplaint')]] as const;
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
    committed=true;patientDirty.current=false;setPatientState('saved');
    const refreshed=await reload();
    if(!refreshed){setPatientState(t('patients.detailsSavedRefreshFailed'));return}
    setEditingPatientField(null);
   }catch(cause){
    if(committed){setPatientState(t('patients.detailsSavedRefreshFailed'));return}
    const message=cause instanceof Error?cause.message:t('errors.patientDetailsSave');setPatientState(message);
    if(/άλλαξε σε άλλη καρτέλα|Επαναφορτώστε|stale/i.test(message)){try{await reload()}catch{/* keep the user's local fields; retry remains explicit */}}
    throw cause;
   }finally{setPatientSaving(false)}
  })();
  patientFlight.current=task;try{await task}finally{patientFlight.current=null}
 }
 const flushRef=useRef<()=>Promise<void>>(async()=>{});
 flushRef.current=async()=>{if(!draft.preserveConflictForNavigation())await draft.flush();if(patientDirty.current||patientFlight.current)throw new Error(t('patients.saveOrCancelDetails'))};
 useEffect(()=>{const flush=()=>flushRef.current();beforeNavigate.current=flush;const leave=(e:BeforeUnloadEvent)=>{if(dirty.current||patientDirty.current){e.preventDefault();e.returnValue=''}};window.addEventListener('beforeunload',leave);return()=>{if(beforeNavigate.current===flush)beforeNavigate.current=null;window.removeEventListener('beforeunload',leave)}},[beforeNavigate]);
 const incomplete=bundle.patient.reported_age==null||!bundle.patient.phone||!bundle.patient.amka||!bundle.patient.address;
 return <section className="panel-stack">
  <div className="panel-heading"><div><span className="kicker">{t('patients.recordKicker')}</span><h2>{t('patients.detailsHistory')}</h2></div><HistoryAddMenu onSelect={action=>{setAddedNotice('');setAddAction(action)}}/></div>
  {addAction==='score'&&<HistoricalScoreForm patientId={bundle.patient.id} onClose={()=>setAddAction(null)} onSaved={async measurement=>{if(onMeasurementSaved)await onMeasurementSaved(measurement);else await reload();setAddedNotice(t('historical.saved'))}}/>}
  {addedNotice&&<p role="status" className="save-state ok">{addedNotice}</p>}
  {onPriorCourse&&<div className="history-prior-course"><button type="button" className="patient-reported-link" onClick={onPriorCourse}>{t('historical.priorCourse')}</button>{bundle.priorCourse?.content&&<p>{bundle.priorCourse.content}</p>}</div>}
  <PatientDocumentsSection bundle={bundle} reload={reload} action={addAction==='document'||addAction==='scan'?addAction:null} onClose={()=>setAddAction(null)}/>
  <PatientReportedHistory patientId={bundle.patient.id}/>

  <section className={'patient-details-card patient-demographics'+(incomplete?' incomplete':'')}>
   <div className="patient-details-head"><div><strong>{t('patients.details')}</strong><span>{incomplete?t('patients.basicDetailsIncomplete'):t('patients.basicDetailsComplete')}</span></div></div>
   <dl className="patient-demographics-list">{patientFields.map(([key,label])=>{
    const editing=editingPatientField===key,value=patientInitial()[key];
    const change=(value:string)=>{patientDirty.current=true;setPatientValues(v=>({...v,[key]:key==='age'?value.replace(/\D/g,''):key==='amka'?value.replace(/\D/g,'').slice(0,11):value}))};
    const cancel=()=>{patientDirty.current=false;setPatientValues(patientInitial());setEditingPatientField(null);setPatientState('')};
    return <div className="patient-demographics-row" key={key}>
     <dt><label htmlFor={editing?'patient-detail-'+key:undefined}>{label}</label></dt>
     <dd>{editing?<form className="patient-demographics-editor" onSubmit={event=>{event.preventDefault();void savePatient().catch(()=>{})}} onKeyDown={event=>{if(event.key==='Escape'&&!patientSaving){event.preventDefault();cancel()}}}>
      {key==='chief_complaint'?<textarea id={'patient-detail-'+key} autoFocus disabled={patientSaving} rows={2} value={patientValues[key]} onChange={event=>change(event.target.value)}/>:<input id={'patient-detail-'+key} autoFocus disabled={patientSaving} required={key==='first_name'} type={key==='email'?'email':'text'} inputMode={key==='age'||key==='amka'?'numeric':key==='phone'||key==='landline'||key==='contact_phone'?'tel':undefined} value={patientValues[key]} onChange={event=>change(event.target.value)}/>}
      <div className="patient-demographics-actions"><button type="submit" disabled={patientSaving} aria-label={t('accessibility.saveFieldPrefix')+label} title={t('common.save')}><Check size={17}/></button><button type="button" disabled={patientSaving} onClick={cancel} aria-label={t('accessibility.cancelFieldPrefix')+label} title={t('common.cancel')}><X size={17}/></button></div>
     </form>:<><span className={value?'patient-demographics-value':'patient-demographics-empty'}>{value?(key==='age'?value+t('patients.yearsOldSuffix'):value):t('clinical.notRecorded')}</span><button type="button" className="patient-demographics-pencil" disabled={editingPatientField!==null||patientSaving} aria-label={t('accessibility.editFieldPrefix')+label} title={t('accessibility.editFieldPrefix')+label} onClick={()=>{setPatientValues(patientInitial());setEditingPatientField(key);setPatientState('')}}><Pencil size={15}/></button></>}</dd>
    </div>
   })}</dl>
   {patientState&&<div role={patientState==='saved'?'status':'alert'} className={patientState==='saved'?'save-state ok':'save-state error'}>{patientState==='saved'?t('common.saved'):systemMessage(patientState)}</div>}
  </section>
  <details className="patient-doctor-notes">
   <summary>{t('history.clinicalNotesTitle')} <span>{historyFields.some(([key])=>values[key]?.trim())?t('clinical.entryExists'):t('common.optionalPlural')}</span></summary>
   <p className="patient-reported-muted">{t('history.sharedNotesHelp')}</p>
   {state&&<div role={draft.error?'alert':'status'} className={draft.error?'save-state error':'save-state ok'}>{draft.error?systemMessage(draft.error):state}</div>}
   {draft.olderRecovery&&<details className="patient-older-notes">
    <summary>{t('history.olderUnsavedDraft')}</summary>
    <p className="patient-reported-muted">{t('history.localDraftHelp')}</p>
    <div className="patient-reported-answers">{historyFields.filter(([key])=>draft.olderRecovery?.[key]?.trim()).map(([key,label])=><div key={key}><strong>{label}</strong><p>{draft.olderRecovery?.[key]}</p></div>)}</div>
    <button type="button" className="patient-reported-link" onClick={draft.dismissOlderRecovery}>{t('history.hideOldDraft')}</button>
   </details>}
   <div className="history-editor-grid">{historyFields.map(([key,label])=><label key={key}>{label}<textarea rows={4} value={values[key]} onChange={e=>draft.change({...values,[key]:e.target.value})} onBlur={()=>void draft.flush().catch(()=>{})} placeholder={t('history.addClinicalNotePlaceholder')}/></label>)}</div>
   <button type="button" className="record compact" onClick={()=>void save().catch(()=>{})} disabled={saving}>{saving?t('common.saving'):t('history.saveNotes')}</button>
  </details>
 </section>
}

export function MedicationsPanel({bundle,reload,beforeNavigate,currentOnly=false}:{bundle:PatientBundle;reload:()=>Promise<unknown>;beforeNavigate?:MutableRefObject<(()=>Promise<void>)|null>;currentOnly?:boolean}){
 const t=useTranslations();

 const flushers=useRef(new Map<string,()=>Promise<void>>()),dirty=useRef(new Set<string>());
 const registerFlusher=useCallback((key:string,flush:()=>Promise<void>)=>{flushers.current.set(key,flush);return()=>{if(flushers.current.get(key)===flush)flushers.current.delete(key)}},[]);
 const onDirtyChange=useCallback((key:string,value:boolean)=>{if(value)dirty.current.add(key);else dirty.current.delete(key)},[]);
 useEffect(()=>{if(!beforeNavigate)return;const flush=async()=>{await Promise.all([...flushers.current.values()].map(fn=>fn()))};beforeNavigate.current=flush;return()=>{if(beforeNavigate.current===flush)beforeNavigate.current=null}},[beforeNavigate]);
 useEffect(()=>{const warn=(event:BeforeUnloadEvent)=>{if(!dirty.current.size)return;event.preventDefault();event.returnValue=''};window.addEventListener('beforeunload',warn);return()=>window.removeEventListener('beforeunload',warn)},[]);
 return <section className="panel-stack medication-record">
  <div className="panel-heading medication-record-head">
   <div><span className="kicker">{t('medications.medicationKicker')}</span><h2>{currentOnly?t('medications.current'):t('medications.medication')}</h2></div>
  </div>
  <MedicationTable bundle={currentOnly?{...bundle,medications:bundle.medications.filter(m=>m.status==='active'||m.status==='planned')}:bundle} reload={reload} editablePlan editableEffects registerFlusher={registerFlusher} onDirtyChange={onDirtyChange}/>
  {currentOnly&&bundle.medications.some(m=>m.status!=='active'&&m.status!=='planned')&&<details className="medication-history-details"><summary>{t('medications.earlierMedication')}</summary><MedicationTable bundle={{...bundle,medications:bundle.medications.filter(m=>m.status!=='active'&&m.status!=='planned')}} reload={reload} editableEffects registerFlusher={registerFlusher} onDirtyChange={onDirtyChange}/></details>}
  <details className="medication-history-details">
   <summary>{t('medications.changeHistory')} <span>{bundle.medicationEvents.length||''}</span></summary>
   <MedicationTimeline bundle={bundle} reload={reload} registerFlusher={registerFlusher} onDirtyChange={onDirtyChange}/>
  </details>
 </section>
}
export function MedicationModal({bundle,onClose,onSaved,sessionId,initialMode,initialMedicationId}:{bundle:PatientBundle;sessionId?:string;initialMode?:'start'|'history'|'change'|'stop'|'side_effect';initialMedicationId?:string;onClose:()=>void;onSaved:()=>Promise<unknown>}){
 const systemMessage=useSystemMessage();

 const t=useTranslations();

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
  if((mode==='start'||mode==='history')&&(!name.trim()||!dose||!frequency.trim())){setError(t('validation.medicationDetailsRequired'));return}
  if(sameDayEvent&&(!correctSameDay||!reason.trim())){setError(t('validation.sameDayCorrectionReason'));return}
  if(mode==='change'&&(!selected||!dose||!frequency.trim())){setError(t('validation.medicationChangeDetails'));return}
  if((mode==='stop'||mode==='side_effect')&&!selected){setError(t('validation.selectMedication'));return}
  if(mode==='side_effect'&&!effect.trim()){setError(t('validation.sideEffectRequired'));return}
  savingRef.current=true;setSaving(true);setError('');
  let committed=false;
  try{
   const draft=bundle.sessions.find(x=>sessionId?x.id===sessionId&&x.status==='draft':x.status==='draft');
   if(sessionId&&!draft)throw new Error(t('errors.selectedDraftUnavailable'));
   if(mode==='history')await demoPost({action:'medication_history',patient_id:bundle.patient.id,session_id:draft?.id||null,name,dose:Number(dose),unit,frequency,started_on:effective,stopped_on:stopped,reason});
   if(mode==='start')await demoPost({action:'medication_start',patient_id:bundle.patient.id,session_id:draft?.id||null,name,dose:Number(dose),unit,frequency,effective_on:effective,reason});
   if(mode==='change')await demoPost({action:'medication_event',replace_id:sameDayEvent?.id||null,event_type:sameDayEvent?.event_type||'changed',expected_version:selected?.plan_version,medication_id:medId,session_id:draft?.id||null,dose:Number(dose),unit,frequency,effective_on:effective,reason});
   if(mode==='stop')await demoPost({action:'medication_event',event_type:'stopped',expected_version:selected?.plan_version,medication_id:medId,session_id:draft?.id||null,effective_on:effective,reason});
   if(mode==='side_effect')await demoPost({action:'medication_side_effect',medication_id:medId,session_id:draft?.id||null,effect,severity,impact,noted_on:effective,note:reason});
   committed=true;
   try{await onSaved()}catch{/* mutation is committed; the folder can refresh independently */}
   setTouched(false);onClose();
  }catch(cause){if(!committed)setError(cause instanceof Error?cause.message:t('errors.medicationChangeSave'))}finally{savingRef.current=false;setSaving(false)}
 }

 function safeClose(){if(saving)return;if(touched&&!window.confirm(t('visits.closeWithoutSaving')))return;onClose()}
  const title=mode==='history'?t('medications.previousMedication'):mode==='start'?t('medications.enterMedication'):mode==='change'?t('medications.doseChange'):mode==='stop'?t('medications.stopMedication'):t('medications.recordSideEffect');
 return <div className="entry-modal-backdrop" onClick={safeClose}><section className="entry-modal medication-runtime-modal" onClick={e=>e.stopPropagation()} onChangeCapture={()=>setTouched(true)}>
  <button className="entry-close" onClick={safeClose} aria-label={t('common.close')}><X size={19}/></button><span className="kicker">{t('medications.managementKicker')}</span><h2>{title}</h2>
  <div className="mode-switch medication-modes">
   <button className={mode==='change'?'active':''} disabled={!active.length} onClick={()=>{setMedId(active[0]?.id||'');setMode('change')}}>{t('medications.doseChange')}</button>
   <button className={mode==='start'||mode==='history'?'active':''} onClick={()=>{setMode('start');setName('');setDose('');setFrequency('')}}>{t('medications.addDrug')}</button>
   <button className={mode==='stop'?'active':''} disabled={!active.length} onClick={()=>{setMedId(active[0]?.id||'');setMode('stop')}}>{t('medications.stop')}</button>
   <button className={mode==='side_effect'?'active':''} disabled={!bundle.medications.length} onClick={()=>{setMedId(active[0]?.id||bundle.medications[0]?.id||'');setMode('side_effect')}}>{t('medications.sideEffect')}</button>
  </div>

  {mode!=='start'&&mode!=='history'&&<><label>{t('medications.drug')}<select value={medId} onChange={e=>setMedId(e.target.value)}>{selectable.map(m=><option key={m.id} value={m.id}>{m.medication_name}{m.status==='planned'?t('medications.scheduledSuffix'):m.status==='stopped'?t('medications.discontinuedSuffix'):''}</option>)}</select></label>{selected&&<div className="current-dose">{selected.status==='stopped'?t('medications.lastDoseBeforeStop'):selected.status==='planned'?t('medications.scheduledMedication'):t('medications.current')} <strong>{selected.dose} {selected.unit} · {selected.frequency}</strong></div>}</>}
  {(mode==='start'||mode==='history')&&<label>{t('medications.takingStatus')}<select value={mode} onChange={e=>setMode(e.target.value as 'start'|'history')}><option value="start">{t('medications.takingNowOrScheduled')}</option><option value="history">{t('medications.stoppedPrevious')}</option></select></label>}
  {(mode==='start'||mode==='history')&&<label>{t('medications.drug')}<input value={name} onChange={e=>setName(e.target.value)} placeholder={t('medications.drugExample')}/></label>}

  {(mode==='start'||mode==='history'||mode==='change')&&<div className="med-form-grid"><label>{mode==='change'?t('medications.newDose'):t('medications.dose')}<input inputMode="decimal" value={dose} onChange={e=>setDose(e.target.value.replace(',','.'))}/></label><label>{t('medications.unit')}<input value={unit} onChange={e=>setUnit(e.target.value)}/></label><div><span>{t('medications.frequency')}</span><MedicationFrequency value={frequency} onChange={setFrequency}/></div><label>{t('visits.startedPrefix')}<input type="date" value={effective} onChange={e=>setEffective(e.target.value)}/></label></div>}
  {mode==='history'&&<label>{t('medications.stoppedSince')}<input type="date" value={stopped} onChange={e=>setStopped(e.target.value)} max={athensToday}/></label>}
  {mode==='stop'&&<label>{t('medications.stopDate')}<input type="date" value={effective} onChange={e=>setEffective(e.target.value)}/></label>}
  {mode==='side_effect'&&<><label>{t('medications.sideEffect')}<input value={effect} onChange={e=>setEffect(e.target.value)} placeholder={t('medications.effectExample')}/></label><div className="med-form-grid side-effect-grid"><label>{t('clinical.severity')}<select value={severity} onChange={e=>setSeverity(e.target.value as 'mild'|'moderate'|'severe')}><option value="mild">{t('clinical.mild')}</option><option value="moderate">{t('clinical.moderate')}</option><option value="severe">{t('clinical.severe')}</option></select></label><label>{t('common.date')}<input type="date" value={effective} onChange={e=>setEffective(e.target.value)}/></label><label className="span-two">{t('clinical.functioningImpact')}<input value={impact} onChange={e=>setImpact(e.target.value)} placeholder={t('common.optional')}/></label></div></>}

  <label>{mode==='side_effect'?t('clinical.clinicalNote'):t('clinical.reasonNote')}<textarea rows={3} value={reason} onChange={e=>setReason(e.target.value)} placeholder={t('clinical.optionalNote')}/></label>

  <div className="med-preview"><span>{t('common.previewKicker')}</span><p>{
   mode==='change'&&selected?selected.medication_name+': '+selected.dose+' '+selected.unit+' → '+(dose||'—')+' '+unit+' · '+(frequency||'—')+t('medications.fromSuffix')+effective:
   mode==='history'?(name||t('medications.previousMedication'))+': '+dose+' '+unit+' · '+frequency+' · '+effective+t('common.until')+stopped+t('medications.discontinuedBadge'):
   mode==='start'?(name||t('medications.newMedication'))+': '+(dose||'—')+' '+unit+' · '+(frequency||'—')+t('medications.fromSuffix')+effective:
   mode==='stop'&&selected?t('medications.stop')+selected.medication_name+t('medications.fromSuffix')+effective:
   selected?(effect||t('medications.sideEffect'))+' · '+selected.medication_name+' · '+effective:'—'
  }</p>{(mode==='change'||mode==='stop')&&effective>athensToday&&<small>{t('medications.futureChangeHelp')}</small>}</div>
  {sameDayEvent&&<div className="current-dose"><p>{t('medications.existingEntryDatePrefix')} {effective}{t('medications.sameDayHistoryHelp')}</p><label><input type="checkbox" checked={correctSameDay} onChange={e=>setCorrectSameDay(e.target.checked)}/>  {t('medications.sameDayCorrection')}</label><small>{t('validation.correctionReasonRequired')}</small></div>}
  {error&&<div className="save-state error" role="alert">{systemMessage(error)}</div>}
  <footer className="entry-footer"><button onClick={safeClose}>{t('common.cancel')}</button><button className="entry-primary" onClick={()=>void save().catch(()=>{})} disabled={saving}><Check size={15}/>{saving?t('common.saving'):t('common.save')}</button></footer>
 </section></div>
}

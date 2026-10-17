'use client';
import {useSystemMessage} from '@/i18n/system-message';

import {useTranslations} from 'next-intl';

import {useLocale} from 'next-intl';

import {useCallback,useEffect,useId,useRef,useState} from 'react';
import {createPortal} from 'react-dom';
import {Ban,Check,Pencil,Plus,Search,X} from 'lucide-react';
import type {DemoMedication,PatientBundle} from '@/lib/patients/demo-runtime';
import {demoPost} from '@/lib/patients/demo-client';
import MedicationFrequency from './MedicationFrequency';
import {formatClinicDate} from '@/lib/clinic-time';
import {placeMedicationMenu,type MedicationMenuPlacement} from '@/lib/clinical/medication-menu-placement';
import {useClinicalDraft} from './useClinicalDraft';
import {medicationRegistration,confirmedMedicationRegistration,type MedicationRegistrationMode} from '@/lib/clinical/medication-registration';
import styles from './MedicationTable.module.css';

type Mode='start'|'history'|'change'|'stop'|'side_effect';
type Tracking={firstAssessment?:boolean;registerFlusher?:(key:string,flush:()=>Promise<void>)=>(()=>void);onDirtyChange?:(key:string,dirty:boolean)=>void};
type MedicationOption={id:string;brand:string;active:string;form?:string};

export default function MedicationTable({bundle,sessionId,onManage,reload,editableEffects=false,editablePlan=false,firstAssessment=false,registerFlusher,onDirtyChange}:{bundle:PatientBundle;sessionId?:string;onManage?:(mode:Mode,id?:string)=>void;reload:()=>Promise<unknown>;editableEffects?:boolean;editablePlan?:boolean}&Tracking){
 const t=useTranslations();

 const today=bundle.clinical_day||new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Athens',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
 const medications=[...bundle.medications].sort((a,b)=>{const rank=(s:string)=>s==='active'?0:s==='planned'?1:2;return rank(a.status)-rank(b.status)||(b.started_at||'').localeCompare(a.started_at||'')});
 function durationLabel(start:string,end?:string|null){if(!start)return '';const days=Math.max(0,Math.floor((Date.parse((end||today).slice(0,10))-Date.parse(start.slice(0,10)))/86400000));if(!Number.isFinite(days))return '';if(!sessionId&&days===0&&!end&&start.slice(0,10)===today)return t('medications.startsToday');if(days<31)return days===1?t('common.oneDay'):days+t('common.daysSuffix');const months=Math.max(1,Math.round(days/30.44));if(months<12)return months===1?t('common.oneMonth'):months+t('common.monthsSuffix');const years=Math.floor(months/12),rest=months%12;return years+(years===1?t('common.yearSuffix'):t('common.yearsSuffix'))+(rest?' · '+rest+t('common.monthsAbbreviation'):'')}
 const actionColumn=editablePlan||Boolean(onManage);
 return <div className={styles.responsive+' clinical-table-wrap medication-table-editor'+(firstAssessment?' first-assessment-medications':'')}><table className="clinical-lean-table medication-lean-table"><caption className="sr-only">{t('medications.medication')}</caption><thead><tr><th>{t('medications.drug')}{editablePlan&&<b className="required-star"> *</b>}</th><th>{t('medications.dose')}{editablePlan&&<b className="required-star"> *</b>}</th><th>{t('medications.frequency')}{editablePlan&&<b className="required-star"> *</b>}</th><th>{t('medications.periodDuration')}</th><th>{t('common.status')}</th><th>{t('medications.sideEffects')}</th>{actionColumn&&<th className="med-actions-head"><span>{t('common.actions')}</span></th>}</tr></thead><tbody>
 {medications.map(m=>editablePlan
  ?<EditableMedicationRow key={m.id} medication={m} bundle={bundle} today={today} sessionId={sessionId} reload={reload} editableEffects={editableEffects} firstAssessment={firstAssessment} registerFlusher={registerFlusher} onDirtyChange={onDirtyChange} durationLabel={durationLabel}/>
  :<ReadOnlyMedicationRow key={m.id} medication={m} bundle={bundle} today={today} sessionId={sessionId} reload={reload} editableEffects={editableEffects} firstAssessment={firstAssessment} registerFlusher={registerFlusher} onDirtyChange={onDirtyChange} onManage={onManage} durationLabel={durationLabel}/>)}
 {editablePlan&&<NewMedicationRow bundle={bundle} today={today} sessionId={sessionId} reload={reload} registerFlusher={registerFlusher} onDirtyChange={onDirtyChange}/>}
 {!medications.length&&!editablePlan&&<tr><td colSpan={actionColumn?7:6} className="med-empty">{t('medications.noneRecorded')}</td></tr>}
 </tbody></table></div>;
}

function ReadOnlyMedicationRow({medication:m,bundle,today,sessionId,reload,editableEffects,firstAssessment=false,registerFlusher,onDirtyChange,onManage,durationLabel}:{medication:DemoMedication;bundle:PatientBundle;today:string;sessionId?:string;reload:()=>Promise<unknown>;editableEffects:boolean;onManage?:(mode:Mode,id?:string)=>void;durationLabel:(start:string,end?:string|null)=>string}&Tracking){
 const t=useTranslations();

 const locale=useLocale();

 const start=m.started_at?.slice(0,10)||'',end=m.ended_at?.slice(0,10);
 return <tr><th scope="row">{m.medication_name}{m.record_source&&m.record_source!=='prescribed'&&<small className={styles.source}>{t('medications.existingRecord')}</small>}</th><td data-label={t('medications.dose')}><span className="med-dose-display">{m.dose}<b>{m.unit}</b></span></td><td data-label={t('medications.frequency')}>{m.frequency}</td><td data-label={t('medications.periodDuration')}><span>{start?formatClinicDate(start, locale):'—'}{end?' – '+formatClinicDate(end, locale):''}</span><small>{m.status==='planned'?t('medications.scheduledStart'):m.status==='stopped'&&!end?'':durationLabel(start,end)}</small></td><td data-label={t('common.status')}><span className={'med-status '+m.status}>{m.status==='active'?t('medications.taking'):m.status==='stopped'?t('medications.discontinued'):t('medications.scheduled')}</span></td><td data-label={t('medications.sideEffects')}><MedicationEffects medication={m} bundle={bundle} sessionId={sessionId} today={today} reload={reload} editableEffects={editableEffects} firstAssessment={firstAssessment} registerFlusher={registerFlusher} onDirtyChange={onDirtyChange}/></td>{onManage&&<td data-label={t('common.actions')} className="med-row-actions">{m.status!=='stopped'&&<><button type="button" onClick={()=>onManage('change',m.id)}>{t('common.change')}</button><button type="button" onClick={()=>onManage('stop',m.id)}>{t('medications.stop')}</button></>}</td>}</tr>;
}

function EditableMedicationRow({medication:m,bundle,today,sessionId,reload,editableEffects,firstAssessment=false,registerFlusher,onDirtyChange,durationLabel}:{medication:DemoMedication;bundle:PatientBundle;today:string;sessionId?:string;reload:()=>Promise<unknown>;editableEffects:boolean;durationLabel:(start:string,end?:string|null)=>string}&Tracking){
 const systemMessage=useSystemMessage();

 const t=useTranslations();

 const locale=useLocale();

 const [editing,setEditing]=useState(false),[stopping,setStopping]=useState(false),[dose,setDose]=useState(String(m.dose)),[unit,setUnit]=useState(m.unit),[frequency,setFrequency]=useState(m.frequency),[stopDate,setStopDate]=useState(today),[saving,setSaving]=useState(false),[error,setError]=useState('');
 const key='medication-plan:'+m.id;
 const dirty=editing&&(dose!==String(m.dose)||unit!==m.unit||frequency!==m.frequency);
 const pending=dirty||stopping||saving;
 const resetEdit=()=>{setDose(String(m.dose));setUnit(m.unit);setFrequency(m.frequency);setEditing(false);setError('')};
 useEffect(()=>{if(!editing&&!saving){setDose(String(m.dose));setUnit(m.unit);setFrequency(m.frequency)}},[m.dose,m.unit,m.frequency,editing,saving]);
 const guard=useCallback(async()=>{if(pending)throw new Error(t('medications.completeOrCancelChange'))},[pending]);
 useEffect(()=>registerFlusher?.(key,guard),[key,registerFlusher,guard]);
 useEffect(()=>{onDirtyChange?.(key,pending);return()=>onDirtyChange?.(key,false)},[key,pending,onDirtyChange]);
 async function saveEdit(){
  if(saving||!dirty)return;
  const numericDose=Number(dose);
  if(!Number.isFinite(numericDose)||numericDose<=0||!unit.trim()||!frequency.trim()){setError(t('validation.requiredFields'));return}
  setSaving(true);setError('');
  try{
   const effectiveOn=m.status==='planned'&&m.started_at?m.started_at.slice(0,10):today;
   const sameDay=bundle.medicationEvents.find(e=>e.medication_id===m.id&&e.effective_on===effectiveOn&&!bundle.medicationRevisions.some(r=>r.event_id===e.id));
   await demoPost({action:'medication_event',replace_id:sameDay?.id||null,event_type:sameDay?.event_type||'changed',expected_version:m.plan_version,medication_id:m.id,session_id:sessionId||null,dose:numericDose,unit:unit.trim(),frequency:frequency.trim(),effective_on:effectiveOn,reason:sameDay?t('medications.correctionFromTable'):''});
   setEditing(false);await reload();
  }catch(cause){setError(cause instanceof Error?cause.message:t('errors.medicationChangeSave'))}finally{setSaving(false)}
 }
 async function stopMedication(){
  if(saving||!stopDate)return;
  setSaving(true);setError('');
  try{await demoPost({action:'medication_stop',medication_id:m.id,session_id:sessionId||null,effective_on:stopDate,reason:''});setStopping(false);await reload()}catch(cause){setError(cause instanceof Error?cause.message:t('errors.medicationStopSave'))}finally{setSaving(false)}
 }
 const start=m.started_at?.slice(0,10)||'',end=m.ended_at?.slice(0,10),editable=m.status!=='stopped';
 return <tr className={editing?'med-row-editing':''}>
  <th scope="row">{m.medication_name}{m.record_source&&m.record_source!=='prescribed'&&<small className={styles.source}>{t('medications.existingRecord')}</small>}{error&&<span className="med-inline-error" role="alert">{systemMessage(error)}</span>}</th>
  <td data-label={t('medications.dose')}>{editing?<div className="med-inline-dose"><input aria-label={t('medications.dose')+m.medication_name} inputMode="decimal" value={dose} disabled={saving} onChange={e=>setDose(e.target.value.replace(',','.'))}/><input aria-label={t('medications.unit')+m.medication_name} value={unit} disabled={saving} onChange={e=>setUnit(e.target.value)}/></div>:<span className="med-dose-display">{m.dose}<b>{m.unit}</b></span>}</td>
  <td data-label={t('medications.frequency')}>{editing?<MedicationFrequency label={t('medications.frequency')+m.medication_name} value={frequency} disabled={saving} onChange={setFrequency}/>:m.frequency}</td>
  <td data-label={t('medications.periodDuration')}><span>{start?formatClinicDate(start, locale):'—'}{end?' – '+formatClinicDate(end, locale):''}</span><small>{m.status==='planned'?t('medications.scheduledStart'):m.status==='stopped'&&!end?'':durationLabel(start,end)}</small></td>
  <td data-label={t('common.status')}><span className={'med-status '+m.status}>{m.status==='active'?t('medications.taking'):m.status==='stopped'?t('medications.discontinued'):t('medications.scheduled')}</span></td>
  <td data-label={t('medications.sideEffects')}><MedicationEffects medication={m} bundle={bundle} sessionId={sessionId} today={today} reload={reload} editableEffects={editableEffects} firstAssessment={firstAssessment} registerFlusher={registerFlusher} onDirtyChange={onDirtyChange}/></td>
  <td data-label={t('common.actions')} className="med-row-actions">{editing?<div className="med-action-pair"><button className="primary" type="button" disabled={saving||!dirty} onClick={()=>void saveEdit()} title={t('common.save')}><Check size={14}/></button><button type="button" disabled={saving} onClick={resetEdit} title={t('common.cancel')}><X size={14}/></button></div>:stopping?<div className="med-stop-inline"><input type="date" value={stopDate} min={start} disabled={saving} onChange={e=>setStopDate(e.target.value)}/><div className="med-action-pair"><button className="danger" type="button" disabled={saving||!stopDate} onClick={()=>void stopMedication()} title={t('medications.confirmStop')}><Check size={14}/></button><button type="button" disabled={saving} onClick={()=>{setStopping(false);setError('')}} title={t('common.cancel')}><X size={14}/></button></div></div>:editable?<div className="med-row-action-links"><button type="button" onClick={()=>{setEditing(true);setStopping(false);setError('')}}><Pencil size={13}/>{t('common.modify')}</button><button type="button" className="danger-link" onClick={()=>{setStopping(true);setEditing(false);setError('')}}><Ban size={13}/>{t('medications.stop')}</button></div>:<span className="med-no-actions">—</span>}</td>
 </tr>;
}

function NewMedicationRow({bundle,today,sessionId,reload,registerFlusher,onDirtyChange}:{bundle:PatientBundle;today:string;sessionId?:string;reload:()=>Promise<unknown>}&Tracking){
 const systemMessage=useSystemMessage();
 const t=useTranslations();
 const initialMode:MedicationRegistrationMode=sessionId?'prescribed':'existing';
 const [open,setOpen]=useState(false),[name,setName]=useState(''),[dose,setDose]=useState(''),[unit,setUnit]=useState('mg'),[frequency,setFrequency]=useState(''),[start,setStart]=useState(sessionId?today:''),[mode,setMode]=useState<MedicationRegistrationMode>(initialMode),[stop,setStop]=useState(''),[saving,setSaving]=useState(false),[error,setError]=useState(''),[saved,setSaved]=useState(false);
 const [needsAction,setNeedsAction]=useState(false);
 const newRowRef=useRef<HTMLTableRowElement>(null),requestId=useRef<string|null>(null),savingRef=useRef(false);
 const key='medication-new';
 const dirty=open&&Boolean(name.trim()||dose.trim()||frequency.trim()||mode!==initialMode||start!==(sessionId?today:'')||stop||unit!=='mg');
 const complete=Boolean(name.trim()&&dose.trim()&&frequency.trim()&&(mode!=='prescribed'||start));
 const pending=dirty||saving;
 const reset=()=>{setOpen(false);setNeedsAction(false);setName('');setDose('');setUnit('mg');setFrequency('');setStart(sessionId?today:'');setMode(initialMode);setStop('');setError('');requestId.current=null};
 const guard=useCallback(async()=>{
  if(!pending)return;
  setNeedsAction(true);
  requestAnimationFrame(()=>newRowRef.current?.scrollIntoView({behavior:'smooth',block:'center'}));
  throw new Error(t('medications.pendingNewMedication'));
 },[pending]);
 useEffect(()=>registerFlusher?.(key,guard),[key,registerFlusher,guard]);
 useEffect(()=>{onDirtyChange?.(key,pending);return()=>onDirtyChange?.(key,false)},[key,pending,onDirtyChange]);
 useEffect(()=>{if(open)newRowRef.current?.querySelector<HTMLInputElement>('[role="combobox"]')?.focus()},[open]);
 function changeMode(next:MedicationRegistrationMode){
  setMode(next);setError('');
  if(next==='prescribed'&&!start)setStart(today);
  else if(mode==='prescribed'&&start===today)setStart('');
  if(next!=='historical')setStop('');
 }
 async function save(){
  if(savingRef.current||!complete)return;
  let input;
  try{input=medicationRegistration({patient_id:bundle.patient.id,request_id:requestId.current||(requestId.current=crypto.randomUUID()),mode,name,dose:Number(dose),unit,frequency,started_on:start||null,stopped_on:mode==='historical'?stop||null:null,session_id:mode==='prescribed'?sessionId||null:null},today)}
  catch(cause){setError(cause instanceof Error&&cause.message==='invalid_medication_dates'?t('medications.checkDates'):t('validation.requiredFields'));return}
  savingRef.current=true;setSaving(true);setError('');setSaved(false);
  try{
   const result=await demoPost({action:'medication_register',...input});
   try{confirmedMedicationRegistration(result.medication,input)}catch{throw new Error(t('medications.registrationUnconfirmed'))}
   reset();setSaved(true);
   try{await reload()}catch{setError(t('medications.savedRefresh'))}
  }catch(cause){setError(cause instanceof Error?cause.message:t('errors.medicationAdd'))}finally{savingRef.current=false;setSaving(false)}
 }
 if(!open)return <tr className="med-add-row"><td colSpan={7}><button type="button" onClick={()=>{setOpen(true);setSaved(false)}}><Plus size={15}/>{t('medications.addTreatment')}</button>{saved&&<small role="status" className={styles.saved}>{t('medications.saved')}</small>}{error&&<span className="med-inline-error" role="alert">{systemMessage(error)}</span>}</td></tr>;
 const dates=<><label className="med-new-date">{mode==='prescribed'?t('medications.startRequired'):t('medications.startOptional')}<input type="date" value={start} max={mode==='prescribed'?undefined:today} disabled={saving} onChange={e=>setStart(e.target.value)}/></label>{mode==='historical'&&<label className="med-new-date">{t('medications.stopOptional')}<input type="date" value={stop} disabled={saving} min={start||undefined} max={today} onChange={e=>setStop(e.target.value)}/></label>}</>;
 return <tr ref={newRowRef} className="med-new-row" onKeyDown={e=>{if(e.key==='Escape'&&!dirty&&!saving){e.preventDefault();reset()}}}>
  <th scope="row" data-label={t('medications.drug')}><MedicationSearchInput value={name} disabled={saving} onChange={value=>{setName(value);setError('')}}/>{error&&<span className="med-inline-error" role="alert">{systemMessage(error)}</span>}{needsAction&&<span className="med-inline-error" role="status">{t('medications.saveCancelHere')}</span>}</th>
  <td data-label={t('medications.dose')}><div className="med-inline-dose"><input aria-label={t('medications.dose')} inputMode="decimal" placeholder="*" value={dose} disabled={saving} onChange={e=>{setDose(e.target.value.replace(',','.'));setError('')}}/><input aria-label={t('medications.unit')} value={unit} disabled={saving} onChange={e=>setUnit(e.target.value)}/></div></td>
  <td data-label={t('medications.frequency')}><MedicationFrequency value={frequency} disabled={saving} onChange={value=>{setFrequency(value);setError('')}}/></td>
  <td data-label={t('medications.periodDuration')}>{mode==='prescribed'?dates:<details className={styles.dates}><summary>{t('medications.datesOptional')}</summary>{dates}</details>}</td>
  <td data-label={t('common.status')}><select className="med-inline-status" aria-label={t('medications.newStatus')} value={mode} disabled={saving} onChange={e=>changeMode(e.target.value as MedicationRegistrationMode)}><option value="existing">{t('medications.alreadyTaking')}</option><option value="historical">{t('medications.previousDiscontinued')}</option><option value="prescribed">{t('medications.newTreatment')}</option></select></td>
  <td data-label={t('medications.sideEffects')}><span className="med-empty-cell">—</span></td>
  <td data-label={t('common.actions')} className="med-row-actions"><div className="med-action-pair"><button className={'primary '+styles.save} type="button" disabled={saving||!complete} onClick={()=>void save()} title={complete?t('common.save'):t('validation.asteriskFields')}><Check size={15}/>{saving?t('common.saving'):t('common.save')}</button><button type="button" disabled={saving} onClick={reset} title={t('medications.cancelNewDrug')} aria-label={t('medications.cancelNewDrug')}><X size={15}/></button></div></td>
 </tr>;
}

function MedicationSearchInput({value,onChange,disabled}:{value:string;onChange:(value:string)=>void;disabled?:boolean}){
 const t=useTranslations();

 const [items,setItems]=useState<MedicationOption[]>([]),[open,setOpen]=useState(false),[loading,setLoading]=useState(false),[active,setActive]=useState(-1);
 const [placement,setPlacement]=useState<MedicationMenuPlacement|null>(null);
 const inputRef=useRef<HTMLInputElement>(null);
 const menuRef=useRef<HTMLDivElement>(null);
 const menuId=useId(),requestSeq=useRef(0);
 useEffect(()=>{
  const query=value.trim();
  if(!query){setItems([]);setOpen(false);setLoading(false);return}
  const seq=++requestSeq.current;
  const controller=new AbortController();
  const timer=setTimeout(async()=>{
   setLoading(true);
   try{
    const response=await fetch('/api/medications/search?q='+encodeURIComponent(query),{signal:controller.signal});
    const data=await response.json();
    if(seq!==requestSeq.current)return;
    setItems(Array.isArray(data.items)?data.items:[]);
    setOpen(true);setActive(-1);
   }catch{if(seq===requestSeq.current)setItems([])}finally{if(seq===requestSeq.current)setLoading(false)}
  },140);
  return()=>{clearTimeout(timer);controller.abort()}
 },[value]);
 // The table scrolls horizontally, so rendering the dropdown inside the
 // table forces overflow-y:auto and cuts off search results. Portaling into
 // the active dialog (or document.body) keeps results above the modal and outside table overflow.
 useEffect(()=>{
  if(!open||disabled){setPlacement(null);return}
  const update=()=>{
   const rect=inputRef.current?.getBoundingClientRect();
   if(!rect||rect.bottom<0||rect.top>window.innerHeight){setPlacement(null);return}
   setPlacement(placeMedicationMenu(rect,{width:window.innerWidth,height:window.innerHeight}));
  };
  update();
  window.addEventListener('resize',update);
  window.addEventListener('scroll',update,true);
  return()=>{window.removeEventListener('resize',update);window.removeEventListener('scroll',update,true)}
 },[open,disabled,items.length,loading]);
 useEffect(()=>{
  if(active>=0)menuRef.current?.querySelectorAll('[role="option"]')[active]?.scrollIntoView({block:'nearest'});
 },[active]);
 const choose=(item:MedicationOption)=>{onChange(item.brand);setOpen(false);setItems([]);setActive(-1)};
 const showMenu=open&&!disabled&&(items.length>0||loading)&&placement!==null;
 return <>
  <div className="medication-search">
   <Search size={14} aria-hidden="true"/>
   <input ref={inputRef} role="combobox" aria-label={t('medications.drug')} aria-autocomplete="list" aria-expanded={showMenu} aria-controls={showMenu?menuId:undefined} autoComplete="off" placeholder={t('medications.searchRequired')} value={value} disabled={disabled} onFocus={()=>{if(value.trim())setOpen(true)}} onChange={e=>onChange(e.target.value)} onKeyDown={e=>{if(!open||!items.length)return;if(e.key==='ArrowDown'){e.preventDefault();setActive(v=>Math.min(items.length-1,v+1))}else if(e.key==='ArrowUp'){e.preventDefault();setActive(v=>Math.max(0,v-1))}else if(e.key==='Enter'&&active>=0){e.preventDefault();choose(items[active])}else if(e.key==='Escape'){e.preventDefault();e.stopPropagation();setOpen(false)}}} onBlur={()=>setTimeout(()=>setOpen(false),120)}/>
  </div>
  {showMenu&&createPortal(<div ref={menuRef} id={menuId} className="medication-search-menu" role="listbox" aria-label={t('accessibility.medicationOptions')} style={{left:placement.left,top:placement.top,width:placement.width,maxHeight:placement.maxHeight}}>
   {loading&&!items.length?<div className="medication-search-loading">{t('common.searching')}</div>:items.map((item,index)=><button type="button" key={item.id} className={active===index?'active':''} role="option" aria-selected={active===index} onMouseDown={e=>e.preventDefault()} onClick={()=>choose(item)}><strong>{item.brand}</strong><span>{item.active}</span>{item.form&&<i>{item.form}</i>}</button>)}
  </div>,inputRef.current?.closest('dialog')||document.body)}
 </>;
}

function MedicationEffects({medication,bundle,sessionId,today,reload,editableEffects,firstAssessment=false,registerFlusher,onDirtyChange}:{medication:DemoMedication;bundle:PatientBundle;sessionId?:string;today:string;reload:()=>Promise<unknown>;editableEffects:boolean}&Tracking){
 const t=useTranslations();

 const locale=useLocale();

 const effects=bundle.medicationSideEffects.filter(e=>e.medication_id===medication.id);
 return <>{effects.map(e=>firstAssessment&&sessionId&&e.session_id===sessionId&&!e.resolved_on?<DraftSideEffect key={e.id} effect={e} medication={medication} sessionId={sessionId} reload={reload} registerFlusher={registerFlusher} onDirtyChange={onDirtyChange}/>:<div className={'med-effect '+(e.resolved_on?'resolved':'')} key={e.id}><span>{e.effect_text}</span><small>{e.severity==='severe'?t('clinical.severe'):e.severity==='mild'?t('clinical.mild'):t('clinical.moderate')} · {formatClinicDate(e.noted_on, locale)}{e.resolved_on?t('medications.resolvedSuffix')+formatClinicDate(e.resolved_on, locale):''}</small></div>)}{!effects.length&&!editableEffects&&<span className="med-empty-cell">—</span>}{editableEffects&&<SideEffectEntry medication={medication} sessionId={sessionId} today={today} reload={reload} firstAssessment={firstAssessment} registerFlusher={registerFlusher} onDirtyChange={onDirtyChange}/>}</>;
}

function DraftSideEffect({effect,medication,sessionId,reload,registerFlusher,onDirtyChange}:{effect:PatientBundle['medicationSideEffects'][number];medication:DemoMedication;sessionId:string;reload:()=>Promise<unknown>}&Tracking){
 const systemMessage=useSystemMessage();

 const t=useTranslations();

 const locale=useLocale();

 const key='medication-effect-edit:'+effect.id;
 const savedVersion=useRef(effect.updated_at);
 useEffect(()=>{savedVersion.current=effect.updated_at},[effect.updated_at]);
 const draft=useClinicalDraft({storageKey:sessionId+':'+key,initial:effect.effect_text,version:Date.parse(effect.updated_at),write:async(text)=>{
  if(text.trim().length<2)throw new Error(t('medications.sideEffectDeletionHelp'));
  const result=await demoPost({action:'initial_side_effect_edit',session_id:sessionId,side_effect_id:effect.id,effect:text,expected_updated_at:savedVersion.current});
  savedVersion.current=result.side_effect.updated_at;
  return {value:result.side_effect.effect_text as string,version:Date.parse(result.side_effect.updated_at)};
 },onSaved:reload,onDirty:dirty=>onDirtyChange?.(key,dirty)});
 useEffect(()=>registerFlusher?.(key,draft.flush),[key,registerFlusher,draft.flush]);
 return <div className="med-effect"><input aria-label={t('medications.sideEffectPrefix')+medication.medication_name} value={draft.value} onChange={e=>draft.change(e.target.value)} onBlur={()=>void draft.flush().catch(()=>{})}/><small>{formatClinicDate(effect.noted_on, locale)} · {effect.severity==='severe'?t('clinical.severe'):effect.severity==='mild'?t('clinical.mild'):t('clinical.moderate')}</small>{effect.note&&<details><summary>{t('medications.entryHistory')}</summary><p style={{whiteSpace:'pre-wrap'}}>{effect.note}</p></details>}{draft.error&&<div role="alert">{systemMessage(draft.error)} {draft.hasConflict?<><button type="button" onClick={()=>void reload()}>{t('medications.refreshSavedEntry')}</button><p>{t('medications.savedEntryPrefix')} {effect.effect_text}</p><button type="button" onClick={()=>{savedVersion.current=effect.updated_at;draft.acceptServer(effect.effect_text,Date.parse(effect.updated_at))}}>{t('visits.useSaved')}</button><button type="button" onClick={()=>{savedVersion.current=effect.updated_at;draft.resolve(draft.value,effect.effect_text,Date.parse(effect.updated_at))}}>{t('medications.keepMyCorrection')}</button></>:<button type="button" onClick={()=>void draft.flush().catch(()=>{})}>{t('common.repeat')}</button>}</div>}</div>;
}

function SideEffectEntry({medication,sessionId,today,reload,registerFlusher,onDirtyChange}:{medication:DemoMedication;sessionId?:string;today:string;reload:()=>Promise<unknown>}&Tracking){
 const systemMessage=useSystemMessage();

 const t=useTranslations();

 const [open,setOpen]=useState(false),[text,setText]=useState(''),[severity,setSeverity]=useState(''),[date,setDate]=useState(today),[saving,setSaving]=useState(false),[error,setError]=useState('');
 const key='medication-effect:'+medication.id,pending=open&&Boolean(text.trim()||severity||date!==today)||saving;
 const guard=useCallback(async()=>{if(pending)throw new Error(t('medications.completeSideEffectPrefix')+medication.medication_name+'.')},[pending,medication.medication_name]);
 useEffect(()=>registerFlusher?.(key,guard),[key,registerFlusher,guard]);
 useEffect(()=>{onDirtyChange?.(key,pending);return()=>onDirtyChange?.(key,false)},[key,pending,onDirtyChange]);
 async function save(){
  if(saving||text.trim().length<2||!severity||!date)return;
  setSaving(true);setError('');
  try{await demoPost({action:'medication_side_effect',medication_id:medication.id,session_id:sessionId||null,effect:text,severity,noted_on:date});setText('');setSeverity('');setDate(today);setOpen(false);await reload()}catch(cause){setError(cause instanceof Error?cause.message:t('errors.sideEffectSave'))}finally{setSaving(false)}
 }
 const cancel=()=>{setText('');setSeverity('');setDate(today);setError('');setOpen(false)};
 if(!open)return <button type="button" className="med-add-effect" onClick={()=>setOpen(true)}><Plus size={12}/> {sessionId?t('medications.sideEffect'):t('medications.recordAdverseEffect')}</button>;
 return <div className="med-inline-effect"><input aria-label={t('medications.newSideEffectPrefix')+medication.medication_name} placeholder={t('medications.sideEffectRequired')} value={text} disabled={saving} onChange={e=>{setText(e.target.value);setError('')}}/><div className="med-effect-controls"><select aria-label={t('clinical.severityPrefix')+medication.medication_name} value={severity} disabled={saving} onChange={e=>setSeverity(e.target.value)}><option value="">{t('clinical.severityRequired')}</option><option value="mild">{t('clinical.mild')}</option><option value="moderate">{t('clinical.moderate')}</option><option value="severe">{t('clinical.severe')}</option></select><input type="date" aria-label={t('medications.sideEffectDatePrefix')+medication.medication_name} value={date} disabled={saving} onChange={e=>setDate(e.target.value)}/></div><div className="med-action-pair"><button className="primary" type="button" disabled={saving||text.trim().length<2||!severity||!date} onClick={()=>void save()}><Check size={13}/></button><button type="button" disabled={saving} onClick={cancel}><X size={13}/></button></div>{error&&<span className="med-inline-error" role="alert">{systemMessage(error)}</span>}</div>;
}

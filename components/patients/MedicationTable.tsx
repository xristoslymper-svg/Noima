'use client';
import {useCallback,useEffect,useRef,useState} from 'react';
import {Ban,Check,Pencil,Plus,Search,X} from 'lucide-react';
import type {DemoMedication,PatientBundle} from '@/lib/patients/demo-runtime';
import {demoPost} from '@/lib/patients/demo-client';
import {formatClinicDate} from '@/lib/clinic-time';
import {medicationEditRequest,medicationStopRequest} from '@/lib/medications/plan-actions';

type Tracking={registerFlusher?:(key:string,flush:()=>Promise<void>)=>(()=>void);onDirtyChange?:(key:string,dirty:boolean)=>void};
async function reconcileMedication(reload:()=>Promise<unknown>){try{return await reload()}catch{return null}}

type MedicationOption={id:string;brand:string;active:string;form?:string};

export default function MedicationTable({bundle,sessionId,reload,editableEffects=false,editablePlan=false,registerFlusher,onDirtyChange}:{bundle:PatientBundle;sessionId?:string;reload:()=>Promise<unknown>;editableEffects?:boolean;editablePlan?:boolean}&Tracking){
 const today=bundle.clinical_day||new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Athens',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
 const medications=[...bundle.medications].sort((a,b)=>{const rank=(s:string)=>s==='active'?0:s==='planned'?1:2;return rank(a.status)-rank(b.status)||Date.parse(b.started_at)-Date.parse(a.started_at)});
 function durationLabel(start:string,end?:string|null){const days=Math.max(0,Math.floor((Date.parse((end||today).slice(0,10))-Date.parse(start.slice(0,10)))/86400000));if(days<31)return days===1?'1 ημέρα':days+' ημέρες';const months=Math.max(1,Math.round(days/30.44));if(months<12)return months===1?'1 μήνας':months+' μήνες';const years=Math.floor(months/12),rest=months%12;return years+(years===1?' έτος':' έτη')+(rest?' · '+rest+' μ.':'')}
 const actionColumn=editablePlan;
 return <div className="clinical-table-wrap medication-table-editor"><table className="clinical-lean-table medication-lean-table"><caption className="sr-only">Αγωγή</caption><thead><tr><th>Φάρμακο{editablePlan&&<b className="required-star"> *</b>}</th><th>Δόση{editablePlan&&<b className="required-star"> *</b>}</th><th>Συχνότητα{editablePlan&&<b className="required-star"> *</b>}</th><th>Περίοδος / διάρκεια</th><th>Κατάσταση</th><th>Παρενέργειες</th>{actionColumn&&<th className="med-actions-head"><span>Ενέργειες</span></th>}</tr></thead><tbody>
 {medications.map(m=>editablePlan
  ?<EditableMedicationRow key={m.id} medication={m} bundle={bundle} today={today} sessionId={sessionId} reload={reload} editableEffects={editableEffects} registerFlusher={registerFlusher} onDirtyChange={onDirtyChange} durationLabel={durationLabel}/>
  :<ReadOnlyMedicationRow key={m.id} medication={m} bundle={bundle} today={today} sessionId={sessionId} reload={reload} editableEffects={editableEffects} registerFlusher={registerFlusher} onDirtyChange={onDirtyChange} durationLabel={durationLabel}/>)}
 {editablePlan&&<NewMedicationRow bundle={bundle} today={today} sessionId={sessionId} reload={reload} registerFlusher={registerFlusher} onDirtyChange={onDirtyChange}/>}
 {!medications.length&&!editablePlan&&<tr><td colSpan={actionColumn?7:6} className="med-empty">Δεν έχει καταγραφεί αγωγή.</td></tr>}
 </tbody></table></div>;
}

function ReadOnlyMedicationRow({medication:m,bundle,today,sessionId,reload,editableEffects,registerFlusher,onDirtyChange,durationLabel}:{medication:DemoMedication;bundle:PatientBundle;today:string;sessionId?:string;reload:()=>Promise<unknown>;editableEffects:boolean;durationLabel:(start:string,end?:string|null)=>string}&Tracking){
 const start=m.started_at.slice(0,10),end=m.ended_at?.slice(0,10);
 return <tr><th scope="row">{m.medication_name}</th><td><span className="med-dose-display">{m.dose}<b>{m.unit}</b></span></td><td>{m.frequency}</td><td><span>{formatClinicDate(start)}{end?' – '+formatClinicDate(end):''}</span><small>{m.status==='planned'?'Προγραμματισμένη έναρξη':durationLabel(start,end)}</small></td><td><span className={'med-status '+m.status}>{m.status==='active'?'Λαμβάνει':m.status==='stopped'?'Διακοπείσα':'Προγραμματισμένη'}</span></td><td><MedicationEffects medication={m} bundle={bundle} sessionId={sessionId} today={today} reload={reload} editableEffects={editableEffects} registerFlusher={registerFlusher} onDirtyChange={onDirtyChange}/></td></tr>;
}

function EditableMedicationRow({medication:m,bundle,today,sessionId,reload,editableEffects,registerFlusher,onDirtyChange,durationLabel}:{medication:DemoMedication;bundle:PatientBundle;today:string;sessionId?:string;reload:()=>Promise<unknown>;editableEffects:boolean;durationLabel:(start:string,end?:string|null)=>string}&Tracking){
 const [editing,setEditing]=useState(false),[stopping,setStopping]=useState(false),[dose,setDose]=useState(String(m.dose)),[unit,setUnit]=useState(m.unit),[frequency,setFrequency]=useState(m.frequency),[stopDate,setStopDate]=useState(today),[saving,setSaving]=useState(false),[error,setError]=useState('');
 const key='medication-plan:'+m.id;
 const savingRef=useRef(false);
 const dirty=editing&&(dose!==String(m.dose)||unit!==m.unit||frequency!==m.frequency);
 const pending=dirty||stopping||saving;
 const resetEdit=()=>{setDose(String(m.dose));setUnit(m.unit);setFrequency(m.frequency);setEditing(false);setError('')};
 useEffect(()=>{if(!editing&&!saving){setDose(String(m.dose));setUnit(m.unit);setFrequency(m.frequency)}},[m.dose,m.unit,m.frequency,editing,saving]);
 const guard=useCallback(async()=>{if(pending)throw new Error('Ολοκλήρωσε ή ακύρωσε τη μεταβολή αγωγής.')},[pending]);
 useEffect(()=>registerFlusher?.(key,guard),[key,registerFlusher,guard]);
 useEffect(()=>{onDirtyChange?.(key,pending);return()=>onDirtyChange?.(key,false)},[key,pending,onDirtyChange]);
 async function saveEdit(){
  if(savingRef.current||!dirty)return;
  const numericDose=Number(dose);
  if(!Number.isFinite(numericDose)||numericDose<=0||!unit.trim()||!frequency.trim()){setError('Συμπλήρωσε τα υποχρεωτικά πεδία.');return}
  savingRef.current=true;setSaving(true);setError('');
  try{
   await demoPost(medicationEditRequest(bundle,m,today,sessionId,numericDose,unit,frequency));
   setEditing(false);const refreshed=await reconcileMedication(reload);if(!refreshed)setError('Η αλλαγή αποθηκεύτηκε. Ανανεώστε τον φάκελο πριν από άλλη μεταβολή.');
  }catch(cause){setError(cause instanceof Error?cause.message:'Δεν αποθηκεύτηκε η αλλαγή.')}finally{savingRef.current=false;setSaving(false)}
 }
 async function stopMedication(){
  if(savingRef.current||!stopDate)return;
  savingRef.current=true;setSaving(true);setError('');
  try{await demoPost(medicationStopRequest(m,stopDate,sessionId));setStopping(false);const refreshed=await reconcileMedication(reload);if(!refreshed)setError('Η διακοπή αποθηκεύτηκε. Ανανεώστε τον φάκελο πριν από άλλη μεταβολή.')}catch(cause){setError(cause instanceof Error?cause.message:'Δεν καταγράφηκε η διακοπή.')}finally{savingRef.current=false;setSaving(false)}
 }
 const start=m.started_at.slice(0,10),end=m.ended_at?.slice(0,10),editable=m.status!=='stopped';
 return <tr className={editing?'med-row-editing':''}>
  <th scope="row">{m.medication_name}{error&&<span className="med-inline-error" role="alert">{error}</span>}</th>
  <td>{editing?<div className="med-inline-dose"><input aria-label={'Δόση '+m.medication_name} inputMode="decimal" value={dose} disabled={saving} onChange={e=>setDose(e.target.value.replace(',','.'))}/><input aria-label={'Μονάδα '+m.medication_name} value={unit} disabled={saving} onChange={e=>setUnit(e.target.value)}/></div>:<span className="med-dose-display">{m.dose}<b>{m.unit}</b></span>}</td>
  <td>{editing?<input className="med-inline-input" aria-label={'Συχνότητα '+m.medication_name} value={frequency} disabled={saving} onChange={e=>setFrequency(e.target.value)}/>:m.frequency}</td>
  <td><span>{formatClinicDate(start)}{end?' – '+formatClinicDate(end):''}</span><small>{m.status==='planned'?'Προγραμματισμένη έναρξη':durationLabel(start,end)}</small></td>
  <td><span className={'med-status '+m.status}>{m.status==='active'?'Λαμβάνει':m.status==='stopped'?'Διακοπείσα':'Προγραμματισμένη'}</span></td>
  <td><MedicationEffects medication={m} bundle={bundle} sessionId={sessionId} today={today} reload={reload} editableEffects={editableEffects} registerFlusher={registerFlusher} onDirtyChange={onDirtyChange}/></td>
  <td className="med-row-actions">{editing?<div className="med-action-pair"><button className="primary" type="button" disabled={saving||!dirty} onClick={()=>void saveEdit()} title="Αποθήκευση"><Check size={14}/></button><button type="button" disabled={saving} onClick={resetEdit} title="Ακύρωση"><X size={14}/></button></div>:stopping?<div className="med-stop-inline"><input type="date" value={stopDate} min={start} disabled={saving} onChange={e=>setStopDate(e.target.value)}/><div className="med-action-pair"><button className="danger" type="button" disabled={saving||!stopDate} onClick={()=>void stopMedication()} title="Επιβεβαίωση διακοπής"><Check size={14}/></button><button type="button" disabled={saving} onClick={()=>{setStopping(false);setError('')}} title="Ακύρωση"><X size={14}/></button></div></div>:editable?<div className="med-row-action-links"><button type="button" onClick={()=>{setEditing(true);setStopping(false);setError('')}}><Pencil size={13}/>Τροποποίηση</button><button type="button" className="danger-link" onClick={()=>{setStopping(true);setEditing(false);setError('')}}><Ban size={13}/>Διακοπή</button></div>:<span className="med-no-actions">—</span>}</td>
 </tr>;
}

function NewMedicationRow({bundle,today,sessionId,reload,registerFlusher,onDirtyChange}:{bundle:PatientBundle;today:string;sessionId?:string;reload:()=>Promise<unknown>}&Tracking){
 const [open,setOpen]=useState(false),[name,setName]=useState(''),[dose,setDose]=useState(''),[unit,setUnit]=useState('mg'),[frequency,setFrequency]=useState(''),[start,setStart]=useState(today),[mode,setMode]=useState<'start'|'history'>('start'),[stop,setStop]=useState(today),[saving,setSaving]=useState(false),[error,setError]=useState('');
 const key='medication-new';
 const savingRef=useRef(false);
 const dirty=open&&Boolean(name.trim()||dose.trim()||frequency.trim()||mode==='history'||start!==today||unit!=='mg');
 const complete=Boolean(name.trim()&&dose.trim()&&frequency.trim()&&start&&(mode==='start'||stop));
 const pending=dirty||saving;
 const reset=()=>{setOpen(false);setName('');setDose('');setUnit('mg');setFrequency('');setStart(today);setMode('start');setStop(today);setError('')};
 const guard=useCallback(async()=>{if(pending)throw new Error('Ολοκλήρωσε ή ακύρωσε τη νέα αγωγή.')},[pending]);
 useEffect(()=>registerFlusher?.(key,guard),[key,registerFlusher,guard]);
 useEffect(()=>{onDirtyChange?.(key,pending);return()=>onDirtyChange?.(key,false)},[key,pending,onDirtyChange]);
 async function save(){
  if(savingRef.current||!complete)return;
  const numericDose=Number(dose);
  if(!Number.isFinite(numericDose)||numericDose<=0){setError('Η δόση δεν είναι έγκυρη.');return}
  if(mode==='history'&&(stop<start||stop>today)){setError('Ελέγξτε τις ημερομηνίες έναρξης και διακοπής.');return}
  savingRef.current=true;setSaving(true);setError('');
  try{
   const draft=sessionId?bundle.sessions.find(x=>x.id===sessionId&&x.status==='draft'):undefined;
   if(sessionId&&!draft)throw new Error('Η επίσκεψη δεν είναι πλέον πρόχειρη. Ανανεώστε τον φάκελο.');
   if(mode==='history')await demoPost({action:'medication_history',patient_id:bundle.patient.id,session_id:draft?.id||null,name:name.trim(),dose:numericDose,unit:unit.trim()||'mg',frequency:frequency.trim(),started_on:start,stopped_on:stop,reason:''});
   else await demoPost({action:'medication_start',patient_id:bundle.patient.id,session_id:draft?.id||null,name:name.trim(),dose:numericDose,unit:unit.trim()||'mg',frequency:frequency.trim(),effective_on:start,reason:''});
   reset();const refreshed=await reconcileMedication(reload);if(!refreshed){setOpen(true);setError('Η αγωγή προστέθηκε. Ανανεώστε τον φάκελο πριν από άλλη μεταβολή.')}
  }catch(cause){setError(cause instanceof Error?cause.message:'Δεν προστέθηκε η αγωγή.')}finally{savingRef.current=false;setSaving(false)}
 }
 if(!open)return <tr className="med-add-row"><td colSpan={7}>{error&&<span className="med-inline-error" role="alert">{error}</span>}<button type="button" onClick={()=>setOpen(true)}><Plus size={15}/> Προσθήκη φαρμάκου</button></td></tr>;
 return <tr className="med-new-row">
  <th scope="row"><MedicationSearchInput value={name} disabled={saving} onChange={value=>{setName(value);setError('')}}/>{error&&<span className="med-inline-error" role="alert">{error}</span>}</th>
  <td><div className="med-inline-dose"><input aria-label="Δόση" inputMode="decimal" placeholder="*" value={dose} disabled={saving} onChange={e=>{setDose(e.target.value.replace(',','.'));setError('')}}/><input aria-label="Μονάδα" value={unit} disabled={saving} onChange={e=>setUnit(e.target.value)}/></div></td>
  <td><input className="med-inline-input" aria-label="Συχνότητα" placeholder="*" value={frequency} disabled={saving} onChange={e=>{setFrequency(e.target.value);setError('')}}/></td>
  <td><label className="med-new-date">Έναρξη *<input type="date" value={start} disabled={saving} onChange={e=>setStart(e.target.value)}/></label>{mode==='history'&&<label className="med-new-date">Διακοπή *<input type="date" value={stop} disabled={saving} min={start} max={today} onChange={e=>setStop(e.target.value)}/></label>}</td>
  <td><select className="med-inline-status" aria-label="Κατάσταση νέας αγωγής" value={mode} disabled={saving} onChange={e=>setMode(e.target.value as 'start'|'history')}><option value="start">Λαμβάνει / προγραμματισμένη</option><option value="history">Προηγούμενη · διακοπείσα</option></select></td>
  <td><span className="med-empty-cell">—</span></td>
  <td className="med-row-actions"><div className="med-action-pair"><button className="primary" type="button" disabled={saving||!complete} onClick={()=>void save()} title={complete?'Προσθήκη':'Συμπλήρωσε τα πεδία με *'}><Check size={15}/></button><button type="button" disabled={saving} onClick={reset} title="Ακύρωση"><X size={15}/></button></div></td>
 </tr>;
}

function MedicationSearchInput({value,onChange,disabled}:{value:string;onChange:(value:string)=>void;disabled?:boolean}){
 const [items,setItems]=useState<MedicationOption[]>([]),[open,setOpen]=useState(false),[loading,setLoading]=useState(false),[active,setActive]=useState(-1);
 const requestSeq=useRef(0);
 const focused=useRef(false),dismissed=useRef(false);
 useEffect(()=>{
  const query=value.trim();
  const seq=++requestSeq.current;
  setItems([]);setActive(-1);setLoading(false);
  if(!query){setItems([]);setOpen(false);setLoading(false);return}
  const controller=new AbortController();
  const timer=setTimeout(async()=>{
   setLoading(true);
   try{
    const response=await fetch('/api/medications/search?q='+encodeURIComponent(query),{signal:controller.signal});
    if(!response.ok)throw new Error('search_unavailable');
    const data=await response.json();
    if(controller.signal.aborted||seq!==requestSeq.current)return;
    setItems(Array.isArray(data.items)?data.items:[]);
    setOpen(focused.current&&!dismissed.current);setActive(-1);
   }catch{if(!controller.signal.aborted&&seq===requestSeq.current)setItems([])}finally{if(!controller.signal.aborted&&seq===requestSeq.current)setLoading(false)}
  },140);
  return()=>{clearTimeout(timer);controller.abort()}
 },[value]);
 const choose=(item:MedicationOption)=>{dismissed.current=true;requestSeq.current++;onChange(item.brand);setOpen(false);setLoading(false);setItems([]);setActive(-1)};
 return <div className="medication-search">
  <Search size={14} aria-hidden="true"/>
  <input role="combobox" aria-expanded={open&&(items.length>0||loading)} aria-autocomplete="list" aria-label="Φάρμακο" autoComplete="off" placeholder="Αναζήτηση φαρμάκου *" value={value} disabled={disabled} onFocus={()=>{focused.current=true;dismissed.current=false;if(value.trim())setOpen(true)}} onChange={e=>{dismissed.current=false;requestSeq.current++;setItems([]);setActive(-1);setLoading(false);setOpen(true);onChange(e.target.value)}} onKeyDown={e=>{if(e.key==='Escape'){e.preventDefault();e.stopPropagation();dismissed.current=true;setOpen(false);return}if(!open||!items.length)return;if(e.key==='ArrowDown'){e.preventDefault();setActive(v=>Math.min(items.length-1,v+1))}else if(e.key==='ArrowUp'){e.preventDefault();setActive(v=>Math.max(0,v-1))}else if(e.key==='Enter'&&active>=0){e.preventDefault();choose(items[active])}}} onBlur={()=>{focused.current=false;setOpen(false)}}/>
  {open&&(items.length>0||loading)&&<div className="medication-search-menu" role="listbox">{loading&&!items.length?<div className="medication-search-loading">…</div>:items.map((item,index)=><button type="button" key={item.id} className={active===index?'active':''} role="option" aria-selected={active===index} onMouseDown={e=>e.preventDefault()} onClick={()=>choose(item)}><strong>{item.brand}</strong><span>{item.active}</span>{item.form&&<i>{item.form}</i>}</button>)}</div>}
 </div>;
}

function MedicationEffects({medication,bundle,sessionId,today,reload,editableEffects,registerFlusher,onDirtyChange}:{medication:DemoMedication;bundle:PatientBundle;sessionId?:string;today:string;reload:()=>Promise<unknown>;editableEffects:boolean}&Tracking){
 const effects=bundle.medicationSideEffects.filter(e=>e.medication_id===medication.id);
 return <>{effects.map(e=><div className={'med-effect '+(e.resolved_on?'resolved':'')} key={e.id}><span>{e.effect_text}</span><small>{e.severity==='severe'?'Σοβαρή':e.severity==='mild'?'Ήπια':'Μέτρια'} · {formatClinicDate(e.noted_on)}{e.resolved_on?' · επιλύθηκε '+formatClinicDate(e.resolved_on):''}</small></div>)}{!effects.length&&!editableEffects&&<span className="med-empty-cell">—</span>}{editableEffects&&<SideEffectEntry medication={medication} sessionId={sessionId} today={today} reload={reload} registerFlusher={registerFlusher} onDirtyChange={onDirtyChange}/>}</>;
}

function SideEffectEntry({medication,sessionId,today,reload,registerFlusher,onDirtyChange}:{medication:DemoMedication;sessionId?:string;today:string;reload:()=>Promise<unknown>}&Tracking){
 const [open,setOpen]=useState(false),[text,setText]=useState(''),[severity,setSeverity]=useState(''),[date,setDate]=useState(today),[saving,setSaving]=useState(false),[error,setError]=useState('');
 const savingRef=useRef(false);
 const key='medication-effect:'+medication.id,pending=open&&Boolean(text.trim()||severity||date!==today)||saving;
 const guard=useCallback(async()=>{if(pending)throw new Error('Ολοκλήρωσε ή ακύρωσε την παρενέργεια του '+medication.medication_name+'.')},[pending,medication.medication_name]);
 useEffect(()=>registerFlusher?.(key,guard),[key,registerFlusher,guard]);
 useEffect(()=>{onDirtyChange?.(key,pending);return()=>onDirtyChange?.(key,false)},[key,pending,onDirtyChange]);
 async function save(){
  if(savingRef.current||text.trim().length<2||!severity||!date)return;
  savingRef.current=true;setSaving(true);setError('');
  try{await demoPost({action:'medication_side_effect',medication_id:medication.id,session_id:sessionId||null,effect:text,severity,noted_on:date});setText('');setSeverity('');setDate(today);setOpen(false);await reload()}catch(cause){setError(cause instanceof Error?cause.message:'Δεν αποθηκεύτηκε η παρενέργεια.')}finally{savingRef.current=false;setSaving(false)}
 }
 const cancel=()=>{setText('');setSeverity('');setDate(today);setError('');setOpen(false)};
 if(!open)return <button type="button" className="med-add-effect" onClick={()=>setOpen(true)}><Plus size={12}/> Παρενέργεια</button>;
 return <div className="med-inline-effect"><input aria-label={'Νέα παρενέργεια — '+medication.medication_name} placeholder="Παρενέργεια *" value={text} disabled={saving} onChange={e=>{setText(e.target.value);setError('')}}/><div className="med-effect-controls"><select aria-label={'Βαρύτητα — '+medication.medication_name} value={severity} disabled={saving} onChange={e=>setSeverity(e.target.value)}><option value="">Βαρύτητα *</option><option value="mild">Ήπια</option><option value="moderate">Μέτρια</option><option value="severe">Σοβαρή</option></select><input type="date" aria-label={'Ημερομηνία παρενέργειας — '+medication.medication_name} value={date} disabled={saving} onChange={e=>setDate(e.target.value)}/></div><div className="med-action-pair"><button className="primary" type="button" disabled={saving||text.trim().length<2||!severity||!date} onClick={()=>void save()}><Check size={13}/></button><button type="button" disabled={saving} onClick={cancel}><X size={13}/></button></div>{error&&<span className="med-inline-error" role="alert">{error}</span>}</div>;
}

'use client';
import {useCallback,useEffect,useRef,useState,type FocusEvent} from 'react';
import type {DemoMedication,PatientBundle} from '@/lib/patients/demo-runtime';
import {demoPost} from '@/lib/patients/demo-client';
import {formatClinicDate} from '@/lib/clinic-time';

type Mode='start'|'history'|'change'|'stop'|'side_effect';
type Tracking={registerFlusher?:(key:string,flush:()=>Promise<void>)=>(()=>void);onDirtyChange?:(key:string,dirty:boolean)=>void};

export default function MedicationTable({bundle,sessionId,onManage,reload,editableEffects=false,editablePlan=false,registerFlusher,onDirtyChange}:{bundle:PatientBundle;sessionId?:string;onManage?:(mode:Mode,id?:string)=>void;reload:()=>Promise<unknown>;editableEffects?:boolean;editablePlan?:boolean}&Tracking){
 const today=bundle.clinical_day||new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Athens',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
 const medications=[...bundle.medications].sort((a,b)=>{const rank=(s:string)=>s==='active'?0:s==='planned'?1:2;return rank(a.status)-rank(b.status)||Date.parse(b.started_at)-Date.parse(a.started_at)});
 function durationLabel(start:string,end?:string|null){const days=Math.max(0,Math.floor((Date.parse((end||today).slice(0,10))-Date.parse(start.slice(0,10)))/86400000));if(days<31)return days===1?'1 ημέρα':days+' ημέρες';const months=Math.max(1,Math.round(days/30.44));if(months<12)return months===1?'1 μήνας':months+' μήνες';const years=Math.floor(months/12),rest=months%12;return years+(years===1?' έτος':' έτη')+(rest?' · '+rest+' μ.':'')}
 return <div className="clinical-table-wrap medication-table-editor"><table className="clinical-lean-table medication-lean-table"><caption>{editablePlan?'Αγωγή · συμπλήρωση και αλλαγές απευθείας στον πίνακα':'Αγωγή · τρέχουσα και προηγούμενη'}</caption><thead><tr><th>Φάρμακο</th><th>Δόση</th><th>Συχνότητα</th><th>Περίοδος / διάρκεια</th><th>Κατάσταση</th><th>Παρενέργειες</th>{onManage&&<th><span className="sr-only">Ενέργειες</span></th>}</tr></thead><tbody>
 {medications.map(m=>editablePlan
  ?<EditableMedicationRow key={m.id} medication={m} bundle={bundle} today={today} sessionId={sessionId} reload={reload} editableEffects={editableEffects} registerFlusher={registerFlusher} onDirtyChange={onDirtyChange} durationLabel={durationLabel}/>
  :<ReadOnlyMedicationRow key={m.id} medication={m} bundle={bundle} today={today} sessionId={sessionId} reload={reload} editableEffects={editableEffects} registerFlusher={registerFlusher} onDirtyChange={onDirtyChange} onManage={onManage} durationLabel={durationLabel}/>)}
 {editablePlan&&<NewMedicationRow bundle={bundle} today={today} sessionId={sessionId} reload={reload} registerFlusher={registerFlusher} onDirtyChange={onDirtyChange}/>}
 {!medications.length&&!editablePlan&&<tr><td colSpan={onManage?7:6} className="med-empty">Δεν έχει καταγραφεί αγωγή. Προσθέστε φάρμακο που λαμβάνει τώρα ή προηγούμενη θεραπεία.</td></tr>}
 </tbody></table></div>;
}

function ReadOnlyMedicationRow({medication:m,bundle,today,sessionId,reload,editableEffects,registerFlusher,onDirtyChange,onManage,durationLabel}:{medication:DemoMedication;bundle:PatientBundle;today:string;sessionId?:string;reload:()=>Promise<unknown>;editableEffects:boolean;onManage?:(mode:Mode,id?:string)=>void;durationLabel:(start:string,end?:string|null)=>string}&Tracking){
 const start=m.started_at.slice(0,10),end=m.ended_at?.slice(0,10),effects=bundle.medicationSideEffects.filter(e=>e.medication_id===m.id);
 return <tr><th scope="row">{m.medication_name}{m.notes&&<small>{m.notes}</small>}</th><td>{m.dose} {m.unit}</td><td>{m.frequency}</td><td><span>{formatClinicDate(start)}{end?' – '+formatClinicDate(end):''}</span><small>{m.status==='planned'?'Προγραμματισμένη έναρξη':durationLabel(start,end)}</small></td><td><span className={'med-status '+m.status}>{m.status==='active'?'Λαμβάνει':m.status==='stopped'?'Διακοπείσα':'Προγραμματισμένη'}</span></td><td><MedicationEffects medication={m} bundle={bundle} sessionId={sessionId} today={today} reload={reload} editableEffects={editableEffects} registerFlusher={registerFlusher} onDirtyChange={onDirtyChange}/></td>{onManage&&<td className="med-row-actions">{m.status!=='stopped'&&<><button type="button" onClick={()=>onManage('change',m.id)}>Αλλαγή</button><button type="button" onClick={()=>onManage('stop',m.id)}>Διακοπή</button></>}</td>}</tr>;
}

function EditableMedicationRow({medication:m,bundle,today,sessionId,reload,editableEffects,registerFlusher,onDirtyChange,durationLabel}:{medication:DemoMedication;bundle:PatientBundle;today:string;sessionId?:string;reload:()=>Promise<unknown>;editableEffects:boolean;durationLabel:(start:string,end?:string|null)=>string}&Tracking){
 const [dose,setDose]=useState(String(m.dose)),[unit,setUnit]=useState(m.unit),[frequency,setFrequency]=useState(m.frequency),[dirty,setDirty]=useState(false),[saving,setSaving]=useState(false),[state,setState]=useState(''),[stopDate,setStopDate]=useState('');
 const flight=useRef<Promise<void>|null>(null),key='medication-plan:'+m.id;
 useEffect(()=>{if(!dirty&&!saving){setDose(String(m.dose));setUnit(m.unit);setFrequency(m.frequency)}},[m.dose,m.unit,m.frequency,dirty,saving]);
 const save=useCallback(async()=>{
  if(flight.current)return flight.current;
  if(!dirty)return;
  const numericDose=Number(dose);
  if(!Number.isFinite(numericDose)||numericDose<=0||!unit.trim()||!frequency.trim()){setState('Συμπλήρωσε έγκυρη δόση, μονάδα και συχνότητα.');throw new Error('Μη έγκυρη αγωγή.')}
  const task=(async()=>{setSaving(true);setState('');let committed=false;try{
   const effectiveOn=m.status==='planned'?m.started_at.slice(0,10):today;
   const sameDay=bundle.medicationEvents.find(e=>e.medication_id===m.id&&e.effective_on===effectiveOn&&!bundle.medicationRevisions.some(r=>r.event_id===e.id));
   await demoPost({action:'medication_event',replace_id:sameDay?.id||null,event_type:sameDay?.event_type||'changed',expected_version:m.plan_version,medication_id:m.id,session_id:sessionId||null,dose:numericDose,unit:unit.trim(),frequency:frequency.trim(),effective_on:effectiveOn,reason:sameDay?'Διόρθωση από τον πίνακα αγωγής':''});
   committed=true;setDirty(false);setState('Αποθηκεύτηκε');
   try{await reload()}catch{setState('Αποθηκεύτηκε · η προβολή δεν ανανεώθηκε.')}
  }catch(error){setState(committed?'Αποθηκεύτηκε · η προβολή δεν ανανεώθηκε.':error instanceof Error?error.message:'Δεν αποθηκεύτηκε.');if(!committed)throw error}finally{setSaving(false)}})();
  flight.current=task;try{await task}finally{flight.current=null}
 },[dirty,dose,unit,frequency,bundle.medicationEvents,bundle.medicationRevisions,m.id,m.plan_version,reload,sessionId,today]);
 useEffect(()=>registerFlusher?.(key,save),[key,registerFlusher,save]);
 useEffect(()=>{onDirtyChange?.(key,dirty||saving);return()=>onDirtyChange?.(key,false)},[key,dirty,saving,onDirtyChange]);
 async function stop(value:string){
  setStopDate(value);if(!value||saving)return;setSaving(true);setState('');
  try{await demoPost({action:'medication_stop',medication_id:m.id,session_id:sessionId||null,effective_on:value,reason:''});setState('Διακοπή καταγράφηκε');setStopDate('');await reload()}catch(error){setState(error instanceof Error?error.message:'Δεν καταγράφηκε η διακοπή.')}finally{setSaving(false)}
 }
 const start=m.started_at.slice(0,10),end=m.ended_at?.slice(0,10),effects=bundle.medicationSideEffects.filter(e=>e.medication_id===m.id),editable=m.status!=='stopped';
 function leaveRow(event:FocusEvent<HTMLTableRowElement>){const next=event.relatedTarget as Node|null;if(next&&event.currentTarget.contains(next))return;if(dirty)void save().catch(()=>{})}
 return <tr className={dirty?'med-row-editing':''} onBlur={leaveRow} onKeyDown={e=>{if(e.key==='Enter'&&(e.target instanceof HTMLInputElement||e.target instanceof HTMLSelectElement))(e.target as HTMLElement).blur()}}>
  <th scope="row">{m.medication_name}{m.notes&&<small>{m.notes}</small>}{state&&<small className={state.includes('Αποθηκεύτηκε')||state.includes('καταγράφηκε')?'med-inline-state ok':'med-inline-state error'}>{saving?'Αποθήκευση…':state}</small>}</th>
  <td>{editable?<div className="med-inline-dose"><input aria-label={'Δόση '+m.medication_name} inputMode="decimal" value={dose} disabled={saving} onChange={e=>{setDose(e.target.value.replace(',','.'));setDirty(true);setState('')}}/><input aria-label={'Μονάδα '+m.medication_name} value={unit} disabled={saving} onChange={e=>{setUnit(e.target.value);setDirty(true);setState('')}}/></div>:<>{m.dose} {m.unit}</>}</td>
  <td>{editable?<input className="med-inline-input" aria-label={'Συχνότητα '+m.medication_name} value={frequency} disabled={saving} onChange={e=>{setFrequency(e.target.value);setDirty(true);setState('')}}/>:m.frequency}</td>
  <td><span>{formatClinicDate(start)}{end?' – '+formatClinicDate(end):''}</span><small>{m.status==='planned'?'Προγραμματισμένη έναρξη':durationLabel(start,end)}</small>{editable&&<label className="med-inline-stop">Διακοπή<input type="date" aria-label={'Ημερομηνία διακοπής '+m.medication_name} value={stopDate} disabled={saving} min={start} onChange={e=>void stop(e.target.value)}/></label>}</td>
  <td><span className={'med-status '+m.status}>{m.status==='active'?'Λαμβάνει':m.status==='stopped'?'Διακοπείσα':'Προγραμματισμένη'}</span>{dirty&&<small className="med-unsaved">Μη αποθηκευμένες αλλαγές</small>}</td>
  <td><MedicationEffects medication={m} bundle={bundle} sessionId={sessionId} today={today} reload={reload} editableEffects={editableEffects} registerFlusher={registerFlusher} onDirtyChange={onDirtyChange}/></td>
 </tr>;
}

function NewMedicationRow({bundle,today,sessionId,reload,registerFlusher,onDirtyChange}:{bundle:PatientBundle;today:string;sessionId?:string;reload:()=>Promise<unknown>}&Tracking){
 const [name,setName]=useState(''),[dose,setDose]=useState(''),[unit,setUnit]=useState('mg'),[frequency,setFrequency]=useState(''),[start,setStart]=useState(today),[mode,setMode]=useState<'start'|'history'>('start'),[stop,setStop]=useState(today),[saving,setSaving]=useState(false),[state,setState]=useState('');
 const flight=useRef<Promise<void>|null>(null),key='medication-new';
 const dirty=Boolean(name.trim()||dose.trim()||frequency.trim()||mode==='history'||start!==today||unit!=='mg');
 const complete=Boolean(name.trim()&&dose.trim()&&frequency.trim()&&start&&(mode==='start'||stop));
 const reset=()=>{setName('');setDose('');setUnit('mg');setFrequency('');setStart(today);setMode('start');setStop(today)};
 const save=useCallback(async()=>{
  if(flight.current)return flight.current;
  if(!dirty)return;
  if(!complete){setState('Συμπλήρωσε φάρμακο, δόση, συχνότητα και ημερομηνίες.');throw new Error('Η νέα αγωγή είναι ημιτελής.')}
  const numericDose=Number(dose);
  if(!Number.isFinite(numericDose)||numericDose<=0){setState('Η δόση δεν είναι έγκυρη.');throw new Error('Η δόση δεν είναι έγκυρη.')}
  const task=(async()=>{setSaving(true);setState('');let committed=false;try{
   const draft=bundle.sessions.find(x=>sessionId?x.id===sessionId&&x.status==='draft':x.status==='draft');
   if(mode==='history')await demoPost({action:'medication_history',patient_id:bundle.patient.id,session_id:draft?.id||null,name:name.trim(),dose:numericDose,unit:unit.trim()||'mg',frequency:frequency.trim(),started_on:start,stopped_on:stop,reason:''});
   else await demoPost({action:'medication_start',patient_id:bundle.patient.id,session_id:draft?.id||null,name:name.trim(),dose:numericDose,unit:unit.trim()||'mg',frequency:frequency.trim(),effective_on:start,reason:''});
   committed=true;reset();setState('Αποθηκεύτηκε');
   try{await reload()}catch{setState('Αποθηκεύτηκε · η προβολή δεν ανανεώθηκε.')}
  }catch(error){setState(committed?'Αποθηκεύτηκε · η προβολή δεν ανανεώθηκε.':error instanceof Error?error.message:'Δεν αποθηκεύτηκε.');if(!committed)throw error}finally{setSaving(false)}})();
  flight.current=task;try{await task}finally{flight.current=null}
 },[bundle.patient.id,bundle.sessions,complete,dirty,dose,frequency,mode,name,reload,sessionId,start,stop,today,unit]);
 useEffect(()=>registerFlusher?.(key,save),[key,registerFlusher,save]);
 useEffect(()=>{onDirtyChange?.(key,dirty||saving);return()=>onDirtyChange?.(key,false)},[key,dirty,saving,onDirtyChange]);
 function leaveRow(event:FocusEvent<HTMLTableRowElement>){const next=event.relatedTarget as Node|null;if(next&&event.currentTarget.contains(next))return;if(dirty)void save().catch(()=>{})}
 return <tr className="med-new-row" onBlur={leaveRow}>
  <th scope="row"><input aria-label="Νέο φάρμακο" placeholder="＋ Φάρμακο…" value={name} disabled={saving} onChange={e=>{setName(e.target.value);setState('')}}/>{state&&<small className={state.includes('Αποθηκεύτηκε')?'med-inline-state ok':'med-inline-state error'}>{saving?'Αποθήκευση…':state}</small>}</th>
  <td><div className="med-inline-dose"><input aria-label="Νέα δόση" inputMode="decimal" placeholder="Δόση" value={dose} disabled={saving} onChange={e=>{setDose(e.target.value.replace(',','.'));setState('')}}/><input aria-label="Νέα μονάδα" value={unit} disabled={saving} onChange={e=>setUnit(e.target.value)}/></div></td>
  <td><input className="med-inline-input" aria-label="Νέα συχνότητα" placeholder="π.χ. 1× πρωί" value={frequency} disabled={saving} onChange={e=>{setFrequency(e.target.value);setState('')}}/></td>
  <td><label className="med-new-date">Έναρξη<input type="date" value={start} disabled={saving} onChange={e=>setStart(e.target.value)}/></label>{mode==='history'&&<label className="med-new-date">Διακοπή<input type="date" value={stop} disabled={saving} min={start} max={today} onChange={e=>setStop(e.target.value)}/></label>}</td>
  <td><select className="med-inline-status" aria-label="Κατάσταση νέας αγωγής" value={mode} disabled={saving} onChange={e=>setMode(e.target.value as 'start'|'history')}><option value="start">Λαμβάνει / προγραμματισμένη</option><option value="history">Προηγούμενη · διακοπείσα</option></select>{dirty&&<small className="med-unsaved">Αποθηκεύεται όταν φύγεις από τη γραμμή</small>}</td>
  <td><small>Οι παρενέργειες προστίθενται μόλις αποθηκευτεί το φάρμακο.</small></td>
 </tr>;
}

function MedicationEffects({medication,bundle,sessionId,today,reload,editableEffects,registerFlusher,onDirtyChange}:{medication:DemoMedication;bundle:PatientBundle;sessionId?:string;today:string;reload:()=>Promise<unknown>;editableEffects:boolean}&Tracking){
 const effects=bundle.medicationSideEffects.filter(e=>e.medication_id===medication.id);
 return <>{effects.map(e=><div className={'med-effect '+(e.resolved_on?'resolved':'')} key={e.id}><span>{e.effect_text}</span><small>{e.severity==='severe'?'Σοβαρή':e.severity==='mild'?'Ήπια':'Μέτρια'} · {formatClinicDate(e.noted_on)}{e.resolved_on?' · επιλύθηκε '+formatClinicDate(e.resolved_on):''}</small></div>)}{!effects.length&&<small>Δεν υπάρχει δομημένη καταγραφή</small>}{editableEffects&&<SideEffectEntry medication={medication} sessionId={sessionId} today={today} reload={reload} registerFlusher={registerFlusher} onDirtyChange={onDirtyChange}/>}</>;
}

function SideEffectEntry({medication,sessionId,today,reload,registerFlusher,onDirtyChange}:{medication:DemoMedication;sessionId?:string;today:string;reload:()=>Promise<unknown>}&Tracking){
 const [text,setText]=useState(''),[severity,setSeverity]=useState(''),[date,setDate]=useState(today),[saving,setSaving]=useState(false),[error,setError]=useState('');const flight=useRef(false),pending=useRef(false);const key='medication-effect:'+medication.id;pending.current=Boolean(text.trim())||saving;
 const flush=useCallback(async()=>{if(pending.current)throw new Error('Αποθηκεύστε ή ακυρώστε την παρενέργεια του '+medication.medication_name+'.')},[medication.medication_name]);
 useEffect(()=>registerFlusher?.(key,flush),[key,registerFlusher,flush]);
 useEffect(()=>{onDirtyChange?.(key,pending.current);return()=>onDirtyChange?.(key,false)},[key,text,saving,onDirtyChange]);
 async function save(){if(flight.current)return;if(text.trim().length<2||!severity||!date){setError('Συμπληρώστε περιγραφή, βαρύτητα και ημερομηνία.');return}flight.current=true;setSaving(true);setError('');let committed=false;try{await demoPost({action:'medication_side_effect',medication_id:medication.id,session_id:sessionId||null,effect:text,severity,noted_on:date});committed=true;setText('');setSeverity('');try{const refreshed=await reload();if(!refreshed)setError('Η παρενέργεια αποθηκεύτηκε, αλλά η προβολή δεν ανανεώθηκε.')}catch{setError('Η παρενέργεια αποθηκεύτηκε, αλλά η προβολή δεν ανανεώθηκε.')}}catch(e){setError(committed?'Η παρενέργεια αποθηκεύτηκε, αλλά η προβολή δεν ανανεώθηκε.':e instanceof Error?e.message:'Δεν αποθηκεύτηκε η παρενέργεια.')}finally{flight.current=false;setSaving(false)}}
 return <div className="med-inline-effect"><textarea rows={1} aria-label={'Νέα παρενέργεια — '+medication.medication_name} placeholder="＋ Παρενέργεια…" value={text} disabled={saving} onChange={e=>setText(e.target.value)}/>{text&&<><div className="med-effect-controls"><select aria-label={'Βαρύτητα — '+medication.medication_name} value={severity} disabled={saving} onChange={e=>setSeverity(e.target.value)}><option value="">Βαρύτητα</option><option value="mild">Ήπια</option><option value="moderate">Μέτρια</option><option value="severe">Σοβαρή</option></select><input type="date" aria-label={'Ημερομηνία παρενέργειας — '+medication.medication_name} value={date} disabled={saving} onChange={e=>setDate(e.target.value)}/></div><button type="button" disabled={saving} onClick={()=>void save()}>{saving?'Αποθήκευση…':'Αποθήκευση'}</button><button type="button" disabled={saving} onClick={()=>{setText('');setSeverity('');setError('')}}>Ακύρωση</button></>}{error&&<p role="alert">{error}</p>}</div>;
}

'use client';
import Link from 'next/link';
import {useEffect,useRef,useState} from 'react';
import {Check,ChevronRight} from 'lucide-react';
import {pendingListState,pendingTaskHref,type PendingTask,type TaskPatient} from '@/lib/overview/pending-tasks';
type Props={tasks:PendingTask[];state:'loading'|'ready'|'error';refreshing:boolean;refreshFailed:boolean;busy:boolean;onRefresh:()=>void;onCreate:(input:{title:string;patient_id:string|null;due_at:string|null})=>Promise<PendingTask>;onStatus:(task:PendingTask,status:'open'|'completed')=>Promise<PendingTask>;searchPatients:(query:string,signal:AbortSignal)=>Promise<TaskPatient[]>};
const dateLabel=(iso:string)=>new Intl.DateTimeFormat('el-GR',{timeZone:'Europe/Athens',day:'numeric',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit'}).format(new Date(iso));
export default function PendingTasks({tasks,state,refreshing,refreshFailed,busy,onRefresh,onCreate,onStatus,searchPatients}:Props){
 const [title,setTitle]=useState(''),[query,setQuery]=useState(''),[patient,setPatient]=useState<TaskPatient|null>(null),[due,setDue]=useState('');
 const [matches,setMatches]=useState<TaskPatient[]>([]),[searchState,setSearchState]=useState<'idle'|'loading'|'ready'|'error'>('idle');
 const [error,setError]=useState(''),[undo,setUndo]=useState<PendingTask|null>(null),[saving,setSaving]=useState(false);
 const inFlight=useRef(false),mounted=useRef(true);
 useEffect(()=>{mounted.current=true;return()=>{mounted.current=false}},[]);
 useEffect(()=>{
  const controller=new AbortController();
  setMatches([]);
  if(patient||query.trim().length<2){setSearchState('idle');return()=>controller.abort();}
  setSearchState('loading');
  const timer=setTimeout(()=>{void searchPatients(query.trim(),controller.signal).then(rows=>{if(!controller.signal.aborted){setMatches(rows);setSearchState('ready')}}).catch(()=>{if(!controller.signal.aborted)setSearchState('error')})},200);
  return()=>{clearTimeout(timer);controller.abort()};
 },[query,patient,searchPatients]);
 async function run(action:()=>Promise<void>){
  if(inFlight.current||busy)return;inFlight.current=true;setSaving(true);setError('');
  try{await action()}catch(cause){if(mounted.current)setError(cause instanceof Error?cause.message:'Η ενέργεια δεν ολοκληρώθηκε.')}
  finally{inFlight.current=false;if(mounted.current)setSaving(false)}
 }
 const disabled=busy||saving;
 const listState=pendingListState(state,refreshFailed,tasks.length);
 return <>
  <p className="pending-help">Εργασίες και πρόχειρες επισκέψεις. Οι επισκέψεις κλείνουν εδώ μόνο μετά την καταχώρισή τους στον φάκελο.</p>
  <form onSubmit={e=>{e.preventDefault();if(!title.trim())return;void run(async()=>{
   const deadline=due?new Date(due):null;
   if(deadline&&!Number.isFinite(deadline.getTime()))throw new Error('Ελέγξτε την προθεσμία.');
   await onCreate({title:title.trim(),patient_id:patient?.id||null,due_at:deadline?.toISOString()||null});
   if(mounted.current){setTitle('');setPatient(null);setQuery('');setDue('')}
  })}}>
   <div className="todo-compose"><input aria-label="Νέα εργασία" value={title} disabled={disabled} onChange={e=>setTitle(e.target.value)} placeholder="Τι χρειάζεται να κάνεις;" maxLength={240}/><button type="submit" disabled={disabled||!title.trim()}>Προσθήκη</button></div>
   <div className="pending-options">
    <div className="pending-patient-search">
     <label htmlFor="pending-patient">Ασθενής (προαιρετικά)</label>
     <input id="pending-patient" value={patient?[patient.first_name,patient.last_name].filter(Boolean).join(' '):query} disabled={disabled} autoComplete="off" placeholder="Αναζήτηση από 2 γράμματα" onChange={e=>{setPatient(null);setQuery(e.target.value)}}/>
     {patient&&<button type="button" disabled={disabled} onClick={()=>{setPatient(null);setQuery('')}}>Αφαίρεση ασθενή</button>}
     {!patient&&searchState==='loading'&&<small role="status">Αναζήτηση…</small>}
     {!patient&&searchState==='error'&&<small role="alert">Δεν φορτώθηκαν οι ασθενείς. Δοκιμάστε ξανά την αναζήτηση.</small>}
     {!patient&&searchState==='ready'&&(matches.length?<ul className="pending-matches" aria-label="Αποτελέσματα ασθενών">{matches.map(p=><li key={p.id}><button type="button" disabled={disabled} onClick={()=>{setPatient(p);setQuery('');setMatches([])}}>{p.first_name} {p.last_name}</button></li>)}</ul>:<small>Δεν βρέθηκαν ασθενείς.</small>)}
    </div>
    <div><label htmlFor="pending-due">Προθεσμία (προαιρετικά, τοπική ώρα)</label><input id="pending-due" type="datetime-local" value={due} disabled={disabled} onChange={e=>setDue(e.target.value)}/></div>
   </div>
  </form>
  {error&&<div className="save-state error" role="alert">{error}</div>}
  {undo&&<div className="pending-undo" role="status"><span>Ολοκληρώθηκε: {undo.title}</span><button disabled={disabled} onClick={()=>void run(async()=>{await onStatus(undo,'open');if(mounted.current)setUndo(null)})}>Αναίρεση</button></div>}
  {refreshing&&state==='ready'&&<p className="pending-help" role="status">Ανανέωση εκκρεμοτήτων…</p>}
  <div className="dashboard-widget-list" aria-busy={refreshing}>
   {listState==='loading'?<div className="dashboard-widget-empty" role="status">Φόρτωση εκκρεμοτήτων…</div>:listState==='error'?<div className="dashboard-widget-empty" role="alert">Δεν φορτώθηκαν οι εκκρεμότητες. <button onClick={onRefresh}>Δοκιμή ξανά</button></div>:<>
    {listState==='stale'&&<div className="save-state error" role="alert">Η ανανέωση απέτυχε. Η τελευταία εικόνα μπορεί να έχει αλλάξει. <button onClick={onRefresh}>Δοκιμή ξανά</button></div>}
    {tasks.map(task=><div className="dashboard-widget-row todo-row" key={task.id}>
     <div><strong>{task.title}</strong><span>{task.source_session_id?'Πρόχειρη επίσκεψη'+(task.session_started_at?' · '+dateLabel(task.session_started_at):''):'Εργασία'+(task.patient_name?' · '+task.patient_name:'')}{task.due_at?' · Προθεσμία '+dateLabel(task.due_at)+(Date.parse(task.due_at)<Date.now()?' · Έχει παρέλθει':''):''}</span></div>
     <div className="pending-row-actions">
      {pendingTaskHref(task)&&<Link prefetch={false} className="todo-done" href={pendingTaskHref(task)!} aria-label={task.source_session_id?'Συνέχεια '+task.title:'Άνοιγμα φακέλου '+(task.patient_name||'ασθενή')} title={task.source_session_id?'Συνέχεια επίσκεψης':'Άνοιγμα φακέλου'}><ChevronRight size={16}/></Link>}
      {!task.source_session_id&&<button className="todo-done" disabled={disabled} onClick={()=>void run(async()=>{const result=await onStatus(task,'completed');if(mounted.current)setUndo(result)})} aria-label={'Ολοκλήρωση '+task.title}><Check size={16}/></button>}
     </div>
    </div>)}
    {listState==='empty'&&<div className="dashboard-widget-empty">Δεν υπάρχουν εκκρεμότητες.</div>}
   </>}
  </div>
 </>;
}

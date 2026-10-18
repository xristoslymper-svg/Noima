'use client';
import {useState} from 'react';
import PendingTasks from './PendingTasks';
import {pendingTasks,taskStatusChange,type PendingTask} from '@/lib/overview/pending-tasks';
import {fixtureTask,taskPatients,taskVisits} from '@/lib/overview/pending-fixture';
const normalize=(value:string)=>value.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase('el-GR');
async function search(query:string){return taskPatients.filter(p=>normalize(p.first_name+' '+p.last_name).includes(normalize(query)))}
export default function PendingTasksPreview(){
 const [tasks,setTasks]=useState<PendingTask[]>([fixtureTask]),[visits,setVisits]=useState(taskVisits);
 const [state,setState]=useState<'loading'|'ready'|'error'>('ready'),[stale,setStale]=useState(false),[failSave,setFailSave]=useState(false);
 const [open,setOpen]=useState(true);
 const snapshot=pendingTasks(tasks,visits,taskPatients);
 return <main className="content overview-shell">
  <div className="page-heading"><div><p className="eyebrow">ΣΥΝΘΕΤΙΚΗ ΔΟΚΙΜΗ · ΜΟΝΟ ΣΤΟ PREVIEW</p><h1>Εκκρεμότητες</h1><p>Το ίδιο widget με υποθετικούς ασθενείς. Όλες οι ενέργειες μένουν στη μνήμη αυτής της σελίδας.</p></div></div>
  <div className="pending-undo"><button onClick={()=>setOpen(true)}>Εκκρεμότητες ({snapshot.length})</button><button onClick={()=>setState('loading')}>Προσομοίωση φόρτωσης</button><button onClick={()=>setState('error')}>Αποτυχία φόρτωσης</button><button onClick={()=>{setState('ready');setStale(true)}}>Αποτυχία ανανέωσης</button><button onClick={()=>setFailSave(true)}>Αποτυχία επόμενης αποθήκευσης</button><button onClick={()=>setVisits(current=>current.map(v=>({...v,status:'completed'})))}>Προσομοίωση καταχώρισης επισκέψεων</button></div>
  {open&&<div className="dashboard-widget-overlay" onClick={()=>setOpen(false)}><section className="dashboard-widget-sheet" role="dialog" aria-modal="true" aria-label="Εκκρεμότητες" onClick={e=>e.stopPropagation()}>
   <header className="dashboard-widget-head"><div><span className="kicker">ΑΡΧΙΚΗ</span><h2>Εκκρεμότητες</h2></div><button aria-label="Κλείσιμο" onClick={()=>setOpen(false)}>×</button></header>
   <PendingTasks tasks={snapshot} state={state} refreshing={state==='loading'} refreshFailed={stale} busy={false} searchPatients={search} onRefresh={()=>{setState('ready');setStale(false)}} onCreate={async input=>{
    if(failSave){setFailSave(false);throw new Error('Συνθετική αποτυχία αποθήκευσης. Το κείμενό σας διατηρήθηκε.')}
    const task:PendingTask={...fixtureTask,...input,id:crypto.randomUUID(),source_session_id:null,created_at:new Date().toISOString(),updated_at:new Date().toISOString()};
    setTasks(current=>[task,...current]);return task;
   }} onStatus={async(task,status)=>{
    taskStatusChange(task,status);
    if(failSave){setFailSave(false);throw new Error('Συνθετική αποτυχία ενημέρωσης. Δοκιμάστε ξανά.')}
    const saved={...task,status,completed_at:status==='completed'?new Date().toISOString():null};
    setTasks(current=>[saved,...current.filter(t=>t.id!==saved.id)]);return saved;
   }}/>
  </section></div>}
 </main>;
}

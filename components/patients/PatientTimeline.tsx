'use client';
import {useMemo,useState} from 'react';
import {Activity,ChevronRight,ClipboardCheck,Pill,TestTube2,TriangleAlert} from 'lucide-react';
import type {PatientBundle} from '@/lib/patients/demo-runtime';
import {formatClinicDateTime} from '@/lib/clinic-time';
import {sessionClinicalTime} from '@/lib/clinical/visit-workspace-state';

type Filter='all'|'visits'|'treatment'|'measurements';
type TimelineEvent={
 id:string;
 kind:Exclude<Filter,'all'>;
 date:string;
 title:string;
 subtitle?:string;
 detail?:string;
 sessionId?:string;
 warning?:boolean;
};

export default function PatientTimeline({
 bundle,
 onOpenVisit,
 onResumeDraft,
}:{
 bundle:PatientBundle;
 onOpenVisit:(id:string)=>void;
 onResumeDraft:(id:string)=>void;
}){
 const [filter,setFilter]=useState<Filter>('all');
 const medicationName=(id:string)=>bundle.medications.find(m=>m.id===id)?.medication_name||'Αγωγή';
 const events=useMemo<TimelineEvent[]>(()=>{
  const rows:TimelineEvent[]=[];
  bundle.sessions.filter(s=>s.status==='completed').forEach(s=>rows.push({
   id:'visit-'+s.id,kind:'visits',date:sessionClinicalTime(bundle,s),sessionId:s.id,
   title:s.session_type==='initial_assessment'?'Αρχική αξιολόγηση':'Επανεξέταση',
   subtitle:'Ολοκληρωμένη κλινική καταγραφή',
  }));
  bundle.medicationEvents.forEach(e=>{
   const next=e.new_state||{},previous=e.previous_state||{};
   const dose=(state:Record<string,unknown>)=>typeof state.dose==='number'||typeof state.dose==='string'?`${state.dose} ${String(state.unit||'mg')}`:'';
   const before=dose(previous),after=dose(next);
   rows.push({id:'med-'+e.id,kind:'treatment',date:e.effective_on||e.created_at,title:e.event_type==='started'?'Έναρξη αγωγής':e.event_type==='stopped'?'Διακοπή αγωγής':e.event_type==='changed'?'Αλλαγή αγωγής':'Μεταβολή αγωγής',subtitle:`${medicationName(e.medication_id)}${before||after?` · ${before}${before&&after?' → ':''}${after}`:''}`,detail:e.reason||undefined});
  });
  bundle.medicationSideEffects.forEach(e=>rows.push({id:'effect-'+e.id,kind:'treatment',date:e.noted_on||e.created_at,title:'Παρενέργεια',subtitle:`${medicationName(e.medication_id)} · ${e.effect_text}`,detail:e.impact||e.note||undefined,warning:e.severity==='severe'}));
  bundle.assessments.filter(a=>a.status==='completed').forEach(a=>rows.push({id:'assessment-'+a.id,kind:'measurements',date:a.completed_at||a.created_at,title:a.instrument,subtitle:a.score!==null?`Βαθμολογία ${a.score}`:'Ολοκληρώθηκε',detail:a.item9_review&&!a.item9_reviewed_at?'Λήμμα 9: αναμένει έλεγχο από γιατρό':undefined,warning:Boolean(a.item9_review&&!a.item9_reviewed_at)}));
  return rows.sort((a,b)=>Date.parse(b.date)-Date.parse(a.date));
 },[bundle]);

 const visible=filter==='all'?events:events.filter(e=>e.kind===filter);
 const months=visible.reduce<Record<string,TimelineEvent[]>>((acc,event)=>{
  const key=new Intl.DateTimeFormat('el-GR',{timeZone:'Europe/Athens',month:'long',year:'numeric'}).format(new Date(event.date));
  (acc[key]||=[]).push(event);return acc;
 },{});
 const draft=bundle.sessions.find(s=>s.status==='draft');

 return <section className="patient-timeline-v2">
  <div className="patient-section-heading timeline-heading"><div><span className="kicker">ΠΟΡΕΙΑ</span><h2>Τι συνέβη στον χρόνο</h2></div><div className="timeline-filters">{([['all','Όλα'],['visits','Επισκέψεις'],['treatment','Θεραπεία'],['measurements','Μετρήσεις']] as const).map(([key,label])=><button key={key} className={filter===key?'active':''} onClick={()=>setFilter(key)}>{label}</button>)}</div></div>
  {draft&&<button className="timeline-draft" onClick={()=>onResumeDraft(draft.id)}><span><Activity size={15}/><strong>Πρόχειρη {draft.session_type==='initial_assessment'?'αρχική αξιολόγηση':'επανεξέταση'}</strong><small>{formatClinicDateTime(draft.started_at)}</small></span><b>Συνέχεια καταγραφής <ChevronRight size={14}/></b></button>}
  {!visible.length?<p className="patient-quiet-empty">Δεν υπάρχουν καταγραφές για αυτό το φίλτρο.</p>:Object.entries(months).map(([month,items])=><div className="timeline-month" key={month}><h3>{month}</h3><div className="timeline-events">{items.map(event=><article className={`timeline-event ${event.warning?'warning':''}`} key={event.id}>
   <div className="timeline-marker">{event.kind==='visits'?<ClipboardCheck size={14}/>:event.kind==='treatment'?<Pill size={14}/>:<TestTube2 size={14}/>}</div>
   <div className="timeline-event-body">
    <time>{formatClinicDateTime(event.date)}</time>
    <strong>{event.warning&&<TriangleAlert size={14}/>} {event.title}</strong>
    {event.subtitle&&<span>{event.subtitle}</span>}
    {event.detail&&<details><summary>Λεπτομέρειες</summary><p>{event.detail}</p></details>}
   </div>
   {event.sessionId&&<button className="timeline-open" onClick={()=>onOpenVisit(event.sessionId!)}>Άνοιγμα <ChevronRight size={14}/></button>}
  </article>)}</div></div>)}
 </section>;
}

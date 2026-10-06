"use client";
import PilotProfile from '@/components/PilotProfile';

import Link from "next/link";
import { useEffect, useState } from "react";
import { getDemoTesterId } from "@/lib/demo-tester";
import type { PatientBundle } from "@/lib/patients/demo-runtime";
import ClinicalSummary from "@/components/patients/ClinicalSummary";

import {
  Activity,
  Bell,
  Check,
  Clock,
  X,
  CalendarDays,
  ChevronRight,
  ClipboardCheck,
  CreditCard,
  FolderOpen,
  Home,
  Mic2,
  Menu,
  ListTodo,
  Search,
  Settings,
  ShieldCheck,
  Sparkles,
  Stethoscope,
  TestTube2,
  Users,
} from "lucide-react";
type OverviewEvent = {id:string;patient_id:string|null;patient_name:string;appointment_type:string;detail:string;scheduled_start:string;scheduled_end:string;readiness:string;readiness_label:string;status:string;payment_status:"unknown"|"pending"|"paid"|"not_applicable"};
type TodoTask = {id:string;tester_id:string;patient_id:string|null;source_session_id:string|null;title:string;due_at:string|null;status:"open"|"completed";completed_at:string|null;created_at:string;updated_at:string};
type OverviewPsychometric={id:string;patient_id:string;patient_name:string;instrument:string;status:string;score:number|null;completed_at:string|null;created_at:string;reviewed_at:string|null;item9_review:boolean;item9_reviewed_at:string|null};
const TIMEZONE="Europe/Athens";
const overviewDateKey=(value:Date)=>{const parts=new Intl.DateTimeFormat("en-GB",{timeZone:TIMEZONE,year:"numeric",month:"2-digit",day:"2-digit"}).formatToParts(value);const pick=(type:string)=>parts.find(part=>part.type===type)?.value||"";return pick("year")+"-"+pick("month")+"-"+pick("day")};
const overviewTime=(iso:string)=>new Intl.DateTimeFormat("el-GR",{timeZone:TIMEZONE,hour:"2-digit",minute:"2-digit"}).format(new Date(iso));
const overviewDayLabel=()=>new Intl.DateTimeFormat("el-GR",{timeZone:TIMEZONE,weekday:"long",day:"numeric",month:"long"}).format(new Date()).toLocaleUpperCase("el-GR");

const nav = [
  [Home, "Επισκόπηση", "/"],
  [CalendarDays, "Ημερολόγιο", "/calendar"],
  [Users, "Ασθενείς", "/patients"],
  [Activity, "Ψυχομετρικά τεστ", "/psychometrics"],
] as const;

export default function Page() {
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [mobileNav,setMobileNav]=useState(false);
  const [selectedPatientId,setSelectedPatientId]=useState<string|null>(null);
  const [schedule,setSchedule]=useState<OverviewEvent[]>([]);
  const [bundles,setBundles]=useState<Record<string,PatientBundle>>({});
  const [tasks,setTasks]=useState<TodoTask[]>([]);
  const [psychometricsForReview,setPsychometricsForReview]=useState<OverviewPsychometric[]>([]);
  const [widgetOpen,setWidgetOpen]=useState<"payments"|"psychometrics"|"todo"|null>(null);
  const [taskTitle,setTaskTitle]=useState("");
  const [widgetBusy,setWidgetBusy]=useState(false);
  const [widgetError,setWidgetError]=useState("");
  const [nowMs,setNowMs]=useState(()=>Date.now());
  const [overviewState,setOverviewState]=useState<'loading'|'ready'|'error'>('loading');
  const [overviewRetry,setOverviewRetry]=useState(0);
  useEffect(()=>{let cancelled=false;const tester=getDemoTesterId();setOverviewState('loading');void (async()=>{
    const response=await fetch("/api/overview?tester="+encodeURIComponent(tester),{cache:"no-store"});
    const data=await response.json();if(!response.ok)throw new Error('overview_unavailable');
    if(cancelled)return;
    const events=(data.events||[]) as OverviewEvent[];
    const todayKey=overviewDateKey(new Date());
    const todayPatientIds=events.filter(event=>overviewDateKey(new Date(event.scheduled_start))===todayKey&&event.status!=="cancelled"&&event.patient_id).map(event=>event.patient_id as string);
    setSchedule(events);setTasks((data.tasks||[]) as TodoTask[]);setPsychometricsForReview((data.psychometrics||[]) as OverviewPsychometric[]);
    setSelectedPatientId(current=>current&&todayPatientIds.includes(current)?current:todayPatientIds[0]||null);
    setOverviewState('ready');
    void fetch('/api/clinical/summary/backfill',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({tester}),keepalive:true}).catch(()=>{});
  })().catch(()=>{if(!cancelled)setOverviewState('error')});return()=>{cancelled=true}},[overviewRetry]);
  useEffect(()=>{if(!selectedPatientId)return;let cancelled=false;const controller=new AbortController();const load=async()=>{try{const tester=getDemoTesterId();const r=await fetch("/api/patients/demo/runtime?tester="+encodeURIComponent(tester)+"&patient="+encodeURIComponent(selectedPatientId),{cache:"no-store",signal:controller.signal});const d=await r.json();if(r.ok&&d.bundle&&!cancelled)setBundles(current=>({...current,[selectedPatientId]:d.bundle as PatientBundle}))}catch{}};void load();const refresh=()=>{if(document.visibilityState==='visible')void load()};window.addEventListener('focus',refresh);return()=>{cancelled=true;controller.abort();window.removeEventListener('focus',refresh)}},[selectedPatientId]);
  useEffect(()=>{const timer=window.setInterval(()=>setNowMs(Date.now()),30_000);return()=>window.clearInterval(timer)},[]);
  const today=overviewDateKey(new Date());
  const todaySchedule=schedule.filter(event=>overviewDateKey(new Date(event.scheduled_start))===today&&event.status!=="cancelled");

  const selectedBundle=selectedPatientId?bundles[selectedPatientId]||null:null;

  const remainingToday=todaySchedule.filter(event=>event.status==="scheduled"&&new Date(event.scheduled_end).getTime()>nowMs);
  const pendingPayments=schedule.filter(event=>event.status!=="cancelled"&&event.payment_status==="pending");
  const openTasks=tasks.filter(task=>task.status==="open");

  async function markPaymentPaid(event:OverviewEvent){
    if(widgetBusy)return;setWidgetBusy(true);setWidgetError("");
    try{
      const response=await fetch("/api/calendar/payment",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({tester:getDemoTesterId(),event_id:event.id,status:"paid"})});
      const data=await response.json();
      if(!response.ok||!data.event)throw new Error(data.error||"payment");
      setSchedule(current=>current.map(item=>item.id===event.id?{...item,...data.event}:item));
    }catch(error){setWidgetError(error instanceof Error?error.message:"Η πληρωμή δεν ενημερώθηκε.")}
    finally{setWidgetBusy(false)}
  }

  async function addTask(){
    const title=taskTitle.trim();if(!title||widgetBusy)return;setWidgetBusy(true);setWidgetError("");
    try{
      const response=await fetch("/api/tasks",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({tester:getDemoTesterId(),action:"create",title})});
      const data=await response.json();if(!response.ok||!data.task)throw new Error(data.error||"task");
      setTasks(current=>[data.task as TodoTask,...current]);setTaskTitle("");
    }catch(error){setWidgetError(error instanceof Error?error.message:"Η εργασία δεν αποθηκεύτηκε.")}
    finally{setWidgetBusy(false)}
  }

  async function completeTask(task:TodoTask){
    if(widgetBusy)return;setWidgetBusy(true);setWidgetError("");
    try{
      const response=await fetch("/api/tasks",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({tester:getDemoTesterId(),action:"set_status",id:task.id,status:"completed"})});
      const data=await response.json();if(!response.ok||!data.task)throw new Error(data.error||"task");
      setTasks(current=>current.map(item=>item.id===task.id?data.task as TodoTask:item));
    }catch(error){setWidgetError(error instanceof Error?error.message:"Η εργασία δεν ενημερώθηκε.")}
    finally{setWidgetBusy(false)}
  }

  return (
    <main className="app-shell">
      <aside className={mobileNav?"sidebar mobile-open":"sidebar"}><button className="mobile-nav-close" onClick={()=>setMobileNav(false)} aria-label="Κλείσιμο μενού"><X size={20}/></button>
        <div className="brand">
          <div className="brand-mark">Ψ</div>
          <div className="brand-copy"><div className="brand-sub">Για μια οργανωμένη κλινική πράξη</div></div>
        </div>

        <nav className="nav">
          {nav.map(([Icon,label,href])=><Link href={href} className={href==="/"?"nav-item active":"nav-item"} key={label}><Icon size={19}/><span>{label}</span></Link>)}
        </nav>

      </aside>
      {mobileNav&&<button className="mobile-nav-backdrop" aria-label="Κλείσιμο μενού" onClick={()=>setMobileNav(false)}/>}
      <section className="workspace">
        <header className="topbar"><button className="mobile-menu-button" onClick={()=>setMobileNav(true)} aria-label="Άνοιγμα μενού"><Menu size={21}/></button>
          <div className="search"><span>Ψ · δοκιμαστικός κλινικός χώρος</span></div>
          <PilotProfile/>
        </header>

        <div className="content">
          <div className="page-heading">
            <div>
              <p className="eyebrow">{overviewDayLabel()}</p>
              <h1>Η ημέρα σας, οργανωμένη</h1>
              <p>Όλα όσα χρειάζεστε για μια όμορφη και παραγωγική ημέρα.</p>
            </div>
            <button className="primary ghost" onClick={()=>setCalendarOpen(true)}><CalendarDays size={18} /> Πρόγραμμα ημέρας</button>
          </div>

          {overviewState==='error'&&<div className="record-state error" role="alert">Δεν φορτώθηκαν τα σημερινά δεδομένα. Δεν εμφανίζονται μηδενικές τιμές ως πραγματικό πρόγραμμα. <button onClick={()=>setOverviewRetry(n=>n+1)}>Δοκιμή ξανά</button></div>}
          <section className="metric-grid">
            <Metric icon={<CalendarDays />} label="Ραντεβού σήμερα" value={overviewState==='ready'?String(remainingToday.length):'—'} note={overviewState==='loading'?'Φόρτωση…':overviewState==='error'?'Δεν φορτώθηκε':remainingToday.length?"Απομένουν σήμερα":"Ολοκληρώθηκε το σημερινό πρόγραμμα"} tone="sage" />
            <TodoMetric
              tasks={overviewState==='ready'?openTasks:[]}
              value={overviewState==='ready'?String(openTasks.length):'—'}
              loading={overviewState==='loading'}
              error={overviewState==='error'}
              busy={widgetBusy}
              onOpen={()=>{setWidgetError("");setWidgetOpen("todo")}}
              onComplete={completeTask}
            />
            <Metric icon={<TestTube2 />} label="Ψυχομετρικά" value={overviewState==='ready'?String(psychometricsForReview.length):'—'} note={overviewState==='loading'?'Φόρτωση…':overviewState==='error'?'Δεν φορτώθηκε':'Νέα για έλεγχο'} tone="gold" onClick={()=>{setWidgetError("");setWidgetOpen("psychometrics")}} />
            <Metric icon={<CreditCard />} label="Πληρωμές" value={overviewState==='ready'?String(pendingPayments.length):'—'} note={overviewState==='loading'?'Φόρτωση…':overviewState==='error'?'Δεν φορτώθηκε':'Εκκρεμείς πληρωμές'} tone="blue" onClick={()=>{setWidgetError("");setWidgetOpen("payments")}} />
          </section>

          <section className={todaySchedule.length&&selectedBundle?"main-grid":"main-grid single"}>
            <div className="card sessions">
              <span className="kicker sessions-title">ΠΡΟΓΡΑΜΜΑ ΗΜΕΡΑΣ</span>
              {overviewState==='loading'?<div className="agenda-empty-state">Φόρτωση προγράμματος…</div>:overviewState==='error'?<div className="agenda-empty-state">Το πρόγραμμα δεν είναι προσωρινά διαθέσιμο.</div>:todaySchedule.length?todaySchedule.map(event => {
                const selectable=Boolean(event.patient_id&&bundles[event.patient_id]);
                return <div className={selectedPatientId === event.patient_id ? "session-row selected-patient" : "session-row"} key={event.id}>
                  <div className="time">{overviewTime(event.scheduled_start)}</div>
                  <div className="patient-avatar">{event.patient_name[0]}</div>
                  <div className="session-info">
                    <div className="patient-name-line"><button className={selectedPatientId === event.patient_id ? "patient-name selected" : "patient-name"} disabled={!selectable} onClick={()=>selectable&&setSelectedPatientId(event.patient_id)}>{event.patient_name}</button><span className={event.appointment_type==="initial_assessment"?"visit-type-badge new":"visit-type-badge"}>{event.appointment_type==="initial_assessment"?"Νέος":"Follow-up"}</span></div>
                    <span>{event.detail||event.readiness_label}</span>
                  </div>

                  {event.patient_id?<Link href={"/patients/demo/"+event.patient_id+"?appointment="+event.id} className="folder-icon-button" aria-label={"Άνοιγμα φακέλου "+event.patient_name} title="Άνοιγμα φακέλου"><FolderOpen size={22}/></Link>:<Link href="/patients" className="folder-icon-button" aria-label="Άνοιγμα ασθενών" title="Άνοιγμα ασθενών"><FolderOpen size={22}/></Link>}
                </div>
              }):<div className="agenda-empty-state">Δεν υπάρχουν ραντεβού σήμερα.</div>}
            </div>

            {todaySchedule.length>0&&selectedBundle&&<div className="card ai-brief" key={selectedPatientId||"none"}>
              <div className="card-head"><span className="status-dot">{selectedBundle.patient.first_name+' '+selectedBundle.patient.last_name}</span></div>
              <ClinicalSummary compact bundle={selectedBundle} onSessions={id=>{window.location.href='/patients/demo/'+selectedBundle.patient.id+'?tab=sessions'+(id?'&session='+id:'')}} onMedications={()=>{window.location.href='/patients/demo/'+selectedBundle.patient.id+'?tab=medications'}} onPsychometrics={()=>{window.location.href='/patients/demo/'+selectedBundle.patient.id+'?tab=psychometrics'}} onHistory={()=>{window.location.href='/patients/demo/'+selectedBundle.patient.id+'?tab=history'}}/>
            </div>}
          </section>

        </div>
      </section>

      {calendarOpen && <div className="calendar-overlay" onClick={()=>setCalendarOpen(false)}>
        <section className="calendar-panel" onClick={e=>e.stopPropagation()}>
          <div className="calendar-panel-head">
            <div><span className="kicker">ΠΡΟΓΡΑΜΜΑ ΗΜΕΡΑΣ</span><h2>{overviewDayLabel()}</h2><p>Τα ίδια αποθηκευμένα ραντεβού που εμφανίζονται στο ημερολόγιο.</p></div>
            <button className="calendar-close" onClick={()=>setCalendarOpen(false)} aria-label="Κλείσιμο"><X size={20}/></button>
          </div>

          <div className="calendar-runtime-link"><CalendarDays size={15}/><span>Η προβολή χρησιμοποιεί το κοινό calendar state.</span><Link href="/calendar" onClick={()=>setCalendarOpen(false)}>Πλήρες ημερολόγιο</Link></div>

          <div className="calendar-body">
            <div className="calendar-agenda">
              <div className="agenda-title"><div><h3>Σήμερα</h3><span>{todaySchedule.length} συνεδρίες · persistent demo</span></div><div className="calendar-head-actions"><Link href="/calendar?voice=1" className="voice-calendar-button" onClick={()=>setCalendarOpen(false)}><Mic2 size={16}/> Φωνητική εντολή</Link><Link href="/calendar" className="add-appointment" onClick={()=>setCalendarOpen(false)}>+ Νέο ραντεβού</Link></div></div>
              {todaySchedule.length?todaySchedule.map(event=><div className="agenda-event" key={event.id}>
                <div className="agenda-time"><strong>{overviewTime(event.scheduled_start)}</strong><span>{Math.round((new Date(event.scheduled_end).getTime()-new Date(event.scheduled_start).getTime())/60000)}′</span></div>
                <div className="agenda-line"></div>
                <div className="agenda-info"><strong>{event.patient_name}</strong><span>{event.detail||event.readiness_label}</span><small><Clock size={13}/> {overviewTime(event.scheduled_start)}–{overviewTime(event.scheduled_end)}</small></div>
                {event.patient_id&&<Link href={"/patients/demo/"+event.patient_id+"?appointment="+event.id} className="folder-icon-button" aria-label={"Άνοιγμα φακέλου "+event.patient_name} title="Άνοιγμα φακέλου" onClick={()=>setCalendarOpen(false)}><FolderOpen size={20}/></Link>}
              </div>):<div className="agenda-empty-state">Δεν υπάρχουν ραντεβού σήμερα.</div>}
            </div>

            <aside className="calendar-integrations">
              <span className="kicker">PILOT</span>
              <h3>Χρησιμοποιήστε το ημερολόγιο του Ψ</h3>
              <p>Οι εξωτερικές συνδέσεις ημερολογίου δεν είναι μέρος αυτής της δοκιμής, ώστε κάθε ενέργεια που βλέπετε εδώ να είναι πραγματικά λειτουργική.</p>
              <div className="integration-note"><Check size={15}/><span>Δημιουργία, μετακίνηση, ακύρωση και φωνητικές εντολές λειτουργούν στο κοινό demo calendar.</span></div>
            </aside>
          </div>
        </section>
      </div>}

      {widgetOpen&&<div className="dashboard-widget-overlay" onClick={()=>setWidgetOpen(null)}>
        <section className="dashboard-widget-sheet" role="dialog" aria-modal="true" aria-label={widgetOpen==="payments"?"Πληρωμές":widgetOpen==="psychometrics"?"Ψυχομετρικά":"To do"} onClick={e=>e.stopPropagation()}>
          <header className="dashboard-widget-head">
            <div><span className="kicker">ΑΡΧΙΚΗ</span><h2>{widgetOpen==="payments"?"Πληρωμές":widgetOpen==="psychometrics"?"Ψυχομετρικά":"To do"}</h2></div>
            <button onClick={()=>setWidgetOpen(null)} aria-label="Κλείσιμο"><X size={18}/></button>
          </header>
          {widgetError&&<div className="save-state error" role="alert">{widgetError}</div>}

          {widgetOpen==="payments"&&<div className="dashboard-widget-list">
            {pendingPayments.length?pendingPayments.map(event=><div className="dashboard-widget-row" key={event.id}>
              <div><strong>{event.patient_name}</strong><span>{new Intl.DateTimeFormat("el-GR",{timeZone:TIMEZONE,day:"numeric",month:"short"}).format(new Date(event.scheduled_start))} · {overviewTime(event.scheduled_start)}</span></div>
              <button disabled={widgetBusy} onClick={()=>void markPaymentPaid(event)}><span>Πληρώθηκε;</span><Check size={15}/></button>
            </div>):<div className="dashboard-widget-empty">Δεν υπάρχουν εκκρεμείς πληρωμές.</div>}
          </div>}

          {widgetOpen==="psychometrics"&&<div className="dashboard-widget-list">
            {psychometricsForReview.length?psychometricsForReview.map(assessment=><div className="dashboard-widget-row" key={assessment.id}>
              <div><strong>{assessment.patient_name} · {assessment.instrument}</strong><span>{assessment.completed_at?new Intl.DateTimeFormat("el-GR",{timeZone:TIMEZONE,day:"numeric",month:"short",hour:"2-digit",minute:"2-digit"}).format(new Date(assessment.completed_at)):"Συμπληρώθηκε"}{assessment.score!==null?" · score "+assessment.score:""}</span></div>
              <Link href={"/patients/demo/"+assessment.patient_id+"?tab=psychometrics"}>Έλεγχος <ChevronRight size={15}/></Link>
            </div>):<div className="dashboard-widget-empty">Δεν υπάρχουν νέα ψυχομετρικά για έλεγχο.</div>}
          </div>}

          {widgetOpen==="todo"&&<>
            <div className="todo-compose"><input value={taskTitle} onChange={e=>setTaskTitle(e.target.value)} onKeyDown={e=>{if(e.key==="Enter")void addTask()}} placeholder="Τι χρειάζεται να κάνεις;" maxLength={240}/><button disabled={widgetBusy||!taskTitle.trim()} onClick={()=>void addTask()}>Προσθήκη</button></div>
            <div className="dashboard-widget-list">
              {openTasks.length?openTasks.map(task=><div className="dashboard-widget-row todo-row" key={task.id}>
                <div><strong>{task.title}</strong>{task.due_at&&<span>{new Intl.DateTimeFormat("el-GR",{timeZone:TIMEZONE,day:"numeric",month:"short",hour:"2-digit",minute:"2-digit"}).format(new Date(task.due_at))}</span>}</div>
                {task.source_session_id&&task.patient_id?<Link className="todo-done" href={"/patients/demo/"+task.patient_id+"?tab=sessions&session="+task.source_session_id} aria-label={"Συνέχεια "+task.title}><ChevronRight size={16}/></Link>:<button className="todo-done" disabled={widgetBusy} onClick={()=>void completeTask(task)} aria-label={"Ολοκλήρωση "+task.title}><Check size={16}/></button>}
              </div>):<div className="dashboard-widget-empty">Δεν υπάρχουν ανοιχτές εργασίες.</div>}
            </div>
          </>}
        </section>
      </div>}
    </main>
  );
}

function TodoMetric({tasks,value,loading,error,onOpen}:{tasks:TodoTask[];value:string;loading:boolean;error:boolean;busy:boolean;onOpen:()=>void;onComplete:(task:TodoTask)=>Promise<void>}){
  const note=loading?'Φόρτωση…':error?'Δεν φορτώθηκε':tasks.length?(tasks.length===1?'1 ανοιχτή εργασία':tasks.length+' ανοιχτές εργασίες'):'Δεν υπάρχουν ανοιχτές εργασίες';
  return <button type="button" className="metric rose metric-action" onClick={onOpen} aria-label="Άνοιγμα To do">
    <div className="metric-icon"><ListTodo size={22}/></div><span>To do</span><strong>{value}</strong><small>{note}</small>
  </button>;
}

function Metric({ icon, label, value, note, tone, onClick }: { icon: React.ReactNode; label: string; value: string; note: string; tone: string; onClick?:()=>void }) {
  const content=<><div className="metric-icon">{icon}</div><span>{label}</span><strong>{value}</strong><small>{note}</small></>;
  return onClick?<button type="button" className={`metric ${tone} metric-action`} onClick={onClick}>{content}</button>:<div className={`metric ${tone}`}>{content}</div>;
}


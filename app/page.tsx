"use client";
import PilotProfile from '@/components/PilotProfile';

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { getDemoTesterId } from "@/lib/demo-tester";
import type { PatientBundle } from "@/lib/patients/demo-runtime";
import ClinicalSummary from "@/components/patients/ClinicalSummary";
import IntakeConflictResolver from '@/components/intake/IntakeConflictResolver';

import {
  Activity,
  BookOpen,
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
type OverviewPsychometric={id:string;patient_id:string;patient_name:string;instrument:string;status:string;score:number|null;completed_at:string|null;created_at:string;reviewed_at:string|null;item9_review:boolean;item9_reviewed_at:string|null;intake_id:string|null;provenance:string|null};
type OverviewIntake={id:string;patient_id:string|null;patient_name:string;tools:string[];channel:string;status:"submitted"|"conflict";submitted_at:string|null;created_at:string};
type ReviewSubmission={key:string;intake_id:string|null;patient_id:string|null;patient_name:string;tools:string[];channel:string;status:"ready"|"conflict";when:string;has_history:boolean;psychometrics:string[]};
const TIMEZONE="Europe/Athens";
const overviewDateKey=(value:Date)=>{const parts=new Intl.DateTimeFormat("en-GB",{timeZone:TIMEZONE,year:"numeric",month:"2-digit",day:"2-digit"}).formatToParts(value);const pick=(type:string)=>parts.find(part=>part.type===type)?.value||"";return pick("year")+"-"+pick("month")+"-"+pick("day")};
const overviewTime=(iso:string)=>new Intl.DateTimeFormat("el-GR",{timeZone:TIMEZONE,hour:"2-digit",minute:"2-digit"}).format(new Date(iso));
const overviewDayLabel=()=>new Intl.DateTimeFormat("el-GR",{timeZone:TIMEZONE,weekday:"long",day:"numeric",month:"long"}).format(new Date()).toLocaleUpperCase("el-GR");
const reviewChannelLabel=(channel:string,provenance="")=>["Tablet","Email","Έντυπο","Σύνδεσμος"].includes(channel)?channel:channel==="tablet"||provenance.includes("patient_intake:tablet")?"Tablet":channel==="email"||provenance.includes("patient_intake:email")?"Email":channel==="print"||channel==="scanned_paper"||provenance.includes("patient_intake:print")||provenance.includes("patient_intake:scanned_paper")?"Έντυπο":provenance.includes("patient_link")?"Σύνδεσμος":"Noima";
const reviewWhen=(iso:string)=>new Intl.DateTimeFormat("el-GR",{timeZone:TIMEZONE,day:"numeric",month:"short",hour:"2-digit",minute:"2-digit"}).format(new Date(iso));

const nav = [
  [Home, "Επισκόπηση", "/"],
  [CalendarDays, "Ημερολόγιο", "/calendar"],
  [Users, "Ασθενείς", "/patients"],
  [BookOpen, "Βιβλιοθήκη", "/psychometrics"],
] as const;

export default function Page() {
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [mobileNav,setMobileNav]=useState(false);
  const [selectedPatientId,setSelectedPatientId]=useState<string|null>(null);
  const [bundleFailure,setBundleFailure]=useState<string|null>(null);
  const [bundleRetry,setBundleRetry]=useState(0);
  const [schedule,setSchedule]=useState<OverviewEvent[]>([]);
  const [bundles,setBundles]=useState<Record<string,PatientBundle>>({});
  const [tasks,setTasks]=useState<TodoTask[]>([]);
  const [psychometricsForReview,setPsychometricsForReview]=useState<OverviewPsychometric[]>([]);
  const [intakesForReview,setIntakesForReview]=useState<OverviewIntake[]>([]);
  const [conflictIntake,setConflictIntake]=useState<string|null>(null);
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
    setSchedule(events);setTasks((data.tasks||[]) as TodoTask[]);setPsychometricsForReview((data.psychometrics||[]) as OverviewPsychometric[]);setIntakesForReview((data.intakes||[]) as OverviewIntake[]);
    setSelectedPatientId(current=>current&&todayPatientIds.includes(current)?current:todayPatientIds[0]||null);
    setOverviewState('ready');
    void fetch('/api/clinical/summary/backfill',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({tester}),keepalive:true}).catch(()=>{});
  })().catch(()=>{if(!cancelled)setOverviewState('error')});return()=>{cancelled=true}},[overviewRetry]);
  useEffect(()=>{if(!selectedPatientId)return;setBundleFailure(null);let cancelled=false;const controller=new AbortController();const load=async()=>{try{const tester=getDemoTesterId();const r=await fetch("/api/patients/demo/runtime?tester="+encodeURIComponent(tester)+"&patient="+encodeURIComponent(selectedPatientId),{cache:"no-store",signal:controller.signal});const d=await r.json();if(!r.ok||!d.bundle)throw new Error('bundle_unavailable');if(!cancelled){setBundles(current=>({...current,[selectedPatientId]:d.bundle as PatientBundle}));setBundleFailure(null)}}catch{if(!cancelled&&!controller.signal.aborted)setBundleFailure(selectedPatientId)}};void load();const refresh=()=>{if(document.visibilityState==='visible')void load()};window.addEventListener('focus',refresh);return()=>{cancelled=true;controller.abort();window.removeEventListener('focus',refresh)}},[selectedPatientId,bundleRetry]);
  useEffect(()=>{const timer=window.setInterval(()=>setNowMs(Date.now()),30_000);return()=>window.clearInterval(timer)},[]);
  const today=overviewDateKey(new Date());
  const todaySchedule=schedule.filter(event=>overviewDateKey(new Date(event.scheduled_start))===today&&event.status!=="cancelled");

  const selectedBundle=selectedPatientId?bundles[selectedPatientId]||null:null;

  const upcomingToday=todaySchedule.filter(event=>event.status==="scheduled"&&new Date(event.scheduled_start).getTime()>nowMs);
  const pendingPayments=schedule.filter(event=>event.status!=="cancelled"&&event.payment_status==="pending");
  const openTasks=tasks.filter(task=>task.status==="open");
  const reviewSubmissions=useMemo<ReviewSubmission[]>(()=>{
    const groups=new Map<string,ReviewSubmission>();
    const addTool=(group:ReviewSubmission,tool:string)=>{if(!group.tools.includes(tool))group.tools.push(tool);if(tool==="history")group.has_history=true;else if(!group.psychometrics.includes(tool))group.psychometrics.push(tool)};
    for(const intake of intakesForReview){
      const group:ReviewSubmission={key:"intake:"+intake.id,intake_id:intake.id,patient_id:intake.patient_id,patient_name:intake.patient_name,tools:[],channel:intake.channel,status:intake.status==="conflict"?"conflict":"ready",when:intake.submitted_at||intake.created_at,has_history:false,psychometrics:[]};
      intake.tools.forEach(tool=>addTool(group,tool));groups.set(group.key,group);
    }
    for(const assessment of psychometricsForReview){
      const key=assessment.intake_id?"intake:"+assessment.intake_id:"assessment:"+assessment.id;
      const existing=groups.get(key);
      const group=existing||{key,intake_id:assessment.intake_id,patient_id:assessment.patient_id,patient_name:assessment.patient_name,tools:[],channel:reviewChannelLabel("",assessment.provenance||""),status:"ready" as const,when:assessment.completed_at||assessment.created_at,has_history:false,psychometrics:[]};
      addTool(group,assessment.instrument);
      group.patient_id=group.patient_id||assessment.patient_id;
      group.patient_name=group.patient_name||assessment.patient_name;
      if(!existing)groups.set(key,group);
      if(Date.parse(assessment.completed_at||assessment.created_at)>Date.parse(group.when))group.when=assessment.completed_at||assessment.created_at;
    }
    return [...groups.values()].sort((a,b)=>Date.parse(b.when)-Date.parse(a.when));
  },[intakesForReview,psychometricsForReview]);

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
            <Metric icon={<CalendarDays />} label="Επόμενα ραντεβού σήμερα" value={overviewState==='ready'?String(upcomingToday.length):'—'} note={overviewState==='loading'?'Φόρτωση…':overviewState==='error'?'Δεν φορτώθηκε':upcomingToday.length?"Προγραμματισμένα για αργότερα":"Δεν υπάρχουν άλλα προγραμματισμένα ραντεβού σήμερα"} tone="sage" />
            <TodoMetric
              tasks={overviewState==='ready'?openTasks:[]}
              value={overviewState==='ready'?String(openTasks.length):'—'}
              loading={overviewState==='loading'}
              error={overviewState==='error'}
              busy={widgetBusy}
              onOpen={()=>{setWidgetError("");setWidgetOpen("todo")}}
              onComplete={completeTask}
            />
            <Metric icon={<TestTube2 />} label="Νέα για έλεγχο" value={overviewState==='ready'?String(reviewSubmissions.length):'—'} note={overviewState==='loading'?'Φόρτωση…':overviewState==='error'?'Δεν φορτώθηκε':reviewSubmissions.length?'Υποβολές ασθενών':'Δεν υπάρχουν νέες υποβολές'} tone="gold" onClick={()=>{setWidgetError("");setWidgetOpen("psychometrics")}} />
            <Metric icon={<CreditCard />} label="Πληρωμές" value={overviewState==='ready'?String(pendingPayments.length):'—'} note={overviewState==='loading'?'Φόρτωση…':overviewState==='error'?'Δεν φορτώθηκε':'Εκκρεμείς πληρωμές'} tone="blue" onClick={()=>{setWidgetError("");setWidgetOpen("payments")}} />
          </section>

          <section className={todaySchedule.length&&selectedPatientId?"main-grid":"main-grid single"}>
            <div className="card sessions">
              <span className="kicker sessions-title">ΠΡΟΓΡΑΜΜΑ ΗΜΕΡΑΣ</span>
              {overviewState==='loading'?<div className="agenda-empty-state">Φόρτωση προγράμματος…</div>:overviewState==='error'?<div className="agenda-empty-state">Το πρόγραμμα δεν είναι προσωρινά διαθέσιμο.</div>:todaySchedule.length?todaySchedule.map(event => {
                const selectable=Boolean(event.patient_id);
                return <div className={selectedPatientId === event.patient_id ? "session-row selected-patient" : "session-row"} key={event.id}>
                  <div className="time">{overviewTime(event.scheduled_start)}</div>
                  <div className="patient-avatar">{event.patient_name[0]}</div>
                  <div className="session-info">
                    <div className="patient-name-line"><button className={selectedPatientId === event.patient_id ? "patient-name selected" : "patient-name"} disabled={!selectable} onClick={()=>selectable&&setSelectedPatientId(event.patient_id)}>{event.patient_name}</button><span className={event.appointment_type==="initial_assessment"?"visit-type-badge new":"visit-type-badge"}>{event.appointment_type==="initial_assessment"?"Νέος":"Επανεξέταση"}</span></div>
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
            {todaySchedule.length>0&&selectedPatientId&&!selectedBundle&&<div className="card ai-brief" role="status">{bundleFailure===selectedPatientId?<><p>Η κλινική εικόνα δεν φορτώθηκε.</p><button onClick={()=>setBundleRetry(n=>n+1)}>Δοκιμή ξανά</button></>:<p>Φόρτωση κλινικής εικόνας…</p>}</div>}
          </section>

        </div>
      </section>

      {calendarOpen && <div className="calendar-overlay" onClick={()=>setCalendarOpen(false)}>
        <section className="calendar-panel" onClick={e=>e.stopPropagation()}>
          <div className="calendar-panel-head">
            <div><span className="kicker">ΠΡΟΓΡΑΜΜΑ ΗΜΕΡΑΣ</span><h2>{overviewDayLabel()}</h2><p>Τα ίδια αποθηκευμένα ραντεβού που εμφανίζονται στο ημερολόγιο.</p></div>
            <button className="calendar-close" onClick={()=>setCalendarOpen(false)} aria-label="Κλείσιμο"><X size={20}/></button>
          </div>

          <div className="calendar-runtime-link"><CalendarDays size={15}/><span>Η προβολή χρησιμοποιεί το ίδιο ημερολόγιο με την πλήρη προβολή.</span><Link href="/calendar" onClick={()=>setCalendarOpen(false)}>Πλήρες ημερολόγιο</Link></div>

          <div className="calendar-body">
            <div className="calendar-agenda">
              <div className="agenda-title"><div><h3>Σήμερα</h3><span>{todaySchedule.length} ραντεβού</span></div><div className="calendar-head-actions"><Link href="/calendar?voice=1" className="voice-calendar-button" onClick={()=>setCalendarOpen(false)}><Mic2 size={16}/> Φωνητική εντολή</Link><Link href="/calendar?new=1" className="add-appointment" onClick={()=>setCalendarOpen(false)}>+ Νέο ραντεβού</Link></div></div>
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
        <section className="dashboard-widget-sheet" role="dialog" aria-modal="true" aria-label={widgetOpen==="payments"?"Πληρωμές":widgetOpen==="psychometrics"?"Νέα για έλεγχο":"Εκκρεμότητες"} onClick={e=>e.stopPropagation()}>
          <header className="dashboard-widget-head">
            <div><span className="kicker">ΑΡΧΙΚΗ</span><h2>{widgetOpen==="payments"?"Πληρωμές":widgetOpen==="psychometrics"?"Νέα για έλεγχο":"Εκκρεμότητες"}</h2></div>
            <button onClick={()=>setWidgetOpen(null)} aria-label="Κλείσιμο"><X size={18}/></button>
          </header>
          {widgetError&&<div className="save-state error" role="alert">{widgetError}</div>}

          {widgetOpen==="payments"&&<div className="dashboard-widget-list">
            {pendingPayments.length?pendingPayments.map(event=><div className="dashboard-widget-row" key={event.id}>
              <div><strong>{event.patient_name}</strong><span>{new Intl.DateTimeFormat("el-GR",{timeZone:TIMEZONE,day:"numeric",month:"short"}).format(new Date(event.scheduled_start))} · {overviewTime(event.scheduled_start)}</span></div>
              <button disabled={widgetBusy} onClick={()=>void markPaymentPaid(event)}><span>Σήμανση ως πληρωμένο</span><Check size={15}/></button>
            </div>):<div className="dashboard-widget-empty">Δεν υπάρχουν εκκρεμείς πληρωμές.</div>}
          </div>}

          {widgetOpen==="psychometrics"&&<div className="dashboard-widget-list">
            {reviewSubmissions.length?reviewSubmissions.map(submission=><div className="dashboard-widget-row review-submission-row" key={submission.key}>
              <div><strong>{submission.patient_name||"Νέα συμπλήρωση"}</strong><span>{submission.tools.map(tool=>tool==="history"?"Αρχικό ιστορικό":tool).join(" · ")} · {reviewChannelLabel(submission.channel)} · {reviewWhen(submission.when)}</span>{submission.status==="conflict"&&<small>Χρειάζεται έλεγχο ταυτότητας πριν συνδεθεί σε φάκελο.</small>}</div>
              {submission.status==="conflict"&&submission.intake_id
                ?<button onClick={()=>setConflictIntake(submission.intake_id!)}>Έλεγχος <ChevronRight size={15}/></button>
                :submission.patient_id?<div className="review-row-actions">
                  {submission.has_history&&<Link href={"/patients/demo/"+submission.patient_id+"?tab=history"}>Ιστορικό</Link>}
                  {submission.psychometrics.length>0&&<Link href={"/patients/demo/"+submission.patient_id+"?tab=psychometrics"}>Ψυχομετρικά</Link>}
                 </div>:null}
            </div>):<div className="dashboard-widget-empty">Δεν υπάρχουν νέες υποβολές για έλεγχο.</div>}
          </div>}

          {widgetOpen==="todo"&&<>
            <div className="todo-compose"><input value={taskTitle} onChange={e=>setTaskTitle(e.target.value)} onKeyDown={e=>{if(e.key==="Enter")void addTask()}} placeholder="Τι χρειάζεται να κάνεις;" maxLength={240}/><button disabled={widgetBusy||!taskTitle.trim()} onClick={()=>void addTask()}>Προσθήκη</button></div>
            <div className="dashboard-widget-list">
              {openTasks.length?openTasks.map(task=><div className="dashboard-widget-row todo-row" key={task.id}>
                <div><strong>{task.title}</strong><span>{task.source_session_id?"Πρόχειρη καταγραφή":"Εργασία"}{task.due_at?" · "+new Intl.DateTimeFormat("el-GR",{timeZone:TIMEZONE,day:"numeric",month:"short",hour:"2-digit",minute:"2-digit"}).format(new Date(task.due_at)):""}</span></div>
                {task.source_session_id&&task.patient_id?<Link className="todo-done" href={"/patients/demo/"+task.patient_id+"?tab=sessions&session="+task.source_session_id} aria-label={"Συνέχεια "+task.title}><ChevronRight size={16}/></Link>:<button className="todo-done" disabled={widgetBusy} onClick={()=>void completeTask(task)} aria-label={"Ολοκλήρωση "+task.title}><Check size={16}/></button>}
              </div>):<div className="dashboard-widget-empty">Δεν υπάρχουν εκκρεμότητες.</div>}
            </div>
          </>}
        </section>
      </div>}
      {conflictIntake&&<IntakeConflictResolver intakeId={conflictIntake} onClose={()=>setConflictIntake(null)} onDone={()=>{setConflictIntake(null);setOverviewRetry(x=>x+1)}}/>}
    </main>
  );
}

function TodoMetric({tasks,value,loading,error,onOpen}:{tasks:TodoTask[];value:string;loading:boolean;error:boolean;busy:boolean;onOpen:()=>void;onComplete:(task:TodoTask)=>Promise<void>}){
  const total=tasks.length;
  const note=loading?'Φόρτωση…':error?'Δεν φορτώθηκε':total?(total===1?'1 εκκρεμότητα':total+' εκκρεμότητες'):'Δεν υπάρχουν ανοιχτές εργασίες';
  return <button type="button" className="metric rose metric-action" onClick={onOpen} aria-label="Άνοιγμα εκκρεμοτήτων">
    <div className="metric-icon"><ListTodo size={22}/></div><span>Εκκρεμότητες</span><strong>{value}</strong><small>{note}</small>
  </button>;
}

function Metric({ icon, label, value, note, tone, onClick }: { icon: React.ReactNode; label: string; value: string; note: string; tone: string; onClick?:()=>void }) {
  const content=<><div className="metric-icon">{icon}</div><span>{label}</span><strong>{value}</strong><small>{note}</small></>;
  return onClick?<button type="button" className={`metric ${tone} metric-action`} onClick={onClick}>{content}</button>:<div className={`metric ${tone}`}>{content}</div>;
}


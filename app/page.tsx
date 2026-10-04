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
  FolderOpen,
  Home,
  Mic2,
  Menu,
  Search,
  Settings,
  ShieldCheck,
  Sparkles,
  Stethoscope,
  TestTube2,
  Users,
} from "lucide-react";
type OverviewEvent = {id:string;patient_id:string|null;patient_name:string;appointment_type:string;detail:string;scheduled_start:string;scheduled_end:string;readiness:string;readiness_label:string;status:string};
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
  useEffect(()=>{let cancelled=false;const tester=getDemoTesterId();void (async()=>{
    const [calendarResponse,patientsResponse]=await Promise.all([
      fetch("/api/calendar/events?tester="+encodeURIComponent(tester),{cache:"no-store"}),
      fetch("/api/patients/demo/runtime?tester="+encodeURIComponent(tester),{cache:"no-store"}),
    ]);
    const calendarData=await calendarResponse.json();const patientData=await patientsResponse.json();
    if(!calendarResponse.ok||!patientsResponse.ok||cancelled)return;
    const events=(calendarData.events||[]) as OverviewEvent[];
    const ids=(patientData.patients||[]).map((p:{id:string})=>p.id) as string[];
    const loaded=await Promise.all(ids.map(async id=>{try{const r=await fetch("/api/patients/demo/runtime?tester="+encodeURIComponent(tester)+"&patient="+encodeURIComponent(id),{cache:"no-store"});const d=await r.json();return r.ok?[id,d.bundle as PatientBundle] as const:null}catch{return null}}));
    if(cancelled)return;
    setSchedule(events);setBundles(Object.fromEntries(loaded.filter(Boolean) as [string,PatientBundle][]));setSelectedPatientId(current=>current||events.find(e=>e.patient_id)?.patient_id||ids[0]||null);
  })().catch(()=>{});return()=>{cancelled=true}},[]);
  const today=overviewDateKey(new Date());
  const todaySchedule=schedule.filter(event=>overviewDateKey(new Date(event.scheduled_start))===today&&event.status!=="cancelled");

  const selectedBundle=selectedPatientId?bundles[selectedPatientId]||null:null;

  const loadedBundles=Object.values(bundles);
  const pendingProposals=loadedBundles.reduce((n,b)=>n+b.proposals.filter(p=>p.status==="proposal").length,0);
  const pendingPsychometrics=loadedBundles.reduce((n,b)=>n+b.assessments.filter(a=>(a.status==="assigned"||a.status==="opened")&&new Date(a.expires_at)>new Date()).length,0);
  const item9Reviews=loadedBundles.reduce((n,b)=>n+b.assessments.filter(a=>a.status==="completed"&&a.item9_review&&!a.item9_reviewed_at).length,0);

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

          <section className="metric-grid">
            <Metric icon={<CalendarDays />} label="Συνεδρίες σήμερα" value={String(todaySchedule.length)} note={todaySchedule.length?"Από το κοινό ημερολόγιο":"Χωρίς ραντεβού σήμερα"} tone="sage" />
            <Metric icon={<ClipboardCheck />} label="Σημειώσεις για έγκριση" value={String(pendingProposals)} note="Πραγματικές εκκρεμείς προτάσεις" tone="blue" />
            <Metric icon={<TestTube2 />} label="Εκκρεμή ψυχομετρικά" value={String(pendingPsychometrics)} note="Assigned ή opened" tone="gold" />
            <Metric icon={<ShieldCheck />} label="PHQ-9 item 9 για έλεγχο" value={String(item9Reviews)} note="Από ολοκληρωμένα τεστ" tone="rose" />
          </section>

          <section className="main-grid">
            <div className="card sessions">
              <span className="kicker sessions-title">ΠΡΟΓΡΑΜΜΑ ΗΜΕΡΑΣ</span>
              {todaySchedule.length?todaySchedule.map(event => {
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

            <div className="card ai-brief" key={selectedPatientId||"none"}>
              <div className="card-head"><span className="status-dot">{selectedBundle?selectedBundle.patient.first_name+' '+selectedBundle.patient.last_name:'Χωρίς επιλογή'}</span></div>
              {selectedBundle?<ClinicalSummary compact bundle={selectedBundle} onSessions={id=>{window.location.href='/patients/demo/'+selectedBundle.patient.id+'?tab=sessions'+(id?'&session='+id:'')}} onMedications={()=>{window.location.href='/patients/demo/'+selectedBundle.patient.id+'?tab=medications'}} onPsychometrics={()=>{window.location.href='/patients/demo/'+selectedBundle.patient.id+'?tab=psychometrics'}} onHistory={()=>{window.location.href='/patients/demo/'+selectedBundle.patient.id+'?tab=history'}}/>:<p>Επιλέξτε ασθενή για να εμφανιστούν οι καταγραφές του φακέλου.</p>}
            </div>
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
    </main>
  );
}

function Metric({ icon, label, value, note, tone }: { icon: React.ReactNode; label: string; value: string; note: string; tone: string }) {
  return <div className={`metric ${tone}`}><div className="metric-icon">{icon}</div><span>{label}</span><strong>{value}</strong><small>{note}</small></div>;
}


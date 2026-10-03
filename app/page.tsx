"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { getDemoTesterId } from "@/lib/demo-tester";
import type { PatientBundle } from "@/lib/patients/demo-runtime";
import { documentedChanges } from "@/lib/clinical/summary";

import {
  Activity,
  Bell,
  Brain,
  Check,
  Clock,
  X,
  CalendarDays,
  ChevronRight,
  ClipboardCheck,
  FileText,
  FolderOpen,
  HeartPulse,
  Home,
  Mic2,
  Menu,
  Pill,
  Search,
  Settings,
  ShieldCheck,
  Sparkles,
  Stethoscope,
  TestTube2,
  Users,
} from "lucide-react";
type OverviewEvent = {id:string;patient_id:string|null;patient_name:string;appointment_type:string;detail:string;scheduled_start:string;scheduled_end:string;readiness:string;readiness_label:string};
type Brief = {kicker:string;changed:string[];today:string[];risk:string};

function clip(value:string,max=145){const clean=value.replace(/\s+/g," ").trim();return clean.length>max?clean.slice(0,max-1)+"…":clean}
function buildBrief(bundle:PatientBundle|null,event?:OverviewEvent):Brief{
 if(!bundle)return {kicker:event?"ΕΠΟΜΕΝΗ ΣΥΝΕΔΡΙΑ":"ΚΛΙΝΙΚΟΣ ΦΑΚΕΛΟΣ",changed:["Δεν υπάρχουν ακόμη διαθέσιμα κλινικά δεδομένα για σύνοψη."],today:["Ανοίξτε τον φάκελο για κλινική αξιολόγηση."],risk:"Δεν υπάρχει διαθέσιμη εκτίμηση κινδύνου."};
 const completed=[...bundle.sessions].filter(x=>x.status==="completed").sort((a,b)=>Date.parse(b.completed_at||"")-Date.parse(a.completed_at||""));
 const latest=completed[0];
 const changes=documentedChanges(bundle).slice(0,3).map(x=>x.label+": "+clip(x.after,105));
 const latestAssessment=[...bundle.assessments].filter(x=>x.status==="completed"&&x.score!==null).sort((a,b)=>Date.parse(b.completed_at||b.created_at)-Date.parse(a.completed_at||a.created_at))[0];
 if(latestAssessment)changes.push(latestAssessment.instrument+": "+latestAssessment.score);
 const latestSide=bundle.medicationSideEffects[0];
 if(latestSide)changes.push("Παρενέργεια: "+clip(latestSide.effect_text+(latestSide.impact?" · "+latestSide.impact:""),105));
 if(!changes.length&&latest){
  const assessment=bundle.sections.find(x=>x.session_id===latest.id&&x.section_key==="assessment")?.content;
  if(assessment)changes.push(clip(assessment));
 }
 if(!changes.length&&bundle.patient.chief_complaint)changes.push("Λόγος προσέλευσης: "+clip(bundle.patient.chief_complaint));
 const plan=latest&&bundle.sections.find(x=>x.session_id===latest.id&&x.section_key==="plan")?.content;
 const review=latest&&bundle.sections.find(x=>x.session_id===latest.id&&x.section_key==="review")?.content;
 const today=[plan&&"Πλάνο: "+clip(plan,105),review&&"Επανεκτίμηση: "+clip(review,105)].filter(Boolean) as string[];
 if(latestSide&&!today.some(x=>x.includes("Παρενέργεια")))today.push("Επανέλεγχος παρενέργειας: "+clip(latestSide.effect_text,90));
 const risk=latest?bundle.risks.find(x=>x.session_id===latest.id):undefined;
 const riskText=!risk?"Δεν υπάρχει δομημένη εκτίμηση κινδύνου στην τελευταία συνεδρία.":risk.suicidal_ideation==="negative"?"Τελευταία εκτίμηση: αρνητικός αυτοκτονικός ιδεασμός.":risk.suicidal_ideation==="positive"?"Τελευταία εκτίμηση: θετικός αυτοκτονικός ιδεασμός — απαιτείται κλινική επανεκτίμηση.":"Τελευταία εκτίμηση αυτοκτονικού ιδεασμού: "+(risk.suicidal_ideation==="unknown"?"άγνωστο.":"δεν διερευνήθηκε.");
 return {kicker:event?"ΕΠΟΜΕΝΗ ΣΥΝΕΔΡΙΑ":"ΚΛΙΝΙΚΟΣ ΦΑΚΕΛΟΣ",changed:changes.slice(0,4).length?changes.slice(0,4):["Δεν υπάρχει ακόμη τεκμηριωμένη μεταβολή μεταξύ συνεδριών."],today:today.length?today.slice(0,3):["Δεν έχουν καταγραφεί ειδικά επόμενα βήματα."],risk:riskText};
}

 = {id:string;patient_id:string|null;patient_name:string;appointment_type:string;detail:string;scheduled_start:string;scheduled_end:string;readiness:string;readiness_label:string};
const TIMEZONE="Europe/Athens";
const overviewDateKey=(value:Date)=>{const parts=new Intl.DateTimeFormat("en-GB",{timeZone:TIMEZONE,year:"numeric",month:"2-digit",day:"2-digit"}).formatToParts(value);const pick=(type:string)=>parts.find(part=>part.type===type)?.value||"";return pick("year")+"-"+pick("month")+"-"+pick("day")};
const overviewTime=(iso:string)=>new Intl.DateTimeFormat("el-GR",{timeZone:TIMEZONE,hour:"2-digit",minute:"2-digit"}).format(new Date(iso));
const overviewDayLabel=()=>new Intl.DateTimeFormat("el-GR",{timeZone:TIMEZONE,weekday:"long",day:"numeric",month:"long"}).format(new Date()).toLocaleUpperCase("el-GR");

const nav = [
  [Home, "Επισκόπηση", true],
  [CalendarDays, "Ημερολόγιο", false],
  [Users, "Ασθενείς", false],
  [Activity, "Ψυχομετρικά τεστ", false],
  [Stethoscope, "Συνεργασία", false],
  [Settings, "Ρυθμίσεις", false],
] as const;

export default function Page() {
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [mobileNav,setMobileNav]=useState(false);
  const [selectedPatientId,setSelectedPatientId]=useState<string|null>(null);
  const [schedule,setSchedule]=useState<OverviewEvent[]>([]);
  const [bundles,setBundles]=useState<Record<string,PatientBundle>>({});
  useEffect(()=>{const tester=getDemoTesterId();fetch("/api/calendar/events?tester="+encodeURIComponent(tester),{cache:"no-store"}).then(async response=>{const data=await response.json();if(!response.ok)return;const events=(data.events||[]) as OverviewEvent[];setSchedule(events);const ids=[...new Set(events.map(e=>e.patient_id).filter(Boolean))] as string[];const loaded=await Promise.all(ids.map(async id=>{try{const r=await fetch("/api/patients/demo/runtime?tester="+encodeURIComponent(tester)+"&patient="+encodeURIComponent(id),{cache:"no-store"});const d=await r.json();return r.ok?[id,d.bundle as PatientBundle] as const:null}catch{return null}}));setBundles(Object.fromEntries(loaded.filter(Boolean) as [string,PatientBundle][]));setSelectedPatientId(current=>current||events.find(e=>e.patient_id)?.patient_id||null)}).catch(()=>{})},[]);
  const today=overviewDateKey(new Date());
  const todaySchedule=schedule.filter(event=>overviewDateKey(new Date(event.scheduled_start))===today);
  const selectedEvent=todaySchedule.find(e=>e.patient_id===selectedPatientId)||schedule.find(e=>e.patient_id===selectedPatientId);
  const selectedBundle=selectedPatientId?bundles[selectedPatientId]||null:null;
  const brief=buildBrief(selectedBundle,selectedEvent);
  const loadedBundles=Object.values(bundles);
  const pendingProposals=loadedBundles.reduce((n,b)=>n+b.proposals.filter(p=>p.status==="proposal").length,0);
  const pendingPsychometrics=loadedBundles.reduce((n,b)=>n+b.assessments.filter(a=>a.status==="assigned"||a.status==="opened").length,0);
  const item9Reviews=loadedBundles.filter(b=>b.assessments.some(a=>a.status==="completed"&&a.item9_review)).length;
  return (
    <main className="app-shell">
      <aside className={mobileNav?"sidebar mobile-open":"sidebar"}><button className="mobile-nav-close" onClick={()=>setMobileNav(false)} aria-label="Κλείσιμο μενού"><X size={20}/></button>
        <div className="brand">
          <div className="brand-mark">Ψ</div>
          <div className="brand-copy"><div className="brand-sub">Για μια οργανωμένη κλινική πράξη</div></div>
        </div>

        <nav className="nav">
          {nav.map(([Icon, label, active]) => label === "Ασθενείς" ? (
            <Link href="/patients" className="nav-item" key={label}><Icon size={19}/><span>{label}</span></Link>
          ) : label === "Ημερολόγιο" ? (
            <Link href="/calendar" className="nav-item" key={label}><Icon size={19}/><span>{label}</span></Link>
          ) : label === "Ψυχομετρικά τεστ" ? (
            <Link href="/psychometrics" className="nav-item" key={label}><Icon size={19}/><span>{label}</span></Link>
          ) : (
            <button className={active ? "nav-item active" : "nav-item"} key={label}><Icon size={19}/><span>{label}</span></button>
          ))}
        </nav>

      </aside>
      {mobileNav&&<button className="mobile-nav-backdrop" aria-label="Κλείσιμο μενού" onClick={()=>setMobileNav(false)}/>}
      <section className="workspace">
        <header className="topbar"><button className="mobile-menu-button" onClick={()=>setMobileNav(true)} aria-label="Άνοιγμα μενού"><Menu size={21}/></button>
          <div className="search">
            <Search size={18} />
            <span>Αναζήτηση ασθενή, σημείωσης, φαρμάκου ή τεστ...</span>
          </div>
          <div className="profile">
            <Bell size={20} />
            <div className="avatar">ΚΠ</div>
            <div>
              <strong>Δρ. Κατερίνα Παπαδάκη</strong>
              <span>Ψυχίατρος</span>
            </div>
          </div>
        </header>

        <div className="content">
          <div className="page-heading">
            <div>
              <p className="eyebrow">{overviewDayLabel()}</p>
              <h1>Καλημέρα, Δρ. Παπαδάκη</h1>
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
                  {event.readiness==="waiting"&&<span className="badge">{event.readiness_label}</span>}
                  {event.patient_id?<Link href={"/patients/demo/"+event.patient_id} className="small-button link-button folder-button"><FolderOpen size={16}/> Φάκελος</Link>:<Link href="/patients" className="small-button link-button folder-button"><FolderOpen size={16}/> Ασθενείς</Link>}
                </div>
              }):<div className="agenda-empty-state">Δεν υπάρχουν ραντεβού σήμερα.</div>}
            </div>

            <div className="card ai-brief" key={selectedPatientId||"none"}>
              <div className="card-head">
                <div>
                  <span className="kicker">{brief.kicker}</span>
                  <h2><Sparkles size={19} /> Σύνοψη πριν τη συνεδρία</h2>
                </div>
                <span className="status-dot">{selectedBundle?(selectedBundle.patient.first_name+" "+selectedBundle.patient.last_name):"Χωρίς επιλογή"}</span>
              </div>

              <div className="brief-block">
                <strong>{selectedBundle?.sessions.some(x=>x.status==="completed")?"Τι έχει αλλάξει":"Τι γνωρίζουμε"}</strong>
                <ul>{brief.changed.map(item=><li key={item}>{item}</li>)}</ul>
              </div>

              <div className="brief-block blue">
                <strong>Να διερευνηθεί σήμερα</strong>
                <ul>{brief.today.map(item=><li key={item}>{item}</li>)}</ul>
              </div>

              <div className="risk-strip"><ShieldCheck size={17} /> {brief.risk}</div>
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
                {event.patient_id&&<Link href={"/patients/demo/"+event.patient_id} className="small-button link-button" onClick={()=>setCalendarOpen(false)}>Φάκελος</Link>}
              </div>):<div className="agenda-empty-state">Δεν υπάρχουν ραντεβού σήμερα.</div>}
            </div>

            <aside className="calendar-integrations">
              <span className="kicker">ΣΥΝΔΕΣΕΙΣ</span>
              <h3>Συγχρονίστε το πρόγραμμά σας</h3>
              <p>Φέρτε τα υπάρχοντα ραντεβού σας στο ίδιο ημερολόγιο.</p>
              <button className="integration-button"><span className="integration-logo google">G</span><div><strong>Google Calendar</strong><small>Σύνδεση ημερολογίου</small></div><ChevronRight size={17}/></button>
              <button className="integration-button"><span className="integration-logo doctor">D</span><div><strong>Doctoranytime</strong><small>Σύνδεση ραντεβού</small></div><ChevronRight size={17}/></button>
              <div className="integration-note"><Check size={15}/><span>Οι συνδέσεις είναι demo στο MVP. Δεν γίνεται ακόμη συγχρονισμός δεδομένων.</span></div>
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


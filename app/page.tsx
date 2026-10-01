"use client";

import Link from "next/link";
import { useState } from "react";

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
const patientBriefs = {
  "Μαρία": {
    kicker: "ΕΠΟΜΕΝΗ ΣΥΝΕΔΡΙΑ",
    changed: ["Ο ύπνος έχει βελτιωθεί, αλλά παραμένουν 1–2 νυχτερινές αφυπνίσεις.","PHQ-9: 17 → 7 τους τελευταίους 3 μήνες.","Sertraline αυξήθηκε από 50 mg → 100 mg στις 12/09.","Αναφέρθηκε μειωμένη libido μετά την αύξηση δόσης."],
    today: ["Επιμένει η σεξουαλική δυσλειτουργία;","Υπήρξε επιστροφή κρίσεων πανικού;","Ανοχή και συνέπεια στη φαρμακευτική αγωγή."],
    risk: "Τελευταία αξιολόγηση: χωρίς αναφερόμενο αυτοκτονικό ιδεασμό."
  },
  "Γιάννης Π.": {
    kicker: "12:30 · FOLLOW-UP",
    changed: ["Λιγότερη σωματική ένταση τις τελευταίες 3 εβδομάδες.","GAD-7: 13 → 8 από την προηγούμενη μέτρηση.","Χρησιμοποιεί την τεχνική αναπνοής πριν από επαγγελματικές συναντήσεις.","Παραμένει αποφυγή σε μετακινήσεις με μετρό όταν υπάρχει συνωστισμός."],
    today: ["Συχνότητα επεισοδίων έντονου άγχους.","Βαθμός αποφυγής και επίδραση στην καθημερινότητα.","Ύπνος και χρήση καφεΐνης."],
    risk: "Δεν έχει αναφερθεί πρόσφατη μεταβολή κινδύνου."
  },
  "Ελένη Δ.": {
    kicker: "14:00 · FOLLOW-UP ΑΓΩΓΗΣ",
    changed: ["Σταθερότερη διάθεση μετά την τελευταία προσαρμογή αγωγής.","Αναφέρει πρωινή υπνηλία 2–3 ημέρες την εβδομάδα.","Η λειτουργικότητα στην εργασία παραμένει καλή.","Δεν αναφέρει νέα επεισόδια έντονης ευερεθιστότητας."],
    today: ["Αν η πρωινή υπνηλία επηρεάζει λειτουργικότητα ή οδήγηση.","Συνέπεια στη λήψη της βραδινής αγωγής.","Επανεκτίμηση διάθεσης και ύπνου."],
    risk: "Στην τελευταία συνεδρία δεν αναφέρθηκαν σκέψεις αυτοβλάβης."
  },
  "Κώστας Σ.": {
    kicker: "16:00 · ΠΡΩΤΗ ΑΞΙΟΛΟΓΗΣΗ",
    changed: ["Πρώτη συνάντηση — δεν υπάρχει ακόμη προηγούμενη κλινική πορεία.","Αιτία παραπομπής: επίμονο άγχος και δυσκολία ύπνου περίπου 4 μήνες.","Δεν υπάρχει καταγεγραμμένη προηγούμενη ψυχιατρική αγωγή στο demo.","Έχει συμπληρώσει βασικά στοιχεία πριν το ραντεβού."],
    today: ["Πλήρες ιστορικό συμπτωμάτων και λειτουργικότητας.","Προηγούμενο ψυχιατρικό/ιατρικό ιστορικό και ουσίες.","Βασική αξιολόγηση κινδύνου και θεραπευτικοί στόχοι."],
    risk: "Απαιτείται αρχική αξιολόγηση κινδύνου στη σημερινή συνεδρία."
  }
} as const;

type PatientName = keyof typeof patientBriefs;

const nav = [
  [Home, "Επισκόπηση", true],
  [CalendarDays, "Ημερολόγιο", false],
  [Users, "Ασθενείς", false],
  [Activity, "Ψυχομετρικά τεστ", false],
  [Stethoscope, "Συνεργασία", false],
  [Settings, "Ρυθμίσεις", false],
] as const;

export default function Page() {
  const [calendarOpen, setCalendarOpen] = useState(false);\n  const [mobileNav,setMobileNav]=useState(false);
  const [selectedPatient, setSelectedPatient] = useState<PatientName>("Μαρία");
  const [voiceOpen,setVoiceOpen]=useState(false);
  const [voiceStep,setVoiceStep]=useState<"listening"|"proposal"|"done">("listening");
  const [voiceText,setVoiceText]=useState("");
  const startVoice=()=>{setVoiceOpen(true);setVoiceStep("listening");setVoiceText("");setTimeout(()=>{setVoiceText("Μετέφερε τη Μαρία αύριο από τις 11 στις 12:30");setVoiceStep("proposal")},1100)};
  const brief = patientBriefs[selectedPatient];
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
              <p className="eyebrow">ΠΕΜΠΤΗ, 1 ΟΚΤΩΒΡΙΟΥ</p>
              <h1>Καλημέρα, Δρ. Παπαδάκη</h1>
              <p>Όλα όσα χρειάζεστε για μια όμορφη και παραγωγική ημέρα.</p>
            </div>
            <button className="primary ghost" onClick={()=>setCalendarOpen(true)}><CalendarDays size={18} /> Πρόγραμμα ημέρας</button>
          </div>

          <section className="metric-grid">
            <Metric icon={<CalendarDays />} label="Συνεδρίες σήμερα" value="6" note="Επόμενη σε 25 λεπτά" tone="sage" />
            <Metric icon={<ClipboardCheck />} label="Σημειώσεις για έγκριση" value="2" note="Από τις τελευταίες συνεδρίες" tone="blue" />
            <Metric icon={<TestTube2 />} label="Νέα ψυχομετρικά" value="4" note="PHQ-9, GAD-7, PCL-5" tone="gold" />
            <Metric icon={<HeartPulse />} label="Ασθενείς σε στενή παρακολούθηση" value="3" note="Με ενεργό clinical flag" tone="rose" />
          </section>

          <section className="main-grid">
            <div className="card sessions">
              <span className="kicker sessions-title">ΠΡΟΓΡΑΜΜΑ ΗΜΕΡΑΣ</span>
              {[
                ["11:00", "Μαρία", "32 ετών · Επανεκτίμηση", "Σε 25 λεπτά"],
                ["12:30", "Γιάννης Π.", "41 ετών · Αγχώδης διαταραχή", ""],
                ["14:00", "Ελένη Δ.", "28 ετών · Follow-up αγωγής", ""],
                ["16:00", "Κώστας Σ.", "37 ετών · Πρώτη αξιολόγηση", ""],
              ].map(([time, name, meta, badge]) => (
                <div className={selectedPatient === name ? "session-row selected-patient" : "session-row"} key={time}>
                  <div className="time">{time}</div>
                  <div className="patient-avatar">{name[0]}</div>
                  <div className="session-info">
                    <div className="patient-name-line"><button className={selectedPatient === name ? "patient-name selected" : "patient-name"} onClick={()=>setSelectedPatient(name as PatientName)}>{name}</button>{name === "Μαρία" && <span className="visit-type-badge">Follow-up</span>}{name === "Κώστας Σ." && <span className="visit-type-badge new">Νέος</span>}</div>
                    <span>{meta}</span>
                  </div>
                  {badge && <span className="badge">{badge}</span>}
                  {name === "Μαρία" ? <div className="session-actions"><Link href="/patients/maria" className="small-button link-button folder-button"><FolderOpen size={16}/> Φάκελος</Link><Link href="/patients/maria/dictation" className="session-mic" aria-label="Νέα υπαγόρευση για τη Μαρία" title="Νέα υπαγόρευση"><Mic2 size={16}/></Link></div> : name === "Κώστας Σ." ? <Link href="/patients/new?patient=kostas" className="small-button link-button folder-button"><FolderOpen size={16}/> Δημιουργία καρτέλας</Link> : <button className="small-button folder-button"><FolderOpen size={16}/> Φάκελος</button>}
                </div>
              ))}
            </div>

            <div className="card ai-brief" key={selectedPatient}>
              <div className="card-head">
                <div>
                  <span className="kicker">{brief.kicker}</span>
                  <h2><Sparkles size={19} /> Σύνοψη πριν τη συνεδρία</h2>
                </div>
                <span className="status-dot">{selectedPatient}</span>
              </div>

              <div className="brief-block">
                <strong>{selectedPatient === "Κώστας Σ." ? "Τι γνωρίζουμε πριν την πρώτη συνάντηση" : "Τι έχει αλλάξει"}</strong>
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
            <div><span className="kicker">ΠΡΟΓΡΑΜΜΑ ΗΜΕΡΑΣ</span><h2>Πέμπτη, 1 Οκτωβρίου</h2><p>Τα ραντεβού σας σε μία καθαρή ημερήσια προβολή.</p></div>
            <button className="calendar-close" onClick={()=>setCalendarOpen(false)} aria-label="Κλείσιμο"><X size={20}/></button>
          </div>

          <div className="calendar-date-strip">
            {["ΔΕΥ|28","ΤΡΙ|29","ΤΕΤ|30","ΠΕΜ|1","ΠΑΡ|2","ΣΑΒ|3","ΚΥΡ|4"].map((d,i)=>{const [day,date]=d.split("|");return <button key={d} className={i===3?"active":""}><span>{day}</span><strong>{date}</strong></button>})}
          </div>

          <div className="calendar-body">
            <div className="calendar-agenda">
              <div className="agenda-title"><div><h3>Σήμερα</h3><span>1 συνεδρία · υποθετικό MVP</span></div><div className="calendar-head-actions"><button className="voice-calendar-button" onClick={startVoice}><Mic2 size={16}/> Φωνητική εντολή</button><button className="add-appointment">+ Νέο ραντεβού</button></div></div>
              <div className="agenda-event">
                <div className="agenda-time"><strong>11:00</strong><span>50′</span></div>
                <div className="agenda-line"></div>
                <div className="agenda-info"><strong>Μαρία</strong><span>Επανεκτίμηση · Follow-up αγωγής</span><small><Clock size={13}/> 11:00–11:50</small></div>
                <Link href="/patients/maria" className="small-button link-button" onClick={()=>setCalendarOpen(false)}>Φάκελος</Link>
              </div>
              <div className="agenda-empty"><span>12:00</span><div></div></div>
              <div className="agenda-empty"><span>13:00</span><div></div></div>
              <div className="agenda-empty"><span>14:00</span><div></div></div>
              <div className="agenda-empty"><span>15:00</span><div></div></div>
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
      {voiceOpen&&<div className="voice-command-overlay" onClick={()=>setVoiceOpen(false)}><section className="voice-command-card" onClick={e=>e.stopPropagation()}><button className="voice-command-close" onClick={()=>setVoiceOpen(false)}><X size={18}/></button>{voiceStep==="listening"?<div className="voice-listening"><div className="voice-orb"><Mic2 size={24}/></div><span className="kicker">ΦΩΝΗΤΙΚΗ ΕΝΤΟΛΗ</span><h3>Σας ακούω…</h3><p>Πείτε τι θέλετε να αλλάξετε στο πρόγραμμά σας.</p><div className="voice-wave"><i/><i/><i/><i/><i/></div></div>:voiceStep==="proposal"?<><div className="voice-command-head"><div className="voice-orb small"><Sparkles size={20}/></div><div><span className="kicker">ΚΑΤΑΛΑΒΑ</span><h3>Μετακίνηση ραντεβού</h3></div></div><div className="voice-transcript">“{voiceText}”</div><div className="voice-change"><div><span>Ασθενής</span><strong>Μαρία</strong></div><div><span>Από</span><strong>Αύριο · 11:00</strong></div><ChevronRight size={18}/><div><span>Σε</span><strong>Αύριο · 12:30</strong></div></div><div className="voice-safe-note"><ShieldCheck size={15}/> Καμία αλλαγή δεν γίνεται χωρίς την επιβεβαίωσή σας.</div><footer><button onClick={()=>setVoiceOpen(false)}>Ακύρωση</button><button className="voice-confirm" onClick={()=>setVoiceStep("done")}><Check size={15}/> Επιβεβαίωση αλλαγής</button></footer></>:<div className="voice-listening voice-done"><div className="voice-done-icon"><Check size={22}/></div><h3>Η αλλαγή επιβεβαιώθηκε</h3><p>Demo ενέργεια: το ραντεβού της Μαρίας μετακινήθηκε στις 12:30.</p><button className="voice-confirm" onClick={()=>setVoiceOpen(false)}>Τέλος</button></div>}</section></div>}
    </main>
  );
}

function Metric({ icon, label, value, note, tone }: { icon: React.ReactNode; label: string; value: string; note: string; tone: string }) {
  return <div className={`metric ${tone}`}><div className="metric-icon">{icon}</div><span>{label}</span><strong>{value}</strong><small>{note}</small></div>;
}


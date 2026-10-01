"use client";

import Link from "next/link";
import { ArrowLeft, Brain, CalendarDays, ChevronRight, ClipboardCheck, FileText, HeartPulse, Mic2, Pill, ShieldCheck, Sparkles, TestTube2 } from "lucide-react";
import { Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

const data=[{date:"Ιαν",phq:17,gad:14},{date:"Φεβ",phq:13,gad:10},{date:"Μαρ",phq:9,gad:6},{date:"Απρ",phq:7,gad:5}];

export default function Maria(){
 return <main className="clinical-page">
  <div className="clinical-top"><Link href="/" className="back"><ArrowLeft size={17}/> Σήμερα</Link><span>Νόημα · Κλινικός φάκελος</span></div>
  <div className="patient-hero">
   <div><p className="eyebrow">ΕΠΟΜΕΝΗ ΣΥΝΕΔΡΙΑ · 11:00</p><h1>Μαρία Κ.</h1><p>32 ετών · τελευταία συνεδρία πριν 43 ημέρες</p></div>
   <Link href="/patients/maria/dictation" className="record"><Mic2 size={19}/> Νέα υπαγόρευση</Link>
  </div>
  <div className="patient-tabs"><button className="active">Σύνοψη</button><button>Ιστορικό</button><button>Φάρμακα</button><button>Τεστ</button><button>Σημειώσεις</button></div>

  <section className="patient-layout">
   <div className="patient-main">
    <div className="card focus-card">
     <span className="kicker">20″ ΠΡΙΝ ΤΗ ΣΥΝΕΔΡΙΑ</span>
     <h2><Sparkles size={19}/> Τι χρειάζεται να θυμάστε σήμερα</h2>
     <div className="memory-lead">Σαφής βελτίωση άγχους και διάθεσης μετά την αύξηση sertraline. Το βασικό ανοιχτό θέμα είναι η <b>μειωμένη libido</b>.</div>
     <div className="memory-grid">
      <div><strong>Από την τελευταία φορά</strong><ul><li>Κρίσεις πανικού: 3/εβδομάδα → καμία τις τελευταίες 2 εβδομάδες</li><li>Ύπνος καλύτερος, παραμένουν 1–2 αφυπνίσεις</li><li>PHQ-9: 17 → 7 · GAD-7: 14 → 5</li></ul></div>
      <div><strong>Να διερευνηθεί σήμερα</strong><ul><li>Σεξουαλική δυσλειτουργία μετά την αύξηση δόσης</li><li>Συνέπεια στη λήψη και ανοχή αγωγής</li><li>Λειτουργικότητα στην εργασία και στη σχέση</li></ul></div>
     </div>
     <div className="risk-strip"><ShieldCheck size={17}/> Τελευταία αξιολόγηση: χωρίς αναφερόμενο αυτοκτονικό ιδεασμό. Επιβεβαίωση στη σημερινή εκτίμηση.</div>
    </div>

    <div className="card">
     <div className="card-head"><div><span className="kicker">ΠΟΡΕΙΑ</span><h2>Συμπτώματα & ψυχομετρικά</h2></div><span className="trend-good">Βελτίωση</span></div>
     <div className="chart patient-chart"><ResponsiveContainer width="100%" height={235}><LineChart data={data}><XAxis dataKey="date" tickLine={false} axisLine={false}/><YAxis domain={[0,20]} tickLine={false} axisLine={false} width={28}/><Tooltip/><Line type="monotone" dataKey="phq" stroke="#2f6f63" strokeWidth={3}/><Line type="monotone" dataKey="gad" stroke="#5d80c2" strokeWidth={3}/></LineChart></ResponsiveContainer></div>
     <div className="legend"><span><i className="dot green"/> PHQ-9 · 7</span><span><i className="dot blue-dot"/> GAD-7 · 5</span></div>
    </div>

    <div className="card">
     <span className="kicker">ΚΛΙΝΙΚΗ ΧΡΟΝΟΓΡΑΜΜΗ</span><h2>Σημαντικές αλλαγές</h2>
     <div className="timeline">
      <div><span>12 Σεπ</span><strong>Sertraline 50 → 100 mg</strong><p>Αύξηση λόγω υπολειπόμενων συμπτωμάτων άγχους.</p></div>
      <div><span>20 Σεπ</span><strong>Νέα παρενέργεια</strong><p>Αναφέρθηκε μειωμένη libido.</p></div>
      <div><span>28 Σεπ</span><strong>PHQ-9: 7</strong><p>Σημαντική πτώση από αρχική τιμή 17.</p></div>
     </div>
    </div>
   </div>

   <aside className="patient-side">
    <div className="card side-card"><span className="kicker">ΚΛΙΝΙΚΗ ΕΙΚΟΝΑ</span>
     <Info icon={<Brain/>} label="Διαγνώσεις" value="Μείζων καταθλιπτική διαταραχή · ΓΑΔ"/>
     <Info icon={<Pill/>} label="Αγωγή" value="Sertraline 100 mg · Trazodone 50 mg"/>
     <Info icon={<HeartPulse/>} label="Παρενέργεια" value="Μειωμένη libido"/>
     <Info icon={<CalendarDays/>} label="Follow-up" value="Σήμερα · 11:00"/>
    </div>
    <div className="card side-card"><span className="kicker">ΤΕΛΕΥΤΑΙΑ ΔΕΔΟΜΕΝΑ</span>
     <Info icon={<TestTube2/>} label="PHQ-9" value="7 · ήπια συμπτώματα"/>
     <Info icon={<TestTube2/>} label="GAD-7" value="5 · ήπιο άγχος"/>
     <Info icon={<ClipboardCheck/>} label="Adherence" value="Αναφέρθηκε συνεπής"/>
    </div>
    <Link href="/patients/maria/dictation" className="next-action"><FileText size={18}/><div><strong>Μετά τη συνεδρία</strong><span>Υπαγόρευση σύντομης κλινικής σημείωσης</span></div><ChevronRight size={18}/></Link>
   </aside>
  </section>
 </main>
}
function Info({icon,label,value}:{icon:React.ReactNode,label:string,value:string}){return <div className="side-info"><span>{icon}</span><div><small>{label}</small><strong>{value}</strong></div></div>}

"use client";

import Link from "next/link";

import {
  Activity,
  Bell,
  Brain,
  CalendarDays,
  ChevronRight,
  ClipboardCheck,
  FileText,
  HeartPulse,
  Home,
  Mic2,
  Pill,
  Search,
  Settings,
  ShieldCheck,
  Sparkles,
  Stethoscope,
  TestTube2,
  Users,
} from "lucide-react";
const nav = [
  [Home, "Σήμερα", true],
  [Users, "Ασθενείς", false],
  [FileText, "Σημειώσεις", false],
  [Activity, "Τεστ & Πρόοδος", false],
  [Stethoscope, "Συνεργασία", false],
  [Settings, "Ρυθμίσεις", false],
] as const;

export default function Page() {
  return (
    <main className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark">Ψ</div>
          <div className="brand-copy"><div className="brand-sub">Για μια οργανωμένη κλινική πράξη</div></div>
        </div>

        <nav className="nav">
          {nav.map(([Icon, label, active]) => (
            <button className={active ? "nav-item active" : "nav-item"} key={label}>
              <Icon size={19} />
              <span>{label}</span>
            </button>
          ))}
        </nav>

        <div className="sidebar-note">
          <Brain size={22} />
          <strong>Ψυχιατρικό workspace</strong>
          <span>Σχεδιασμένο γύρω από την πορεία του ασθενούς, όχι γύρω από φόρμες.</span>
        </div>
      </aside>

      <section className="workspace">
        <header className="topbar">
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
              <p>Ό,τι χρειάζεστε πριν, κατά και μετά τη σημερινή κλινική εργασία.</p>
            </div>
            <button className="primary ghost"><CalendarDays size={18} /> Πρόγραμμα ημέρας</button>
          </div>

          <section className="metric-grid">
            <Metric icon={<CalendarDays />} label="Συνεδρίες σήμερα" value="6" note="Επόμενη σε 25 λεπτά" tone="sage" />
            <Metric icon={<ClipboardCheck />} label="Σημειώσεις για έγκριση" value="2" note="Από τις τελευταίες συνεδρίες" tone="blue" />
            <Metric icon={<TestTube2 />} label="Νέα ψυχομετρικά" value="4" note="PHQ-9, GAD-7, PCL-5" tone="gold" />
            <Metric icon={<HeartPulse />} label="Ασθενείς σε στενή παρακολούθηση" value="3" note="Με ενεργό clinical flag" tone="rose" />
          </section>

          <section className="main-grid">
            <div className="card sessions">
              <div className="card-head">
                <div>
                  <span className="kicker">ΣΗΜΕΡΑ</span>
                  <h2>Επόμενες συνεδρίες</h2>
                </div>
                <button className="text-button">Προβολή ημέρας <ChevronRight size={16} /></button>
              </div>

              {[
                ["11:00", "Μαρία", "32 ετών · Επανεκτίμηση", "Σε 25 λεπτά"],
                ["12:30", "Γιάννης Π.", "41 ετών · Αγχώδης διαταραχή", ""],
                ["14:00", "Ελένη Δ.", "28 ετών · Follow-up αγωγής", ""],
                ["16:00", "Κώστας Σ.", "37 ετών · Πρώτη αξιολόγηση", ""],
              ].map(([time, name, meta, badge]) => (
                <div className="session-row" key={time}>
                  <div className="time">{time}</div>
                  <div className="patient-avatar">{name[0]}</div>
                  <div className="session-info">
                    <strong>{name}</strong>
                    <span>{meta}</span>
                  </div>
                  {badge && <span className="badge">{badge}</span>}
                  {name === "Μαρία" ? <div className="session-actions"><Link href="/patients/maria" className="small-button link-button">Άνοιγμα σύνοψης</Link><Link href="/patients/maria/dictation" className="session-mic" aria-label="Νέα υπαγόρευση για τη Μαρία" title="Νέα υπαγόρευση"><Mic2 size={16}/></Link></div> : <button className="small-button">Άνοιγμα σύνοψης</button>}
                </div>
              ))}
            </div>

            <div className="card ai-brief">
              <div className="card-head">
                <div>
                  <span className="kicker">ΕΠΟΜΕΝΗ ΣΥΝΕΔΡΙΑ</span>
                  <h2><Sparkles size={19} /> Σύνοψη πριν τη συνεδρία</h2>
                </div>
                <span className="status-dot">Μαρία</span>
              </div>

              <div className="brief-block">
                <strong>Τι έχει αλλάξει</strong>
                <ul>
                  <li>Ο ύπνος έχει βελτιωθεί, αλλά παραμένουν 1–2 νυχτερινές αφυπνίσεις.</li>
                  <li>PHQ-9: <b>17 → 7</b> τους τελευταίους 3 μήνες.</li>
                  <li>Sertraline αυξήθηκε από <b>50 mg → 100 mg</b> στις 12/09.</li>
                  <li>Αναφέρθηκε μειωμένη libido μετά την αύξηση δόσης.</li>
                </ul>
              </div>

              <div className="brief-block blue">
                <strong>Να διερευνηθεί σήμερα</strong>
                <ul>
                  <li>Επιμένει η σεξουαλική δυσλειτουργία;</li>
                  <li>Υπήρξε επιστροφή κρίσεων πανικού;</li>
                  <li>Ανοχή και συνέπεια στη φαρμακευτική αγωγή.</li>
                </ul>
              </div>

              <div className="risk-strip"><ShieldCheck size={17} /> Τελευταία αξιολόγηση: χωρίς αναφερόμενο αυτοκτονικό ιδεασμό.</div>
            </div>
          </section>

        </div>
      </section>
    </main>
  );
}

function Metric({ icon, label, value, note, tone }: { icon: React.ReactNode; label: string; value: string; note: string; tone: string }) {
  return <div className={`metric ${tone}`}><div className="metric-icon">{icon}</div><span>{label}</span><strong>{value}</strong><small>{note}</small></div>;
}


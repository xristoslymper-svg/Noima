"use client";
import Link from "next/link";
import { Search, Plus, ChevronRight, Users, CalendarDays, AlertCircle, Bell, Activity, Home, Settings, Stethoscope, Menu, X } from "lucide-react";
import { useState } from "react";

const patients=[
 {name:"Μαρία",age:"32",last:"17 Σεπ",next:"Σήμερα · 11:00",status:"Follow-up",href:"/patients/maria",note:"Μείζον καταθλιπτικό επεισόδιο · Διαταραχή πανικού"},
 {name:"Γιάννης Π.",age:"41",last:"10 Σεπ",next:"Σήμερα · 12:30",status:"Follow-up",href:"#",note:"Αγχώδης διαταραχή"},
 {name:"Ελένη Δ.",age:"28",last:"18 Σεπ",next:"Σήμερα · 14:00",status:"Follow-up",href:"#",note:"Παρακολούθηση αγωγής"},
 {name:"Κώστας Σ.",age:"37",last:"—",next:"Σήμερα · 16:00",status:"Νέος",href:"/patients/new?patient=kostas",note:"Πρώτη αξιολόγηση"}
];

export default function Patients(){
 const [q,setQ]=useState("");\n const [mobileNav,setMobileNav]=useState(false);
 const filtered=patients.filter(p=>p.name.toLowerCase().includes(q.toLowerCase())||p.note.toLowerCase().includes(q.toLowerCase()));
 return <main className="app-shell secondary-shell"><aside className={mobileNav?"sidebar mobile-open":"sidebar"}><button className="mobile-nav-close" onClick={()=>setMobileNav(false)} aria-label="Κλείσιμο μενού"><X size={20}/></button><div className="brand"><div className="brand-mark">Ψ</div><div className="brand-copy"><div className="brand-sub">Για μια οργανωμένη κλινική πράξη</div></div></div><nav className="nav"><Link href="/" className="nav-item"><Home size={19}/><span>Επισκόπηση</span></Link><Link href="/calendar" className="nav-item"><CalendarDays size={19}/><span>Ημερολόγιο</span></Link><Link href="/patients" className="nav-item active"><Users size={19}/><span>Ασθενείς</span></Link><Link href="/psychometrics" className="nav-item"><Activity size={19}/><span>Ψυχομετρικά τεστ</span></Link><button className="nav-item"><Stethoscope size={19}/><span>Συνεργασία</span></button><button className="nav-item"><Settings size={19}/><span>Ρυθμίσεις</span></button></nav></aside>{mobileNav&&<button className="mobile-nav-backdrop" aria-label="Κλείσιμο μενού" onClick={()=>setMobileNav(false)}/>}<section className="workspace"><header className="topbar"><button className="mobile-menu-button" onClick={()=>setMobileNav(true)} aria-label="Άνοιγμα μενού"><Menu size={21}/></button><div className="search"><Search size={18}/><span>Αναζήτηση ασθενή, σημείωσης, φαρμάκου ή τεστ...</span></div><div className="profile"><Bell size={20}/><div className="avatar">ΚΠ</div><div><strong>Δρ. Κατερίνα Παπαδάκη</strong><span>Ψυχίατρος</span></div></div></header><div className="secondary-content registry-page">
  <section className="registry-wrap">
   <div className="registry-heading"><div><span className="kicker">ΚΛΙΝΙΚΟ ΜΗΤΡΩΟ</span><h1>Ασθενείς</h1><p>Οι ασθενείς σας και ό,τι χρειάζεται την προσοχή σας.</p></div><Link href="/patients/new" className="record"><Plus size={18}/> Νέος ασθενής</Link></div>
   <div className="registry-stats"><div><Users/><span><strong>4</strong> ενεργοί ασθενείς</span></div><div><CalendarDays/><span><strong>4</strong> συνεδρίες σήμερα</span></div><div><AlertCircle/><span><strong>1</strong> νέα καρτέλα προς δημιουργία</span></div></div>
   <div className="registry-tools"><div className="registry-search"><Search size={17}/><input value={q} onChange={e=>setQ(e.target.value)} placeholder="Αναζήτηση ασθενή..."/></div><div className="registry-filters"><button className="active">Όλοι</button><button>Ενεργοί</button><button>Χρειάζονται προσοχή</button></div></div>
   <div className="patient-registry">
    <div className="registry-row registry-labels"><span>Ασθενής</span><span>Τελευταία επίσκεψη</span><span>Επόμενη</span><span>Κατάσταση</span><span/></div>
    {filtered.map(p=><Link href={p.href} className="registry-row" key={p.name}>
      <div className="registry-patient"><span className="registry-avatar">{p.name[0]}</span><div><strong>{p.name}</strong><small>{p.age} ετών · {p.note}</small></div></div>
      <span>{p.last}</span><span>{p.next}</span><span><i className={p.status==="Νέος"?"registry-status new":"registry-status"}>{p.status}</i></span>
      <ChevronRight size={17}/>
    </Link>)}
   </div>
  </section></div></section>
 </main>
}
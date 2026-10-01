"use client";
import Link from "next/link";
import { Search, Plus, ChevronRight, Users, CalendarDays, AlertCircle } from "lucide-react";
import { useState } from "react";

const patients=[
 {name:"Μαρία",age:"32",last:"17 Σεπ",next:"Σήμερα · 11:00",status:"Follow-up",href:"/patients/maria",note:"Μείζον καταθλιπτικό επεισόδιο · Διαταραχή πανικού"},
 {name:"Γιάννης Π.",age:"41",last:"10 Σεπ",next:"Σήμερα · 12:30",status:"Follow-up",href:"#",note:"Αγχώδης διαταραχή"},
 {name:"Ελένη Δ.",age:"28",last:"18 Σεπ",next:"Σήμερα · 14:00",status:"Follow-up",href:"#",note:"Παρακολούθηση αγωγής"},
 {name:"Κώστας Σ.",age:"37",last:"—",next:"Σήμερα · 16:00",status:"Νέος",href:"/patients/new?patient=kostas",note:"Πρώτη αξιολόγηση"}
];

export default function Patients(){
 const [q,setQ]=useState("");
 const filtered=patients.filter(p=>p.name.toLowerCase().includes(q.toLowerCase())||p.note.toLowerCase().includes(q.toLowerCase()));
 return <main className="registry-page">
  <header className="registry-top"><Link href="/" className="registry-brand"><span>Ψ</span><small>Για μια οργανωμένη κλινική πράξη</small></Link><Link href="/" className="back-home">← Σήμερα</Link></header>
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
  </section>
 </main>
}
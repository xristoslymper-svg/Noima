"use client";
import Link from "next/link";
import { useState } from "react";
import { ArrowLeft, Mic2, UserRound, Brain, HeartPulse, Pill, ClipboardList, ShieldCheck, Check, ChevronRight, Mail } from "lucide-react";

const sections=[
 ["complaint","Λόγος προσέλευσης","Chief complaint, έναρξη και βασικό αίτημα",Brain],
 ["psych","Ψυχιατρικό ιστορικό","Προηγούμενα επεισόδια, διαγνώσεις, νοσηλείες και θεραπείες",ClipboardList],
 ["medical","Ιατρικό ιστορικό","Νοσήματα, αλλεργίες και σημαντικό σωματικό ιστορικό",HeartPulse],
 ["meds","Τρέχουσα αγωγή","Φάρμακα, δόσεις, διάρκεια και συμμόρφωση",Pill],
] as const;

export default function NewPatient(){
 const [fields,setFields]=useState<Record<string,string>>({});
 const [listening,setListening]=useState<string|null>(null);
 const [sent,setSent]=useState<string[]>([]);
 const sendScale=(scale:string)=>setSent(v=>v.includes(scale)?v:[...v,scale]);
 const dictate=(key:string)=>{setListening(key);setTimeout(()=>{setFields(v=>({...v,[key]:"Demo υπαγόρευσης — το κείμενο θα προταθεί εδώ προς έλεγχο και έγκριση από τον ψυχίατρο."}));setListening(null)},650)};
 return <main className="intake-page">
  <div className="intake-top"><Link href="/patients" className="back"><ArrowLeft size={17}/> Ασθενείς</Link><span>Νέα καρτέλα · Αρχική αξιολόγηση</span></div>
  <section className="intake-wrap">
   <div className="intake-heading"><div><span className="new-patient-chip">ΝΕΟΣ ΑΣΘΕΝΗΣ</span><h1>Κώστας Σ.</h1><p>37 ετών · Πρώτη αξιολόγηση σήμερα στις 16:00</p></div><div className="intake-progress"><strong>Αρχική καρτέλα</strong><span>Συμπληρώστε τα βασικά πριν ή κατά την πρώτη επίσκεψη.</span></div></div>

   <div className="intake-layout"><div className="intake-main">
    <section className="intake-card demographics"><div className="intake-card-title"><span className="intake-icon"><UserRound size={18}/></span><div><h2>Βασικά στοιχεία</h2><p>Στοιχεία ταυτοποίησης και επικοινωνίας</p></div></div>
     <div className="field-grid"><label>Όνομα<input defaultValue="Κώστας"/></label><label>Επώνυμο<input defaultValue="Σ."/></label><label>Ηλικία<input defaultValue="37"/></label><label>Τηλέφωνο<input placeholder="—"/></label></div>
    </section>
    {sections.map(([key,title,hint,Icon])=><section className="intake-card" key={key}><div className="intake-card-title"><span className="intake-icon"><Icon size={18}/></span><div><h2>{title}</h2><p>{hint}</p></div><button className={listening===key?"section-mic recording":"section-mic"} onClick={()=>dictate(key)} disabled={listening!==null}><Mic2 size={16}/>{listening===key?" Ακούω…":" Υπαγόρευση"}</button></div>
     {fields[key]?<div className="intake-proposal"><span>ΠΡΟΤΑΣΗ ΑΠΟ ΥΠΑΓΟΡΕΥΣΗ</span><p>{fields[key]}</p></div>:<textarea placeholder="Καταγραφή με κείμενο ή χρησιμοποιήστε την υπαγόρευση…"/>}
    </section>)}
    <section className="intake-card"><div className="intake-card-title"><span className="intake-icon"><ShieldCheck size={18}/></span><div><h2>Κλίμακες πριν τη συνεδρία</h2><p>Προαιρετικές μετρήσεις για baseline</p></div></div><div className="scale-picks">{["PHQ-9","GAD-7","ASRS","AUDIT-C"].map(scale=><div className="scale-pick" key={scale}><div><strong>{scale}</strong><button className="scale-add">+ Προσθήκη</button></div><button className={sent.includes(scale)?"scale-send sent":"scale-send"} onClick={()=>sendScale(scale)}>{sent.includes(scale)?<><Check size={13}/> Στάλθηκε</>:<><Mail size={13}/> Αποστολή στον ασθενή</>}</button></div>)}</div></section>
   </div>
   <aside className="intake-side"><div className="intake-side-card"><span className="kicker">ΡΟΗ ΠΡΩΤΗΣ ΕΠΙΣΚΕΨΗΣ</span><div className="flow-step done"><Check size={15}/><div><strong>Δημιουργία καρτέλας</strong><span>Βασικά στοιχεία & pre-visit ιστορικό</span></div></div><div className="flow-step"><span>2</span><div><strong>Πρώτη συνεδρία</strong><small>Συνέντευξη · MSE · Risk</small></div></div><div className="flow-step"><span>3</span><div><strong>Κλινική εκτίμηση</strong><small>Διάγνωση · formulation · πλάνο</small></div></div><div className="flow-step"><span>4</span><div><strong>Σύνοψη</strong><small>Δημιουργείται μετά την αξιολόγηση</small></div></div></div>
    <div className="intake-note"><strong>Δεν υπάρχει ακόμη Σύνοψη</strong><p>Η κλινική σύνοψη θα δημιουργηθεί από τα εγκεκριμένα δεδομένα της αρχικής αξιολόγησης.</p></div>
   </aside></div>
   <div className="intake-footer"><span>Demo MVP · Καμία πληροφορία δεν αποθηκεύεται ακόμη.</span><button className="save-intake">Αποθήκευση & έναρξη πρώτης συνεδρίας <ChevronRight size={17}/></button></div>
  </section>
 </main>
}
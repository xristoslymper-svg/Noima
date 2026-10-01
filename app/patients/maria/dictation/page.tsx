"use client";
import Link from "next/link";
import { ArrowLeft, Check, Mic2, ShieldCheck, Sparkles } from "lucide-react";
import { useState } from "react";

export default function Dictation(){
 const [recording,setRecording]=useState(false);
 const [structured,setStructured]=useState(false);
 return <main className="clinical-page narrow">
  <div className="clinical-top"><Link href="/patients/maria" className="back"><ArrowLeft size={17}/> Μαρία Κ.</Link><span>Νόημα · Σημείωση μετά τη συνεδρία</span></div>
  <div className="patient-hero"><div><p className="eyebrow">ΜΑΡΙΑ Κ. · 1 ΟΚΤΩΒΡΙΟΥ</p><h1>Σύντομη κλινική σημείωση</h1><p>Υπαγορεύστε ό,τι θέλετε να θυμάστε από τη σημερινή συνεδρία.</p></div></div>
  <div className="privacy-note"><ShieldCheck size={18}/><div><strong>Δεν καταγράφεται η συνεδρία.</strong><span> Η ηχογράφηση αφορά μόνο τη σύντομη σημείωση που επιλέγετε να υπαγορεύσετε.</span></div></div>
  <section className="card recorder-card">
   <button className={recording?"mic-button recording":"mic-button"} onClick={()=>setRecording(!recording)}><Mic2 size={30}/></button>
   <h2>{recording?"Ακούω...":"Έναρξη υπαγόρευσης"}</h2>
   <p>{recording?"Πατήστε ξανά όταν ολοκληρώσετε.":"Συνήθως αρκούν 30–60 δευτερόλεπτα."}</p>
   <div className="transcript">«Η Μαρία κοιμάται καλύτερα, δεν είχε κρίση πανικού τις τελευταίες δύο εβδομάδες, παραμένει στα 100 mg sertraline αλλά αναφέρει μειωμένη libido. Δεν αναφέρει αυτοκτονικό ιδεασμό. Επανεκτίμηση σε τέσσερις εβδομάδες.»</div>
   <button className="structure-button" onClick={()=>setStructured(true)}><Sparkles size={18}/> Δόμηση σημείωσης με AI</button>
  </section>
  {structured&&<section className="card structured-note"><div className="card-head"><div><span className="kicker">ΠΡΟΤΑΣΗ AI · ΑΠΑΙΤΕΙ ΕΓΚΡΙΣΗ</span><h2>Δομημένη κλινική σημείωση</h2></div></div>
   <div className="structure-grid">
    <Field label="Συμπτώματα" value="Βελτιωμένος ύπνος. Καμία κρίση πανικού τις τελευταίες 2 εβδομάδες."/>
    <Field label="Αγωγή" value="Sertraline 100 mg — χωρίς αλλαγή."/>
    <Field label="Παρενέργειες" value="Μειωμένη libido."/>
    <Field label="Κίνδυνος" value="Δεν αναφέρθηκε αυτοκτονικός ιδεασμός."/>
    <Field label="Πλάνο" value="Συνέχιση τρέχουσας αγωγής. Παρακολούθηση σεξουαλικής δυσλειτουργίας."/>
    <Field label="Follow-up" value="Επανεκτίμηση σε 4 εβδομάδες."/>
   </div>
   <div className="approval-note"><ShieldCheck size={17}/> Η AI πρόταση δεν αποτελεί κλινικό γεγονός μέχρι να την εγκρίνετε.</div>
   <div className="note-actions"><button className="secondary-action">Επεξεργασία</button><button className="approve"><Check size={18}/> Έγκριση & Αποθήκευση</button></div>
  </section>}
 </main>
}
function Field({label,value}:{label:string,value:string}){return <div className="structured-field"><span>{label}</span><strong>{value}</strong></div>}

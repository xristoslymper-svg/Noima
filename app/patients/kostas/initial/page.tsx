"use client";
import Link from "next/link";
import { useState } from "react";
import { ArrowLeft, Mic2, Brain, ShieldCheck, ClipboardList, Check, ChevronRight, Sparkles } from "lucide-react";

const demo={
 interview:"Αναφέρει επίμονο άγχος τους τελευταίους 4 μήνες, δυσκολία έναρξης ύπνου και αυξημένη ανησυχία για την εργασία. Η λειτουργικότητα έχει επηρεαστεί κυρίως το βράδυ και πριν από σημαντικές συναντήσεις.",
 mse:"Σε εγρήγορση και πλήρως προσανατολισμένος. Συνεργάσιμος, λόγος φυσιολογικού ρυθμού. Διάθεση αγχώδης, συναίσθημα ανάλογο. Σκέψη οργανωμένη, χωρίς ψυχωτικά στοιχεία.",
 risk:"Αρνείται αυτοκτονικό ιδεασμό, πρόθεση ή σχέδιο. Δεν αναφέρει ιστορικό αυτοβλάβης. Προστατευτικοί παράγοντες: οικογένεια, εργασία και αναζήτηση βοήθειας.",
 assessment:"Πρώτη κλινική εικόνα συμβατή με αγχώδη συμπτωματολογία με διαταραχή ύπνου. Απαιτείται περαιτέρω διαφορική αξιολόγηση πριν οριστικοποιηθεί διάγνωση.",
 plan:"Ψυχοεκπαίδευση, παρακολούθηση ύπνου και άγχους. Συζήτηση θεραπευτικών επιλογών μετά την ολοκλήρωση baseline κλιμάκων.",
 review:"Επανεκτίμηση σε 2 εβδομάδες."
} as const;
type Key=keyof typeof demo;
const sections:[Key,string,string][]=[
 ["interview","Ψυχιατρική συνέντευξη","Συμπτώματα, πορεία, λειτουργικότητα και σημαντικά γεγονότα"],
 ["mse","Εξέταση ψυχικής κατάστασης (MSE)","Σημερινά ευρήματα"],
 ["risk","Εκτίμηση κινδύνου","Αυτοκτονικότητα, αυτοβλάβη και προστατευτικοί παράγοντες"],
 ["assessment","Διάγνωση & κλινική διατύπωση","Αρχική εκτίμηση και διαφορική διάγνωση"],
 ["plan","Θεραπευτικό πλάνο","Παρεμβάσεις, αγωγή και επόμενα βήματα"],
 ["review","Επόμενη επανεκτίμηση","Χρόνος και λόγος επόμενης επίσκεψης"]
];

export default function InitialSession(){
 const [fields,setFields]=useState<Partial<Record<Key,string>>>({});
 const [recording,setRecording]=useState<Key|null>(null);
 const [approved,setApproved]=useState(false);
 const dictate=(key:Key)=>{setRecording(key);setTimeout(()=>{setFields(v=>({...v,[key]:demo[key]}));setRecording(null)},650)};
 if(approved)return <main className="intake-page"><div className="intake-top"><Link href="/patients" className="back"><ArrowLeft size={17}/> Ασθενείς</Link><span>Κώστας Σ. · Η καρτέλα δημιουργήθηκε</span></div><section className="created-record"><div className="created-check"><Check size={25}/></div><span className="kicker">ΠΡΩΤΗ ΑΞΙΟΛΟΓΗΣΗ ΟΛΟΚΛΗΡΩΘΗΚΕ</span><h1>Η καρτέλα του Κώστα είναι έτοιμη</h1><p>Η παρακάτω σύνοψη δημιουργήθηκε μόνο από τα εγκεκριμένα στοιχεία της σημερινής αξιολόγησης.</p><div className="created-summary"><span><Sparkles size={16}/> ΚΛΙΝΙΚΗ ΣΥΝΟΨΗ</span><strong>Πρώτη αξιολόγηση για επίμονο άγχος και δυσκολία ύπνου.</strong><p>Αγχώδη συμπτωματολογία περίπου 4 μηνών με επίδραση στον ύπνο και την εργασιακή λειτουργικότητα. Χωρίς αναφερόμενο αυτοκτονικό ιδεασμό. Προγραμματίστηκε επανεκτίμηση σε 2 εβδομάδες και ολοκλήρωση baseline κλιμάκων.</p></div><div className="created-actions"><Link href="/patients" className="small-button link-button">Επιστροφή στους ασθενείς</Link><button className="save-intake">Άνοιγμα φακέλου <ChevronRight size={16}/></button></div></section></main>;
 return <main className="intake-page"><div className="intake-top"><Link href="/patients/new?patient=kostas" className="back"><ArrowLeft size={17}/> Αρχική καρτέλα</Link><span>Κώστας Σ. · Πρώτη συνεδρία</span></div><section className="intake-wrap">
  <div className="session-work-head"><div><div className="visit-label"><span>ΠΡΩΤΗ ΑΞΙΟΛΟΓΗΣΗ</span><i/> ΣΗΜΕΡΑ · 16:00</div><h2>Πρώτη συνεδρία</h2><p>Καταγράψτε τα κλινικά ευρήματα της επίσκεψης. Η υπαγόρευση δημιουργεί πρόταση προς έλεγχο — όχι οριστική καταχώρηση.</p></div></div>
  <div className="initial-context"><span className="kicker">PRE-VISIT</span><div><strong>Λόγος προσέλευσης</strong><p>Επίμονο άγχος και δυσκολία ύπνου περίπου 4 μήνες.</p></div><div><strong>Προηγούμενη ψυχιατρική αγωγή</strong><p>Δεν υπάρχει καταγεγραμμένη αγωγή στο demo.</p></div><div><strong>Baseline κλίμακες</strong><p>Δεν έχουν επιστραφεί ακόμη.</p></div></div>
  <div className="sections-label"><span className="kicker">IN VISIT · ΚΑΤΑΓΡΑΦΗ</span><span>Μικρόφωνο ανά κλινική ενότητα</span></div>
  <div className="clinical-sections">{sections.map(([key,title,hint])=><div className={fields[key]?"clinical-section populated":"clinical-section"} key={key}><div className="clinical-section-head"><div><h3>{title}</h3><span>{hint}</span></div><button className={recording===key?"section-mic recording":"section-mic"} onClick={()=>dictate(key)} disabled={recording!==null}><Mic2 size={16}/>{recording===key?" Ακούω…":" Υπαγόρευση"}</button></div>{fields[key]?<div className="section-content"><p>{fields[key]}</p><button onClick={()=>setFields(v=>({...v,[key]:undefined}))}>Καθαρισμός</button></div>:<div className="section-empty">Δεν έχει καταγραφεί ακόμη περιεχόμενο.</div>}</div>)}</div>
  <div className="session-save"><span><ShieldCheck size={16}/> Η Σύνοψη θα δημιουργηθεί μόνο από όσα εγκρίνετε.</span><button onClick={()=>setApproved(true)}>Έγκριση & δημιουργία φακέλου</button></div>
 </section></main>
}
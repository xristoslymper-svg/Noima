"use client";
import Link from "next/link";
import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft, Mic2, UserRound, Brain, HeartPulse, Pill, ClipboardList, ShieldCheck, Check, ChevronRight, Mail } from "lucide-react";

const sections=[
 ["complaint","Λόγος προσέλευσης","Chief complaint, έναρξη και βασικό αίτημα",Brain],
 ["psych","Ψυχιατρικό ιστορικό","Προηγούμενα επεισόδια, διαγνώσεις, νοσηλείες και θεραπείες",ClipboardList],
 ["medical","Ιατρικό ιστορικό","Νοσήματα, αλλεργίες και σημαντικό σωματικό ιστορικό",HeartPulse],
 ["meds","Τρέχουσα αγωγή","Φάρμακα, δόσεις, διάρκεια και συμμόρφωση",Pill],
] as const;

export default function NewPatient(){
 const router=useRouter(); const search=useSearchParams(); const preset=search.get("patient")==="kostas";
 const [fields,setFields]=useState<Record<string,string>>({});
 const [firstName,setFirstName]=useState(preset?"Κώστας":"");
 const [lastName,setLastName]=useState(preset?"Σ.":"");
 const [age,setAge]=useState(preset?"37":"");
 const [saving,setSaving]=useState(false);
 const [saveError,setSaveError]=useState("");
 async function createPatient(){
  if(!firstName.trim()){setSaveError("Συμπληρώστε όνομα.");return}
  setSaving(true);setSaveError("");
  try{const note=fields.complaint||"";const r=await fetch("/api/patients/demo",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({first_name:firstName,last_name:lastName,age:age?Number(age):null,note})});const d=await r.json();if(!r.ok)throw new Error(d.error||"error");router.push(`/patients/demo/${d.patient.id}`)}
  catch(e){setSaveError(e instanceof Error&&e.message!=="error"?e.message:"Δεν δημιουργήθηκε η καρτέλα.");}finally{setSaving(false)}
 }
 const [listening,setListening]=useState<string|null>(null);
 const [sent,setSent]=useState<string[]>([]);
 const sendScale=(scale:string)=>setSent(v=>v.includes(scale)?v:[...v,scale]);
 const dictate=(key:string)=>{setListening(key);setTimeout(()=>{setFields(v=>({...v,[key]:"Demo υπαγόρευσης — το κείμενο θα προταθεί εδώ προς έλεγχο και έγκριση από τον ψυχίατρο."}));setListening(null)},650)};
 return <main className="intake-page">
  <div className="intake-top"><Link href="/patients" className="back"><ArrowLeft size={17}/> Ασθενείς</Link><span>Νέα καρτέλα · Αρχική αξιολόγηση</span></div>
  <section className="intake-wrap">
   <div className="intake-heading"><div><span className="new-patient-chip">ΝΕΟΣ ΑΣΘΕΝΗΣ · TEST DATA</span><h1>{firstName?firstName+" "+lastName:"Νέα καρτέλα"}</h1><p>{age?age+" ετών · ":""}Δοκιμαστική αρχική αξιολόγηση</p></div><div className="intake-progress"><strong>Αρχική καρτέλα</strong><span>Συμπληρώστε τα βασικά πριν ή κατά την πρώτη επίσκεψη.</span></div></div>

   <div className="intake-layout"><div className="intake-main">
    <section className="intake-card demographics"><div className="intake-card-title"><span className="intake-icon"><UserRound size={18}/></span><div><h2>Βασικά στοιχεία</h2><p>Στοιχεία ταυτοποίησης και επικοινωνίας</p></div></div>
     <div className="field-grid"><label>Όνομα<input value={firstName} onChange={e=>setFirstName(e.target.value)} placeholder="π.χ. Νίκος"/></label><label>Επώνυμο<input value={lastName} onChange={e=>setLastName(e.target.value)} placeholder="π.χ. Δ."/></label><label>Ηλικία<input value={age} onChange={e=>setAge(e.target.value.replace(/\D/g,"").slice(0,3))} inputMode="numeric" placeholder="—"/></label><label>Τηλέφωνο<input placeholder="— (δεν αποθηκεύεται στο demo)"/></label></div>
    </section>
    {sections.map(([key,title,hint,Icon])=><section className="intake-card" key={key}><div className="intake-card-title"><span className="intake-icon"><Icon size={18}/></span><div><h2>{title}</h2><p>{hint}</p></div><button className={listening===key?"section-mic recording":"section-mic"} onClick={()=>dictate(key)} disabled={listening!==null}><Mic2 size={16}/>{listening===key?" Ακούω…":" Υπαγόρευση"}</button></div>
     {fields[key]?<div className="intake-proposal"><span>ΠΡΟΤΑΣΗ ΑΠΟ ΥΠΑΓΟΡΕΥΣΗ</span><p>{fields[key]}</p></div>:<textarea placeholder="Καταγραφή με κείμενο ή χρησιμοποιήστε την υπαγόρευση…"/>}
    </section>)}
    <section className="intake-card"><div className="intake-card-title"><span className="intake-icon"><ShieldCheck size={18}/></span><div><h2>Κλίμακες πριν τη συνεδρία</h2><p>Προαιρετικές μετρήσεις για baseline</p></div></div><div className="scale-picks">{["PHQ-9","GAD-7","ASRS","AUDIT-C"].map(scale=><div className="scale-pick" key={scale}><div><strong>{scale}</strong><button className="scale-add">+ Προσθήκη</button></div><button className={sent.includes(scale)?"scale-send sent":"scale-send"} onClick={()=>sendScale(scale)}>{sent.includes(scale)?<><Check size={13}/> Στάλθηκε</>:<><Mail size={13}/> Αποστολή στον ασθενή</>}</button></div>)}</div></section>
   </div>
   <aside className="intake-side"><div className="intake-side-card"><span className="kicker">ΡΟΗ ΠΡΩΤΗΣ ΕΠΙΣΚΕΨΗΣ</span><div className="flow-step done"><Check size={15}/><div><strong>Δημιουργία καρτέλας</strong><span>Βασικά στοιχεία & pre-visit ιστορικό</span></div></div><div className="flow-step"><span>2</span><div><strong>Πρώτη συνεδρία</strong><small>Συνέντευξη · MSE · Risk</small></div></div><div className="flow-step"><span>3</span><div><strong>Κλινική εκτίμηση</strong><small>Διάγνωση · formulation · πλάνο</small></div></div><div className="flow-step"><span>4</span><div><strong>Σύνοψη</strong><small>Δημιουργείται μετά την αξιολόγηση</small></div></div></div>
    <div className="intake-note"><strong>Δεν υπάρχει ακόμη Σύνοψη</strong><p>Η κλινική σύνοψη θα δημιουργηθεί από τα εγκεκριμένα δεδομένα της αρχικής αξιολόγησης.</p></div>
   </aside></div>
   <div className="intake-footer"><span>Demo MVP · Χρησιμοποιήστε μόνο ψεύτικα στοιχεία tester.{saveError&&<b className="intake-save-error"> {saveError}</b>}</span><button onClick={()=>void createPatient()} disabled={saving} className="save-intake">{saving?"Δημιουργία…":"Δημιουργία φακέλου"} <ChevronRight size={17}/></button></div>
  </section>
 </main>
}
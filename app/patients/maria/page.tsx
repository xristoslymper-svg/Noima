"use client";
import Link from "next/link";
import { useState } from "react";
import { ArrowLeft, Brain, CalendarDays, ChevronRight, ClipboardCheck, FileText, HeartPulse, Mic2, Pill, ShieldCheck, Sparkles, TestTube2, Mail, X, Check } from "lucide-react";
import { Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

const data=[{date:"Ιουν",phq:17,gad:14},{date:"Ιουλ",phq:14,gad:11},{date:"Αυγ",phq:11,gad:8},{date:"Σεπ",phq:7,gad:5}];
type Tab="Σύνοψη"|"Συνεδρίες"|"Ιστορικό"|"Αγωγή"|"Κλίμακες";

export default function Maria(){
 const [tab,setTab]=useState<Tab>("Σύνοψη");
 return <main className="clinical-page">
  <div className="clinical-top"><Link href="/" className="back"><ArrowLeft size={17}/> Επισκόπηση</Link><span>Κλινικός φάκελος · Υποθετική ασθενής MVP</span></div>
  <div className="patient-hero"><div><p className="eyebrow">ΕΠΟΜΕΝΗ ΣΥΝΕΔΡΙΑ · 11:00</p><h1>Μαρία</h1><p>32 ετών · τελευταία συνεδρία πριν 14 ημέρες · υποθετική ασθενής</p></div></div>
  <div className="patient-tabs">{(["Σύνοψη","Συνεδρίες","Ιστορικό","Αγωγή","Κλίμακες"] as Tab[]).map(x=><button key={x} onClick={()=>setTab(x)} className={tab===x?"active":""}>{x}</button>)}</div>
  {tab==="Σύνοψη"&&<Summary/>}{tab==="Συνεδρίες"&&<Sessions/>}{tab==="Ιστορικό"&&<History/>}{tab==="Αγωγή"&&<Meds/>}{tab==="Κλίμακες"&&<Tests/>}
 </main>
}

function Summary(){return <section className="patient-layout"><div className="patient-main">
 <div className="card focus-card"><span className="kicker">20″ ΠΡΙΝ ΤΗ ΣΥΝΕΔΡΙΑ</span><h2><Sparkles size={19}/> Τι χρειάζεται να θυμάστε σήμερα</h2>
  <div className="memory-lead">Σημαντική βελτίωση διάθεσης και άγχους από τον Ιούνιο. Μετά την αύξηση της sertraline στα 100 mg οι κρίσεις πανικού υποχώρησαν, αλλά εμφανίστηκε <b>μειωμένη libido</b>. Σήμερα χρειάζεται απόφαση για ανοχή έναντι οφέλους.</div>
  <div className="memory-grid"><div><strong>Από την τελευταία συνεδρία</strong><ul><li>Καμία κρίση πανικού τις τελευταίες 2 εβδομάδες</li><li>Ύπνος 6–7 ώρες, 1 νυχτερινή αφύπνιση</li><li>Επέστρεψε σε πλήρες ωράριο εργασίας</li><li>PHQ-9 17 → 7 · GAD-7 14 → 5</li></ul></div><div><strong>Να διερευνηθεί σήμερα</strong><ul><li>Ένταση και επίδραση της σεξουαλικής δυσλειτουργίας</li><li>Συμμόρφωση και τυχόν χαμένες δόσεις</li><li>Άγχος ενόψει παρουσίασης στη δουλειά</li><li>Επανεκτίμηση αυτοκτονικού ιδεασμού</li></ul></div></div>
  <div className="risk-strip"><ShieldCheck size={17}/> Στις 17/09: αρνήθηκε αυτοκτονικό ιδεασμό, πρόθεση ή σχέδιο. Χωρίς ιστορικό απόπειρας.</div>
 </div>
 <div className="card"><div className="card-head"><div><span className="kicker">ΠΟΡΕΙΑ 4 ΜΗΝΩΝ</span><h2>Κατάθλιψη & άγχος</h2></div><span className="trend-good">Βελτίωση</span></div><div className="chart patient-chart"><ResponsiveContainer width="100%" height={235}><LineChart data={data}><XAxis dataKey="date" tickLine={false} axisLine={false}/><YAxis domain={[0,20]} tickLine={false} axisLine={false} width={28}/><Tooltip/><Line type="monotone" dataKey="phq" stroke="#2f6f63" strokeWidth={3}/><Line type="monotone" dataKey="gad" stroke="#5d80c2" strokeWidth={3}/></LineChart></ResponsiveContainer></div><div className="legend"><span><i className="dot green"/> PHQ-9 · 7</span><span><i className="dot blue-dot"/> GAD-7 · 5</span></div></div>
 <div className="card"><span className="kicker">ΠΡΟΣΦΑΤΗ ΠΟΡΕΙΑ</span><h2>Σημαντικές αλλαγές</h2><div className="timeline"><div><span>03 ΣΕΠ</span><strong>Sertraline 50 → 100 mg</strong><p>Υπολειπόμενο άγχος και επεισόδια πανικού παρά μερική βελτίωση διάθεσης.</p></div><div><span>10 ΣΕΠ</span><strong>Πρώτη αναφορά μειωμένης libido</strong><p>Χρονική συσχέτιση με αύξηση δόσης. Χωρίς άλλη νέα ανεπιθύμητη ενέργεια.</p></div><div><span>17 ΣΕΠ</span><strong>Κλινική βελτίωση</strong><p>Χωρίς νέα κρίση πανικού, καλύτερη συγκέντρωση και επιστροφή σε πλήρες ωράριο.</p></div></div></div>
 </div><PatientSide/></section>}

function PatientSide(){return <aside className="patient-side"><div className="card side-card"><span className="kicker">ΚΛΙΝΙΚΗ ΕΙΚΟΝΑ</span><Info icon={<Brain/>} label="Διαγνώσεις" value="Μείζον καταθλιπτικό επεισόδιο · Διαταραχή πανικού"/><Info icon={<Pill/>} label="Αγωγή" value="Sertraline 100 mg πρωί · Trazodone 50 mg βράδυ"/><Info icon={<HeartPulse/>} label="Παρενέργεια" value="Μειωμένη libido — μέτρια ενόχληση"/><Info icon={<CalendarDays/>} label="Επανεκτίμηση" value="Σήμερα · 11:00"/></div><div className="card side-card"><span className="kicker">ΤΕΛΕΥΤΑΙΑ ΔΕΔΟΜΕΝΑ</span><Info icon={<TestTube2/>} label="PHQ-9" value="7 · ήπια συμπτώματα"/><Info icon={<TestTube2/>} label="GAD-7" value="5 · ήπιο άγχος"/><Info icon={<ClipboardCheck/>} label="Συμμόρφωση" value="Καλή · 1 χαμένη δόση/μήνα"/></div><Link href="/patients/maria/dictation" className="next-action"><FileText size={18}/><div><strong>Μετά τη συνεδρία</strong><span>Υπαγόρευση σύντομης κλινικής σημείωσης</span></div><ChevronRight size={18}/></Link></aside>}

function History(){return <TabPage title="Κλινικό ιστορικό" subtitle="Η ιστορία της Μαρίας σε κλινικά χρήσιμη μορφή."><div className="detail-grid"><Detail title="Έναρξη & πορεία" text="Πρώτη προσέλευση 06/06 με 3μηνη περίοδο καταθλιπτικής διάθεσης, ανηδονίας, πρωινής κόπωσης, δυσκολίας συγκέντρωσης και αυξανόμενων κρίσεων πανικού. Επιβάρυνση μετά από αλλαγή ρόλου στην εργασία."/><Detail title="Κρίσεις πανικού" text="Αρχικά 2–3/εβδομάδα, διάρκειας 10–20 λεπτών, με ταχυκαρδία, δύσπνοια και φόβο απώλειας ελέγχου. Τελευταία κρίση 31/08."/><Detail title="Ύπνος" text="Αρχικά 4–5 ώρες με συχνές αφυπνίσεις. Τώρα 6–7 ώρες, συνήθως μία αφύπνιση. Trazodone 50 mg με καλή ανοχή."/><Detail title="Λειτουργικότητα" text="Τον Ιούνιο είχε μειώσει προσωρινά το ωράριο. Από 15/09 εργάζεται ξανά πλήρες ωράριο. Παραμένει anticipatory anxiety πριν από παρουσιάσεις."/><Detail title="Ψυχιατρικό ιστορικό" text="Χωρίς προηγούμενη νοσηλεία ή απόπειρα αυτοκτονίας. Σύντομη ψυχοθεραπεία στα 26 για άγχος εξετάσεων. Δεν αναφέρεται προηγούμενο μανιακό ή ψυχωτικό επεισόδιο."/><Detail title="Ουσίες & συνήθειες" text="Αλκοόλ 1–2 ποτά/εβδομάδα. Δεν αναφέρει χρήση άλλων ουσιών. Καφές 2/ημέρα, αποφεύγει καφεΐνη μετά τις 15:00."/><Detail title="Οικογενειακό ιστορικό" text="Μητέρα με ιστορικό καταθλιπτικού επεισοδίου. Δεν αναφέρεται γνωστό οικογενειακό ιστορικό διπολικής διαταραχής ή αυτοκτονίας."/><Detail title="Προστατευτικοί παράγοντες" text="Σταθερή σχέση, καλή επαφή με αδελφή, εργασία που επιθυμεί να διατηρήσει, θεραπευτική συνεργασία και καλή προσήλωση." /></div></TabPage>}

function Meds(){return <TabPage title="Φάρμακα" subtitle="Τρέχουσα αγωγή, αλλαγές, ανταπόκριση και ανεπιθύμητες ενέργειες."><div className="med-list"><Medication name="Sertraline" current="100 mg · πρωί" started="06/06: 25 mg → 13/06: 50 mg → 03/09: 100 mg" response="Σαφής βελτίωση διάθεσης και κρίσεων πανικού μετά την τιτλοποίηση." adverse="Μειωμένη libido από την πρώτη εβδομάδα στα 100 mg. Δεν αναφέρει ναυτία ή τρόμο."/><Medication name="Trazodone" current="50 mg · βράδυ" started="20/06: έναρξη 50 mg" response="Ύπνος από 4–5 ώρες σε 6–7 ώρες. Λιγότερες νυχτερινές αφυπνίσεις." adverse="Ήπια πρωινή υπνηλία τις πρώτες ημέρες, πλέον όχι."/></div><div className="card tab-card"><span className="kicker">ΣΥΜΜΟΡΦΩΣΗ</span><h2>Λήψη αγωγής</h2><p>Η Μαρία αναφέρει καθημερινή λήψη. Μία χαμένη πρωινή δόση sertraline τον τελευταίο μήνα. Δεν έχει διακόψει μόνη της φάρμακο.</p></div></TabPage>}

function Tests(){
 const [open,setOpen]=useState<string|null>(null);
 const [sent,setSent]=useState<string[]>([]);
 const [done,setDone]=useState<string[]>([]);
 const scales=[["PHQ-9","Κατάθλιψη","7 · ήπια συμπτώματα"],["GAD-7","Άγχος","5 · ήπιο άγχος"],["ASRS","ΔΕΠΥ ενηλίκων","Δεν έχει συμπληρωθεί"],["AUDIT-C","Χρήση αλκοόλ","Δεν έχει συμπληρωθεί"]];
 return <TabPage title="Κλίμακες & πρόοδος" subtitle="Μετρήσεις που συμπληρώνουν — δεν αντικαθιστούν — την κλινική εκτίμηση.">
  <div className="scale-library">{scales.map(([name,purpose,status])=><div className="scale-library-card" key={name}><div><span className="scale-name">{name}</span><small>{purpose}</small></div><strong>{done.includes(name)?"Ολοκληρώθηκε σήμερα":status}</strong><div className="scale-card-actions"><button onClick={()=>setOpen(name)}>Συμπλήρωση</button><button className={sent.includes(name)?"sent":""} onClick={()=>setSent(v=>v.includes(name)?v:[...v,name])}>{sent.includes(name)?<><Check size={13}/> Στάλθηκε</>:<><Mail size={13}/> Αποστολή</>}</button></div></div>)}</div>
  <div className="test-table"><div className="test-head"><span>Ημερομηνία</span><span>PHQ-9</span><span>GAD-7</span><span>Κλινική εικόνα</span></div>{[["06/06","17","14","Μέτρια-σοβαρά συμπτώματα, συχνές κρίσεις πανικού"],["04/07","14","11","Μερική βελτίωση ύπνου και διάθεσης"],["08/08","11","8","Λιγότερη αποφυγή, καλύτερη λειτουργικότητα"],["17/09","7","5","Ήπια υπολειπόμενα συμπτώματα"]].map(r=><div className="test-row" key={r[0]}>{r.map(x=><span key={x}>{x}</span>)}</div>)}</div>
  {open&&<div className="scale-modal-backdrop" onClick={()=>setOpen(null)}><div className="scale-modal" onClick={e=>e.stopPropagation()}><div className="scale-modal-head"><div><span className="kicker">ΚΛΙΜΑΚΑ · DEMO</span><h3>{open}</h3><p>Συμπλήρωση στο ιατρείο ή από τον ασθενή μέσω ασφαλούς συνδέσμου.</p></div><button onClick={()=>setOpen(null)}><X size={18}/></button></div><div className="demo-question"><strong>Τις τελευταίες 2 εβδομάδες, πόσο συχνά σας ενόχλησε το παρακάτω;</strong><p>Μειωμένο ενδιαφέρον ή ευχαρίστηση για δραστηριότητες.</p>{["Καθόλου","Μερικές ημέρες","Πάνω από τις μισές ημέρες","Σχεδόν κάθε ημέρα"].map(x=><label key={x}><input type="radio" name="demo"/>{x}</label>)}</div><button className="save-intake" onClick={()=>{setDone(v=>v.includes(open)?v:[...v,open]);setOpen(null)}}>Αποθήκευση κλίμακας</button></div></div>}
 </TabPage>
}

function Sessions(){
 const demo={
  interview:"Χωρίς νέα κρίση πανικού από την προηγούμενη επίσκεψη. Αναφέρει ύπνο 6–7 ώρες και λιγότερο άγχος στην εργασία, με ήπια ένταση πριν από παρουσιάσεις. Έχει επιστρέψει σε πλήρες ωράριο και δεν αναφέρει νέο σημαντικό στρεσογόνο γεγονός.",
  effects:"Η μειωμένη libido επιμένει μετά την αύξηση της sertraline στα 100 mg και προκαλεί μέτρια ενόχληση.",
  adherence:"Καλή συνέπεια στη λήψη. Αναφέρει μία χαμένη πρωινή δόση sertraline τον τελευταίο μήνα.",
  mse:"Συνεργάσιμη, καλή βλεμματική επαφή. Λόγος φυσιολογικού ρυθμού. Διάθεση βελτιωμένη, συναίσθημα κατάλληλο. Χωρίς αναφερόμενα ψυχωτικά στοιχεία.",
  risk:"Αρνείται αυτοκτονικό ιδεασμό, πρόθεση ή σχέδιο. Χωρίς ιστορικό απόπειρας. Παρόντες προστατευτικοί παράγοντες.",
  assessment:"Συνεχιζόμενη κλινική βελτίωση καταθλιπτικών και αγχωδών συμπτωμάτων. Κύριο τρέχον ζήτημα η ανεκτικότητα της αγωγής λόγω σεξουαλικής δυσλειτουργίας.",
  plan:"Συνέχιση sertraline 100 mg προς το παρόν. Παρακολούθηση σεξουαλικής δυσλειτουργίας και συζήτηση επιλογών εάν επιμένει. Συνέχιση trazodone 50 mg.",
  review:"Επανεκτίμηση σε 4 εβδομάδες ή νωρίτερα εάν υπάρξει επιδείνωση."
 } as const;
 type Key=keyof typeof demo;
 const [fields,setFields]=useState<Partial<Record<Key,string>>>({});
 const [recording,setRecording]=useState<Key|null>(null);
 const dictate=(key:Key)=>{setRecording(key); window.setTimeout(()=>{setFields(v=>({...v,[key]:demo[key]}));setRecording(null)},650)};
 const sections:[Key,string,string][]=[
  ["interview","Ψυχιατρική συνέντευξη","Συμπτώματα, πορεία, λειτουργικότητα και σημαντικά γεγονότα"],
  ["effects","Παρενέργειες","Ανεπιθύμητες ενέργειες και επίδραση"],
  ["adherence","Συμμόρφωση στην αγωγή","Λήψη, παραλείψεις και δυσκολίες"],
  ["mse","Εξέταση ψυχικής κατάστασης (MSE)","Σημερινά ευρήματα και μεταβολές"],
  ["risk","Εκτίμηση κινδύνου","Αυτοκτονικότητα, αυτοβλάβη και προστατευτικοί παράγοντες"],
  ["assessment","Διάγνωση & κλινική εκτίμηση","Τρέχουσα κλινική διατύπωση"],
  ["plan","Θεραπευτικό πλάνο","Αγωγή, παρεμβάσεις και επόμενα βήματα"],
  ["review","Επόμενη επανεκτίμηση","Χρόνος και λόγος επόμενου follow-up"]
 ];
 return <section className="session-workspace">
  <div className="session-work-head">
   <div><div className="visit-label"><span>FOLLOW-UP</span><i/> 1 ΟΚΤΩΒΡΙΟΥ · 11:00</div><h2>Σημερινή συνεδρία</h2><p>Κάθε ενότητα μπορεί να συμπληρωθεί με κείμενο ή με στοχευμένη υπαγόρευση.</p></div>
   <Link href="/patients/maria/dictation" className="record compact"><Mic2 size={17}/> Υπαγόρευση συνολικής συνεδρίας</Link>
  </div>

  <div className="visit-context"><div className="visit-context-title"><span className="kicker">ΑΠΟ ΤΗΝ ΠΡΟΗΓΟΥΜΕΝΗ ΕΠΙΣΚΕΨΗ</span><span>Γρήγορη εικόνα πριν την καταγραφή</span></div><div className="followup-snapshot">
   <div><span>PHQ-9</span><strong>11 → 7</strong><small>από προηγούμενη μέτρηση</small></div>
   <div><span>GAD-7</span><strong>8 → 5</strong><small>από προηγούμενη μέτρηση</small></div>
   <div><span>Αγωγή</span><strong>Sertraline 100 mg</strong><small>αύξηση από 50 mg</small></div>
   <div><span>Κύριο θέμα</span><strong>Μειωμένη libido</strong><small>μετά την αύξηση δόσης</small></div>
  </div></div>

  <div className="sections-label"><span className="kicker">ΚΑΤΑΓΡΑΦΗ ΣΥΝΕΔΡΙΑΣ</span><span>Πατήστε το μικρόφωνο της ενότητας που θέλετε να συμπληρώσετε</span></div>
  <div className="clinical-sections">
   {sections.map(([key,title,hint])=><div className={fields[key]?"clinical-section populated":"clinical-section"} key={key}>
    <div className="clinical-section-head"><div><h3>{title}</h3><span>{hint}</span></div><button className={recording===key?"section-mic recording":"section-mic"} onClick={()=>dictate(key)} disabled={recording!==null} aria-label={"Υπαγόρευση: "+title}><Mic2 size={17}/>{recording===key?" Ακούω…":" Υπαγόρευση"}</button></div>
    {fields[key]?<div className="section-content"><p>{fields[key]}</p><button onClick={()=>setFields(v=>({...v,[key]:undefined}))}>Καθαρισμός</button></div>:<div className="section-empty">Δεν έχει καταγραφεί ακόμη περιεχόμενο.</div>}
   </div>)}
  </div>
  <div className="session-save"><span><ShieldCheck size={16}/> Demo: η υπαγόρευση δημιουργεί πρόταση προς έλεγχο από τον ψυχίατρο.</span><button>Έγκριση & αποθήκευση συνεδρίας</button></div>

  <div className="previous-visits"><span className="kicker">ΠΡΟΗΓΟΥΜΕΝΕΣ ΣΥΝΕΔΡΙΕΣ</span><h3>Κλινική πορεία</h3>
   <Note date="17/09" title="Follow-up αγωγής" text="Χωρίς κρίση πανικού από 31/08. Διάθεση σαφώς καλύτερη. Μειωμένη libido μετά την αύξηση sertraline. Αρνείται SI/plan/intent."/>
   <Note date="03/09" title="Follow-up · αλλαγή αγωγής" text="Μερική ανταπόκριση στα 50 mg, αλλά παραμένει anticipatory anxiety. Συμφωνήθηκε αύξηση sertraline σε 100 mg."/>
   <Note date="06/06" title="Αρχική αξιολόγηση" text="Καταθλιπτική διάθεση, ανηδονία, κόπωση, δυσκολία συγκέντρωσης και 2–3 κρίσεις πανικού/εβδομάδα. Χωρίς ιστορικό μανίας/ψύχωσης."/>
  </div>
 </section>
}

function TabPage({title,subtitle,children}:{title:string,subtitle:string,children:React.ReactNode}){return <section className="tab-page"><div className="tab-heading"><h2>{title}</h2><p>{subtitle}</p></div>{children}</section>}
function Detail({title,text}:{title:string,text:string}){return <div className="card detail-card"><h3>{title}</h3><p>{text}</p></div>}
function Medication({name,current,started,response,adverse}:{name:string,current:string,started:string,response:string,adverse:string}){return <div className="card medication-card"><div><span className="kicker">ΕΝΕΡΓΟ</span><h2>{name}</h2><strong>{current}</strong></div><div className="med-facts"><p><b>Ιστορικό δόσης:</b> {started}</p><p><b>Ανταπόκριση:</b> {response}</p><p><b>Ανεπιθύμητες:</b> {adverse}</p></div></div>}
function Note({date,title,text}:{date:string,title:string,text:string}){return <div className="card note-card"><div><span>{date}</span><strong>{title}</strong></div><p>{text}</p></div>}
function Info({icon,label,value}:{icon:React.ReactNode,label:string,value:string}){return <div className="side-info"><span>{icon}</span><div><small>{label}</small><strong>{value}</strong></div></div>}

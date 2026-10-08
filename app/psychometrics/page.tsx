"use client";
import PilotProfile from '@/components/PilotProfile';
import IntakeLauncher from '@/components/intake/IntakeLauncher';
import Link from "next/link";
import { useMemo, useState } from "react";
import { diagnosisOptions, familyConditions, familyRelations, medicalOptions, reasonOptions, substanceOptions } from '@/lib/intake/history';
import { Check, ChevronRight, Clock3, Eye, Mail, Plus, Search, ShieldCheck, Tablet, Trash2, X, Printer, UserRound, ChevronDown, UploadCloud, FileText, Sparkles, Bell, Activity, Home, Settings, Stethoscope, Users, CalendarDays, Menu } from "lucide-react";

type Instrument={code:string;title:string;area:string;minutes:string;source:string;period:string;items:string[];options:{label:string;score:number}[];interpret:(n:number)=>string};
const frequency=[{label:"Καθόλου",score:0},{label:"Μερικές μέρες",score:1},{label:"Περισσότερες από τις μισές μέρες",score:2},{label:"Σχεδόν κάθε μέρα",score:3}];
const phq=["Είχατε μικρό ενδιαφέρον για δραστηριότητες ή λίγη ευχαρίστηση από δραστηριότητες","Νιώσατε πεσμένος(η), καταθλιμμένος(η) ή απελπισμένος(η)","Είχατε πρόβλημα να αποκοιμηθείτε ή να συνεχίσετε τον ύπνο σας ή κοιμόσασταν υπερβολικά","Νιώθατε κουρασμένος(η) ή είχατε λίγη ενέργεια","Είχατε μειωμένη όρεξη ή τρώγατε υπερβολικά","Νιώθατε άσχημα για τον εαυτό σας ή ότι έχετε αποτύχει ή ότι έχετε απογοητεύσει τον εαυτό σας ή την οικογένειά σας.","Είχατε πρόβλημα συγκέντρωσης σε κάποιες δραστηριότητες, όπως όταν διαβάζατε εφημερίδα ή όταν παρακολουθούσατε τηλεόραση","Κινιόσασταν ή μιλάγατε τόσο αργά που άλλοι άνθρωποι το παρατηρούσαν ή το αντίθετο, είσαστε τόσο ανήσυχος(η) ή νευρικός(ή), που κινιόσασταν πολύ περισσότερο από ότι συνήθως","Σκεπτόσασταν ότι θα ήταν καλύτερα αν είχατε πεθάνει ή σκεπτόσασταν να προκαλέσετε κακό στον εαυτό σας με κάποιο τρόπο"];
const gad=["Αισθανθήκατε νεύρα, άγχος ή ένταση","Δεν μπορούσατε να σταματήσετε ή να ελέγξετε το άγχος σας","Ανησυχούσατε υπερβολικά για διάφορα πράγματα","Δυσκολευόσασταν να χαλαρώσετε","Είχατε τόσο μεγάλη ανησυχία που δεν μπορούσατε να καθίσετε ακίνητος(η)","Νιώθατε εύκολα ενόχληση ή εκνευρισμό","Φοβόσασταν ότι κάτι φρικτό μπορεί να συμβεί"];
const pclOptions=[{label:"Not at all",score:0},{label:"A little bit",score:1},{label:"Moderately",score:2},{label:"Quite a bit",score:3},{label:"Extremely",score:4}];
const pcl=["Repeated, disturbing, and unwanted memories of the stressful experience?","Repeated, disturbing dreams of the stressful experience?","Suddenly feeling or acting as if the stressful experience were actually happening again (as if you were actually back there reliving it)?","Feeling very upset when something reminded you of the stressful experience?","Having strong physical reactions when something reminded you of the stressful experience (for example, heart pounding, trouble breathing, sweating)?","Avoiding memories, thoughts, or feelings related to the stressful experience?","Avoiding external reminders of the stressful experience (for example, people, places, conversations, activities, objects, or situations)?","Trouble remembering important parts of the stressful experience?","Having strong negative beliefs about yourself, other people, or the world (for example, having thoughts such as: I am bad, there is something seriously wrong with me, no one can be trusted, the world is completely dangerous)?","Blaming yourself or someone else for the stressful experience or what happened after it?","Having strong negative feelings such as fear, horror, anger, guilt, or shame?","Loss of interest in activities that you used to enjoy?","Feeling distant or cut off from other people?","Trouble experiencing positive feelings (for example, being unable to feel happiness or have loving feelings for people close to you)?","Irritable behavior, angry outbursts, or acting aggressively?","Taking too many risks or doing things that could cause you harm?","Being “superalert” or watchful or on guard?","Feeling jumpy or easily startled?","Having difficulty concentrating?","Trouble falling or staying asleep?"];
const categories=["Όλα","Κατάθλιψη","Άγχος","ADHD","PTSD","Διπολική","OCD","Ουσίες","Ύπνος","Άλλα"] as const;
const instruments:Instrument[]=[
 {code:"PHQ-9",title:"Ερωτηματολόγιο Υγείας Ασθενούς",area:"Κατάθλιψη",minutes:"2–5 λεπτά",source:"Επίσημη ελληνική έκδοση PHQ",period:"Τις τελευταίες 2 εβδομάδες",items:phq,options:frequency,interpret:n=>n<5?"Ελάχιστη συμπτωματολογία":n<10?"Ήπια":n<15?"Μέτρια":n<20?"Μετρίως σοβαρή":"Σοβαρή"},
 {code:"GAD-7",title:"Generalized Anxiety Disorder",area:"Άγχος",minutes:"2–3 λεπτά",source:"Επίσημη ελληνική έκδοση GAD-7",period:"Τις τελευταίες 2 εβδομάδες",items:gad,options:frequency,interpret:n=>n<5?"Ελάχιστη συμπτωματολογία":n<10?"Ήπια":n<15?"Μέτρια":"Σοβαρή"},
 {code:"PHQ-4",title:"Patient Health Questionnaire-4",area:"Κατάθλιψη / Άγχος",minutes:"1–2 λεπτά",source:"Ελληνικά επικυρωμένο ultra-short screening",period:"Τις τελευταίες 2 εβδομάδες",items:[phq[0],phq[1],gad[0],gad[1]],options:frequency,interpret:n=>n<3?"Φυσιολογικό εύρος":n<6?"Ήπια επιβάρυνση":n<9?"Μέτρια επιβάρυνση":"Σοβαρή επιβάρυνση"},
 {code:"PHQ-2",title:"Patient Health Questionnaire-2",area:"Κατάθλιψη",minutes:"< 1 λεπτό",source:"2 πρώτα λήμματα του PHQ-9",period:"Τις τελευταίες 2 εβδομάδες",items:[phq[0],phq[1]],options:frequency,interpret:n=>n>=3?"Θετικό screening — χρειάζεται περαιτέρω αξιολόγηση":"Αρνητικό screening"},
 {code:"GAD-2",title:"Generalized Anxiety Disorder-2",area:"Άγχος",minutes:"< 1 λεπτό",source:"2 πρώτα λήμματα του GAD-7",period:"Τις τελευταίες 2 εβδομάδες",items:[gad[0],gad[1]],options:frequency,interpret:n=>n>=3?"Θετικό screening — χρειάζεται περαιτέρω αξιολόγηση":"Αρνητικό screening"},
 {code:"PCL-5",title:"PTSD Checklist for DSM-5",area:"PTSD",minutes:"5–10 λεπτά",source:"U.S. National Center for PTSD · Public domain",period:"In the past month",items:pcl,options:pclOptions,interpret:n=>n>=33?"Score ≥33 — warrants clinical PTSD assessment":n>=31?"Score 31–32 — within suggested provisional cutoff range":"Below suggested provisional cutoff range"}
];

export default function Psychometrics(){
 const [mobileNav,setMobileNav]=useState(false);
 const [query,setQuery]=useState(""); const [category,setCategory]=useState<string>("Όλα"); const [active,setActive]=useState<Instrument|null>(null); const [answers,setAnswers]=useState<Record<number,number>>({}); const [launcherRequest,setLauncherRequest]=useState<{tools:string[];channel:"tablet"|"email"|"print"}|null>(null); const [historyPreview,setHistoryPreview]=useState(false); const [customOpen,setCustomOpen]=useState(false); const [custom,setCustom]=useState({title:"",area:"",period:"",questions:[""]}); const [customInstruments,setCustomInstruments]=useState<Instrument[]>([]);
 const visible=useMemo(()=>[...instruments,...customInstruments].filter(x=>{const categoryMatch=category==="Όλα"||(category==="Άγχος"&&x.area.includes("Άγχος"))||(category==="Κατάθλιψη"&&x.area.includes("Κατάθλιψη"))||x.area===category;return categoryMatch&&(x.code+" "+x.area+" "+x.title).toLowerCase().includes(query.toLowerCase())}),[query,category,customInstruments]);
 const open=(i:Instrument)=>{setActive(i);setAnswers({})}; const launch=(tools:string[],channel:"tablet"|"email"|"print")=>setLauncherRequest({tools,channel}); const score=Object.values(answers).reduce((a,b)=>a+b,0); const complete=active?Object.keys(answers).length===active.items.length:false;
 return <main className="app-shell secondary-shell"><aside className={mobileNav?"sidebar mobile-open":"sidebar"}><button className="mobile-nav-close" onClick={()=>setMobileNav(false)} aria-label="Κλείσιμο μενού"><X size={20}/></button><div className="brand"><div className="brand-mark">Ψ</div><div className="brand-copy"><div className="brand-sub">Για μια οργανωμένη κλινική πράξη</div></div></div><nav className="nav"><Link href="/" className="nav-item"><Home size={19}/><span>Επισκόπηση</span></Link><Link href="/calendar" className="nav-item"><CalendarDays size={19}/><span>Ημερολόγιο</span></Link><Link href="/patients" className="nav-item"><Users size={19}/><span>Ασθενείς</span></Link><Link href="/psychometrics" className="nav-item active"><Activity size={19}/><span>Βιβλιοθήκη</span></Link></nav></aside>{mobileNav&&<button className="mobile-nav-backdrop" aria-label="Κλείσιμο μενού" onClick={()=>setMobileNav(false)}/>}<section className="workspace"><header className="topbar"><button className="mobile-menu-button" onClick={()=>setMobileNav(true)} aria-label="Άνοιγμα μενού"><Menu size={21}/></button><div className="search"><span>Ψ · βιβλιοθήκη κλινικών εργαλείων</span></div><PilotProfile/></header><div className="secondary-content psy-page"><div className="psy-content library-redesign"><div className="library-heading">
  <div>
    <h1>Βιβλιοθήκη</h1>
    <p>Ιστορικό και κλινικά εργαλεία για χρήση με τους ασθενείς σου.</p>
  </div>
  <div className="library-utility-actions">
    <Link href="/scan" className="library-utility"><UploadCloud size={15}/> Σάρωση εντύπου</Link>
    <button className="library-utility" onClick={()=>setCustomOpen(true)}><Plus size={15}/> Νέο τεστ</button>
  </div>
 </div>

 <div className="library-searchbar"><Search size={17}/><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Αναζήτηση εργαλείου"/></div>

 <section className="library-family">
  <div className="library-family-heading">
    <div><span>Ιστορικό</span><small>Έντυπα πριν και κατά την πρώτη επίσκεψη</small></div>
  </div>
  <div className="history-tool-grid">
   <article className="instrument-card library-instrument-card compact-psychometric-card compact-history-card" role="button" tabIndex={0} aria-label="Προεπισκόπηση αρχικού ιστορικού" onClick={()=>setHistoryPreview(true)} onKeyDown={e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();setHistoryPreview(true)}}}>
    <div className="instrument-top"><span className="instrument-code history-code"><FileText size={13}/> ΙΣΤΟΡΙΚΟ</span><span className="instrument-time"><Clock3 size={12}/>7–10 λεπτά</span></div>
    <div className="instrument-category">Πρώτη επίσκεψη</div>
    <h2>Αρχικό ιστορικό</h2>
    <p>Δομημένο ιστορικό ασθενούς με επιλογές και branching.</p>
    <div className="instrument-meta"><span>8 βασικές ενότητες</span><small>Κυρίως επιλογές · ελάχιστη πληκτρολόγηση</small></div>
    <div className="instrument-actions library-card-actions icon-only-actions" onClick={e=>e.stopPropagation()}>
      <button title="Tablet" aria-label="Αποστολή αρχικού ιστορικού σε tablet" onClick={e=>{e.stopPropagation();launch(["history"],"tablet")}}><Tablet size={15}/></button>
      <button title="Email" aria-label="Αποστολή αρχικού ιστορικού με email" onClick={e=>{e.stopPropagation();launch(["history"],"email")}}><Mail size={15}/></button>
      <button title="Εκτύπωση" aria-label="Εκτύπωση αρχικού ιστορικού" onClick={e=>{e.stopPropagation();launch(["history"],"print")}}><Printer size={15}/></button>
    </div>
   </article>
  </div>
 </section>

 <section className="library-family psychometric-family">
  <div className="library-family-heading library-psych-heading">
    <div><span>Ψυχομετρικά</span><small>Βρες γρήγορα το κατάλληλο εργαλείο ανά κλινική περιοχή</small></div>
    <small className="library-clinical-note">Screening & παρακολούθηση · όχι αυτόνομη διάγνωση</small>
  </div>
  <div className="category-tabs library-category-tabs">{categories.map(cat=><button key={cat} className={category===cat?"active":""} onClick={()=>setCategory(cat)}>{cat}</button>)}</div>
  <section className="psy-grid">{visible.map(i=>{const assignable=['PHQ-9','GAD-7'].includes(i.code);return <article className="instrument-card library-instrument-card compact-psychometric-card" key={i.code} role="button" tabIndex={0} aria-label={`Προεπισκόπηση ${i.code}`} onClick={()=>open(i)} onKeyDown={e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();open(i)}}}>
    <div className="instrument-top"><span className="instrument-code">{i.code}</span><span className="instrument-time"><Clock3 size={12}/>{i.minutes}</span></div>
    <div className="instrument-category">{i.area}</div>
    <h2>{i.code}</h2>
    <p>{i.title}</p>
    <div className="instrument-meta"><span>{i.items.length} ερωτήσεις</span><small>{i.source}</small></div>
    <div className="instrument-actions library-card-actions icon-only-actions" onClick={e=>e.stopPropagation()}>
      <button disabled={!assignable} title={assignable?"Tablet":"Η ηλεκτρονική ανάθεση δεν υποστηρίζεται ακόμη για αυτό το εργαλείο"} aria-label={assignable?`Αποστολή ${i.code} σε tablet`:`Tablet μη διαθέσιμο για ${i.code}`} onClick={e=>{e.stopPropagation();if(assignable)launch([i.code],"tablet")}}><Tablet size={15}/></button>
      <button disabled={!assignable} title={assignable?"Email":"Η ηλεκτρονική ανάθεση δεν υποστηρίζεται ακόμη για αυτό το εργαλείο"} aria-label={assignable?`Αποστολή ${i.code} με email`:`Email μη διαθέσιμο για ${i.code}`} onClick={e=>{e.stopPropagation();if(assignable)launch([i.code],"email")}}><Mail size={15}/></button>
      <button title="Εκτύπωση" aria-label={`Εκτύπωση ${i.code}`} onClick={e=>{e.stopPropagation();if(assignable)launch([i.code],"print");else{setActive(i);setAnswers({});setTimeout(()=>window.print(),100)}}}><Printer size={15}/></button>
    </div>
   </article>})}</section>
 </section>
 </div>
 {launcherRequest&&<IntakeLauncher defaultTools={launcherRequest.tools} initialChannel={launcherRequest.channel} onClose={()=>setLauncherRequest(null)}/>}
 {historyPreview&&<div className="instrument-overlay" onClick={()=>setHistoryPreview(false)}><section className="library-history-preview real-history-preview" onClick={e=>e.stopPropagation()}><button className="instrument-floating-close" onClick={()=>setHistoryPreview(false)} aria-label="Κλείσιμο προεπισκόπησης"><X size={19}/></button><span className="kicker">ΠΡΟΕΠΙΣΚΟΠΗΣΗ ΕΡΩΤΗΜΑΤΟΛΟΓΙΟΥ</span><h2>Αρχικό ιστορικό</h2><p>Αυτή είναι η μορφή που βλέπει ο ασθενής. Οι περισσότερες απαντήσεις δίνονται με επιλογές και εμφανίζονται πρόσθετες ερωτήσεις μόνο όταν χρειάζεται.</p><div className="history-preview-meta"><span>7–10 λεπτά</span><span>8 ενότητες</span><span>Κυρίως επιλογές</span></div><HistoryQuestionnairePreview/></section></div>}
 {customOpen&&<div className="instrument-overlay" onClick={()=>setCustomOpen(false)}><section className="custom-test-sheet" onClick={e=>e.stopPropagation()}><header><div><span className="kicker">ΔΟΚΙΜΑΣΤΙΚΗ ΔΗΜΙΟΥΡΓΙΑ</span><h2>Προεπισκόπηση δικού μου τεστ</h2><p>Δημιουργήστε ένα ερωτηματολόγιο που χρησιμοποιείτε ήδη. Σε αυτή την έκδοση παραμένει μόνο στην τρέχουσα συνεδρία και δεν αποθηκεύεται μόνιμα.</p></div><button onClick={()=>setCustomOpen(false)}><X size={19}/></button></header><div className="custom-fields"><label>Όνομα τεστ<input value={custom.title} onChange={e=>setCustom(v=>({...v,title:e.target.value}))} placeholder="π.χ. Κλίμακα παρακολούθησης ύπνου"/></label><label>Κλινική περιοχή<input value={custom.area} onChange={e=>setCustom(v=>({...v,area:e.target.value}))} placeholder="π.χ. Ύπνος"/></label><label>Χρονικό πλαίσιο<input value={custom.period} onChange={e=>setCustom(v=>({...v,period:e.target.value}))} placeholder="π.χ. Τις τελευταίες 7 ημέρες"/></label><div className="custom-q-head"><strong>Ερωτήσεις</strong><span>Απαντήσεις: 0 Καθόλου · 1 Μερικές μέρες · 2 Συχνά · 3 Σχεδόν κάθε μέρα</span></div>{custom.questions.map((q,i)=><div className="custom-q" key={i}><span>{i+1}</span><textarea value={q} onChange={e=>setCustom(v=>({...v,questions:v.questions.map((x,j)=>j===i?e.target.value:x)}))} placeholder="Γράψτε την ερώτηση ακριβώς όπως θέλετε να εμφανίζεται"/>{custom.questions.length>1&&<button onClick={()=>setCustom(v=>({...v,questions:v.questions.filter((_,j)=>j!==i)}))}><Trash2 size={15}/></button>}</div>)}<button className="add-question" onClick={()=>setCustom(v=>({...v,questions:[...v.questions,""]}))}><Plus size={15}/> Προσθήκη ερώτησης</button><div className="custom-caution"><ShieldCheck size={16}/><span>Για προστατευμένα ή αδειοδοτούμενα εργαλεία, ο ιατρός είναι υπεύθυνος να διαθέτει τα απαραίτητα δικαιώματα χρήσης.</span></div></div><footer><button className="secondary-custom" onClick={()=>setCustomOpen(false)}>Ακύρωση</button><button disabled={!custom.title.trim()||!custom.area.trim()||custom.questions.some(q=>!q.trim())} onClick={()=>{const n:Instrument={code:"ΔΙΚΟ ΜΟΥ",title:custom.title.trim(),area:custom.area.trim(),minutes:`${Math.max(1,Math.ceil(custom.questions.length/3))}–${Math.max(2,Math.ceil(custom.questions.length/2))} λεπτά`,source:"Προσωπικό εργαλείο ιατρού",period:custom.period.trim()||"Τρέχουσα αξιολόγηση",items:custom.questions.map(q=>q.trim()),options:frequency,interpret:n=>`Συνολική βαθμολογία ${n}`};setCustomInstruments(v=>[...v,n]);setCustom({title:"",area:"",period:"",questions:[""]});setCustomOpen(false)}}>Προσθήκη στην προεπισκόπηση</button></footer></section></div>}
 {active&&<div className="instrument-overlay" onClick={()=>setActive(null)}><section className="instrument-sheet" onClick={e=>e.stopPropagation()}><header><div><span className="instrument-code">{active.code}</span><h2>{active.title}</h2><p>{active.period} — {active.code==="PCL-5"?"how much were you bothered by the following problems?":"πόσο συχνά σας ενόχλησαν τα παρακάτω προβλήματα;"}</p></div><button className="instrument-floating-close" onClick={()=>setActive(null)} aria-label="Κλείσιμο τεστ"><X size={19}/></button></header><div className="assessment-patient"><UserRound size={16}/><span>Προεπισκόπηση βιβλιοθήκης — δεν συνδέεται με ασθενή και δεν αποθηκεύεται. Για πραγματική ανάθεση ανοίξτε τον φάκελο ασθενούς.</span></div><div className="instrument-progress"><div style={{width:`${(Object.keys(answers).length/active.items.length)*100}%`}}/><span>{Object.keys(answers).length} / {active.items.length}</span></div><div className="instrument-questions">{active.items.map((q,idx)=><div className="instrument-question" key={q}><strong><span>{idx+1}</span>{q}</strong><div>{active.options.map(o=><button className={answers[idx]===o.score?"selected":""} key={o.score} onClick={()=>setAnswers(v=>({...v,[idx]:o.score}))}><i>{o.score}</i>{o.label}</button>)}</div>{active.code==="PHQ-9"&&idx===8&&answers[idx]!==undefined&&answers[idx]>0&&<div className="risk-answer-note"><ShieldCheck size={15}/> Θετική απάντηση στο λήμμα 9 — απαιτείται κλινική αξιολόγηση αυτοκτονικού κινδύνου.</div>}</div>)}</div><footer className="preview-score-footer">{complete?<div className="score-result"><span>Συνολική βαθμολογία</span><strong>{score}</strong><b>{active.interpret(score)}</b></div>:<span>Απαντήστε σε όλες τις ερωτήσεις για υπολογισμό βαθμολογίας.</span>}</footer></section></div>}
 </div></section></main>
}

function PreviewChoice({children}:{children:React.ReactNode}){return <span className="history-preview-choice">{children}</span>}
function PreviewQuestion({title,children}:{title:string;children:React.ReactNode}){return <div className="history-preview-question"><strong>{title}</strong><div className="history-preview-options">{children}</div></div>}
function HistoryQuestionnairePreview(){
 return <div className="history-questionnaire-preview">
  <section>
   <div className="history-preview-section-head"><span>1</span><div><strong>Τι σας φέρνει σήμερα;</strong><small>Μπορείτε να επιλέξετε περισσότερα από ένα.</small></div></div>
   <div className="history-preview-chip-grid">{reasonOptions.map(x=><PreviewChoice key={x}>{x}</PreviewChoice>)}</div>
   <PreviewQuestion title="Πόσο καιρό περίπου σας απασχολεί;"><PreviewChoice>Λιγότερο από 1 μήνα</PreviewChoice><PreviewChoice>1–6 μήνες</PreviewChoice><PreviewChoice>6–12 μήνες</PreviewChoice><PreviewChoice>Πάνω από 1 χρόνο</PreviewChoice></PreviewQuestion>
   <label className="history-preview-textarea">Αν θέλετε, με λίγα λόγια τι σας φέρνει σήμερα <span>προαιρετικό</span><div/></label>
  </section>

  <section>
   <div className="history-preview-section-head"><span>2</span><div><strong>Προηγούμενη φροντίδα</strong><small>Ψυχιατρική και ψυχολογική παρακολούθηση.</small></div></div>
   <PreviewQuestion title="Έχετε επισκεφθεί στο παρελθόν ψυχίατρο;"><PreviewChoice>Ναι</PreviewChoice><PreviewChoice>Όχι</PreviewChoice></PreviewQuestion>
   <PreviewQuestion title="Έχετε κάνει ψυχοθεραπεία ή παρακολούθηση από ψυχολόγο;"><PreviewChoice>Ναι</PreviewChoice><PreviewChoice>Όχι</PreviewChoice></PreviewQuestion>
   <PreviewQuestion title="Σας έχει δοθεί ποτέ ψυχιατρική διάγνωση;"><PreviewChoice>Ναι</PreviewChoice><PreviewChoice>Όχι</PreviewChoice><PreviewChoice>Δεν γνωρίζω</PreviewChoice></PreviewQuestion>
   <div className="history-preview-subchoices">{diagnosisOptions.slice(0,7).map(x=><PreviewChoice key={x}>{x}</PreviewChoice>)}<PreviewChoice>+ άλλες</PreviewChoice></div>
  </section>

  <section>
   <div className="history-preview-section-head"><span>3</span><div><strong>Αγωγή & νοσηλείες</strong><small>Προηγούμενη και τρέχουσα θεραπεία.</small></div></div>
   <PreviewQuestion title="Έχετε πάρει στο παρελθόν φάρμακα για την ψυχική υγεία;"><PreviewChoice>Ναι</PreviewChoice><PreviewChoice>Όχι</PreviewChoice><PreviewChoice>Δεν θυμάμαι</PreviewChoice></PreviewQuestion>
   <PreviewQuestion title="Παίρνετε αυτή τη στιγμή φάρμακα;"><PreviewChoice>Ναι</PreviewChoice><PreviewChoice>Όχι</PreviewChoice></PreviewQuestion>
   <PreviewQuestion title="Έχετε νοσηλευτεί ποτέ για λόγους ψυχικής υγείας;"><PreviewChoice>Ναι</PreviewChoice><PreviewChoice>Όχι</PreviewChoice></PreviewQuestion>
   <PreviewQuestion title="Έχετε αυτοτραυματιστεί ποτέ;"><PreviewChoice>Ναι</PreviewChoice><PreviewChoice>Όχι</PreviewChoice><PreviewChoice>Προτιμώ να το συζητήσω με τον γιατρό</PreviewChoice></PreviewQuestion>
   <PreviewQuestion title="Έχετε κάνει ποτέ απόπειρα αυτοκτονίας;"><PreviewChoice>Ναι</PreviewChoice><PreviewChoice>Όχι</PreviewChoice><PreviewChoice>Προτιμώ να το συζητήσω με τον γιατρό</PreviewChoice></PreviewQuestion>
  </section>

  <section>
   <div className="history-preview-section-head"><span>4</span><div><strong>Σωματική υγεία</strong><small>Σημαντικά προβλήματα υγείας και αλλεργίες.</small></div></div>
   <div className="history-preview-matrix">{medicalOptions.map(x=><div key={x}><span>{x}</span><div><PreviewChoice>Ναι</PreviewChoice><PreviewChoice>Όχι</PreviewChoice></div></div>)}</div>
  </section>

  <section>
   <div className="history-preview-section-head"><span>5</span><div><strong>Χρήση ουσιών</strong><small>Τρέχουσα ή προηγούμενη χρήση.</small></div></div>
   <div className="history-preview-matrix">{substanceOptions.map(x=><div key={x}><span>{x}</span><div><PreviewChoice>Ποτέ</PreviewChoice><PreviewChoice>Παλαιότερα</PreviewChoice><PreviewChoice>Τώρα</PreviewChoice></div></div>)}</div>
  </section>

  <section>
   <div className="history-preview-section-head"><span>6</span><div><strong>Οικογενειακό ιστορικό</strong><small>Ψυχιατρικό ιστορικό στην οικογένεια.</small></div></div>
   <div className="history-preview-family">{familyConditions.slice(0,5).map(x=><div key={x}><strong>{x}</strong><span>{familyRelations.slice(0,4).join(' · ')} · …</span></div>)}</div>
  </section>

  <section>
   <div className="history-preview-section-head"><span>7</span><div><strong>Καθημερινότητα</strong><small>Σχέσεις, διαμονή, εργασία και υποστήριξη.</small></div></div>
   <PreviewQuestion title="Οικογενειακή / σχεσιακή κατάσταση"><PreviewChoice>Μόνος/η</PreviewChoice><PreviewChoice>Σε σχέση</PreviewChoice><PreviewChoice>Έγγαμος/η</PreviewChoice><PreviewChoice>Χωρισμένος/η</PreviewChoice></PreviewQuestion>
   <PreviewQuestion title="Έχετε ανθρώπους που σας στηρίζουν;"><PreviewChoice>Ναι</PreviewChoice><PreviewChoice>Όχι</PreviewChoice></PreviewQuestion>
  </section>

  <section>
   <div className="history-preview-section-head"><span>8</span><div><strong>Τραύμα & κάτι ακόμη</strong><small>Προαιρετικές πληροφορίες πριν την επίσκεψη.</small></div></div>
   <PreviewQuestion title="Έχετε βιώσει γεγονός που θεωρείτε σοβαρά τραυματικό;"><PreviewChoice>Ναι</PreviewChoice><PreviewChoice>Όχι</PreviewChoice><PreviewChoice>Προτιμώ να το συζητήσω μόνο με τον γιατρό</PreviewChoice></PreviewQuestion>
   <label className="history-preview-textarea">Υπάρχει κάτι άλλο σημαντικό που θέλετε να γνωρίζει ο γιατρός; <span>προαιρετικό</span><div/></label>
  </section>
 </div>
}

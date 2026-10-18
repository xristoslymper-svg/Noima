'use client';
import Link from 'next/link';
import {useCallback,useEffect,useRef,useState} from 'react';
import {Home,CalendarDays,Users,BookOpen,Video,Mic,MicOff,VideoOff,PhoneOff,Send,FileText,Check,ArrowLeft} from 'lucide-react';
import {FollowupDraftProvider,FollowupField,useFollowupDraft} from '@/components/patients/FollowupDraft';
import {SyntheticChartContext} from '@/components/patients/SyntheticChartContext';
import type {PatientBundle} from '@/lib/patients/demo-runtime';
import type {ContinuityDraft} from '@/lib/clinical/continuity';
import {emptyContinuity} from '@/lib/clinical/continuity';
import fixture from '@/lib/clinical/treatment-preview.json';
import {saveFixtureNotes,assignFixture,type FixtureRecord} from '@/lib/teleconsultations/preview';
import styles from './Teleconsultations.module.css';
const patientId='10000000-0000-4000-8000-000000000006',sessionId='tele-preview-visit';
const initial:FixtureRecord={appointment:{id:'tele-preview-appointment',patient_id:patientId,session_id:sessionId,status:'scheduled',scheduled_start:'2026-10-18T17:00:00+03:00',scheduled_end:'2026-10-18T17:50:00+03:00'},patientId,sessionId,version:0,notes:{...emptyContinuity,transcript:'Συνθετική επίσκεψη · συζήτηση για ύπνο και καθημερινή λειτουργικότητα.'},assignments:[]};
function SaveNotes(){
 const {draft}=useFollowupDraft();
 return <div className={styles.save}><span role="status">{draft.error?'Δεν αποθηκεύτηκε':draft.saving?'Αποθήκευση…':draft.dirty?'Μη αποθηκευμένες αλλαγές':'Αποθηκευμένο στο συνθετικό παράδειγμα'}</span><button type="button" className="small-button" onClick={()=>void draft.flush().catch(()=>{})} disabled={draft.saving}><Check size={15}/>Αποθήκευση προσχεδίου</button></div>;
}
export default function TeleconsultationsPreview(){
 const [record,setRecord]=useState(initial),[opened,setOpened]=useState(false),[inCall,setInCall]=useState(false),[mic,setMic]=useState(true),[camera,setCamera]=useState(true),[view,setView]=useState<'call'|'record'>('call'),[tool,setTool]=useState<'PHQ-9'|'GAD-7'|'history'|null>(null),[message,setMessage]=useState(''),[fail,setFail]=useState(false),[dirty,setDirty]=useState(false);
 const current=useRef(record);current.current=record;
 const flushers=useRef(new Map<string,()=>Promise<void>>());
 const registerFlusher=useCallback((key:string,flush:()=>Promise<void>)=>{flushers.current.set(key,flush);return()=>{if(flushers.current.get(key)===flush)flushers.current.delete(key)}},[]);
 const dirtyKeys=useRef(new Set<string>());
 const onDirtyChange=useCallback((key:string,value:boolean)=>{if(value)dirtyKeys.current.add(key);else dirtyKeys.current.delete(key);setDirty(dirtyKeys.current.size>0)},[]);
 useEffect(()=>{const warn=(event:BeforeUnloadEvent)=>{if(!dirty)return;event.preventDefault();event.returnValue=''};window.addEventListener('beforeunload',warn);return()=>window.removeEventListener('beforeunload',warn)},[dirty]);
 const bundle={...fixture,patient:{...fixture.patient,first_name:'Σοφία',last_name:'Δείγμα'},sessions:[{...fixture.sessions[3],id:sessionId,patient_id:patientId,closure_draft:record.notes,closure_version:record.version}],sections:[]} as unknown as PatientBundle;
 const session=bundle.sessions[0];
 async function saveClosure(notes:ContinuityDraft,version:number|null){
  if(fail)throw new Error('Συνθετική αποτυχία αποθήκευσης. Το κείμενο παραμένει στο πεδίο.');
  const next=saveFixtureNotes(current.current,patientId,sessionId,version,notes);current.current=next;setRecord(next);return {value:next.notes,version:next.version};
 }
 async function closeVisit(){
  try{await Promise.all([...flushers.current.values()].map(flush=>flush()));setInCall(false);setOpened(false);setMessage('Το συνθετικό προσχέδιο διατηρήθηκε. Δεν οριστικοποιήθηκε επίσκεψη.')}catch{setMessage('Αποθηκεύστε τις εκκρεμείς αλλαγές πριν κλείσετε την επίσκεψη.')}
 }
 return <main className="app-shell secondary-shell">
  <aside className="sidebar"><div className="brand"><Link href="/" className="brand-mark">Ψ</Link><div className="brand-copy"><div className="brand-sub">Για μια οργανωμένη κλινική πράξη</div></div></div><nav className="nav" aria-label="Κύρια πλοήγηση"><Link href="/" className="nav-item"><Home size={19}/>Επισκόπηση</Link><Link href="/calendar" className="nav-item"><CalendarDays size={19}/>Ημερολόγιο</Link><Link href="/patients" className="nav-item"><Users size={19}/>Ασθενείς</Link><Link href="/psychometrics" className="nav-item"><BookOpen size={19}/>Βιβλιοθήκη</Link><Link href="/teleconsultations" className="nav-item active" aria-current="page"><Video size={19}/>Τηλεσυνεδρίες</Link></nav></aside>
  <div className="workspace"><div className={styles.content}>
   <header className="page-heading"><div><h1>Τηλεσυνεδρίες</h1><p>Η επίσκεψη και η καταγραφή σας, στον ίδιο χώρο.</p></div><Video size={24}/></header>
   <p className={styles.notice}>Συνθετική δοκιμή · χωρίς σύνδεση Daily, αποστολή email ή εγγραφές στη βάση. Οι σημειώσεις διατηρούνται μόνο όσο μένει ανοιχτή αυτή η σελίδα.</p>
   {!opened?<section className="card"><div className="card-head"><div><span className="kicker">ONLINE ΡΑΝΤΕΒΟΥ · ΔΟΚΙΜΗ</span><h2>Σοφία Δείγμα</h2><p>18 Οκτωβρίου · 17:00–17:50 · Ώρα Ελλάδας</p></div><span className="status-dot">Προγραμματισμένο</span></div><button className="record compact" onClick={()=>{setOpened(true);setView('call');setMessage('')}}><Video size={17}/>Άνοιγμα επίσκεψης</button></section>:<SyntheticChartContext.Provider value={true}><FollowupDraftProvider bundle={bundle} session={session} reload={async()=>current.current} registerFlusher={registerFlusher} onDirtyChange={onDirtyChange} saveClosure={saveClosure}>
    <header className={styles.visitHead}><div><h2>Σοφία Δείγμα</h2><span>17:00–17:50 · Ίδιο ραντεβού και ίδια επίσκεψη</span></div><button className="small-button" onClick={()=>void closeVisit()}><ArrowLeft size={15}/>Πίσω στα ραντεβού</button></header>
    <div className={styles.actions}><button className="small-button" onClick={()=>setTool('PHQ-9')}><Send size={15}/>Αποστολή τεστ</button><button className="small-button" onClick={()=>setTool('history')}><FileText size={15}/>Αποστολή ιστορικού</button><button className="small-button" aria-pressed={view==='record'} onClick={()=>setView(v=>v==='call'?'record':'call')}> {view==='call'?'Προβολή καταγραφής επίσκεψης':'Επιστροφή στην κλήση'}</button></div>
    <div className={styles.grid}>
     <section className="card" aria-label="Περιοχή βιντεοκλήσης"><div className={styles.video}><div className={styles.avatar}>ΣΔ</div><h3>{inCall?'Συνθετική κλήση σε εξέλιξη':'Έτοιμοι για τη συνεδρία;'}</h3><p>{inCall?'Προσομοίωση · δεν μεταδίδεται ήχος ή βίντεο':'Το πραγματικό βίντεο θα ενεργοποιηθεί μετά τη ρύθμιση Daily και του ορίου χρήσης.'}</p>{!inCall&&<button className="record compact" onClick={()=>setInCall(true)}><Video size={17}/>Δοκιμή ροής κλήσης</button>}<div className={styles.self}>Εσείς · {camera?'Κάμερα δοκιμής':'Κάμερα κλειστή'}</div></div>
      <div className={styles.controls}><button className="small-button" disabled={!inCall} aria-label={mic?'Κλείσιμο μικροφώνου':'Άνοιγμα μικροφώνου'} aria-pressed={!mic} onClick={()=>setMic(v=>!v)}>{mic?<Mic size={19}/>:<MicOff size={19}/>}</button><button className="small-button" disabled={!inCall} aria-label={camera?'Κλείσιμο κάμερας':'Άνοιγμα κάμερας'} aria-pressed={!camera} onClick={()=>setCamera(v=>!v)}>{camera?<Video size={19}/>:<VideoOff size={19}/>}</button><button className="small-button" disabled={!inCall} onClick={()=>{setInCall(false);setMessage('Η κλήση τερματίστηκε. Η καταγραφή παραμένει ανοιχτή.')}}><PhoneOff size={18}/>Τερματισμός κλήσης</button></div>
     </section>
     <section className="card" aria-label="Σημειώσεις συνδεδεμένης επίσκεψης"><div className="card-head"><div><span className="kicker">ΚΑΤΑΓΡΑΦΗ ΕΠΙΣΚΕΨΗΣ</span><h2>{view==='record'?'Καταγραφή στον φάκελο':'Σημειώσεις επίσκεψης'}</h2><p>Οι ίδιες σημειώσεις της επίσκεψης. Ο ασθενής δεν τις βλέπει.</p></div></div><FollowupField field="transcript" title="Σημειώσεις επίσκεψης" rows={9}/><SaveNotes/>{view==='record'&&<div className={styles.saved}><strong>Αποθηκευμένο συνθετικό προσχέδιο</strong><p>{record.notes.transcript}</p></div>}</section>
    </div>
    {record.assignments.length>0&&<p className={styles.notice}>Δοκιμαστικές αναθέσεις στον ίδιο ασθενή: {record.assignments.map(x=>x==='history'?'Ιστορικό':x).join(' · ')}. Δεν στάλθηκε πραγματικό μήνυμα.</p>}
    {tool&&<div className="intake-launcher-backdrop"><section className="intake-launcher assignment-launcher" role="dialog" aria-modal="true" aria-labelledby="tele-assignment" onKeyDown={event=>{if(event.key==='Escape')setTool(null)}}><h2 id="tele-assignment">Αποστολή {tool==='history'?'ιστορικού':'τεστ'} · δοκιμή</h2><p>Σοφία Δείγμα · συνδεδεμένο με το ανοιχτό ραντεβού</p>{tool!=='history'&&<label>Εργαλείο <select value={tool} onChange={event=>setTool(event.target.value as 'PHQ-9'|'GAD-7')}><option>PHQ-9</option><option>GAD-7</option></select></label>}<p>Η επιβεβαίωση δημιουργεί μόνο συνθετική ανάθεση στην τρέχουσα σελίδα.</p><div className="pilot-actions"><button autoFocus className="small-button" onClick={()=>setTool(null)}>Ακύρωση</button><button className="record compact" onClick={()=>{const next=assignFixture(current.current,tool);current.current=next;setRecord(next);setMessage('Η δοκιμαστική ανάθεση εμφανίζεται στην ίδια επίσκεψη. Η κλήση συνεχίζεται.');setTool(null)}}>Επιβεβαίωση δοκιμής</button></div></section></div>}
   </FollowupDraftProvider></SyntheticChartContext.Provider>}
   <p role="status" aria-live="polite">{message}</p>
   <details className={styles.tests}><summary>Σενάρια συνθετικής δοκιμής</summary><label><input type="checkbox" checked={fail} onChange={event=>setFail(event.target.checked)}/>Προσομοίωση αποτυχίας αποθήκευσης</label><p>{dirty?'Υπάρχουν εκκρεμείς αλλαγές.':'Δεν υπάρχουν εκκρεμείς αλλαγές.'} Η πραγματική κλήση παραμένει απενεργοποιημένη.</p></details>
  </div></div>
 </main>;
}

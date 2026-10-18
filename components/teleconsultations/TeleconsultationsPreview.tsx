'use client';
import Link from 'next/link';
import type {ComponentProps} from 'react';
import {useCallback,useEffect,useLayoutEffect,useRef,useState} from 'react';
import {Home,CalendarDays,Users,BookOpen,Video,Mic,MicOff,VideoOff,PhoneOff,Send,FileText,Check,ArrowLeft,ChevronDown,FolderOpen} from 'lucide-react';
import {FollowupDraftProvider,FollowupField,useFollowupDraft} from '@/components/patients/FollowupDraft';
import {SyntheticChartContext} from '@/components/patients/SyntheticChartContext';
import StructuredVisitEditor from '@/components/patients/StructuredVisitEditor';
import RiskTreeEditor from '@/components/patients/RiskTreeEditor';
import type {VisitDocument} from '@/lib/clinical/visit-document';
import {followupCompletionIssues} from '@/lib/clinical/visit-workspace-state';
import type {DemoSection,DemoRisk,PatientBundle} from '@/lib/patients/demo-runtime';
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
 const [record,setRecord]=useState(initial),[opened,setOpened]=useState(false),[inCall,setInCall]=useState(false),[mic,setMic]=useState(true),[camera,setCamera]=useState(true),[view,setView]=useState<'call'|'notes'>('call'),[tool,setTool]=useState<'PHQ-9'|'GAD-7'|'history'|null>(null),[message,setMessage]=useState(''),[fail,setFail]=useState(false),[dirty,setDirty]=useState(false);
 const [mse,setMse]=useState<DemoSection>(),[risk,setRisk]=useState<DemoRisk>(),[review,setReview]=useState<string[]|null>(null);
 const clinical=useRef<{mse?:DemoSection;risk?:DemoRisk}>({});
 const sendMenu=useRef<HTMLDetailsElement>(null);
 const reference=fixture as unknown as PatientBundle;
 const lastVisit=reference.sessions.filter(row=>row.patient_id===patientId&&row.status==='completed').sort((a,b)=>Date.parse(b.completed_at||b.started_at)-Date.parse(a.completed_at||a.started_at))[0];
 const activeMedications=fixture.medications.filter(row=>row.patient_id===patientId&&row.status==='active');
 const latestScores=Object.values(Object.fromEntries(fixture.assessments.filter(row=>row.patient_id===patientId&&row.status==='completed').sort((a,b)=>Date.parse(a.completed_at||a.created_at)-Date.parse(b.completed_at||b.created_at)).map(row=>[row.instrument,row])));
 const notesPanel=useRef<HTMLElement>(null),notesPosition=useRef({start:0,end:0,scroll:0});
 function changeMode(next:'call'|'notes'){
  if(view==='notes'){const field=notesPanel.current?.querySelector('textarea');notesPosition.current={start:field?.selectionStart||0,end:field?.selectionEnd||0,scroll:notesPanel.current?.scrollTop||0}}
  setView(next);
 }
 useLayoutEffect(()=>{if(view!=='notes')return;const panel=notesPanel.current,field=panel?.querySelector('textarea');if(field){field.focus({preventScroll:true});field.setSelectionRange(notesPosition.current.start,notesPosition.current.end)}if(panel)panel.scrollTop=notesPosition.current.scroll},[view]);
 const current=useRef(record);current.current=record;
 const flushers=useRef(new Map<string,()=>Promise<void>>());
 const registerFlusher=useCallback((key:string,flush:()=>Promise<void>)=>{flushers.current.set(key,flush);return()=>{if(flushers.current.get(key)===flush)flushers.current.delete(key)}},[]);
 const dirtyKeys=useRef(new Set<string>());
 const onDirtyChange=useCallback((key:string,value:boolean)=>{if(value)dirtyKeys.current.add(key);else dirtyKeys.current.delete(key);setDirty(dirtyKeys.current.size>0)},[]);
 useEffect(()=>{const warn=(event:BeforeUnloadEvent)=>{if(!dirty)return;event.preventDefault();event.returnValue=''};window.addEventListener('beforeunload',warn);return()=>window.removeEventListener('beforeunload',warn)},[dirty]);
 const bundle={...fixture,patient:{...fixture.patient,first_name:'Σοφία',last_name:'Δείγμα'},sessions:[{...fixture.sessions[3],id:sessionId,patient_id:patientId,closure_draft:record.notes,closure_version:record.version}],sections:mse?[mse]:[],risks:risk?[risk]:[]} as unknown as PatientBundle;
 const session=bundle.sessions[0];
 async function saveClosure(notes:ContinuityDraft,version:number|null){
  if(fail)throw new Error('Συνθετική αποτυχία αποθήκευσης. Το κείμενο παραμένει στο πεδίο.');
  const next=saveFixtureNotes(current.current,patientId,sessionId,version,notes);current.current=next;setRecord(next);setMessage(previous=>previous.startsWith('Αποθηκεύστε')?'':previous);return {value:next.notes,version:next.version};
 }
 async function saveMse(document:VisitDocument,version:number|null){
  if(fail)throw new Error('Συνθετική αποτυχία αποθήκευσης.');
  if(version!==(clinical.current.mse?.version??null))throw new Error('Η αξιολόγηση άλλαξε.');
  const section:DemoSection={id:'tele-preview-mse',session_id:sessionId,patient_id:patientId,section_key:'mse',content:document.fields.map(f=>f.text).join('\n'),document,source:'clinician',version:(version??0)+1,updated_at:new Date().toISOString()};
  clinical.current.mse=section;setMse(section);return {value:document,version:section.version};
 }
 const saveRisk:NonNullable<ComponentProps<typeof RiskTreeEditor>['saveRisk']>=async(value,version)=>{
  if(fail)throw new Error('Συνθετική αποτυχία αποθήκευσης.');
  if(version!==(clinical.current.risk?.version??null))throw new Error('Η αξιολόγηση άλλαξε.');
  const next:DemoRisk={...value,session_id:sessionId,patient_id:patientId,version:(version??0)+1,updated_at:new Date().toISOString()};
  clinical.current.risk=next;setRisk(next);return {value,version:next.version};
 };
 async function reviewVisit(){
  try{await Promise.all([...flushers.current.values()].map(flush=>flush()));
   setReview(followupCompletionIssues(current.current.notes,clinical.current.mse?[clinical.current.mse]:[],clinical.current.risk).map(issue=>issue.message));
  }catch{setReview(['Αποθηκεύστε πρώτα τις εκκρεμείς αλλαγές.'])}
 }
 async function closeVisit(){
  if(inCall){setMessage('Τερματίστε πρώτα την κλήση για να επιστρέψετε στα ραντεβού. Η καταγραφή παραμένει ανοιχτή.');return}
  try{await Promise.all([...flushers.current.values()].map(flush=>flush()));setInCall(false);setOpened(false);setMessage('Το συνθετικό προσχέδιο διατηρήθηκε. Δεν οριστικοποιήθηκε επίσκεψη.')}catch{setMessage('Αποθηκεύστε τις εκκρεμείς αλλαγές πριν κλείσετε την επίσκεψη.')}
 }
 return <main className="app-shell secondary-shell">
  <aside className="sidebar"><div className="brand"><Link href="/" className="brand-mark">Ψ</Link><div className="brand-copy"><div className="brand-sub">Για μια οργανωμένη κλινική πράξη</div></div></div><nav className="nav" aria-label="Κύρια πλοήγηση"><Link href="/" className="nav-item"><Home size={19}/>Επισκόπηση</Link><Link href="/calendar" className="nav-item"><CalendarDays size={19}/>Ημερολόγιο</Link><Link href="/patients" className="nav-item"><Users size={19}/>Ασθενείς</Link><Link href="/psychometrics" className="nav-item"><BookOpen size={19}/>Βιβλιοθήκη</Link><Link href="/teleconsultations" className="nav-item active" aria-current="page"><Video size={19}/>Τηλεσυνεδρίες</Link></nav></aside>
  <div className="workspace"><div className={styles.content}>
   <header className={'page-heading '+styles.pageHeader}><div>{opened&&<span className="kicker">ΤΗΛΕΣΥΝΕΔΡΙΕΣ</span>}<h1>{opened?'Σοφία Δείγμα':'Τηλεσυνεδρίες'}</h1><p>{opened?'18 Οκτωβρίου · 17:00–17:50 · Ώρα Ελλάδας':'Η επίσκεψη και η καταγραφή σας, στον ίδιο χώρο.'}</p></div>{opened?<button className="small-button" onClick={()=>void closeVisit()}><ArrowLeft size={15}/>Πίσω στα ραντεβού</button>:<Video size={24}/>}</header>
   <p className={styles.notice}>Δοκιμαστικό περιβάλλον · χωρίς πραγματική κλήση, αποστολή ή εγγραφή στη βάση. Το προσχέδιο διατηρείται στην ανοιχτή σελίδα.</p>
   {!opened?<section className="card"><div className="card-head"><div><span className="kicker">ONLINE ΡΑΝΤΕΒΟΥ · ΔΟΚΙΜΗ</span><h2>Σοφία Δείγμα</h2><p>18 Οκτωβρίου · 17:00–17:50 · Ώρα Ελλάδας</p></div><span className="status-dot">Προγραμματισμένο</span></div><button className="record compact" onClick={()=>{setOpened(true);setView('call');setMessage('')}}><Video size={17}/>Άνοιγμα επίσκεψης</button></section>:<SyntheticChartContext.Provider value={true}><FollowupDraftProvider bundle={bundle} session={session} reload={async()=>current.current} registerFlusher={registerFlusher} onDirtyChange={onDirtyChange} saveClosure={saveClosure}>

    <div className={styles.modebar}><div role="group" aria-label="Προβολή τηλεσυνεδρίας" className={styles.modes}><button type="button" aria-pressed={view==='call'} onClick={()=>changeMode('call')}><Video size={16}/>Κλήση</button><button type="button" aria-pressed={view==='notes'} onClick={()=>changeMode('notes')}><FileText size={16}/>Σημειώσεις</button></div><div className={styles.actions}>
 <details className={styles.reference}><summary><FolderOpen size={16}/>Φάκελος ασθενή<ChevronDown size={14}/></summary><div className={styles.referencePanel} role="region" aria-label="Αναφορά φακέλου ασθενή"><p className={styles.referenceNotice}>Συνθετικά στοιχεία φακέλου · μόνο ανάγνωση. Δεν αποτελούν σημερινή αξιολόγηση.</p><h3>Προηγούμενη επιβεβαιωμένη επίσκεψη</h3><small>{lastVisit?new Intl.DateTimeFormat('el-GR',{timeZone:'Europe/Athens',day:'numeric',month:'short',year:'numeric'}).format(new Date(lastVisit.completed_at||lastVisit.started_at)):'Δεν έχει καταγραφεί'}</small><p>{lastVisit?.continuity?.clinical_state_summary||'Δεν υπάρχει διαθέσιμη κλινική καταγραφή.'}</p><h3>Καταγεγραμμένη ενεργή αγωγή</h3>{activeMedications.length?<ul>{activeMedications.map(row=><li key={row.id}>{row.medication_name} · {row.dose} {row.unit} · {row.frequency}</li>)}</ul>:<p>Δεν έχει καταγραφεί ενεργή αγωγή.</p>}<h3>Τελευταίες ολοκληρωμένες μετρήσεις</h3>{latestScores.length?<ul>{latestScores.map(row=><li key={row.id}>{row.instrument}: <strong>{row.score}</strong> · {new Intl.DateTimeFormat('el-GR',{timeZone:'Europe/Athens',day:'numeric',month:'short'}).format(new Date(row.completed_at||row.created_at))}</li>)}</ul>:<p>Δεν υπάρχουν ολοκληρωμένες μετρήσεις.</p>}</div></details>
 <details ref={sendMenu} className={styles.sendMenu}><summary><Send size={16}/>Αποστολή<ChevronDown size={14}/></summary><div className={styles.sendOptions}><button type="button" onClick={()=>{setTool('PHQ-9');sendMenu.current?.removeAttribute('open')}}><Send size={16}/>Αποστολή τεστ</button><button type="button" onClick={()=>{setTool('history');sendMenu.current?.removeAttribute('open')}}><FileText size={16}/>Αποστολή ιστορικού</button></div></details>
 </div></div>
    <div className={[styles.grid,view==='notes'?styles.notesMode:styles.callMode].join(' ')} data-call-mode={view}>
     <section className={'card '+styles.callPanel} aria-label="Περιοχή βιντεοκλήσης"><div className={styles.video}><div className={styles.avatar}>ΣΔ</div><h3>{inCall?'Συνθετική κλήση σε εξέλιξη':'Έτοιμοι για τη συνεδρία;'}</h3><p>{inCall?'Προσομοίωση · δεν μεταδίδεται ήχος ή βίντεο':'Το πραγματικό βίντεο θα ενεργοποιηθεί μετά τη ρύθμιση Daily και του ορίου χρήσης.'}</p>{!inCall&&<button className="record compact" onClick={()=>setInCall(true)}><Video size={17}/>Δοκιμή ροής κλήσης</button>}<div className={styles.self}>Εσείς · {camera?'Κάμερα δοκιμής':'Κάμερα κλειστή'}</div>
      <div className={styles.controls}><button className="small-button" disabled={!inCall} aria-label={mic?'Κλείσιμο μικροφώνου':'Άνοιγμα μικροφώνου'} aria-pressed={!mic} onClick={()=>setMic(v=>!v)}>{mic?<Mic size={19}/>:<MicOff size={19}/>}</button><button className="small-button" disabled={!inCall} aria-label={camera?'Κλείσιμο κάμερας':'Άνοιγμα κάμερας'} aria-pressed={!camera} onClick={()=>setCamera(v=>!v)}>{camera?<Video size={19}/>:<VideoOff size={19}/>}</button><button className="small-button" disabled={!inCall} onClick={()=>{setInCall(false);setMessage('Η κλήση τερματίστηκε. Η καταγραφή παραμένει ανοιχτή.')}}><PhoneOff size={18}/>Τερματισμός κλήσης</button></div></div><div className={styles.privacy}><strong>Ιδιωτική καταγραφή επίσκεψης</strong><p>Ο ασθενής δεν βλέπει τις κλινικές σημειώσεις. Οι αναθέσεις γίνονται από την «Αποστολή».</p></div>
     </section>
     <section ref={notesPanel} hidden={view!=='notes'} className={styles.notesPanel} aria-label="Σημειώσεις συνδεδεμένης επίσκεψης">
      <div className={'card '+styles.editorCard}><span className="kicker">ΚΑΤΑΓΡΑΦΗ ΕΠΙΣΚΕΨΗΣ · ΤΗΛΕΣΥΝΕΔΡΙΑ</span><h2>Τακτική ψυχιατρική παρακολούθηση</h2><span className={styles.draftBadge}>Τοπικό συνθετικό προσχέδιο</span><div className={styles.steps}><strong>1. Καταγραφή</strong><span>2. Έλεγχος</span><span>3. Ολοκλήρωση</span></div></div>
      <div className={'card '+styles.editorCard}><FollowupField field="transcript" title="Σημειώσεις επίσκεψης" rows={5}/></div>
      <div className={'card '+styles.editorCard}><h3>Σημερινή ψυχική κατάσταση</h3><p>Καταγράψτε τη σημερινή αξιολόγηση. Δεν προεπιλέγονται προηγούμενα ευρήματα.</p><StructuredVisitEditor sessionId={sessionId} kind="mse" followup existing={mse} saveDocument={saveMse} onSaved={async()=>({...bundle,sections:clinical.current.mse?[clinical.current.mse]:[]})} registerFlusher={registerFlusher} onDirtyChange={onDirtyChange}/></div>
      <div className={'card '+styles.editorCard}><h3>Εκτίμηση κινδύνου</h3><RiskTreeEditor sessionId={sessionId} existing={risk} saveRisk={saveRisk} onSaved={async()=>({...bundle,risks:clinical.current.risk?[clinical.current.risk]:[]})} registerFlusher={registerFlusher} onDirtyChange={onDirtyChange}/></div>
      <div className={'card '+styles.editorCard}><FollowupField field="clinical_state_summary" title="Σημερινή κλινική εικόνα" rows={3}/><FollowupField field="adherence" title="Λήψη αγωγής" rows={2}/><FollowupField field="treatment_decision" title="Απόφαση / παρεμβάσεις" rows={3}/><FollowupField field="next_review_focus" title="Τι θα επανεκτιμηθεί" rows={2}/></div>
      <div className={'card '+styles.editorFooter}><SaveNotes/><button type="button" className="small-button" onClick={()=>void reviewVisit()}>Έλεγχος καταγραφής</button>{review&&<div role="status"><strong>Έλεγχος συνθετικής επίσκεψης</strong>{review.length?<ul>{review.map((text,i)=><li key={i}>{text}</li>)}</ul>:<p>Τα απαιτούμενα πεδία έχουν συμπληρωθεί. Η επίδειξη δεν οριστικοποιεί επίσκεψη στη βάση.</p>}</div>}</div>
     </section>
    </div>
    {record.assignments.length>0&&<p className={styles.notice}>Δοκιμαστικές αναθέσεις στον ίδιο ασθενή: {record.assignments.map(x=>x==='history'?'Ιστορικό':x).join(' · ')}. Δεν στάλθηκε πραγματικό μήνυμα.</p>}
    {tool&&<div className="intake-launcher-backdrop"><section className={"intake-launcher assignment-launcher "+styles.assignment} role="dialog" aria-modal="true" aria-labelledby="tele-assignment" onKeyDown={event=>{if(event.key==='Escape')setTool(null);if(event.key==='Tab'){const items=Array.from(event.currentTarget.querySelectorAll<HTMLElement>('button,select')).filter(el=>!el.hasAttribute('disabled'));const first=items[0],last=items[items.length-1];if(event.shiftKey&&document.activeElement===first){event.preventDefault();last?.focus()}else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first?.focus()}}}}><h2 id="tele-assignment">Αποστολή {tool==='history'?'ιστορικού':'τεστ'} · δοκιμή</h2><p>Σοφία Δείγμα · συνδεδεμένο με το ανοιχτό ραντεβού</p>{tool!=='history'&&<label>Εργαλείο <select value={tool} onChange={event=>setTool(event.target.value as 'PHQ-9'|'GAD-7')}><option>PHQ-9</option><option>GAD-7</option></select></label>}<p>Η επιβεβαίωση δημιουργεί μόνο συνθετική ανάθεση στην τρέχουσα σελίδα.</p><div className="pilot-actions"><button autoFocus className="small-button" onClick={()=>setTool(null)}>Ακύρωση</button><button className="record compact" onClick={()=>{const next=assignFixture(current.current,tool);current.current=next;setRecord(next);setMessage('Η δοκιμαστική ανάθεση εμφανίζεται στην ίδια επίσκεψη. Η κλήση συνεχίζεται.');setTool(null)}}>Επιβεβαίωση δοκιμής</button></div></section></div>}
   </FollowupDraftProvider></SyntheticChartContext.Provider>}
   <p role="status" aria-live="polite">{message}</p>
   <details className={styles.tests}><summary>Σενάρια συνθετικής δοκιμής</summary><label><input type="checkbox" checked={fail} onChange={event=>setFail(event.target.checked)}/>Προσομοίωση αποτυχίας αποθήκευσης</label><p>{dirty?'Υπάρχουν εκκρεμείς αλλαγές.':'Δεν υπάρχουν εκκρεμείς αλλαγές.'} Η πραγματική κλήση παραμένει απενεργοποιημένη.</p></details>
  </div></div>
 </main>;
}

'use client';
import Link from 'next/link';
import type {ComponentProps} from 'react';
import {useCallback,useEffect,useLayoutEffect,useRef,useState} from 'react';
import {Home,CalendarDays,Users,BookOpen,Video,Mic,MicOff,VideoOff,PhoneOff,Send,FileText,Check,ArrowLeft,ChevronDown,FolderOpen} from 'lucide-react';
import {FollowupDraftProvider,FollowupField,useFollowupDraft} from '@/components/patients/FollowupDraft';
import {SyntheticChartContext} from '@/components/patients/SyntheticChartContext';
import StructuredVisitEditor from '@/components/patients/StructuredVisitEditor';
import RiskTreeEditor,{RiskTreeRead} from '@/components/patients/RiskTreeEditor';
import {previousMseReference,mseTimeline} from '@/lib/clinical/visit-workspace-state';
import {mseDomainLabel} from '@/lib/clinical/mse-presentation';
import {riskTreeChoices} from '@/lib/clinical/risk-tree';
import type {VisitDocument} from '@/lib/clinical/visit-document';
import {reviewFixtureVisit,visitRevision,completeFixtureVisit} from '@/lib/teleconsultations/visit-lifecycle';
import {recordForVisit,reviewConnectedVisit,assertReviewedRecord,type RecordConnection} from '@/lib/teleconsultations/record-connection';
import {confirmedCompletion,finalizeAndVerify} from '@/lib/clinical/finalization';
import type {DemoSection,DemoRisk,PatientBundle} from '@/lib/patients/demo-runtime';
import type {ContinuityDraft} from '@/lib/clinical/continuity';
import {emptyContinuity} from '@/lib/clinical/continuity';
import fixture from '@/lib/clinical/treatment-preview.json';
import {saveFixtureNotes,assignFixture,type FixtureRecord} from '@/lib/teleconsultations/preview';
import TeleInvitation from './TeleInvitation';
import TeleconsultationsLobby from './TeleconsultationsLobby';
import {demoPatientContext,demoPatients,type DemoTelePatient} from '@/lib/teleconsultations/entry';
import styles from './Teleconsultations.module.css';
const patientId='10000000-0000-4000-8000-000000000006',sessionId='tele-preview-visit';
const initial:FixtureRecord={appointment:{id:'tele-preview-appointment',patient_id:patientId,session_id:sessionId,status:'scheduled',scheduled_start:'2026-10-18T17:00:00+03:00',scheduled_end:'2026-10-18T17:50:00+03:00'},patientId,sessionId,version:0,notes:{...emptyContinuity,transcript:'Συνθετική επίσκεψη · συζήτηση για ύπνο και καθημερινή λειτουργικότητα.'},assignments:[]};
function SaveNotes({saveAll,connection}:{saveAll:()=>Promise<void>;connection?:RecordConnection}){
 const {draft,sessionId:activeSessionId}=useFollowupDraft();
 const [comparison,setComparison]=useState<{value:ContinuityDraft;version:number}|null>(null),[error,setError]=useState('');
 return <div className={styles.save}><span role="status">{draft.error?'Δεν αποθηκεύτηκε':draft.saving?'Αποθήκευση…':draft.dirty?'Μη αποθηκευμένες αλλαγές':connection?'Αποθηκευμένο στην επίσκεψη':'Αποθηκευμένο στο συνθετικό παράδειγμα'}</span><button type="button" className="small-button" onClick={()=>void saveAll().catch(()=>{})} disabled={draft.saving}><Check size={15}/>Αποθήκευση προσχεδίου</button>{connection&&draft.error&&<><button className="small-button" onClick={()=>void draft.flush().catch(()=>{})}>Επανάληψη αποθήκευσης</button><button className="small-button" disabled={draft.saving} onClick={()=>void connection.read().then(bundle=>{const r=recordForVisit(bundle,bundle.patient.id,activeSessionId);setComparison({value:r.notes,version:r.version})}).catch(e=>setError(e.message))}>Σύγκριση με αποθηκευμένο πρόχειρο</button></>}{comparison&&<div className="conflict-review" aria-label="Σύγκριση προχείρου"><h4>Έλεγχος πριν αντικαταστήσετε το κείμενο</h4>{(['transcript','clinical_state_summary','treatment_decision','next_review_focus','adherence','pinned_context'] as const).filter(key=>draft.value[key]!==comparison.value[key]).map(key=><div key={key}><strong>{({transcript:'Σημειώσεις',clinical_state_summary:'Κλινική εικόνα',treatment_decision:'Απόφαση',next_review_focus:'Επανεκτίμηση',adherence:'Λήψη αγωγής',pinned_context:'Σημαντικά θέματα'})[key]}</strong><p>Δικό σας: {draft.value[key]||'Κενό'}</p><p>Αποθηκευμένο: {comparison.value[key]||'Κενό'}</p></div>)}<button className="small-button" disabled={draft.saving} onClick={()=>{draft.resolve(draft.currentValue(),comparison.value,comparison.version);setComparison(null)}}>Διατήρηση του δικού μου και επανάληψη αποθήκευσης</button><button className="small-button" disabled={draft.saving} onClick={()=>{try{draft.acceptServerPreservingLocal(comparison.value,comparison.version);setComparison(null)}catch{setError('Δεν κρατήθηκε αντίγραφο ανάκτησης. Το κείμενό σας διατηρήθηκε.')}}}>Χρήση αποθηκευμένου με αντίγραφο ανάκτησης</button><button className="small-button" onClick={()=>setComparison(null)}>Ακύρωση σύγκρισης</button></div>}{draft.olderRecovery&&<button className="small-button" onClick={()=>{draft.change(draft.olderRecovery!);draft.dismissOlderRecovery()}}>Επαναφορά του δικού μου κειμένου</button>}{error&&<p role="alert">{error}</p>}</div>;
}
function VisitReadback({notes,mse,risk}:{notes:ContinuityDraft;mse?:DemoSection;risk?:DemoRisk}){
 return <div className={styles.readback}>{([['transcript','Σημειώσεις επίσκεψης'],['clinical_state_summary','Σημερινή κλινική εικόνα'],['adherence','Λήψη αγωγής'],['treatment_decision','Απόφαση / παρεμβάσεις'],['next_review_focus','Τι θα επανεκτιμηθεί']] as const).map(([key,label])=><section key={key}><h3>{label}</h3><p>{notes[key]||'Δεν καταγράφηκε'}</p></section>)}<section><h3>Σημερινή ψυχική κατάσταση</h3>{mse?.document?.fields.filter(field=>field.text.trim()).map(field=><p key={field.key}><strong>{mseDomainLabel(field)}</strong><br/>{field.text}</p>)}</section><section><h3>Εκτίμηση κινδύνου</h3>{risk?.tree&&<RiskTreeRead tree={risk.tree} includeHidden={false}/>}<p>Αυτοτραυματισμός: {riskTreeChoices.find(([value])=>value===risk?.self_harm)?.[1]||'Δεν καταγράφηκε'} · Ιστορικό απόπειρας: {riskTreeChoices.find(([value])=>value===risk?.attempt_history)?.[1]||'Δεν καταγράφηκε'}</p><p>{risk?.protective_factors}</p><p>{risk?.clinical_note}</p></section></div>;
}
type Entry={record:FixtureRecord;patient:DemoTelePatient;visited:boolean;completed:boolean};
export default function TeleconsultationsPreview(){
 const [entries,setEntries]=useState<Entry[]>([{record:initial,patient:demoPatients[0],visited:false,completed:false}]),[active,setActive]=useState<string|null>(null);
 function open(record:FixtureRecord,patient:DemoTelePatient){
  setEntries(previous=>previous.some(entry=>entry.record.sessionId===record.sessionId)?previous.map(entry=>entry.record.sessionId===record.sessionId?{...entry,visited:true}:entry):[...previous,{record,patient,visited:true,completed:false}]);setActive(record.sessionId);
 }
 return <><div hidden={active!==null}><TeleconsultationsLobby entries={entries} onOpen={open}/></div>{entries.filter(entry=>entry.visited).map(entry=><div key={entry.record.sessionId} hidden={active!==entry.record.sessionId}><TeleconsultationWorkspace initialRecord={entry.record} patient={entry.patient} onBack={()=>setActive(null)} onComplete={()=>setEntries(previous=>previous.map(row=>row.record.sessionId===entry.record.sessionId?{...row,completed:true}:row))}/></div>)}</>;
}
export function TeleconsultationWorkspace({initialRecord,patient,onBack,onComplete,connection}:{initialRecord:FixtureRecord;patient:DemoTelePatient;onBack:()=>void;onComplete:()=>void;connection?:RecordConnection}){
 const patientId=initialRecord.patientId,sessionId=initialRecord.sessionId,opened=true;
 const visitTime=new Intl.DateTimeFormat('el-GR',{timeZone:'Europe/Athens',day:'numeric',month:'long',hour:'2-digit',minute:'2-digit'}).format(new Date(initialRecord.appointment.scheduled_start))+' · Ώρα Ελλάδας';
 const [record,setRecord]=useState(initialRecord),[inCall,setInCall]=useState(false),[mic,setMic]=useState(true),[camera,setCamera]=useState(true),[view,setView]=useState<'call'|'notes'>('call'),[tool,setTool]=useState<'PHQ-9'|'GAD-7'|'history'|null>(null),[message,setMessage]=useState(''),[fail,setFail]=useState(false),[dirty,setDirty]=useState(false);
 const [mse,setMse]=useState<DemoSection|undefined>(()=>connection?.bundle.sections.find(r=>r.session_id===sessionId&&r.section_key==='mse')),[risk,setRisk]=useState<DemoRisk|undefined>(()=>connection?.bundle.risks.find(r=>r.session_id===sessionId)),[review,setReview]=useState<string[]|null>(null);
 const [completionPending,setCompletionPending]=useState(false);
 const [ended,setEnded]=useState(false),[reviewing,setReviewing]=useState(false),[busy,setBusy]=useState(false),[completed,setCompleted]=useState<PatientBundle|null>(()=>connection?.bundle.sessions.find(s=>s.id===sessionId)?.status==='completed'?connection.bundle:null),[showRecord,setShowRecord]=useState(false);
 const reviewedRevision=useRef<string|null>(null),completedRef=useRef<PatientBundle|null>(null),finalizing=useRef(false);
 const [assessmentOpen,setAssessmentOpen]=useState(false),[planOpen,setPlanOpen]=useState(false);
 const clinical=useRef<{mse?:DemoSection;risk?:DemoRisk}>({mse,risk});
 const sendMenu=useRef<HTMLDetailsElement>(null);
 const reference=connection?.bundle||demoPatientContext(fixture as unknown as PatientBundle,patient);
 const lastVisit=reference.sessions.filter(row=>row.patient_id===patientId&&row.status==='completed').sort((a,b)=>Date.parse(b.completed_at||b.started_at)-Date.parse(a.completed_at||a.started_at))[0];
 const activeMedications=reference.medications.filter(row=>row.patient_id===patientId&&row.status==='active');
 const latestScores=Object.values(Object.fromEntries(reference.assessments.filter(row=>row.patient_id===patientId&&row.status==='completed').sort((a,b)=>Date.parse(a.completed_at||a.created_at)-Date.parse(b.completed_at||b.created_at)).map(row=>[row.instrument,row])));
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
 const onDirtyChange=useCallback((key:string,value:boolean)=>{if(value){dirtyKeys.current.add(key);setReview(null);reviewedRevision.current=null;setReviewing(false)}else dirtyKeys.current.delete(key);setDirty(dirtyKeys.current.size>0)},[]);
 useEffect(()=>{const warn=(event:BeforeUnloadEvent)=>{if(!dirty)return;event.preventDefault();event.returnValue=''};window.addEventListener('beforeunload',warn);return()=>window.removeEventListener('beforeunload',warn)},[dirty]);
 const syntheticBundle={...reference,patient:{...reference.patient,id:patientId,first_name:patient.first,last_name:patient.last},sessions:[{...fixture.sessions[3],id:sessionId,tester_id:reference.patient.tester_id,patient_id:patientId,status:'draft',completed_at:null,continuity:null,version:0,started_at:initialRecord.appointment.scheduled_start,session_type:'followup',closure_draft:record.notes,closure_version:record.version}],appointments:[{...reference.appointments[0],appointment_type:'teleconsultation',...record.appointment}],sections:mse?[mse]:[],risks:risk?[risk]:[]} as unknown as PatientBundle;
 const bundle=connection?{...reference,sessions:reference.sessions.map(s=>s.id===sessionId?{...s,closure_draft:record.notes,closure_version:record.version}:s),sections:[...reference.sections.filter(s=>!(s.session_id===sessionId&&s.section_key==='mse')),...(mse?[mse]:[])],risks:[...reference.risks.filter(r=>r.session_id!==sessionId),...(risk?[risk]:[])]}:syntheticBundle;
 const session=bundle.sessions.find(s=>s.id===sessionId)!;
 async function reloadRecord(){if(!connection)return current.current;const fresh=await connection.read();const next=recordForVisit(fresh,patientId,sessionId);if(next.version>=current.current.version){current.current=next;setRecord(next)}const section=fresh.sections.find(s=>s.session_id===sessionId&&s.section_key==='mse'),assessment=fresh.risks.find(r=>r.session_id===sessionId);if(section&&section.version>=(clinical.current.mse?.version||0)){clinical.current.mse=section;setMse(section)}if(assessment&&assessment.version>=(clinical.current.risk?.version||0)){clinical.current.risk=assessment;setRisk(assessment)}if(fresh.sessions.find(s=>s.id===sessionId)?.status==='completed'){confirmedCompletion(fresh.sessions.find(s=>s.id===sessionId),sessionId,patientId);completedRef.current=fresh;setCompleted(fresh)}return fresh}
 async function saveClosure(notes:ContinuityDraft,version:number|null){
  if(completedRef.current)throw new Error('Η επίσκεψη έχει ήδη καταχωριστεί.');
  if(fail)throw new Error('Συνθετική αποτυχία αποθήκευσης. Το κείμενο παραμένει στο πεδίο.');
  const saved=connection?await connection.saveClosure(notes,version):null;
  const next=saved?{...current.current,notes:saved.value,version:saved.version}:saveFixtureNotes(current.current,patientId,sessionId,version,notes);current.current=next;setRecord(next);setMessage(previous=>previous.startsWith('Αποθηκεύστε')?'':previous);return {value:next.notes,version:next.version};
 }
 async function saveMse(document:VisitDocument,version:number|null){
  if(fail)throw new Error('Συνθετική αποτυχία αποθήκευσης.');
  if(completedRef.current)throw new Error('Η επίσκεψη έχει ήδη καταχωριστεί.');
  if(connection){const section=await connection.saveMse(document,version);clinical.current.mse=section;setMse(section);return {value:section.document!,version:section.version}}
  if(version!==(clinical.current.mse?.version??null))throw new Error('Η αξιολόγηση άλλαξε.');
  const section:DemoSection={id:'tele-preview-mse',session_id:sessionId,patient_id:patientId,section_key:'mse',content:document.fields.map(f=>f.text).join('\n'),document,source:'clinician',version:(version??0)+1,updated_at:new Date().toISOString()};
  clinical.current.mse=section;setMse(section);return {value:document,version:section.version};
 }
 const saveRisk:NonNullable<ComponentProps<typeof RiskTreeEditor>['saveRisk']>=async(value,version)=>{
  if(fail)throw new Error('Συνθετική αποτυχία αποθήκευσης.');
  if(completedRef.current)throw new Error('Η επίσκεψη έχει ήδη καταχωριστεί.');
  if(connection){const saved=await connection.saveRisk(value,version);clinical.current.risk=saved;setRisk(saved);return {value:{...value,...saved,tree:saved.tree||value.tree},version:saved.version}}
  if(version!==(clinical.current.risk?.version??null))throw new Error('Η αξιολόγηση άλλαξε.');
  const next:DemoRisk={...value,session_id:sessionId,patient_id:patientId,version:(version??0)+1,updated_at:new Date().toISOString()};
  clinical.current.risk=next;setRisk(next);return {value,version:next.version};
 };
 async function saveAll(){
  await Promise.all([...flushers.current.values()].map(flush=>flush()));
 }
 function currentBundle(){
  return {...bundle,sessions:bundle.sessions.map(row=>({...row,closure_draft:current.current.notes,closure_version:current.current.version})),sections:clinical.current.mse?[clinical.current.mse]:[],risks:clinical.current.risk?[clinical.current.risk]:[]};
 }
 async function reviewVisit(){
  if(inCall){setMessage('Τερματίστε την κλήση και επεξεργαστείτε την καταγραφή πριν την καταχώριση.');return}
  if(finalizing.current)return;
  setBusy(true);
  try{await saveAll();
   const issues=connection?reviewConnectedVisit(await connection.read(),current.current,clinical.current.mse,clinical.current.risk):reviewFixtureVisit(current.current,clinical.current.mse,clinical.current.risk);
   setReview(issues);
   if(issues.length){setAssessmentOpen(true);setPlanOpen(true)}
   if(!issues.length){reviewedRevision.current=visitRevision(current.current,clinical.current.mse,clinical.current.risk);setReviewing(true);setMessage('')}
  }catch(cause){setReview([connection&&cause instanceof Error?cause.message:'Αποθηκεύστε πρώτα τις εκκρεμείς αλλαγές.'])}
  finally{setBusy(false)}
 }
 async function registerVisit(){
  if(finalizing.current||completedRef.current)return;
  finalizing.current=true;setBusy(true);
  try{
   await saveAll();
   if(fail)throw new Error('Η καταχώριση απέτυχε. Το προσχέδιο παραμένει διαθέσιμο.');
   await finalizeAndVerify({
    sessionId,patientId,closure:true,closureVersion:current.current.version,
    read:async()=>{if(connection){const fresh=await connection.read();assertReviewedRecord(fresh,current.current,clinical.current.mse,clinical.current.risk);return fresh}return completedRef.current||currentBundle()},
    write:async body=>{
     if(connection)return connection.write(body);
     const next=completeFixtureVisit(currentBundle(),current.current,clinical.current.mse,clinical.current.risk,{inCall,confirmed:reviewing,reviewedRevision:reviewedRevision.current||'',now:new Date().toISOString()});
     completedRef.current=next;
     return {session:next.sessions.find(row=>row.id===sessionId)};
    },
    onCommitted:(committed,baseline)=>{if(connection){completedRef.current={...baseline,sessions:baseline.sessions.map(s=>s.id===sessionId?committed:s)};setCompletionPending(true)}},
    onVerified:(_session,next)=>{setCompleted(next);onComplete();setReviewing(false);setShowRecord(true);setCompletionPending(false);setMessage(connection?'Η επίσκεψη καταχωρίστηκε στον φάκελο του ασθενή.':'Η επίσκεψη καταχωρίστηκε στον συνθετικό φάκελο. Δεν έγινε εγγραφή στη βάση.')}
   });
  }catch(cause){setMessage(cause instanceof Error?cause.message:'Δεν καταχωρίστηκε η επίσκεψη. Το προσχέδιο διατηρήθηκε.')}
  finally{finalizing.current=false;setBusy(false)}
 }
 function endCall(){
  setInCall(false);setEnded(true);setView('notes');setReview(null);reviewedRevision.current=null;
  setMessage('Η κλήση τερματίστηκε. Επεξεργαστείτε την καταγραφή και ελέγξτε την πριν την καταχώριση.');
 }
 async function closeVisit(){
  if(finalizing.current)return;
  if(completedRef.current){onBack();return}
  if(inCall){setMessage('Τερματίστε πρώτα την κλήση για να επιστρέψετε στα ραντεβού. Η καταγραφή παραμένει ανοιχτή.');return}
  try{await Promise.all([...flushers.current.values()].map(flush=>flush()));setInCall(false);onBack();setMessage('Το συνθετικό προσχέδιο διατηρήθηκε. Δεν οριστικοποιήθηκε επίσκεψη.')}catch{setMessage('Αποθηκεύστε τις εκκρεμείς αλλαγές πριν κλείσετε την επίσκεψη.')}
 }
 async function verifyRegistration(){if(!connection)return;try{const fresh=await connection.read();confirmedCompletion(fresh.sessions.find(s=>s.id===sessionId),sessionId,patientId);setCompleted(fresh);setCompletionPending(false);onComplete();setMessage('Η καταχώριση επιβεβαιώθηκε στον φάκελο.')}catch(e){setMessage(e instanceof Error?e.message:'Δεν επιβεβαιώθηκε η ανανέωση. Δοκιμάστε ξανά.')}}
 return <main className="app-shell secondary-shell">
  <aside className="sidebar"><div className="brand"><Link href="/" className="brand-mark">Ψ</Link><div className="brand-copy"><div className="brand-sub">Για μια οργανωμένη κλινική πράξη</div></div></div><nav className="nav" aria-label="Κύρια πλοήγηση"><Link href="/" className="nav-item"><Home size={19}/>Επισκόπηση</Link><Link href="/calendar" className="nav-item"><CalendarDays size={19}/>Ημερολόγιο</Link><Link href="/patients" className="nav-item"><Users size={19}/>Ασθενείς</Link><Link href="/psychometrics" className="nav-item"><BookOpen size={19}/>Βιβλιοθήκη</Link><Link href="/teleconsultations" className="nav-item active" aria-current="page"><Video size={19}/>Τηλεσυνεδρίες</Link></nav></aside>
  <div className="workspace"><div className={styles.content}>
   <header className={'page-heading '+styles.pageHeader}><div>{opened&&<span className="kicker">ΤΗΛΕΣΥΝΕΔΡΙΕΣ</span>}<h1>{patient.name}</h1><p>{visitTime}</p></div>{opened?<button className="small-button" onClick={()=>void closeVisit()}><ArrowLeft size={15}/>Πίσω στα ραντεβού</button>:<Video size={24}/>}</header>
   <p className={styles.notice}>{connection?'Η βιντεοκλήση παραμένει σε προσομοίωση. Οι σημειώσεις αποθηκεύονται στην ίδια επίσκεψη του φακέλου.':'Προσομοίωση τηλεσυνεδρίας · χωρίς πραγματική κλήση, αποστολή ή εγγραφή στη βάση. Οι σημειώσεις χάνονται με ανανέωση της σελίδας.'}</p>
   {completionPending&&!completed?<section className="card"><h2>Η καταχώριση χρειάζεται επιβεβαίωση</h2><p>Η αποθήκευση επιβεβαιώθηκε, αλλά η ανανέωση του φακέλου εκκρεμεί. Η επίσκεψη παραμένει κλειδωμένη.</p><button className="small-button" onClick={()=>void verifyRegistration()}>Επιβεβαίωση από τον φάκελο</button></section>:completed?<section className={'card '+styles.completedVisit}><span className="kicker">{connection?'ΦΑΚΕΛΟΣ ΑΣΘΕΝΗ · ΕΠΙΣΚΕΨΕΙΣ':'ΣΥΝΘΕΤΙΚΟΣ ΦΑΚΕΛΟΣ · ΕΠΙΣΚΕΨΕΙΣ'}</span><h2>Η επίσκεψη καταχωρίστηκε</h2><p>{patient.name} · {visitTime} · Τηλεσυνεδρία</p><p>{connection?'Η επίσκεψη έχει καταχωριστεί στον φάκελο του ασθενή.':'Η καταχώριση αφορά μόνο το συνθετικό παράδειγμα στην ανοιχτή σελίδα.'}</p><button type="button" className="small-button" aria-expanded={showRecord} onClick={()=>setShowRecord(value=>!value)}>Προβολή στον φάκελο</button>{showRecord&&<VisitReadback notes={completed.sessions.find(row=>row.id===sessionId)!.continuity||initialRecord.notes} mse={completed.sections.find(row=>row.session_id===sessionId)} risk={completed.risks.find(row=>row.session_id===sessionId)}/>}</section>:<SyntheticChartContext.Provider value={true}><FollowupDraftProvider bundle={bundle} session={session} reload={reloadRecord} registerFlusher={registerFlusher} onDirtyChange={onDirtyChange} saveClosure={saveClosure}>

    {reviewing&&<section className={'card '+styles.reviewCard} aria-label="Έλεγχος πριν την καταχώριση"><span className="kicker">ΕΛΕΓΧΟΣ ΠΡΙΝ ΤΗΝ ΚΑΤΑΧΩΡΙΣΗ</span><h2>Ελέγξτε την επίσκεψη</h2><p>Η παρακάτω καταγραφή θα εμφανιστεί στον συνθετικό φάκελο. Δεν έχει καταχωριστεί ακόμη.</p><VisitReadback notes={record.notes} mse={mse} risk={risk}/><div className={styles.actions}><button type="button" className="small-button" disabled={busy} onClick={()=>{setReviewing(false);reviewedRevision.current=null}}>Επιστροφή στην επεξεργασία</button><button type="button" className="record compact" disabled={busy||inCall} onClick={()=>void registerVisit()}>{busy?'Καταχώριση…':'Καταχώριση επίσκεψης'}</button></div></section>}
    <div hidden={reviewing}><div className={styles.modebar}><div role="group" aria-label="Προβολή τηλεσυνεδρίας" className={styles.modes}><button type="button" aria-pressed={view==='call'} onClick={()=>changeMode('call')}><Video size={16}/>Κλήση</button><button type="button" aria-pressed={view==='notes'} onClick={()=>changeMode('notes')}><FileText size={16}/>Σημειώσεις</button></div><div className={styles.actions}>

 {connection?<button className="small-button" disabled title="Η πρόσκληση θα ενεργοποιηθεί με το Daily.">Πρόσκληση με link</button>:<TeleInvitation record={record}/>}<details ref={sendMenu} className={styles.sendMenu}><summary aria-disabled={Boolean(connection)} onClick={e=>{if(connection)e.preventDefault()}} title={connection?'Οι αποστολές γίνονται από τον φάκελο ασθενή.':undefined}><Send size={16}/>Αποστολή<ChevronDown size={14}/></summary><div className={styles.sendOptions}><button type="button" onClick={()=>{setTool('PHQ-9');sendMenu.current?.removeAttribute('open')}}><Send size={16}/>Αποστολή τεστ</button><button type="button" onClick={()=>{setTool('history');sendMenu.current?.removeAttribute('open')}}><FileText size={16}/>Αποστολή ιστορικού</button></div></details>
 </div></div>
    <div className={[styles.grid,view==='notes'?styles.notesMode:styles.callMode].join(' ')} data-call-mode={view}>
     <section className={'card '+styles.callPanel} aria-label="Περιοχή βιντεοκλήσης"><div className={styles.video}><div className={styles.avatar}>{patient.first[0]+patient.last[0]}</div><h3>{inCall?'Συνθετική κλήση σε εξέλιξη':ended?'Η κλήση ολοκληρώθηκε':'Έτοιμοι για τη συνεδρία;'}</h3><p>{inCall?'Προσομοίωση · δεν μεταδίδεται ήχος ή βίντεο':'Το πραγματικό βίντεο θα ενεργοποιηθεί μετά τη ρύθμιση Daily και του ορίου χρήσης.'}</p>{!inCall&&<button className="record compact" onClick={()=>{setInCall(true);setEnded(false);setReviewing(false);reviewedRevision.current=null}}><Video size={17}/>Δοκιμή ροής κλήσης</button>}<div className={styles.self}>Εσείς · {camera?'Κάμερα δοκιμής':'Κάμερα κλειστή'}</div>
      <div className={styles.controls}><button className="small-button" disabled={!inCall} aria-label={mic?'Κλείσιμο μικροφώνου':'Άνοιγμα μικροφώνου'} aria-pressed={!mic} onClick={()=>setMic(v=>!v)}>{mic?<Mic size={19}/>:<MicOff size={19}/>}</button><button className="small-button" disabled={!inCall} aria-label={camera?'Κλείσιμο κάμερας':'Άνοιγμα κάμερας'} aria-pressed={!camera} onClick={()=>setCamera(v=>!v)}>{camera?<Video size={19}/>:<VideoOff size={19}/>}</button><button className="small-button" disabled={!inCall} onClick={endCall}><PhoneOff size={18}/>Τερματισμός κλήσης</button></div></div><div className={styles.privacy}><strong>Ιδιωτική καταγραφή επίσκεψης</strong><p>Ο ασθενής δεν βλέπει τις κλινικές σημειώσεις. Οι αναθέσεις γίνονται από την «Αποστολή».</p></div>
     </section>
     <section ref={notesPanel} hidden={view!=='notes'} className={styles.notesPanel} aria-label="Σημειώσεις συνδεδεμένης επίσκεψης">
 <details className={styles.reference}><summary><FolderOpen size={16}/>Φάκελος ασθενή <small>Μόνο ανάγνωση</small><ChevronDown size={14}/></summary><div className={styles.referencePanel} role="region" aria-label="Αναφορά φακέλου ασθενή"><p className={styles.referenceNotice}>Συνθετικά στοιχεία φακέλου · μόνο ανάγνωση. Δεν αποτελούν σημερινή αξιολόγηση.</p><h3>Προηγούμενη επιβεβαιωμένη επίσκεψη</h3><small>{lastVisit?new Intl.DateTimeFormat('el-GR',{timeZone:'Europe/Athens',day:'numeric',month:'short',year:'numeric'}).format(new Date(lastVisit.completed_at||lastVisit.started_at)):'Δεν έχει καταγραφεί'}</small><p>{lastVisit?.continuity?.clinical_state_summary||'Δεν υπάρχει διαθέσιμη κλινική καταγραφή.'}</p><h3>Καταγεγραμμένη ενεργή αγωγή</h3>{activeMedications.length?<ul>{activeMedications.map(row=><li key={row.id}>{row.medication_name} · {row.dose} {row.unit} · {row.frequency}</li>)}</ul>:<p>Δεν έχει καταγραφεί ενεργή αγωγή.</p>}<h3>Τελευταίες ολοκληρωμένες μετρήσεις</h3>{latestScores.length?<ul>{latestScores.map(row=><li key={row.id}>{row.instrument}: <strong>{row.score}</strong> · {new Intl.DateTimeFormat('el-GR',{timeZone:'Europe/Athens',day:'numeric',month:'short'}).format(new Date(row.completed_at||row.created_at))}</li>)}</ul>:<p>Δεν υπάρχουν ολοκληρωμένες μετρήσεις.</p>}</div></details>
      <div className={'card '+styles.editorCard+' '+styles.noteCard}><div className={styles.noteContext}><span className={styles.draftBadge}>Προσχέδιο — δεν έχει οριστικοποιηθεί</span>{ended&&<span>Η κλήση ολοκληρώθηκε · επεξεργασία</span>}</div><FollowupField field="transcript" title="Σημειώσεις επίσκεψης" rows={10}/></div>
      <details className={'card '+styles.disclosure} open={assessmentOpen} onToggle={event=>setAssessmentOpen(event.currentTarget.open)}><summary><span>Σημερινή αξιολόγηση</span><small>{mse?.content.trim()&&risk&&risk.suicidal_ideation!=='not_assessed'?'Υπάρχει καταγραφή':'Εκκρεμεί'}</small><ChevronDown size={15}/></summary><div className={styles.disclosureBody}>
      <div className={'card '+styles.editorCard}><h3>Σημερινή ψυχική κατάσταση</h3><p>Καταγράψτε τη σημερινή αξιολόγηση. Δεν προεπιλέγονται προηγούμενα ευρήματα.</p><StructuredVisitEditor sessionId={sessionId} kind="mse" followup existing={mse} baseline={connection?previousMseReference(reference,sessionId,session.started_at)?.section:undefined} timeline={connection?mseTimeline(reference,sessionId,session.started_at):undefined} saveDocument={saveMse} onSaved={connection?reloadRecord:async()=>({...bundle,sections:clinical.current.mse?[clinical.current.mse]:[]})} registerFlusher={registerFlusher} onDirtyChange={onDirtyChange}/></div>
      <div className={'card '+styles.editorCard}><h3>Εκτίμηση κινδύνου</h3><RiskTreeEditor sessionId={sessionId} existing={risk} saveRisk={saveRisk} onSaved={connection?reloadRecord:async()=>({...bundle,risks:clinical.current.risk?[clinical.current.risk]:[]})} registerFlusher={registerFlusher} onDirtyChange={onDirtyChange}/></div>
      </div></details>
      <details className={'card '+styles.disclosure} open={planOpen} onToggle={event=>setPlanOpen(event.currentTarget.open)}><summary><span>Πλάνο & συνέχεια</span><small>{record.notes.treatment_decision.trim()||record.notes.next_review_focus.trim()?'Υπάρχει καταγραφή':'Εκκρεμεί'}</small><ChevronDown size={15}/></summary><div className={styles.disclosureBody}>
      <div className={'card '+styles.editorCard}><FollowupField field="clinical_state_summary" title="Σημερινή κλινική εικόνα" rows={3}/><FollowupField field="adherence" title="Λήψη αγωγής" rows={2}/><FollowupField field="treatment_decision" title="Απόφαση / παρεμβάσεις" rows={3}/><FollowupField field="next_review_focus" title="Τι θα επανεκτιμηθεί" rows={2}/></div>
      </div></details>
      <div className={'card '+styles.editorFooter}><SaveNotes saveAll={saveAll} connection={connection?{...connection,read:async()=>await reloadRecord() as PatientBundle}:undefined}/><button type="button" className="record compact" disabled={busy||inCall} onClick={()=>void reviewVisit()}>Έλεγχος καταγραφής</button>{review&&<div role="status"><strong>Έλεγχος συνθετικής επίσκεψης</strong>{review.length?<ul>{review.map((text,i)=><li key={i}>{text}</li>)}</ul>:<p>Τα απαιτούμενα πεδία έχουν συμπληρωθεί.</p>}</div>}</div>
     </section>
    </div>
    </div>
    {record.assignments.length>0&&<p className={styles.notice}>Δοκιμαστικές αναθέσεις στον ίδιο ασθενή: {record.assignments.map(x=>x==='history'?'Ιστορικό':x).join(' · ')}. Δεν στάλθηκε πραγματικό μήνυμα.</p>}
    {tool&&<div className="intake-launcher-backdrop"><section className={"intake-launcher assignment-launcher "+styles.assignment} role="dialog" aria-modal="true" aria-labelledby="tele-assignment" onKeyDown={event=>{if(event.key==='Escape')setTool(null);if(event.key==='Tab'){const items=Array.from(event.currentTarget.querySelectorAll<HTMLElement>('button,select')).filter(el=>!el.hasAttribute('disabled'));const first=items[0],last=items[items.length-1];if(event.shiftKey&&document.activeElement===first){event.preventDefault();last?.focus()}else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first?.focus()}}}}><h2 id="tele-assignment">Αποστολή {tool==='history'?'ιστορικού':'τεστ'} · δοκιμή</h2><p>{patient.name} · συνδεδεμένο με την ανοιχτή επίσκεψη</p>{tool!=='history'&&<label>Εργαλείο <select value={tool} onChange={event=>setTool(event.target.value as 'PHQ-9'|'GAD-7')}><option>PHQ-9</option><option>GAD-7</option></select></label>}<p>Η επιβεβαίωση δημιουργεί μόνο συνθετική ανάθεση στην τρέχουσα σελίδα.</p><div className="pilot-actions"><button autoFocus className="small-button" onClick={()=>setTool(null)}>Ακύρωση</button><button className="record compact" onClick={()=>{const next=assignFixture(current.current,tool);current.current=next;setRecord(next);setMessage('Η δοκιμαστική ανάθεση εμφανίζεται στην ίδια επίσκεψη. Η κλήση συνεχίζεται.');setTool(null)}}>Επιβεβαίωση δοκιμής</button></div></section></div>}
   </FollowupDraftProvider></SyntheticChartContext.Provider>}
   <p role="status" aria-live="polite">{message}</p>
   <details className={styles.tests}><summary>Σενάρια συνθετικής δοκιμής</summary><label><input type="checkbox" checked={fail} onChange={event=>setFail(event.target.checked)}/>Προσομοίωση αποτυχίας αποθήκευσης</label><p>{dirty?'Υπάρχουν εκκρεμείς αλλαγές.':'Δεν υπάρχουν εκκρεμείς αλλαγές.'} Η πραγματική κλήση παραμένει απενεργοποιημένη.</p></details>
  </div></div>
 </main>;
}

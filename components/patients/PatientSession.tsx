'use client';

import { useCallback, useEffect, useRef, useState, type MutableRefObject } from 'react';
import { ArrowLeft, Check, CheckCircle2, Mic2, RotateCcw, ShieldCheck } from 'lucide-react';
import RiskEditor from './RiskTreeEditor';
import StructuredVisitEditor from './StructuredVisitEditor';
import CompletedRecordEditor from './CompletedRecordEditor';
import VisitHistory from './VisitHistory';
import VisitNextAppointment from './VisitNextAppointment';
import VisitScores from './VisitScores';
import MedicationTable from './MedicationTable';
import {MedicationModal} from './PatientPanels';
import ProposalReview from './ProposalReview';
import {useClinicalDraft} from './useClinicalDraft';
import type {ClinicalProposal} from '@/lib/clinical/core-types';
import SectionDictation from '@/components/dictation/SectionDictation';
import type { DemoRisk, DemoSection, DemoSession, PatientBundle } from '@/lib/patients/demo-runtime';
import { demoPost } from '@/lib/patients/demo-client';
import { formatClinicDateTime } from '@/lib/clinic-time';
import {activeVisitPart,finalizationBlocker,visitSteps,previousMseReference,sessionClinicalTime} from '@/lib/clinical/visit-workspace-state';

const definitions=[
 ['interview','Ψυχιατρική συνέντευξη / συμπτώματα','Αίτημα, συμπτώματα, πορεία και τι άλλαξε.'],
 ['mse','Εξέταση ψυχικής κατάστασης (MSE)','Στοχευμένα ευρήματα της σημερινής εξέτασης.'],
 ['assessment','Κλινική εκτίμηση','Διάγνωση / διαφορική, formulation και κλινική αποτίμηση.'],
 ['plan','Θεραπευτικό πλάνο','Αγωγή, παρεμβάσεις, παραπομπές και οδηγίες.'],
 ['review','Επανεκτίμηση','Χρονικός ορίζοντας και τι πρέπει να ελεγχθεί στην επίσκεψη.'],
 ['functioning','Λειτουργικότητα','Εργασία, σχέσεις, καθημερινότητα και ύπνος.'],
 ['effects','Παρενέργειες','Ανεπιθύμητες ενέργειες και επίδρασή τους.'],
 ['adherence','Συμμόρφωση','Λήψη αγωγής, παραλείψεις και δυσκολίες.'],
] as const;

const required=new Set(['interview','mse','assessment','plan','review']);
const fmt=(value?:string|null)=>value?formatClinicDateTime(value):'—';
const riskOptions=[['not_assessed','Δεν διερευνήθηκε'],['unknown','Άγνωστο'],['negative','Αρνητικό'],['positive','Θετικό']] as const;
const riskLabel=(value:string)=>riskOptions.find(([key])=>key===value)?.[1]||value;

type RegisterFlusher=(key:string,flush:()=>Promise<void>)=>(()=>void);
type DirtyChange=(key:string,dirty:boolean)=>void;

export default function PatientSession({
 bundle,
 reload,
 onFinalize,
 onFinishLater,
 finalizing,
 finalizeError,
 selectedSessionId,
 onSelectSession,
 contextReady=true,
 reloadContext=reload,
 onClose,
 beforeNavigate,
 previousMse,
}:{
 beforeNavigate?:MutableRefObject<(()=>Promise<void>)|null>;
 previousMse?:ReturnType<typeof previousMseReference>;
 contextReady?:boolean;
 reloadContext?:()=>Promise<unknown>;
 onClose?:()=>void;
 bundle:PatientBundle;
 reload:()=>Promise<unknown>;
 onFinalize:(sessionId:string)=>Promise<void>;
 onFinishLater?:(sessionId:string)=>Promise<void>;
 finalizing:boolean;
 finalizeError:string;
 selectedSessionId:string|null;
 onSelectSession:(sessionId?:string|null)=>void;
}){
 const [medOpen,setMedOpen]=useState(false);
 const [medTarget,setMedTarget]=useState<{mode:'start'|'history'|'change'|'stop'|'side_effect';id?:string}>({mode:'start'});
 function manageMedication(mode:typeof medTarget.mode,id?:string){setMedTarget({mode,id});setMedOpen(true)}
 const [narrativeMode,setNarrativeMode]=useState<Record<string,boolean>>({});
 const completed=bundle.sessions.filter(s=>s.status==='completed').sort((a,b)=>Date.parse(sessionClinicalTime(bundle,b))-Date.parse(sessionClinicalTime(bundle,a)));
 const requested=selectedSessionId?bundle.sessions.find(s=>s.id===selectedSessionId):undefined;
 const draft=requested?.status==='draft'?requested:(!selectedSessionId?bundle.sessions.find(s=>s.status==='draft'):undefined);
 const selected=requested?.status==='completed'?requested:undefined;
 const flushers=useRef(new Map<string,()=>Promise<void>>());
 const dirtyKeys=useRef(new Set<string>());
 const [dirtyCount,setDirtyCount]=useState(0);
 const [flushing,setFlushing]=useState(false);
 const [flushError,setFlushError]=useState('');
 const [refreshError,setRefreshError]=useState('');
 const [showFinalizeGuidance,setShowFinalizeGuidance]=useState(false);
 const [finishingLater,setFinishingLater]=useState(false);
 const finishing=useRef(false);
 const documentRef=useRef<HTMLFieldSetElement>(null);
 const [activePart,setActivePart]=useState('interview');

 const registerFlusher=useCallback<RegisterFlusher>((key,flush)=>{
  flushers.current.set(key,flush);
  return()=>{if(flushers.current.get(key)===flush)flushers.current.delete(key)};
 },[]);

 const onDirtyChange=useCallback<DirtyChange>((key,dirty)=>{
  if(dirty)dirtyKeys.current.add(key);else dirtyKeys.current.delete(key);
  setDirtyCount(dirtyKeys.current.size);
 },[]);

 useEffect(()=>{
  const warn=(event:BeforeUnloadEvent)=>{
   if(!dirtyKeys.current.size&&!medOpen)return;
   event.preventDefault();
   event.returnValue='';
  };
  window.addEventListener('beforeunload',warn);
  return()=>window.removeEventListener('beforeunload',warn);
 },[medOpen]);

 const flushAll=useCallback(async(requireRefresh=false)=>{
  setFlushing(true);
  setFlushError('');
  setRefreshError('');
  try{
   const pending=[...flushers.current.values()];
   await Promise.all(pending.map(flush=>flush()));
  }catch(cause){
   const message=cause instanceof Error?cause.message:'Δεν αποθηκεύτηκαν όλες οι αλλαγές.';
   setFlushError(message);
   setFlushing(false);
   throw cause;
  }
  try{
   const refreshed=await reload();
   if(!refreshed)throw new Error('refresh_unavailable');
   return refreshed;
  }catch(cause){
   setRefreshError('Οι αλλαγές αποθηκεύτηκαν, αλλά η προβολή δεν ανανεώθηκε. Δοκιμάστε ξανά ή ανανεώστε τον φάκελο.');
   if(requireRefresh)throw cause;
   return null;
  }finally{
   setFlushing(false);
  }
 },[reload]);

 useEffect(()=>{if(!beforeNavigate)return;const flush=async()=>{if(medOpen){setFlushError('Ολοκληρώστε πρώτα την καταχώρηση αγωγής.');throw new Error('medication_pending')}await flushAll()};beforeNavigate.current=flush;return()=>{if(beforeNavigate.current===flush)beforeNavigate.current=null}},[beforeNavigate,medOpen,flushAll]);

 useEffect(()=>{
  const root=documentRef.current;if(!root)return;
  const sections=[...root.querySelectorAll<HTMLElement>('[data-visit-part]')];
  const scroller=root.closest<HTMLElement>('.visit-dialog')||document.scrollingElement;
  let frame=0;
  const update=()=>{frame=0;const top=scroller instanceof HTMLElement&&scroller.matches('.visit-dialog')?scroller.getBoundingClientRect().top:0;setActivePart(activeVisitPart(sections.map(section=>({key:section.dataset.visitPart||'interview',top:section.getBoundingClientRect().top})),top+125))};
  const schedule=()=>{if(!frame)frame=requestAnimationFrame(update)};
  const target=scroller?.matches('.visit-dialog')?scroller:window;
  target.addEventListener('scroll',schedule,{passive:true});window.addEventListener('resize',schedule);
  const observer=new ResizeObserver(schedule);sections.forEach(section=>observer.observe(section));update();
  return()=>{target.removeEventListener('scroll',schedule);window.removeEventListener('resize',schedule);observer.disconnect();if(frame)cancelAnimationFrame(frame)};
 },[draft?.id]);
 function goToPart(key:string){documentRef.current?.querySelector<HTMLElement>('[data-visit-part="'+key+'"]')?.scrollIntoView({behavior:'smooth',block:'start'})}

 async function finishLater(){
  if(!draft||!onFinishLater||finishingLater)return;
  setFinishingLater(true);
  try{if(medOpen)throw new Error('Ολοκληρώστε πρώτα την καταχώρηση αγωγής.');await flushAll();await onFinishLater(draft.id)}catch{}finally{setFinishingLater(false)}
 }
 async function finalizeSafely(){
  if(finishing.current)return;finishing.current=true;
  try{
   if(medOpen)throw new Error('Ολοκληρώστε πρώτα την καταχώρηση αγωγής.');
   const fresh=await flushAll(true) as PatientBundle;
   const blocker=finalizationBlocker(fresh.sections.filter(s=>s.session_id===draft?.id),fresh.risks.find(r=>r.session_id===draft?.id));
   if(!draft)throw new Error('Δεν υπάρχει το επιλεγμένο πρόχειρο.');
   if(blocker){setShowFinalizeGuidance(true);if(onFinishLater)await onFinishLater(draft.id);return}
   await onFinalize(draft.id);
  }catch{
   // The concrete save/finalize error is already rendered in the workspace.
  }finally{finishing.current=false}
 }

 if(selected){
  return <CompletedSessionView session={selected} bundle={bundle} reload={reload} registerFlusher={registerFlusher} onDirtyChange={onDirtyChange} onBack={()=>onSelectSession(null)} />;
 }

 if(selectedSessionId&&!requested){
  return <section className="panel-stack"><div className="panel-heading"><div><span className="kicker">ΣΥΝΕΔΡΙΕΣ</span><h2>Η συγκεκριμένη συνεδρία δεν είναι διαθέσιμη</h2><p>Ο σύνδεσμος είναι παλιός ή η συνεδρία δεν ανήκει πλέον σε αυτόν τον φάκελο.</p></div><button onClick={()=>onSelectSession(null)}>Προβολή συνεδριών</button></div></section>;
 }

 if(!draft){
  return <section className="panel-stack">
   <div className="panel-heading"><div><span className="kicker">ΣΥΝΕΔΡΙΕΣ</span><h2>Ολοκληρωμένες συνεδρίες</h2><p>Επιλέξτε ολοκληρωμένη συνεδρία για να δείτε ακριβώς τι καταγράφηκε.</p></div></div>
   {completed.length?<CompletedList sessions={completed} onSelect={id=>void flushAll().then(()=>onSelectSession(id)).catch(()=>{})}/>:<div className="panel-empty">Δεν υπάρχει ακόμη συνεδρία.</div>}
  </section>;
 }

 const risk=bundle.risks.find(x=>x.session_id===draft.id);
 const sections=bundle.sections.filter(x=>x.session_id===draft.id);
 const blocker=finalizationBlocker(sections,risk);
 const mseReference=previousMse??previousMseReference(bundle,draft.id,draft.started_at);

 const editor=(key:string)=>{const d=definitions.find(([k])=>k===key)!;return <SectionEditor key={draft.id+':'+key} sessionId={draft.id} definition={{key,title:d[1]}} existing={sections.find(s=>s.section_key===key)} proposals={bundle.proposals.filter(p=>p.session_id===draft.id&&p.section_key===key)} onSaved={reload} registerFlusher={registerFlusher} onDirtyChange={onDirtyChange}/>};
 const assessment=()=> <VisitPart anchor="assessment" number={draft.session_type==='follow_up'?'07':'05'} title="Κλινική εκτίμηση *">{narrativeMode.assessment?editor('assessment'):<StructuredVisitEditor key={draft.id+':assessment'} sessionId={draft.id} kind="assessment" existing={sections.find(s=>s.section_key==='assessment')} followup={draft.session_type==='follow_up'} onSaved={reload} registerFlusher={registerFlusher} onDirtyChange={onDirtyChange}/>}<button type="button" className="visit-text-button" onClick={()=>void flushAll(true).then(()=>setNarrativeMode(v=>({...v,assessment:!v.assessment}))).catch(()=>{})}>{narrativeMode.assessment?'Δομημένη αξιολόγηση':'Ελεύθερο κείμενο / έλεγχος υπαγόρευσης αξιολόγησης'}</button></VisitPart>;
 return <section className="session-workspace runtime-session">
  <div className="session-work-head">
   <div><h2>{draft.session_type==='initial_assessment'?'Αρχική αξιολόγηση':'Follow-up'}</h2><p>{fmt(draft.started_at)}</p></div>
   <div className="session-save-overview"><span className={dirtyCount?'pending':''}>{flushing?'Αποθήκευση…':dirtyCount?dirtyCount+' αλλαγές σε αναμονή':'Όλες οι αλλαγές αποθηκεύτηκαν'}</span><small>Έναρξη {fmt(draft.started_at)}</small></div>
  </div>

  <nav className="visit-scroll-nav" aria-label="Πλοήγηση επίσκεψης">{visitSteps[draft.session_type==='initial_assessment'?'initial_assessment':'follow_up'].map(([key,label])=><button type="button" key={key} aria-current={activePart===key?'step':undefined} className={activePart===key?'active':''} onClick={()=>goToPart(key)}><i/><span>{label}</span></button>)}</nav>
  <fieldset ref={documentRef} disabled={flushing||finalizing||finishingLater||medOpen} className="visit-document">
   <VisitPart anchor="interview" number="01" title={draft.session_type==='follow_up'?'Συμπτώματα / πορεία':'Λόγος προσέλευσης & παρούσα εικόνα'}>{editor('interview')}</VisitPart>
   {draft.session_type==='follow_up'&&<VisitPart anchor="adherence" number="02" title="Παρενέργειες & λήψη αγωγής">{contextReady?<MedicationTable bundle={bundle} sessionId={draft.id} reload={reloadContext} editableEffects registerFlusher={registerFlusher} onDirtyChange={onDirtyChange}/>:<p role="status">Φόρτωση αγωγής…</p>}<details className="visit-review-notes"><summary>Συνολική καταγραφή παρενεργειών{sections.find(s=>s.section_key==='effects')?.content.trim()?' · υπάρχει καταγραφή':''}</summary>{editor('effects')}</details>{editor('adherence')}</VisitPart>}
   <VisitPart anchor="mse" number="02" title={draft.session_type==='follow_up'?'MSE · τι άλλαξε':'Mental Status Examination'}>
    {draft.session_type==='follow_up'&&<details className="visit-additional mse-reference"><summary>Προηγούμενο MSE · πλήρης αναφορά</summary>{mseReference?<><small>{fmt(mseReference.session.completed_at||mseReference.session.started_at)} · ιστορική καταγραφή</small><p style={{whiteSpace:'pre-wrap'}}>{mseReference.section.content}</p>{mseReference.addenda.map(a=><div key={a.id}><strong>{a.kind==='correction'?'Διόρθωση':'Προσθήκη'} · {fmt(a.created_at)}</strong><p>{a.reason}</p><p style={{whiteSpace:'pre-wrap'}}>{a.content}</p></div>)}</>:<p>{contextReady?'Δεν υπάρχει προηγούμενο καταγεγραμμένο MSE.':'Φόρτωση προηγούμενου MSE…'}</p>}<p className="visit-hint">Καταγράψτε μόνο τα σημερινά σχετικά ευρήματα. Η προηγούμενη καταγραφή παραμένει ιστορική.</p></details>}
    {narrativeMode.mse?editor('mse'):<StructuredVisitEditor key={draft.id+':mse'} sessionId={draft.id} kind="mse" existing={sections.find(s=>s.section_key==='mse')} followup={draft.session_type==='follow_up'} baseline={draft.session_type==='follow_up'?mseReference?.section:null} onSaved={reload} registerFlusher={registerFlusher} onDirtyChange={onDirtyChange}/>}
    <details className="visit-additional"><summary>Εναλλακτική καταγραφή MSE</summary><p className="visit-hint">Χρησιμοποιήστε την μόνο όταν χρειάζεστε ενιαίο αφηγηματικό κείμενο ή έλεγχο παλαιότερης υπαγόρευσης.</p><button type="button" className="visit-text-button" onClick={()=>void flushAll(true).then(()=>setNarrativeMode(v=>({...v,mse:!v.mse}))).catch(()=>{})}>{narrativeMode.mse?'Επιστροφή στο δομημένο MSE':'Άνοιγμα ελεύθερου κειμένου MSE'}</button></details>
   </VisitPart>
   <VisitPart anchor="risk" number="03" title="Εκτίμηση κινδύνου"><RiskEditor key={draft.id} sessionId={draft.id} existing={risk} onSaved={reload} registerFlusher={registerFlusher} onDirtyChange={onDirtyChange}/></VisitPart>
   {draft.session_type==='initial_assessment'&&<VisitPart anchor="history" number="04" title="Ιστορικό">{contextReady?<VisitHistory bundle={bundle} sessionId={draft.id} reload={reloadContext} registerFlusher={registerFlusher} onDirtyChange={onDirtyChange}/>:<p role="status">Φόρτωση ιστορικού… Μπορείτε να συνεχίσετε την καταγραφή.</p>}</VisitPart>}
   {draft.session_type==='follow_up'&&<VisitPart anchor="psychometrics" number="05" title="Scores έναντι προηγούμενης επίσκεψης">{contextReady?<VisitScores bundle={bundle} sessionId={draft.id} reload={reloadContext}/>:<p role="status">Φόρτωση ψυχομετρικών…</p>}</VisitPart>}
   {draft.session_type==='initial_assessment'&&assessment()}
   <VisitPart anchor="medication" number="06" title={draft.session_type==='follow_up'?'Τροποποίηση αγωγής':'Αγωγή / ιστορικό αγωγής'}>{contextReady?<><MedicationTable bundle={bundle} sessionId={draft.id} reload={reloadContext} onManage={manageMedication} editableEffects={draft.session_type==='initial_assessment'} registerFlusher={registerFlusher} onDirtyChange={onDirtyChange}/><button type="button" className="visit-text-button" onClick={()=>manageMedication('start')}>＋ Προσθήκη φαρμάκου</button></>:<p role="status">Φόρτωση αγωγής…</p>}</VisitPart>
   {draft.session_type==='follow_up'&&assessment()}
   <VisitPart anchor="plan" number={draft.session_type==='follow_up'?'08':'07'} title="Πλάνο / επόμενη επίσκεψη">{editor('plan')}{editor('review')}{contextReady&&<VisitNextAppointment bundle={bundle} reload={reloadContext} registerFlusher={registerFlusher} onDirtyChange={onDirtyChange}/>}</VisitPart>
   <details className="visit-additional"><summary>Πρόσθετη καταγραφή & λειτουργικότητα</summary>{editor('functioning')}{draft.session_type==='initial_assessment'&&<>{editor('adherence')}{editor('effects')}</>}{draft.session_type==='follow_up'&&contextReady&&<VisitHistory bundle={bundle} sessionId={draft.id} reload={reloadContext} registerFlusher={registerFlusher} onDirtyChange={onDirtyChange}/>}</details>
  </fieldset>
  {medOpen&&<MedicationModal bundle={bundle} sessionId={draft.id} initialMode={medTarget.mode} initialMedicationId={medTarget.id} onClose={()=>setMedOpen(false)} onSaved={reloadContext}/>}

  <div className="finalize-bar">
   <button onClick={()=>void finalizeSafely()} aria-describedby={showFinalizeGuidance&&blocker?'visit-finalize-guidance':undefined} disabled={finalizing||flushing||finishingLater||medOpen}><Check size={16}/>{flushing?'Αποθήκευση…':finalizing?'Ολοκλήρωση…':'Ολοκλήρωση & αποθήκευση καταγραφής'}</button>{onFinishLater&&<button type="button" className="finalize-later" disabled={finalizing||flushing||finishingLater||medOpen} onClick={()=>void finishLater()}>{finishingLater?'Αποθήκευση…':'Ολοκλήρωση αργότερα'}</button>}
   {showFinalizeGuidance&&blocker&&<span id="visit-finalize-guidance" className="visit-finalize-guidance" role="status">{blocker.message} <button type="button" onClick={()=>goToPart(blocker.anchor)}>Μετάβαση</button></span>}
  </div>
  
  {flushError&&<div className="save-state error" role="alert"><strong>Υπάρχουν μη αποθηκευμένες αλλαγές.</strong> {flushError} <span>Διορθώστε το πρόβλημα ή δοκιμάστε ξανά πριν οριστικοποιήσετε.</span></div>}
  {refreshError&&<div className="save-state" role="status">{refreshError}</div>}
  {finalizeError&&<div className="save-state error" role="alert">{finalizeError}</div>}

  {completed.length>0&&<div className="previous-visits"><span className="kicker">ΠΡΟΗΓΟΥΜΕΝΕΣ</span><CompletedList sessions={completed} onSelect={id=>void flushAll().then(()=>onSelectSession(id)).catch(()=>{})}/></div>}
 </section>;
}

function CompletedList({sessions,onSelect}:{sessions:DemoSession[];onSelect:(id:string)=>void}){
 return <div className="completed-session-list">{sessions.map(session=><button className="completed-session-row" key={session.id} onClick={()=>onSelect(session.id)}><CheckCircle2 size={18}/><div><strong>{session.session_type==='initial_assessment'?'Αρχική αξιολόγηση':'Επαναληπτική συνεδρία'}</strong><span>Οριστικοποιήθηκε {fmt(session.completed_at)}</span></div><span className="open-session-label">Άνοιγμα</span></button>)}</div>;
}

function CompletedSessionView({session,bundle,onBack,reload,registerFlusher,onDirtyChange}:{session:DemoSession;bundle:PatientBundle;onBack:()=>void;reload:()=>Promise<unknown>;registerFlusher:RegisterFlusher;onDirtyChange:DirtyChange}){
 return <CompletedRecordEditor session={session} bundle={bundle} reload={reload} onBack={onBack} registerFlusher={registerFlusher} onDirtyChange={onDirtyChange}/>;
}

function SectionEditor({sessionId,definition,existing,proposals,onSaved,registerFlusher,onDirtyChange}:{sessionId:string;definition:{key:string;title:string};existing?:DemoSection;proposals:ClinicalProposal[];onSaved:()=>Promise<unknown>;registerFlusher:RegisterFlusher;onDirtyChange:DirtyChange}){
 const [dictating,setDictating]=useState(false),[transcript,setTranscript]=useState(''),[review,setReview]=useState<ClinicalProposal|undefined>(),[reviewOpen,setReviewOpen]=useState(false),[conflict,setConflict]=useState<DemoSection|null|undefined>();
 const key='section:'+definition.key;
 const [recoverable,setRecoverable]=useState('');
 useEffect(()=>{try{setRecoverable(sessionStorage.getItem(sessionId+':transcript:'+definition.key)||'')}catch{}},[sessionId,definition.key]);
 const draft=useClinicalDraft({storageKey:sessionId+':'+key,initial:existing?.content||'',version:existing?.version??null,write:async(content,version)=>{const d=await demoPost({action:'save_section',session_id:sessionId,section_key:definition.key,content,source:'manual',expected_version:version});return {value:d.section.content as string,version:d.section.version as number}},onSaved,onDirty:dirty=>onDirtyChange(key,dirty)});
 const reviewRef=useRef(false),dictatingRef=useRef(false);reviewRef.current=reviewOpen;dictatingRef.current=dictating;
 useEffect(()=>{const pending=dictating||reviewOpen;onDirtyChange(key+':dictation',pending);return()=>onDirtyChange(key+':dictation',false)},[key,dictating,reviewOpen,onDirtyChange]);
 useEffect(()=>registerFlusher(key,async()=>{if(dictatingRef.current)throw new Error('Ολοκληρώστε ή κλείστε την υπαγόρευση πριν συνεχίσετε.');if(reviewRef.current)throw new Error('Ολοκληρώστε ή κλείστε τον έλεγχο υπαγόρευσης.');await draft.flush()}),[key,registerFlusher,draft.flush]);
 async function compare(){const fresh=await onSaved() as PatientBundle|null;if(fresh)setConflict(fresh.sections.find(s=>s.session_id===sessionId&&s.section_key===definition.key)||null)}
 return <div className="clinical-section"><div className="clinical-section-head"><div><h3>{definition.title}{required.has(definition.key)&&' *'}</h3></div><button className="section-mic" onClick={()=>setDictating(true)}><Mic2 size={15}/> Υπαγόρευση</button></div>
 <textarea disabled={reviewOpen} className="section-editor" rows={4} value={draft.value} onChange={e=>draft.change(e.target.value)} onBlur={()=>void draft.flush().catch(()=>{})} placeholder=""/>
 <div role="status">{draft.saving?'Αποθηκεύεται…':draft.error|| (draft.savedAt?'Αποθηκεύτηκε '+draft.savedAt:existing?'Αποθηκευμένο':'Δεν έχει καταγραφεί')}</div>
 {draft.error&&<><button onClick={()=>void draft.flush().catch(()=>{})}>Επανάληψη</button><button onClick={()=>void compare()}>Σύγκριση με αποθηκευμένο</button></>}
 {conflict!==undefined&&<div className="conflict-review"><h4>Αποθηκευμένη έκδοση</h4><p>{conflict?.content||'Κενή ενότητα'}</p><p>Το δικό σας κείμενο παραμένει στον επεξεργαστή. Επεξεργαστείτε το πριν επιλέξετε αντικατάσταση.</p><button onClick={()=>{draft.acceptServer(conflict?.content||'',conflict?.version??null);setConflict(undefined)}}>Χρήση αποθηκευμένου</button><button onClick={()=>{draft.resolve(draft.value,conflict?.content||'',conflict?.version??null);setConflict(undefined)}}>Ρητή αντικατάσταση με το δικό μου</button><button onClick={()=>{draft.resolve([conflict?.content,draft.value].filter(Boolean).join('\n\n'),conflict?.content||'',conflict?.version??null);setConflict(undefined)}}>Συνένωση των δύο</button></div>}
 {dictating&&<SectionDictation title={definition.title} onClose={()=>setDictating(false)} onInsert={text=>{setDictating(false);setTranscript(text);setRecoverable(text);try{sessionStorage.setItem(sessionId+':transcript:'+definition.key,text)}catch{};setReview(undefined);setReviewOpen(true)}}/>}
 {!reviewOpen&&<>{proposals.filter(p=>p.status==='proposal').slice(0,3).map(p=><button key={p.id} onClick={()=>{setReview(p);setTranscript(p.transcript);setReviewOpen(true)}}>Συνέχεια ελέγχου πρότασης · {fmt(p.created_at)}</button>)}{recoverable&&<button className="text-button" onClick={()=>{setTranscript(recoverable);setReview(undefined);setReviewOpen(true)}}>Ανάκτηση τελευταίας μεταγραφής</button>}</>}
 {reviewOpen&&<ProposalReview sessionId={sessionId} section={definition.key} title={definition.title} transcript={transcript} initial={review} current={draft.value} beforeApprove={async()=>{await draft.flush();return draft.version()}} onCancel={()=>setReviewOpen(false)} onApproved={s=>{draft.acceptServer(s.content,s.version);setReviewOpen(false);setRecoverable('');try{sessionStorage.removeItem(sessionId+':transcript:'+definition.key);sessionStorage.removeItem(`noima-proposal:${sessionId}:${definition.key}`)}catch{};void onSaved()}}/>}
 {proposals.some(p=>p.status==='approved')&&<details><summary>Προέλευση εγκεκριμένων υπαγορεύσεων</summary>{proposals.filter(p=>p.status==='approved').map(p=><div key={p.id}><small>Εγκρίθηκε {fmt(p.approved_at)}</small><p>Μεταγραφή: {p.transcript}</p><p>Εγκεκριμένο: {p.approved_text}</p></div>)}</details>}
 </div>
}

function VisitPart({number:_,title,children,anchor}:{number:string;title:string;children:React.ReactNode;anchor?:string}){return <section className="visit-part" data-visit-part={anchor}><header><h3>{title}</h3></header><div>{children}</div></section>}

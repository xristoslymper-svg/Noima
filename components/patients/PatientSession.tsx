'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowLeft, Check, CheckCircle2, Mic2, RotateCcw, ShieldCheck } from 'lucide-react';
import Addenda from './Addenda';
import StructuredVisitEditor from './StructuredVisitEditor';
import VisitHistory from './VisitHistory';
import VisitNextAppointment from './VisitNextAppointment';
import PatientPsychometrics from './PatientPsychometrics';
import {MedicationModal} from './PatientPanels';
import ProposalReview from './ProposalReview';
import {useClinicalDraft} from './useClinicalDraft';
import type {ClinicalProposal} from '@/lib/clinical/core-types';
import SectionDictation from '@/components/dictation/SectionDictation';
import type { DemoRisk, DemoSection, DemoSession, PatientBundle } from '@/lib/patients/demo-runtime';
import { demoPost } from '@/lib/patients/demo-client';
import { formatClinicDateTime } from '@/lib/clinic-time';

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
 finalizing,
 finalizeError,
 selectedSessionId,
 onSelectSession,
 contextReady=true,
 reloadContext=reload,
 onClose,
}:{
 contextReady?:boolean;
 reloadContext?:()=>Promise<unknown>;
 onClose?:()=>void;
 bundle:PatientBundle;
 reload:()=>Promise<unknown>;
 onFinalize:(sessionId:string)=>Promise<void>;
 finalizing:boolean;
 finalizeError:string;
 selectedSessionId:string|null;
 onSelectSession:(sessionId?:string|null)=>void;
}){
 const [medOpen,setMedOpen]=useState(false);
 const [narrativeMode,setNarrativeMode]=useState<Record<string,boolean>>({});
 const completed=bundle.sessions.filter(s=>s.status==='completed');
 const requested=selectedSessionId?bundle.sessions.find(s=>s.id===selectedSessionId):undefined;
 const draft=requested?.status==='draft'?requested:(!selectedSessionId?bundle.sessions.find(s=>s.status==='draft'):undefined);
 const selected=requested?.status==='completed'?requested:undefined;
 const flushers=useRef(new Map<string,()=>Promise<void>>());
 const dirtyKeys=useRef(new Set<string>());
 const [dirtyCount,setDirtyCount]=useState(0);
 const [flushing,setFlushing]=useState(false);
 const [flushError,setFlushError]=useState('');
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
   if(!dirtyKeys.current.size)return;
   event.preventDefault();
   event.returnValue='';
  };
  window.addEventListener('beforeunload',warn);
  return()=>window.removeEventListener('beforeunload',warn);
 },[]);

 async function flushAll(){
  setFlushing(true);
  setFlushError('');
  try{
   const pending=[...flushers.current.values()];
   await Promise.all(pending.map(flush=>flush()));
   await reload();
  }catch(cause){
   const message=cause instanceof Error?cause.message:'Δεν αποθηκεύτηκαν όλες οι αλλαγές.';
   setFlushError(message);
   throw cause;
  }finally{
   setFlushing(false);
  }
 }

 useEffect(()=>{
  const root=documentRef.current;if(!root)return;
  const sections=[...root.querySelectorAll<HTMLElement>('[data-visit-part]')];
  const observer=new IntersectionObserver(entries=>{const visible=entries.filter(e=>e.isIntersecting).sort((a,b)=>b.intersectionRatio-a.intersectionRatio)[0];if(visible)setActivePart((visible.target as HTMLElement).dataset.visitPart||'interview')},{root:root.closest('.visit-dialog'),rootMargin:'-18% 0px -62% 0px',threshold:[0,.15,.4]});
  sections.forEach(section=>observer.observe(section));return()=>observer.disconnect();
 },[draft?.id]);
 function goToPart(key:string){documentRef.current?.querySelector<HTMLElement>('[data-visit-part="'+key+'"]')?.scrollIntoView({behavior:'smooth',block:'start'})}

 async function finalizeSafely(){
  if(finishing.current)return;finishing.current=true;
  try{
   if(medOpen)throw new Error('Ολοκληρώστε πρώτα την καταχώρηση αγωγής.');
   await flushAll();
   if(!draft)throw new Error('Δεν υπάρχει το επιλεγμένο πρόχειρο.');
   await onFinalize(draft.id);
  }catch{
   // The concrete save/finalize error is already rendered in the workspace.
  }finally{finishing.current=false}
 }

 if(selected){
  return <CompletedSessionView session={selected} bundle={bundle} reload={reload} onBack={()=>onSelectSession(null)} />;
 }

 if(selectedSessionId&&!requested){
  return <section className="panel-stack"><div className="panel-heading"><div><span className="kicker">ΣΥΝΕΔΡΙΕΣ</span><h2>Η συγκεκριμένη συνεδρία δεν είναι διαθέσιμη</h2><p>Ο σύνδεσμος είναι παλιός ή η συνεδρία δεν ανήκει πλέον σε αυτόν τον φάκελο.</p></div><button onClick={()=>onSelectSession(null)}>Προβολή συνεδριών</button></div></section>;
 }

 if(!draft){
  return <section className="panel-stack">
   <div className="panel-heading"><div><span className="kicker">ΣΥΝΕΔΡΙΕΣ</span><h2>Ολοκληρωμένες συνεδρίες</h2><p>Δεν υπάρχει ανοιχτό πρόχειρο. Επιλέξτε συνεδρία για να δείτε ακριβώς τι καταγράφηκε.</p></div></div>
   {completed.length?<CompletedList sessions={completed} onSelect={id=>void flushAll().then(()=>onSelectSession(id)).catch(()=>{})}/>:<div className="panel-empty">Δεν υπάρχει ακόμη συνεδρία.</div>}
  </section>;
 }

 const risk=bundle.risks.find(x=>x.session_id===draft.id);
 const sections=bundle.sections.filter(x=>x.session_id===draft.id);
 const completeKeys=new Set(sections.filter(x=>x.content.trim()).map(x=>x.section_key));
 const requiredDone=[...required].filter(x=>completeKeys.has(x)).length;
 const riskFollowupReady=!risk||risk.suicidal_ideation!=='positive'||[risk.intent,risk.plan,risk.self_harm,risk.attempt_history].every(value=>value!=='not_assessed');
 const riskReady=Boolean(risk)&&risk?.suicidal_ideation!=='not_assessed'&&riskFollowupReady;
 const ready=requiredDone===required.size&&riskReady;

 const editor=(key:string)=>{const d=definitions.find(([k])=>k===key)!;return <SectionEditor key={draft.id+':'+key} sessionId={draft.id} definition={{key,title:d[1],hint:d[2]}} existing={sections.find(s=>s.section_key===key)} proposals={bundle.proposals.filter(p=>p.session_id===draft.id&&p.section_key===key)} onSaved={reload} registerFlusher={registerFlusher} onDirtyChange={onDirtyChange}/>};
 const assessment=()=> <VisitPart anchor="assessment" number={draft.session_type==='follow_up'?'07':'05'} title="Κλινική αξιολόγηση">{narrativeMode.assessment?editor('assessment'):<StructuredVisitEditor key={draft.id+':assessment'} sessionId={draft.id} kind="assessment" existing={sections.find(s=>s.section_key==='assessment')} followup={draft.session_type==='follow_up'} onSaved={reload} registerFlusher={registerFlusher} onDirtyChange={onDirtyChange}/>}<button type="button" className="visit-text-button" onClick={()=>void flushAll().then(()=>setNarrativeMode(v=>({...v,assessment:!v.assessment}))).catch(()=>{})}>{narrativeMode.assessment?'Δομημένη αξιολόγηση':'Ελεύθερο κείμενο / έλεγχος υπαγόρευσης αξιολόγησης'}</button></VisitPart>;
 return <section className="session-workspace runtime-session">
  <div className="session-work-head">
   <div><h2>{draft.session_type==='initial_assessment'?'Αρχική αξιολόγηση':'Follow-up'}</h2><p>{fmt(draft.started_at)}</p></div>
   <div className="session-save-overview"><span className={dirtyCount?'pending':''}>{flushing?'Αποθήκευση…':dirtyCount?dirtyCount+' αλλαγές σε αναμονή':'Όλες οι αλλαγές αποθηκεύτηκαν'}</span><small>Έναρξη {fmt(draft.started_at)}</small></div>
  </div>

  <nav className="visit-scroll-nav" aria-label="Πλοήγηση επίσκεψης">{(draft.session_type==='initial_assessment'?[['interview','Λόγος'],['mse','MSE'],['risk','Risk'],['history','Ιστορικό'],['assessment','Αξιολόγηση'],['medication','Αγωγή'],['plan','Πλάνο']]:[['interview','Πορεία'],['mse','MSE'],['risk','Risk'],['psychometrics','Scores'],['adherence','Αγωγή'],['assessment','Αξιολόγηση'],['plan','Πλάνο']]).map(([key,label])=><button type="button" key={key} className={activePart===key?'active':''} onClick={()=>goToPart(key)}><i/><span>{label}</span></button>)}</nav>
  <fieldset ref={documentRef} disabled={flushing||finalizing||medOpen} className="visit-document">
   <VisitPart anchor="interview" number="01" title={draft.session_type==='follow_up'?'Συμπτώματα / πορεία':'Λόγος προσέλευσης & παρούσα εικόνα'}>{editor('interview')}</VisitPart>
   <VisitPart anchor="mse" number="02" title={draft.session_type==='follow_up'?'MSE · τι άλλαξε':'Mental Status Examination'}>
    {narrativeMode.mse?editor('mse'):<StructuredVisitEditor key={draft.id+':mse'} sessionId={draft.id} kind="mse" existing={sections.find(s=>s.section_key==='mse')} followup={draft.session_type==='follow_up'} onSaved={reload} registerFlusher={registerFlusher} onDirtyChange={onDirtyChange}/>}
    <details className="visit-additional"><summary>Εναλλακτική καταγραφή MSE</summary><p className="visit-hint">Χρησιμοποιήστε την μόνο όταν χρειάζεστε ενιαίο αφηγηματικό κείμενο ή έλεγχο παλαιότερης υπαγόρευσης.</p><button type="button" className="visit-text-button" onClick={()=>void flushAll().then(()=>setNarrativeMode(v=>({...v,mse:!v.mse}))).catch(()=>{})}>{narrativeMode.mse?'Επιστροφή στο δομημένο MSE':'Άνοιγμα ελεύθερου κειμένου MSE'}</button></details>
   </VisitPart>
   <VisitPart anchor="risk" number="03" title="Εκτίμηση κινδύνου"><RiskEditor key={draft.id} sessionId={draft.id} existing={risk} onSaved={reload} registerFlusher={registerFlusher} onDirtyChange={onDirtyChange}/></VisitPart>
   {draft.session_type==='initial_assessment'&&<VisitPart anchor="history" number="04" title="Ιστορικό">{contextReady?<VisitHistory bundle={bundle} sessionId={draft.id} reload={reloadContext} registerFlusher={registerFlusher} onDirtyChange={onDirtyChange}/>:<p role="status">Φόρτωση ιστορικού… Μπορείτε να συνεχίσετε την καταγραφή.</p>}</VisitPart>}
   {draft.session_type==='follow_up'&&<><VisitPart anchor="psychometrics" number="04" title="Scores / ψυχομετρικά">{contextReady?<PatientPsychometrics bundle={bundle} reload={reloadContext}/>:<p role="status">Φόρτωση ψυχομετρικών…</p>}</VisitPart><VisitPart anchor="adherence" number="05" title="Λήψη αγωγής & παρενέργειες">{editor('adherence')}{editor('effects')}</VisitPart></>}
   {draft.session_type==='initial_assessment'&&assessment()}
   <VisitPart anchor="medication" number={draft.session_type==='follow_up'?'06':'06'} title="Αγωγή / θεραπεία">{contextReady?<><div className="visit-med-table">{bundle.medications.map(m=><div key={m.id}><strong>{m.medication_name}</strong><span>{m.dose} {m.unit}</span><span>{m.frequency}</span><span>Από {m.started_at.slice(0,10)}{m.ended_at?' έως '+m.ended_at.slice(0,10):''}</span><span>{m.status==='active'?'Λαμβάνει':m.status==='stopped'?'Διακοπείσα':'Προγραμματισμένη'}</span><span>{bundle.medicationSideEffects.filter(e=>e.medication_id===m.id&&!e.resolved_on).map(e=>e.effect_text).join('; ')||'—'}</span></div>)}</div><button type="button" onClick={()=>setMedOpen(true)}>Καταχώρηση / αλλαγή αγωγής</button></>:<p role="status">Φόρτωση χρονολογίου αγωγής…</p>}</VisitPart>
   {draft.session_type==='follow_up'&&assessment()}
   <VisitPart anchor="plan" number={draft.session_type==='follow_up'?'08':'07'} title="Πλάνο / επόμενη επίσκεψη">{editor('plan')}{editor('review')}{contextReady&&<VisitNextAppointment bundle={bundle} reload={reloadContext} registerFlusher={registerFlusher} onDirtyChange={onDirtyChange}/>}</VisitPart>
   <details className="visit-additional"><summary>Πρόσθετη καταγραφή & λειτουργικότητα</summary>{editor('functioning')}{draft.session_type==='initial_assessment'&&<>{editor('adherence')}{editor('effects')}</>}{draft.session_type==='follow_up'&&contextReady&&<VisitHistory bundle={bundle} sessionId={draft.id} reload={reloadContext} registerFlusher={registerFlusher} onDirtyChange={onDirtyChange}/>}</details>
  </fieldset>
  {medOpen&&<MedicationModal bundle={bundle} sessionId={draft.id} onClose={()=>setMedOpen(false)} onSaved={reloadContext}/>}

  <div className="finalize-bar">
   <div className="visit-finalize-status"><strong>{flushing?'Αποθήκευση…':dirtyCount?dirtyCount+' αλλαγές σε αναμονή':'✓ Αποθηκεύτηκε'}</strong>{!ready&&<span>{!risk||risk.suicidal_ideation==='not_assessed'?'Η εκτίμηση κινδύνου απαιτείται πριν την ολοκλήρωση.':!riskFollowupReady?'Ολοκληρώστε τα σχετικά πεδία κινδύνου πριν την ολοκλήρωση.':'Συμπληρώστε τις βασικές κλινικές ενότητες πριν την ολοκλήρωση.'}</span>}</div>
   <button onClick={()=>void finalizeSafely()} disabled={finalizing||flushing||medOpen||!ready}><Check size={16}/>{flushing?'Αποθήκευση…':finalizing?'Ολοκλήρωση…':'Ολοκλήρωση επίσκεψης'}</button>
  </div>
  {onClose&&<button data-visit-close className="visit-close" disabled={flushing||finalizing||medOpen} onClick={()=>void flushAll().then(onClose).catch(()=>{})}>Αποθήκευση & κλείσιμο</button>}
  {flushError&&<div className="save-state error" role="alert"><strong>Υπάρχουν μη αποθηκευμένες αλλαγές.</strong> {flushError} <span>Διορθώστε το πρόβλημα ή δοκιμάστε ξανά πριν οριστικοποιήσετε.</span></div>}
  {finalizeError&&<div className="save-state error" role="alert">{finalizeError}</div>}

  {completed.length>0&&<div className="previous-visits"><span className="kicker">ΠΡΟΗΓΟΥΜΕΝΕΣ</span><CompletedList sessions={completed} onSelect={id=>void flushAll().then(()=>onSelectSession(id)).catch(()=>{})}/></div>}
 </section>;
}

function CompletedList({sessions,onSelect}:{sessions:DemoSession[];onSelect:(id:string)=>void}){
 return <div className="completed-session-list">{sessions.map(session=><button className="completed-session-row" key={session.id} onClick={()=>onSelect(session.id)}><CheckCircle2 size={18}/><div><strong>{session.session_type==='initial_assessment'?'Αρχική αξιολόγηση':'Επαναληπτική συνεδρία'}</strong><span>Οριστικοποιήθηκε {fmt(session.completed_at)}</span></div><span className="open-session-label">Άνοιγμα</span></button>)}</div>;
}

function CompletedSessionView({session,bundle,onBack,reload}:{session:DemoSession;bundle:PatientBundle;onBack:()=>void;reload:()=>Promise<unknown>}){
 const sections=bundle.sections.filter(item=>item.session_id===session.id);
 const risk=bundle.risks.find(item=>item.session_id===session.id);
 return <section className="session-workspace completed-session-view">
  <div className="session-work-head">
   <div><button className="session-back-button" onClick={onBack}><ArrowLeft size={15}/> Συνεδρίες</button><span className="visit-label completed"><span>ΟΡΙΣΤΙΚΟΠΟΙΗΜΕΝΟ</span><i/> {session.session_type==='initial_assessment'?'ΑΡΧΙΚΗ ΑΞΙΟΛΟΓΗΣΗ':'FOLLOW-UP'}</span><h2>{session.session_type==='initial_assessment'?'Αρχική αξιολόγηση':'Επαναληπτική συνεδρία'}</h2><p>Οριστικοποιημένη καταγραφή · διορθώσεις μέσω προσθήκης.</p></div>
   <span className="draft-updated">Ολοκληρώθηκε {fmt(session.completed_at)}</span>
  </div>
  <Addenda bundle={bundle} sessionId={session.id} reload={reload}/><div className="completed-section-stack">
   {definitions.map(([key,title])=>{
    const item=sections.find(section=>section.section_key===key);
    const approved=bundle.proposals.filter(p=>p.session_id===session.id&&p.section_key===key&&p.status==='approved');
    return <article className="completed-clinical-section" key={key}><span>{title}</span><p>{item?.content.trim()||'Δεν καταγράφηκε.'}</p>{item&&<small>Έκδοση {item.version} · ενημέρωση {fmt(item.updated_at)}</small>}{approved.length>0&&<details><summary>Προέλευση εγκεκριμένων υπαγορεύσεων</summary>{approved.map(p=><div key={p.id}><small>Έγκριση {fmt(p.approved_at)}</small><p>Μεταγραφή: {p.transcript}</p><p>Εγκεκριμένη πρόταση: {p.approved_text}</p></div>)}</details>}</article>;
   })}
   <article className="completed-clinical-section completed-risk">
    <span>Εκτίμηση κινδύνου</span>
    {risk?<div className="completed-risk-grid">
     <RiskRead label="Αυτοκτονικός ιδεασμός" value={risk.suicidal_ideation}/>
     <RiskRead label="Πρόθεση" value={risk.intent}/>
     <RiskRead label="Σχέδιο" value={risk.plan}/>
     <RiskRead label="Αυτοτραυματισμός" value={risk.self_harm}/>
     <RiskRead label="Ιστορικό απόπειρας" value={risk.attempt_history}/><RiskRead label="Κίνδυνος προς άλλους" value={risk.harm_to_others||'not_assessed'}/>
     <div><strong>Προστατευτικοί παράγοντες</strong><p>{risk.protective_factors||'Δεν καταγράφηκαν.'}</p></div>
     <div><strong>Κλινική σημείωση</strong><p>{risk.clinical_note||'Δεν καταγράφηκε.'}</p></div>
    </div>:<p>Δεν καταγράφηκε δομημένη εκτίμηση κινδύνου.</p>}
   </article>
  </div>
 </section>;
}

function RiskRead({label,value}:{label:string;value:string}){
 return <div><strong>{label}</strong><p>{riskLabel(value)}</p></div>;
}

function SectionEditor({sessionId,definition,existing,proposals,onSaved,registerFlusher,onDirtyChange}:{sessionId:string;definition:{key:string;title:string;hint:string};existing?:DemoSection;proposals:ClinicalProposal[];onSaved:()=>Promise<unknown>;registerFlusher:RegisterFlusher;onDirtyChange:DirtyChange}){
 const [dictating,setDictating]=useState(false),[transcript,setTranscript]=useState(''),[review,setReview]=useState<ClinicalProposal|undefined>(),[reviewOpen,setReviewOpen]=useState(false),[conflict,setConflict]=useState<DemoSection|null|undefined>();
 const key='section:'+definition.key;
 const [recoverable,setRecoverable]=useState('');
 useEffect(()=>{try{setRecoverable(sessionStorage.getItem(sessionId+':transcript:'+definition.key)||'')}catch{}},[sessionId,definition.key]);
 const draft=useClinicalDraft({storageKey:sessionId+':'+key,initial:existing?.content||'',version:existing?.version??null,write:async(content,version)=>{const d=await demoPost({action:'save_section',session_id:sessionId,section_key:definition.key,content,source:'manual',expected_version:version});return {value:d.section.content as string,version:d.section.version as number}},onSaved,onDirty:dirty=>onDirtyChange(key,dirty)});
 const reviewRef=useRef(false);reviewRef.current=reviewOpen;
 useEffect(()=>registerFlusher(key,async()=>{if(reviewRef.current)throw new Error('Ολοκληρώστε ή κλείστε τον έλεγχο υπαγόρευσης.');await draft.flush()}),[key,registerFlusher,draft.flush]);
 async function compare(){const fresh=await onSaved() as PatientBundle|null;if(fresh)setConflict(fresh.sections.find(s=>s.session_id===sessionId&&s.section_key===definition.key)||null)}
 return <div className="clinical-section"><div className="clinical-section-head"><div><h3>{definition.title}{required.has(definition.key)&&' *'}</h3><span>{definition.hint}</span></div><button className="section-mic" onClick={()=>setDictating(true)}><Mic2 size={15}/> Υπαγόρευση</button></div>
 <textarea disabled={reviewOpen} className="section-editor" rows={4} value={draft.value} onChange={e=>draft.change(e.target.value)} onBlur={()=>void draft.flush().catch(()=>{})} placeholder="Γράψτε ή υπαγορεύστε ανά ενότητα."/>
 <div role="status">{draft.saving?'Αποθηκεύεται…':draft.error|| (draft.savedAt?'Αποθηκεύτηκε '+draft.savedAt:existing?'Αποθηκευμένο':'Δεν έχει καταγραφεί')}</div>
 {draft.error&&<><button onClick={()=>void draft.flush().catch(()=>{})}>Επανάληψη</button><button onClick={()=>void compare()}>Σύγκριση με αποθηκευμένο</button></>}
 {conflict!==undefined&&<div className="conflict-review"><h4>Αποθηκευμένη έκδοση</h4><p>{conflict?.content||'Κενή ενότητα'}</p><p>Το δικό σας κείμενο παραμένει στον επεξεργαστή. Επεξεργαστείτε το πριν επιλέξετε αντικατάσταση.</p><button onClick={()=>{draft.acceptServer(conflict?.content||'',conflict?.version??null);setConflict(undefined)}}>Χρήση αποθηκευμένου</button><button onClick={()=>{draft.resolve(draft.value,conflict?.content||'',conflict?.version??null);setConflict(undefined)}}>Ρητή αντικατάσταση με το δικό μου</button><button onClick={()=>{draft.resolve([conflict?.content,draft.value].filter(Boolean).join('\n\n'),conflict?.content||'',conflict?.version??null);setConflict(undefined)}}>Συνένωση των δύο</button></div>}
 {dictating&&<SectionDictation title={definition.title} onClose={()=>setDictating(false)} onInsert={text=>{setDictating(false);setTranscript(text);setRecoverable(text);try{sessionStorage.setItem(sessionId+':transcript:'+definition.key,text)}catch{};setReview(undefined);setReviewOpen(true)}}/>}
 {!reviewOpen&&<>{proposals.filter(p=>p.status==='proposal').slice(0,3).map(p=><button key={p.id} onClick={()=>{setReview(p);setTranscript(p.transcript);setReviewOpen(true)}}>Συνέχεια ελέγχου πρότασης · {fmt(p.created_at)}</button>)}{recoverable&&<button className="text-button" onClick={()=>{setTranscript(recoverable);setReview(undefined);setReviewOpen(true)}}>Ανάκτηση τελευταίας μεταγραφής</button>}</>}
 {reviewOpen&&<ProposalReview sessionId={sessionId} section={definition.key} title={definition.title} transcript={transcript} initial={review} current={draft.value} beforeApprove={async()=>{await draft.flush();return draft.version()}} onCancel={()=>setReviewOpen(false)} onApproved={s=>{draft.acceptServer(s.content,s.version);setReviewOpen(false);setRecoverable('');try{sessionStorage.removeItem(sessionId+':transcript:'+definition.key);sessionStorage.removeItem(`noima-proposal:${sessionId}:${definition.key}`)}catch{};void onSaved()}}/>}
 {proposals.some(p=>p.status==='approved')&&<details><summary>Προέλευση εγκεκριμένων υπαγορεύσεων</summary>{proposals.filter(p=>p.status==='approved').map(p=><div key={p.id}><small>Εγκρίθηκε {fmt(p.approved_at)}</small><p>Μεταγραφή: {p.transcript}</p><p>Εγκεκριμένο: {p.approved_text}</p></div>)}</details>}
 </div>
}

function RiskEditor({sessionId,existing,onSaved,registerFlusher,onDirtyChange}:{sessionId:string;existing?:DemoRisk;onSaved:()=>Promise<unknown>;registerFlusher:RegisterFlusher;onDirtyChange:DirtyChange}){
 const shape=(r?:DemoRisk)=>({suicidal_ideation:r?.suicidal_ideation||'not_assessed',intent:r?.intent||'not_assessed',plan:r?.plan||'not_assessed',self_harm:r?.self_harm||'not_assessed',attempt_history:r?.attempt_history||'not_assessed',harm_to_others:r?.harm_to_others||'not_assessed',protective_factors:r?.protective_factors||'',clinical_note:r?.clinical_note||''});
 const [conflict,setConflict]=useState<DemoRisk|null|undefined>();
 const draft=useClinicalDraft({storageKey:sessionId+':risk',initial:shape(existing),version:existing?.version??null,write:async(risk,version)=>{const d=await demoPost({action:'save_risk',session_id:sessionId,risk,expected_version:version});return {value:shape(d.risk),version:d.risk.version as number}},onSaved,onDirty:d=>onDirtyChange('risk',d)});
 useEffect(()=>registerFlusher('risk',draft.flush),[registerFlusher,draft.flush]);
 const positiveNeedsFollowup=draft.value.suicidal_ideation==='positive'&&[draft.value.intent,draft.value.plan,draft.value.self_harm,draft.value.attempt_history].some(value=>value==='not_assessed');
 return <div className="clinical-section risk-editor"><h3>Εκτίμηση κινδύνου *</h3><p className="risk-principle">Καταγράψτε μόνο ό,τι διερευνήθηκε σήμερα.</p>{positiveNeedsFollowup&&<div className="review-signal"><strong>Θετικός αυτοκτονικός ιδεασμός</strong><p>Πριν την ολοκλήρωση της συνεδρίας αξιολογήστε Πρόθεση, Σχέδιο, Αυτοτραυματισμό και Ιστορικό απόπειρας.</p></div>}<div className="risk-grid">{[['suicidal_ideation','Αυτοκτονικός ιδεασμός'],['intent','Πρόθεση'],['plan','Σχέδιο'],['self_harm','Αυτοτραυματισμός'],['attempt_history','Ιστορικό απόπειρας'],['harm_to_others','Κίνδυνος προς άλλους']].filter(([k])=>!['intent','plan'].includes(k)||draft.value.suicidal_ideation==='positive'||!['not_assessed','negative'].includes(draft.value[k as keyof typeof draft.value])).map(([k,label])=><label key={k}>{label}<span className="risk-choice-group">{riskOptions.filter(([v])=>v!=='unknown').map(([v,t])=><button type="button" key={v} className={draft.value[k as keyof typeof draft.value]===v?'selected':''} onClick={()=>draft.change({...draft.value,[k]:v})}>{t}</button>)}</span></label>)}</div>{[['protective_factors','Προστατευτικοί παράγοντες'],['clinical_note','Κλινική σημείωση']].map(([k,label])=><label className="risk-note" key={k}>{label}<textarea value={draft.value[k as keyof typeof draft.value]} onChange={e=>draft.change({...draft.value,[k]:e.target.value})}/></label>)}<p role="status">{draft.saving?'Αποθήκευση…':draft.error|| (draft.savedAt?'Αποθηκεύτηκε '+draft.savedAt:'')}</p>
 {draft.error&&<><button onClick={()=>void draft.flush().catch(()=>{})}>Επανάληψη</button><button onClick={()=>void onSaved().then(b=>{if(b)setConflict((b as PatientBundle).risks.find(r=>r.session_id===sessionId)||null)})}>Σύγκριση με αποθηκευμένο</button></>}
 {conflict!==undefined&&<div className="conflict-review"><h4>Αποθηκευμένη εκτίμηση</h4>{Object.entries(shape(conflict||undefined)).map(([k,v])=><p key={k}>{k}: {riskLabel(v)}</p>)}<button onClick={()=>{draft.acceptServer(shape(conflict||undefined),conflict?.version??null);setConflict(undefined)}}>Χρήση αποθηκευμένου</button><button onClick={()=>{draft.resolve(draft.value,shape(conflict||undefined),conflict?.version??null);setConflict(undefined)}}>Ρητή αντικατάσταση με τις επιλογές μου</button></div>}
 </div>
}

function VisitPart({number:_,title,children,anchor}:{number:string;title:string;children:React.ReactNode;anchor?:string}){return <section className="visit-part" data-visit-part={anchor}><header><h3>{title}</h3></header><div>{children}</div></section>}

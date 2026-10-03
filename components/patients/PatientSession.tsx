'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowLeft, Check, CheckCircle2, Mic2, RotateCcw, ShieldCheck } from 'lucide-react';
import Addenda from './Addenda';
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
}:{
 bundle:PatientBundle;
 reload:()=>Promise<unknown>;
 onFinalize:(sessionId:string)=>Promise<void>;
 finalizing:boolean;
 finalizeError:string;
 selectedSessionId:string|null;
 onSelectSession:(sessionId?:string|null)=>void;
}){
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

 async function finalizeSafely(){
  if(finishing.current)return;finishing.current=true;
  try{
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

 return <section className="session-workspace runtime-session">
  <div className="session-work-head">
   <div><span className="visit-label"><span>ΠΡΟΧΕΙΡΟ</span><i/> {draft.session_type==='initial_assessment'?'ΑΡΧΙΚΗ ΑΞΙΟΛΟΓΗΣΗ':'FOLLOW-UP'}</span><h2>{draft.session_type==='initial_assessment'?'Αρχική αξιολόγηση':'Επαναληπτική συνεδρία'}</h2><p>Αυτόματη αποθήκευση · οριστικοποίηση μετά τον κλινικό έλεγχο.</p></div>
   <div className="session-save-overview"><span className={dirtyCount?'pending':''}>{flushing?'Αποθήκευση…':dirtyCount?dirtyCount+' αλλαγές σε αναμονή':'Όλες οι αλλαγές αποθηκεύτηκαν'}</span><small>Έναρξη {fmt(draft.started_at)}</small></div>
  </div>

  <div className="sections-label"><span className="kicker">ΚΛΙΝΙΚΗ ΚΑΤΑΓΡΑΦΗ</span><span>* απαιτείται για ολοκλήρωση</span></div>
  <p className="dictation-guidance">Γράψτε φυσικά ή υπαγορεύστε. Πρόσθετη καταγραφή μόνο όταν χρειάζεται.</p><fieldset disabled={flushing||finalizing} className="clinical-sections">
   {definitions.filter(([key])=>required.has(key)).map(([key,title,hint])=><SectionEditor key={draft.id+':'+key} sessionId={draft.id} definition={{key,title,hint}} existing={sections.find(x=>x.section_key===key)} proposals={bundle.proposals.filter(p=>p.session_id===draft.id&&p.section_key===key)} onSaved={reload} registerFlusher={registerFlusher} onDirtyChange={onDirtyChange}/>)}
   <RiskEditor key={draft.id} sessionId={draft.id} existing={risk} onSaved={reload} registerFlusher={registerFlusher} onDirtyChange={onDirtyChange}/>
   <details className="optional-clinical-sections"><summary>Πρόσθετη καταγραφή <span>Λειτουργικότητα · Παρενέργειες · Συμμόρφωση</span></summary><div>{definitions.filter(([key])=>!required.has(key)).map(([key,title,hint])=><SectionEditor key={draft.id+':'+key} sessionId={draft.id} definition={{key,title,hint}} existing={sections.find(x=>x.section_key===key)} proposals={bundle.proposals.filter(p=>p.session_id===draft.id&&p.section_key===key)} onSaved={reload} registerFlusher={registerFlusher} onDirtyChange={onDirtyChange}/>)}</div></details>
  </fieldset>

  <div className="finalize-bar">
   <div><strong>{ready?'Έτοιμη για ολοκλήρωση':'Χρειάζεται έλεγχο'}</strong><span>{ready?'Οι 5 βασικές ενότητες και ο ιδεασμός έχουν καταγραφεί. Ελέγξτε τα υπόλοιπα πεδία κινδύνου πριν ολοκληρώσετε.':requiredDone+'/5 βασικές ενότητες · '+(!risk?'χρειάζεται εκτίμηση αυτοκτονικού ιδεασμού':risk.suicidal_ideation==='not_assessed'?'χρειάζεται εκτίμηση αυτοκτονικού ιδεασμού':!riskFollowupReady?'θετικός ιδεασμός · ολοκληρώστε τα σχετικά πεδία κινδύνου':'κίνδυνος καταγράφηκε')}</span></div>
   <button onClick={()=>void finalizeSafely()} disabled={finalizing||flushing||!ready}><Check size={16}/>{flushing?'Αποθήκευση…':finalizing?'Ολοκλήρωση…':'Έλεγχος & ολοκλήρωση'}</button>
  </div>
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
     <RiskRead label="Ιστορικό απόπειρας" value={risk.attempt_history}/>
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
 const shape=(r?:DemoRisk)=>({suicidal_ideation:r?.suicidal_ideation||'not_assessed',intent:r?.intent||'not_assessed',plan:r?.plan||'not_assessed',self_harm:r?.self_harm||'not_assessed',attempt_history:r?.attempt_history||'not_assessed',protective_factors:r?.protective_factors||'',clinical_note:r?.clinical_note||''});
 const [conflict,setConflict]=useState<DemoRisk|null|undefined>();
 const draft=useClinicalDraft({storageKey:sessionId+':risk',initial:shape(existing),version:existing?.version??null,write:async(risk,version)=>{const d=await demoPost({action:'save_risk',session_id:sessionId,risk,expected_version:version});return {value:shape(d.risk),version:d.risk.version as number}},onSaved,onDirty:d=>onDirtyChange('risk',d)});
 useEffect(()=>registerFlusher('risk',draft.flush),[registerFlusher,draft.flush]);
 const positiveNeedsFollowup=draft.value.suicidal_ideation==='positive'&&[draft.value.intent,draft.value.plan,draft.value.self_harm,draft.value.attempt_history].some(value=>value==='not_assessed');
 return <div className="clinical-section risk-editor"><h3>Εκτίμηση κινδύνου *</h3><p>Δεν διερευνήθηκε ≠ αρνητικό εύρημα.</p>{positiveNeedsFollowup&&<div className="review-signal"><strong>Θετικός αυτοκτονικός ιδεασμός</strong><p>Πριν την ολοκλήρωση της συνεδρίας αξιολογήστε Πρόθεση, Σχέδιο, Αυτοτραυματισμό και Ιστορικό απόπειρας.</p></div>}<div className="risk-grid">{[['suicidal_ideation','Αυτοκτονικός ιδεασμός'],['intent','Πρόθεση'],['plan','Σχέδιο'],['self_harm','Αυτοτραυματισμός'],['attempt_history','Ιστορικό απόπειρας']].map(([k,label])=><label key={k}>{label}<select value={draft.value[k as keyof typeof draft.value]} onChange={e=>draft.change({...draft.value,[k]:e.target.value})}>{riskOptions.map(([v,t])=><option key={v} value={v}>{t}</option>)}</select></label>)}</div>{[['protective_factors','Προστατευτικοί παράγοντες'],['clinical_note','Κλινική σημείωση']].map(([k,label])=><label className="risk-note" key={k}>{label}<textarea value={draft.value[k as keyof typeof draft.value]} onChange={e=>draft.change({...draft.value,[k]:e.target.value})}/></label>)}<p role="status">{draft.saving?'Αποθήκευση…':draft.error|| (draft.savedAt?'Αποθηκεύτηκε '+draft.savedAt:'')}</p>
 {draft.error&&<><button onClick={()=>void draft.flush().catch(()=>{})}>Επανάληψη</button><button onClick={()=>void onSaved().then(b=>{if(b)setConflict((b as PatientBundle).risks.find(r=>r.session_id===sessionId)||null)})}>Σύγκριση με αποθηκευμένο</button></>}
 {conflict!==undefined&&<div className="conflict-review"><h4>Αποθηκευμένη εκτίμηση</h4>{Object.entries(shape(conflict||undefined)).map(([k,v])=><p key={k}>{k}: {riskLabel(v)}</p>)}<button onClick={()=>{draft.acceptServer(shape(conflict||undefined),conflict?.version??null);setConflict(undefined)}}>Χρήση αποθηκευμένου</button><button onClick={()=>{draft.resolve(draft.value,shape(conflict||undefined),conflict?.version??null);setConflict(undefined)}}>Ρητή αντικατάσταση με τις επιλογές μου</button></div>}
 </div>
}

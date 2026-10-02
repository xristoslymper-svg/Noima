'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowLeft, Check, CheckCircle2, Mic2, RotateCcw, ShieldCheck } from 'lucide-react';
import SectionDictation from '@/components/dictation/SectionDictation';
import type { DemoRisk, DemoSection, DemoSession, PatientBundle } from '@/lib/patients/demo-runtime';
import { demoPost } from '@/lib/patients/demo-client';

const definitions=[
 ['interview','Ψυχιατρική συνέντευξη / συμπτώματα','Αίτημα, συμπτώματα, πορεία και τι άλλαξε.'],
 ['functioning','Λειτουργικότητα','Εργασία, σχέσεις, καθημερινότητα και ύπνος.'],
 ['effects','Παρενέργειες','Ανεπιθύμητες ενέργειες και επίδρασή τους.'],
 ['adherence','Συμμόρφωση','Λήψη αγωγής, παραλείψεις και δυσκολίες.'],
 ['mse','Εξέταση ψυχικής κατάστασης (MSE)','Στοχευμένα ευρήματα της σημερινής εξέτασης.'],
 ['assessment','Κλινική εκτίμηση','Διάγνωση / διαφορική, formulation και κλινική αποτίμηση.'],
 ['plan','Θεραπευτικό πλάνο','Αγωγή, παρεμβάσεις, παραπομπές και οδηγίες.'],
 ['review','Επανεκτίμηση','Χρονικός ορίζοντας και τι πρέπει να ελεγχθεί στην επίσκεψη.'],
] as const;

const required=new Set(['interview','mse','assessment','plan','review']);
const fmt=(value?:string|null)=>value?new Intl.DateTimeFormat('el-GR',{day:'2-digit',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit'}).format(new Date(value)):'—';
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
 onFinalize:()=>Promise<void>;
 finalizing:boolean;
 finalizeError:string;
 selectedSessionId:string|null;
 onSelectSession:(sessionId?:string|null)=>void;
}){
 const draft=bundle.sessions.find(s=>s.status==='draft');
 const completed=bundle.sessions.filter(s=>s.status==='completed');
 const selected=selectedSessionId?completed.find(s=>s.id===selectedSessionId):undefined;
 const flushers=useRef(new Map<string,()=>Promise<void>>());
 const dirtyKeys=useRef(new Set<string>());
 const [dirtyCount,setDirtyCount]=useState(0);
 const [flushing,setFlushing]=useState(false);
 const [flushError,setFlushError]=useState('');

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
  try{
   await flushAll();
   await onFinalize();
  }catch{
   // The concrete save/finalize error is already rendered in the workspace.
  }
 }

 if(selected){
  return <CompletedSessionView session={selected} bundle={bundle} onBack={()=>onSelectSession(null)} />;
 }

 if(!draft){
  return <section className="panel-stack">
   <div className="panel-heading"><div><span className="kicker">ΣΥΝΕΔΡΙΕΣ</span><h2>Ολοκληρωμένες συνεδρίες</h2><p>Δεν υπάρχει ανοιχτό πρόχειρο. Επιλέξτε συνεδρία για να δείτε ακριβώς τι καταγράφηκε.</p></div></div>
   {completed.length?<CompletedList sessions={completed} onSelect={id=>onSelectSession(id)}/>:<div className="panel-empty">Δεν υπάρχει ακόμη συνεδρία.</div>}
  </section>;
 }

 const risk=bundle.risks.find(x=>x.session_id===draft.id);
 const sections=bundle.sections.filter(x=>x.session_id===draft.id);
 const completeKeys=new Set(sections.filter(x=>x.content.trim()).map(x=>x.section_key));
 const ready=[...required].every(x=>completeKeys.has(x))&&risk?.suicidal_ideation!=='not_assessed'&&Boolean(risk);

 return <section className="session-workspace runtime-session">
  <div className="session-work-head">
   <div><span className="visit-label"><span>ΠΡΟΧΕΙΡΟ</span><i/> {draft.session_type==='initial_assessment'?'ΑΡΧΙΚΗ ΑΞΙΟΛΟΓΗΣΗ':'FOLLOW-UP'}</span><h2>{draft.session_type==='initial_assessment'?'Αρχική αξιολόγηση':'Επαναληπτική συνεδρία'}</h2><p>Οι αλλαγές αποθηκεύονται αυτόματα. Πριν από την οριστικοποίηση περιμένουμε όλες τις εκκρεμείς αποθηκεύσεις και ξαναδιαβάζουμε την τελευταία έκδοση.</p></div>
   <div className="session-save-overview"><span className={dirtyCount?'pending':''}>{flushing?'Αποθήκευση…':dirtyCount?dirtyCount+' αλλαγές σε αναμονή':'Όλες οι αλλαγές αποθηκεύτηκαν'}</span><small>Έναρξη {fmt(draft.started_at)}</small></div>
  </div>

  <div className="sections-label"><span className="kicker">ΚΛΙΝΙΚΗ ΚΑΤΑΓΡΑΦΗ</span><span>* απαιτείται για ολοκλήρωση</span></div>
  <div className="clinical-sections">
   {definitions.map(([key,title,hint])=><SectionEditor key={draft.id+':'+key} sessionId={draft.id} definition={{key,title,hint}} existing={sections.find(x=>x.section_key===key)} onSaved={reload} registerFlusher={registerFlusher} onDirtyChange={onDirtyChange}/>)}
   <RiskEditor sessionId={draft.id} existing={risk} onSaved={reload} registerFlusher={registerFlusher} onDirtyChange={onDirtyChange}/>
  </div>

  <div className="finalize-bar">
   <div><strong>{ready?'Έτοιμη για ολοκλήρωση':'Χρειάζεται έλεγχο'}</strong><span>{ready?'Όλες οι βασικές ενότητες και η εκτίμηση κινδύνου έχουν καταγραφεί.':'Συμπληρώστε τις ενότητες με * και εκτιμήστε αυτοκτονικό ιδεασμό.'}</span></div>
   <button onClick={()=>void finalizeSafely()} disabled={finalizing||flushing||!ready}><Check size={16}/>{flushing?'Αποθήκευση…':finalizing?'Ολοκλήρωση…':'Έλεγχος & ολοκλήρωση'}</button>
  </div>
  {flushError&&<div className="save-state error" role="alert"><strong>Υπάρχουν μη αποθηκευμένες αλλαγές.</strong> {flushError} <span>Διορθώστε το πρόβλημα ή δοκιμάστε ξανά πριν οριστικοποιήσετε.</span></div>}
  {finalizeError&&<div className="save-state error" role="alert">{finalizeError}</div>}

  {completed.length>0&&<div className="previous-visits"><span className="kicker">ΠΡΟΗΓΟΥΜΕΝΕΣ</span><CompletedList sessions={completed} onSelect={id=>onSelectSession(id)}/></div>}
 </section>;
}

function CompletedList({sessions,onSelect}:{sessions:DemoSession[];onSelect:(id:string)=>void}){
 return <div className="completed-session-list">{sessions.map(session=><button className="completed-session-row" key={session.id} onClick={()=>onSelect(session.id)}><CheckCircle2 size={18}/><div><strong>{session.session_type==='initial_assessment'?'Αρχική αξιολόγηση':'Επαναληπτική συνεδρία'}</strong><span>Οριστικοποιήθηκε {fmt(session.completed_at)}</span></div><span className="open-session-label">Άνοιγμα</span></button>)}</div>;
}

function CompletedSessionView({session,bundle,onBack}:{session:DemoSession;bundle:PatientBundle;onBack:()=>void}){
 const sections=bundle.sections.filter(item=>item.session_id===session.id);
 const risk=bundle.risks.find(item=>item.session_id===session.id);
 return <section className="session-workspace completed-session-view">
  <div className="session-work-head">
   <div><button className="session-back-button" onClick={onBack}><ArrowLeft size={15}/> Συνεδρίες</button><span className="visit-label completed"><span>ΟΡΙΣΤΙΚΟΠΟΙΗΜΕΝΟ</span><i/> {session.session_type==='initial_assessment'?'ΑΡΧΙΚΗ ΑΞΙΟΛΟΓΗΣΗ':'FOLLOW-UP'}</span><h2>{session.session_type==='initial_assessment'?'Αρχική αξιολόγηση':'Επαναληπτική συνεδρία'}</h2><p>Ανάγνωση της οριστικοποιημένης έκδοσης. Το περιεχόμενο δεν τροποποιείται σιωπηλά μετά την ολοκλήρωση.</p></div>
   <span className="draft-updated">Ολοκληρώθηκε {fmt(session.completed_at)}</span>
  </div>
  <div className="completed-section-stack">
   {definitions.map(([key,title])=>{
    const item=sections.find(section=>section.section_key===key);
    return <article className="completed-clinical-section" key={key}><span>{title}</span><p>{item?.content.trim()||'Δεν καταγράφηκε.'}</p>{item&&<small>Έκδοση {item.version} · ενημέρωση {fmt(item.updated_at)}</small>}</article>;
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

function SectionEditor({sessionId,definition,existing,onSaved,registerFlusher,onDirtyChange}:{sessionId:string;definition:{key:string;title:string;hint:string};existing?:DemoSection;onSaved:()=>Promise<unknown>;registerFlusher:RegisterFlusher;onDirtyChange:DirtyChange}){
 const [value,setValue]=useState(existing?.content||'');
 const [status,setStatus]=useState(existing?.content?'Αποθηκεύτηκε':'');
 const [dictating,setDictating]=useState(false);
 const [pending,setPending]=useState('');
 const latest=useRef(existing?.content||'');
 const lastSaved=useRef(existing?.content||'');
 const versionRef=useRef<number|null>(existing?.version??null);
 const timer=useRef<ReturnType<typeof setTimeout>|null>(null);
 const inFlight=useRef<Promise<void>|null>(null);
 const key='section:'+definition.key;

 const saveNow=useCallback(async()=>{
  if(timer.current){clearTimeout(timer.current);timer.current=null}
  if(inFlight.current){
   await inFlight.current;
   if(latest.current!==lastSaved.current)return saveNow();
   return;
  }
  const content=latest.current;
  if(content===lastSaved.current){onDirtyChange(key,false);return}
  setStatus('Αποθηκεύεται…');
  const request=(async()=>{
   try{
    const data=await demoPost({action:'save_section',session_id:sessionId,section_key:definition.key,content,source:'manual',expected_version:versionRef.current});
    versionRef.current=data.section.version;
    lastSaved.current=content;
    onDirtyChange(key,latest.current!==lastSaved.current);
    setStatus('Αποθηκεύτηκε '+new Date().toLocaleTimeString('el-GR',{hour:'2-digit',minute:'2-digit'}));
    await onSaved();
   }catch(cause){
    onDirtyChange(key,true);
    setStatus(cause instanceof Error?cause.message:'Αποτυχία αποθήκευσης');
    throw cause;
   }
  })();
  inFlight.current=request;
  try{await request}finally{inFlight.current=null}
  if(latest.current!==lastSaved.current)return saveNow();
 },[definition.key,key,onDirtyChange,onSaved,sessionId]);

 useEffect(()=>registerFlusher(key,saveNow),[key,registerFlusher,saveNow]);
 useEffect(()=>()=>{if(timer.current)clearTimeout(timer.current);if(latest.current!==lastSaved.current)void saveNow().catch(()=>{})},[saveNow]);

 function change(next:string){
  latest.current=next;
  setValue(next);
  onDirtyChange(key,next!==lastSaved.current);
  if(timer.current)clearTimeout(timer.current);
  setStatus('Αποθήκευση σε αναμονή…');
  timer.current=setTimeout(()=>{void saveNow().catch(()=>{})},700);
 }

 function acceptDictation(text:string){setDictating(false);if(value.trim())setPending(text);else change(text)}

 const failed=status.includes('Αποτυχία')||status.includes('άλλαξε')||status.includes('Επαναφορτώστε');
 return <div className={value.trim()?'clinical-section populated':'clinical-section'}>
  <div className="clinical-section-head"><div><h3>{definition.title}{required.has(definition.key)&&' *'}</h3><span>{definition.hint}</span></div><button className="section-mic" onClick={()=>setDictating(true)}><Mic2 size={15}/> Υπαγόρευση</button></div>
  <textarea className="section-editor" rows={value.length>280?7:4} value={value} onChange={event=>change(event.target.value)} onBlur={()=>void saveNow().catch(()=>{})} placeholder="Γράψτε ή υπαγορεύστε. Κενό = δεν έχει καταγραφεί."/>
  <div className={failed?'section-save-state error':'section-save-state'}>{status||'Δεν έχει αποθηκευτεί ακόμη'}{failed&&<button className="inline-retry" onClick={()=>void saveNow().catch(()=>{})}><RotateCcw size={12}/> Επανάληψη</button>}</div>
  {dictating&&<SectionDictation title={definition.title} onClose={()=>setDictating(false)} onInsert={acceptDictation}/>}
  {pending&&<div className="dictation-insert-choice"><div><strong>Υπάρχει ήδη κείμενο</strong><span>Πώς θέλετε να χρησιμοποιηθεί η νέα μεταγραφή;</span></div><button onClick={()=>{change((value.trim()+'\n\n'+pending).trim());setPending('')}}>Προσθήκη</button><button onClick={()=>{change(pending);setPending('')}}>Αντικατάσταση</button><button onClick={()=>setPending('')}>Ακύρωση</button></div>}
 </div>;
}

function RiskEditor({sessionId,existing,onSaved,registerFlusher,onDirtyChange}:{sessionId:string;existing?:DemoRisk;onSaved:()=>Promise<unknown>;registerFlusher:RegisterFlusher;onDirtyChange:DirtyChange}){
 const initial={suicidal_ideation:existing?.suicidal_ideation||'not_assessed',intent:existing?.intent||'not_assessed',plan:existing?.plan||'not_assessed',self_harm:existing?.self_harm||'not_assessed',attempt_history:existing?.attempt_history||'not_assessed',protective_factors:existing?.protective_factors||'',clinical_note:existing?.clinical_note||''};
 const [risk,setRisk]=useState(initial);
 const latest=useRef(initial);
 const lastSaved=useRef(JSON.stringify(initial));
 const versionRef=useRef<number|null>(existing?.version??null);
 const [state,setState]=useState(existing?'Αποθηκεύτηκε':'');
 const timer=useRef<ReturnType<typeof setTimeout>|null>(null);
 const inFlight=useRef<Promise<void>|null>(null);
 const key='risk';

 const saveNow=useCallback(async()=>{
  if(timer.current){clearTimeout(timer.current);timer.current=null}
  if(inFlight.current){
   await inFlight.current;
   if(JSON.stringify(latest.current)!==lastSaved.current)return saveNow();
   return;
  }
  const snapshot={...latest.current};
  const serialized=JSON.stringify(snapshot);
  if(serialized===lastSaved.current){onDirtyChange(key,false);return}
  setState('Αποθηκεύεται…');
  const request=(async()=>{
   try{
    const data=await demoPost({action:'save_risk',session_id:sessionId,risk:snapshot,expected_version:versionRef.current});
    versionRef.current=data.risk.version;
    lastSaved.current=serialized;
    onDirtyChange(key,JSON.stringify(latest.current)!==lastSaved.current);
    setState('Αποθηκεύτηκε '+new Date().toLocaleTimeString('el-GR',{hour:'2-digit',minute:'2-digit'}));
    await onSaved();
   }catch(cause){
    onDirtyChange(key,true);
    setState(cause instanceof Error?cause.message:'Αποτυχία αποθήκευσης');
    throw cause;
   }
  })();
  inFlight.current=request;
  try{await request}finally{inFlight.current=null}
  if(JSON.stringify(latest.current)!==lastSaved.current)return saveNow();
 },[onDirtyChange,onSaved,sessionId]);

 useEffect(()=>registerFlusher(key,saveNow),[registerFlusher,saveNow]);
 useEffect(()=>()=>{if(timer.current)clearTimeout(timer.current);if(JSON.stringify(latest.current)!==lastSaved.current)void saveNow().catch(()=>{})},[saveNow]);

 function change(field:string,value:string){
  const next={...latest.current,[field]:value};
  latest.current=next;
  setRisk(next);
  onDirtyChange(key,JSON.stringify(next)!==lastSaved.current);
  setState('Αποθήκευση σε αναμονή…');
  if(timer.current)clearTimeout(timer.current);
  timer.current=setTimeout(()=>{void saveNow().catch(()=>{})},700);
 }

 const failed=state.includes('Αποτυχία')||state.includes('άλλαξε')||state.includes('Επαναφορτώστε');
 return <div className="clinical-section risk-editor">
  <div className="clinical-section-head"><div><h3>Εκτίμηση κινδύνου *</h3><span>Το «Δεν διερευνήθηκε» διαφέρει από αρνητικό εύρημα. Οι αλλαγές αποθηκεύονται αυτόματα.</span></div><ShieldCheck size={18}/></div>
  <div className="risk-grid">{[['suicidal_ideation','Αυτοκτονικός ιδεασμός'],['intent','Πρόθεση'],['plan','Σχέδιο'],['self_harm','Αυτοτραυματισμός'],['attempt_history','Ιστορικό απόπειρας']].map(([field,label])=><label key={field}>{label}<select value={risk[field as keyof typeof risk]} onChange={event=>change(field,event.target.value)} onBlur={()=>void saveNow().catch(()=>{})}>{riskOptions.map(([value,text])=><option key={value} value={value}>{text}</option>)}</select></label>)}</div>
  <label className="risk-note">Προστατευτικοί παράγοντες<textarea rows={2} value={risk.protective_factors} onChange={event=>change('protective_factors',event.target.value)} onBlur={()=>void saveNow().catch(()=>{})}/></label>
  <label className="risk-note">Κλινική σημείωση<textarea rows={2} value={risk.clinical_note} onChange={event=>change('clinical_note',event.target.value)} onBlur={()=>void saveNow().catch(()=>{})}/></label>
  <div className={failed?'risk-save error':'risk-save'}><span>{state||'Δεν έχει αποθηκευτεί'}</span>{failed&&<button onClick={()=>void saveNow().catch(()=>{})}><RotateCcw size={12}/> Επανάληψη</button>}</div>
 </div>;
}

'use client';
import {useCallback,useEffect,useRef,useState} from 'react';
import Link from 'next/link';
import {usePathname} from 'next/navigation';
import {Search,Send,Sparkles} from 'lucide-react';
import type {SearchAnswer,SearchPatient} from '@/lib/overview/record-search';
import {sseData} from '@/lib/copilot/stream';
import styles from './RecordAssistant.module.css';
type Reply=SearchAnswer&{conversation?:string;blocks?:{title:string;text:string;sources:SearchAnswer['sources']}[];proposal?:{id:string;summary:string;expires_at:string};status?:string};
type Turn={question:string;choice?:string;result?:Reply;error?:string;executing?:boolean;done?:boolean};
export default function RecordAssistant({compact=false}:{compact?:boolean}){
 const [actionMode,setActionMode]=useState(false);
 const [query,setQuery]=useState(''),[turns,setTurns]=useState<Turn[]>([]),[busy,setBusy]=useState(false),[expanded,setExpanded]=useState(false),[patient,setPatient]=useState<SearchPatient|null>(null);
 const context=useRef<string|undefined>(undefined),locked=useRef(false),sequence=useRef(0),pending=useRef<AbortController|null>(null),tail=useRef<HTMLDivElement|null>(null);
 const pathname=usePathname();
 useEffect(()=>{sequence.current++;pending.current?.abort();context.current=undefined;locked.current=false;setBusy(false);setPatient(null);setTurns([]);setQuery('')},[pathname]);
 useEffect(()=>()=>{pending.current?.abort()},[]);
 useEffect(()=>{tail.current?.scrollIntoView({block:'nearest'})},[turns]);
 function reset(){sequence.current++;pending.current?.abort();context.current=undefined;locked.current=false;setBusy(false);setPatient(null);setTurns([]);setQuery('')}
 async function ask(question:string,choice?:string){
  if(locked.current||question.trim().length<3)return;
  locked.current=true;setBusy(true);setQuery('');
  const current=++sequence.current,controller=new AbortController();pending.current=controller;
  const timeout=setTimeout(()=>controller.abort(),175000);
  setTurns(t=>[...t.slice(-7),{question,choice}]);
  try{
   const r=await fetch(actionMode?'/api/copilot':'/api/copilot/chat',{method:'POST',signal:controller.signal,headers:{'Content-Type':'application/json'},body:JSON.stringify({query:question,choice_id:choice,conversation:context.current,patient_id:choice||patient?.id||pathname.match(/^\/patients\/demo\/([^/]+)/)?.[1]})});
   let data:Reply;
   if(r.ok&&r.headers.get('content-type')?.includes('text/event-stream')&&r.body){
    let partial:Reply={answer:'',sources:[]},complete=false;
    for await(const raw of sseData(r.body)){
     if(current!==sequence.current)return;
     const event=JSON.parse(raw);
     if(event.type==='error')throw new Error(event.error);
     if(event.type==='meta'){partial={...partial,patient:event.patient};setPatient(event.patient||null);}
     if(event.type==='delta')partial={...partial,answer:partial.answer+event.text};
     if(event.type==='done'){partial={...partial,answer:event.answer,conversation:event.conversation};complete=true;}
     setTurns(t=>t.map((turn,i)=>i===t.length-1?{question,choice,result:partial}:turn));
    }
    if(!complete)throw new Error('Η απάντηση διακόπηκε. Δοκιμάστε ξανά.');
    data=partial;
   }else{const value=await r.json();if(!r.ok)throw new Error(value.error||'Η ερώτηση δεν ολοκληρώθηκε.');data=value;}
   if(current!==sequence.current)return;
   context.current=data.conversation;setPatient(data.patient||null);
   setTurns(t=>t.map((turn,i)=>i===t.length-1?{question,choice,result:data}:turn));
  }catch(e){if(current===sequence.current){setQuery(question);setTurns(t=>t.map((turn,i)=>i===t.length-1?{question,choice,error:e instanceof Error?e.message:'Δοκιμάστε ξανά.'}:turn))}}
  finally{clearTimeout(timeout);if(current===sequence.current){locked.current=false;setBusy(false)}}
 }
 async function confirm(index:number){
  const proposal=turns[index].result?.proposal;if(!proposal||locked.current)return;
  locked.current=true;setBusy(true);const current=sequence.current;
  setTurns(t=>t.map((turn,i)=>i===index?{...turn,executing:true,error:undefined}:turn));
  try{
   const response=await fetch('/api/copilot/confirm',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({proposal_id:proposal.id,confirm:true})});
   const data=await response.json();if(!response.ok)throw new Error(data.error||'Δεν επιβεβαιώθηκε ολοκλήρωση.');
   if(current!==sequence.current)return;
   setTurns(t=>t.map((turn,i)=>i===index?{...turn,executing:false,done:data.status==='verified'||data.status==='accepted',result:{...turn.result,...data,proposal}}:turn));
  }catch(e){if(current===sequence.current)setTurns(t=>t.map((turn,i)=>i===index?{...turn,executing:false,error:e instanceof Error?e.message:'Η κατάσταση δεν επιβεβαιώθηκε.'}:turn))}
  finally{if(current===sequence.current){locked.current=false;setBusy(false)}}
 }
 const examples=actionMode?['Κλείσε ραντεβού για τον…','Στείλε PHQ-9 στον…']:patient?['Πότε ξεκίνησε η δεύτερη αγωγή;','Και πώς ήταν ο ύπνος της μετά;','Τι άλλαξε από την προηγούμενη επίσκεψη;']:['Τι αγωγή παίρνει η…','Πώς εξελίχθηκε η κατάσταση της…','Τι άλλαξε στην τελευταία επίσκεψη της…'];
 return <section className={styles.assistant+(compact&&!expanded?' '+styles.compact:'')+(expanded?' '+styles.expanded:'')} aria-label="Βοηθός Ψ">
  <div className={styles.heading}><span><Sparkles size={18}/> Βοηθός Ψ</span><button aria-expanded={expanded} onClick={()=>setExpanded(!expanded)}>{expanded?'Σύμπτυξη':'Ανάπτυξη'}</button><button disabled={busy} onClick={reset}>Νέα συζήτηση</button></div>
  <label>Τρόπος χρήσης <select disabled={busy} value={actionMode?'action':'chat'} onChange={e=>{reset();setActionMode(e.target.value==='action')}}><option value="chat">Συζήτηση</option><option value="action">Ενέργεια</option></select></label>
  <p className={styles.context}>{patient?'Φάκελος: '+patient.first_name+' '+patient.last_name:'Η συζήτηση αφορά τον επιλεγμένο φάκελο. Για άλλον ασθενή ξεκίνα νέα συζήτηση.'}</p>
  <h2>Ο φάκελος, σε μια συζήτηση</h2>
  <p>Συζήτησε την πορεία του ασθενούς και οργάνωσε τις επόμενες ενέργειες.</p>
  <div className={styles.suggestions}>{examples.map(example=><button disabled={busy} key={example} onClick={()=>setQuery(example.replace('…',' '))}>{example}</button>)}</div>
  <div className={styles.conversation} aria-live="polite" aria-busy={busy}>{turns.map((turn,index)=><div className={styles.turn} key={index}>
   <strong>{turn.question}</strong>
   {turn.error&&<p role="alert">{turn.error}</p>}
   {turn.error&&!turn.result?.proposal&&<button disabled={busy} onClick={()=>void ask(turn.question,turn.choice)}>Δοκιμή ξανά</button>}
   {turn.result&&<>
    {turn.result.patient&&<span className={styles.patient}>{turn.result.patient.first_name} {turn.result.patient.last_name}</span>}
    <p>{turn.result.answer}</p>
    {turn.result.blocks?.map((block,i)=><article className={styles.block} key={i}><h3>{block.title}</h3><p>{block.text}</p></article>)}
    {turn.result.choices?.map(p=><button className={styles.choice} disabled={busy} key={p.id} onClick={()=>void ask(turn.question,p.id)}>{p.first_name} {p.last_name} · {p.id.slice(-6)}</button>)}
    {turn.result.patient&&!turn.result.proposal&&<div className={styles.sources}><Link href={'/patients/demo/'+turn.result.patient.id}>Επιβεβαίωση στην καρτέλα ασθενούς →</Link></div>}
    {turn.result.proposal&&<div className={styles.action}><strong>Προτεινόμενη ενέργεια</strong><p>{turn.result.proposal.summary}</p><small>Λήξη: {new Date(turn.result.proposal.expires_at).toLocaleTimeString('el-GR')}</small>{!turn.done&&<button disabled={busy} onClick={()=>void confirm(index)}>{turn.executing?'Εκτέλεση και επαλήθευση…':turn.error||turn.result.status==='attention'?'Επανάληψη ίδιας επιβεβαίωσης':'Επιβεβαιώνω την εκτέλεση'}</button>}</div>}
   </>}
   {!turn.result&&!turn.error&&<p>Διαβάζω τον φάκελο…</p>}
  </div>)}<div ref={tail}/></div>
  <form className={styles.compose} onSubmit={e=>{e.preventDefault();void ask(query)}}>
   <label className={styles.srOnly} htmlFor="record-question">Ερώτηση ή αίτημα ενέργειας</label>
   <textarea id="record-question" rows={2} maxLength={1500} disabled={busy} value={query} onChange={e=>setQuery(e.target.value)} placeholder="Ρώτησε για έναν ασθενή…"/>
   <button type="submit" disabled={busy||query.trim().length<3} aria-label="Αποστολή ερώτησης"><Send size={18}/></button>
  </form>
 </section>;
}
export function OverviewShortcuts(){
 const [query,setQuery]=useState(''),[patients,setPatients]=useState<SearchPatient[]>([]),[status,setStatus]=useState('');
 const sequence=useRef(0);
 const timer=useRef<ReturnType<typeof setTimeout>|null>(null),pending=useRef<AbortController|null>(null);
 const search=useCallback(async()=>{
  if(timer.current)clearTimeout(timer.current);
  pending.current?.abort();
  if(query.trim().length<2)return;
  const controller=new AbortController();pending.current=controller;
  const current=++sequence.current;setPatients([]);setStatus('Αναζήτηση…');
  try{const response=await fetch('/api/records/search?q='+encodeURIComponent(query.trim()),{cache:'no-store',signal:controller.signal});const data=await response.json();if(!response.ok)throw new Error(data.error);if(current===sequence.current){setPatients(data.patients);setStatus(data.patients.length?'':'Δεν βρέθηκε ασθενής.')}}catch{if(!controller.signal.aborted&&current===sequence.current)setStatus('Η αναζήτηση δεν είναι διαθέσιμη προσωρινά.')}
 },[query]);
 useEffect(()=>{
  if(query.trim().length>=2)timer.current=setTimeout(()=>void search(),250);
  return()=>{if(timer.current)clearTimeout(timer.current);pending.current?.abort()};
 },[query,search]);
 function closeResults(){if(timer.current)clearTimeout(timer.current);pending.current?.abort();sequence.current++;setPatients([]);setStatus('')}
 return <div className={styles.shortcuts}>
  <div className={styles.searchWrap}><form onSubmit={event=>{event.preventDefault();void search()}}><Search size={16} aria-hidden="true"/><input aria-label="Αναζήτηση ασθενούς" placeholder="Αναζήτηση ασθενούς…" maxLength={100} value={query} onKeyDown={event=>{if(event.key==='Escape')closeResults()}} onChange={event=>{sequence.current++;setQuery(event.target.value);setPatients([]);setStatus('')}}/><button disabled={query.trim().length<2} type="submit">Αναζήτηση</button></form>
   {(patients.length>0||status)&&<div className={styles.results}><button className={styles.close} aria-label="Κλείσιμο αποτελεσμάτων" onClick={closeResults}>×</button><span role="status">{status}</span>{patients.map(patient=><Link key={patient.id} href={'/patients/demo/'+patient.id}>{patient.first_name} {patient.last_name}<small>Φάκελος · {patient.id.slice(-6)}</small></Link>)}</div>}
  </div>
  <Link className={styles.primary} href="/calendar?new=1">+ Νέο ραντεβού</Link>
  <Link href="/patients/new">+ Νέος ασθενής</Link>
 </div>;
}

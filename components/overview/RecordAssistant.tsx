'use client';
import {useCallback,useEffect,useId,useRef,useState} from 'react';
import {createPortal} from 'react-dom';
import Link from 'next/link';
import {usePathname} from 'next/navigation';
import {Search,Send,Sparkles,Minus,Plus,Square,MessageCircle,ArrowUpRight} from 'lucide-react';
import type {SearchAnswer,SearchPatient} from '@/lib/overview/record-search';
import {syntheticChartAt} from '@/lib/copilot/chart-scope';
import {sseData} from '@/lib/copilot/stream';
import styles from './RecordAssistant.module.css';
type Reply=SearchAnswer&{conversation?:string;blocks?:{title:string;text:string;sources:SearchAnswer['sources']}[];proposal?:{id:string;summary:string;expires_at:string};status?:string};
type Turn={question:string;choice?:string;result?:Reply;error?:string;executing?:boolean;done?:boolean;firstMs?:number;totalMs?:number};
export default function RecordAssistant({synthetic:forceSynthetic=false}:{synthetic?:boolean}){
 const [mounted,setMounted]=useState(false),[open,setOpen]=useState(false),[actionMode,setActionMode]=useState(false);
 const [query,setQuery]=useState(''),[turns,setTurns]=useState<Turn[]>([]),[busy,setBusy]=useState(false),[patient,setPatient]=useState<SearchPatient|null>(null);
 const context=useRef<string|undefined>(undefined),locked=useRef(false),sequence=useRef(0),pending=useRef<AbortController|null>(null);
 const scroll=useRef<HTMLDivElement|null>(null),follow=useRef(true),input=useRef<HTMLTextAreaElement|null>(null),launcher=useRef<HTMLButtonElement|null>(null);
 const uid=useId(),pathname=usePathname(),inChart=pathname.startsWith('/patients/demo/');
 const syntheticChart=syntheticChartAt(pathname),synthetic=forceSynthetic||Boolean(syntheticChart);
 useEffect(()=>setMounted(true),[]);
 useEffect(()=>{sequence.current++;pending.current?.abort();context.current=undefined;locked.current=false;setBusy(false);setPatient(null);setTurns([]);setQuery('');setActionMode(false)},[pathname]);
 useEffect(()=>()=>pending.current?.abort(),[]);
 useEffect(()=>{if(open)input.current?.focus()},[open]);
 useEffect(()=>{if(open&&follow.current&&scroll.current)scroll.current.scrollTop=scroll.current.scrollHeight},[turns,open]);
 function minimize(){setOpen(false);launcher.current?.focus();}
 function reset(){sequence.current++;pending.current?.abort();context.current=undefined;locked.current=false;setBusy(false);setPatient(null);setTurns([]);setQuery('');follow.current=true;input.current?.focus();}
 async function ask(question:string,choice?:string){
  if(locked.current||question.trim().length<3)return;
  locked.current=true;setBusy(true);setQuery('');follow.current=true;
  const current=++sequence.current,controller=new AbortController();pending.current=controller;
  const timeout=setTimeout(()=>controller.abort(),actionMode?175000:45000),started=performance.now();
  let firstMs:number|undefined;
  setTurns(t=>[...t.slice(-7),{question,choice}]);
  const update=(result:Reply,totalMs?:number)=>setTurns(t=>t.map((turn,i)=>i===t.length-1?{question,choice,result,firstMs,totalMs}:turn));
  try{
   const endpoint=synthetic?'/api/copilot/synthetic':actionMode?'/api/copilot':'/api/copilot/chat';
   const payload=synthetic?{query:question,conversation:context.current,chart:syntheticChart?.key||'copilot'}:{query:question,choice_id:choice,conversation:context.current,patient_id:choice||patient?.id||pathname.match(/^\/patients\/demo\/([^/]+)/)?.[1]};
   const r=await fetch(endpoint,{method:'POST',signal:controller.signal,headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});
   let data:Reply;
   if(r.ok&&r.headers.get('content-type')?.includes('text/event-stream')&&r.body){
    let partial:Reply={answer:'',sources:[]},complete=false;
    for await(const raw of sseData(r.body)){
     if(current!==sequence.current)return;
     const event=JSON.parse(raw);
     if(event.type==='error')throw new Error(event.error);
     if(event.type==='meta'){partial={...partial,patient:event.patient};setPatient(event.patient||null);}
     if(event.type==='delta'){if(firstMs===undefined&&event.text.trim())firstMs=performance.now()-started;partial={...partial,answer:partial.answer+event.text};}
     if(event.type==='done'){partial={...partial,answer:event.answer,conversation:event.conversation};complete=true;}
     update(partial);
    }
    if(!complete)throw new Error('Η απάντηση διακόπηκε. Δοκιμάστε ξανά.');
    data=partial;
   }else{const value=await r.json();if(!r.ok)throw new Error(value.error||'Η ερώτηση δεν ολοκληρώθηκε.');data=value;}
   if(current!==sequence.current)return;
   context.current=data.conversation;setPatient(data.patient||null);update(data,performance.now()-started);
  }catch(e){if(current===sequence.current){setQuery(question);setTurns(t=>t.map((turn,i)=>i===t.length-1?{question,choice,error:controller.signal.aborted?'Η απάντηση διακόπηκε. Μπορείς να δοκιμάσεις ξανά.':e instanceof Error?e.message:'Δοκιμάστε ξανά.'}:turn));}}
  finally{clearTimeout(timeout);if(current===sequence.current){locked.current=false;setBusy(false);input.current?.focus();}}
 }
 async function confirm(index:number){
  const proposal=turns[index].result?.proposal;if(!proposal||locked.current||synthetic)return;
  locked.current=true;setBusy(true);const current=sequence.current;
  setTurns(t=>t.map((turn,i)=>i===index?{...turn,executing:true,error:undefined}:turn));
  try{
   const response=await fetch('/api/copilot/confirm',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({proposal_id:proposal.id,confirm:true})});
   const data=await response.json();if(!response.ok)throw new Error(data.error||'Δεν επιβεβαιώθηκε ολοκλήρωση.');
   if(current!==sequence.current)return;
   setTurns(t=>t.map((turn,i)=>i===index?{...turn,executing:false,done:data.status==='verified'||data.status==='accepted',result:{...turn.result,...data,proposal}}:turn));
  }catch(e){if(current===sequence.current)setTurns(t=>t.map((turn,i)=>i===index?{...turn,executing:false,error:e instanceof Error?e.message:'Η κατάσταση δεν επιβεβαιώθηκε.'}:turn));}
  finally{if(current===sequence.current){locked.current=false;setBusy(false);}}
 }
 const examples=actionMode?['Κλείσε ραντεβού για τον…','Στείλε PHQ-9 στον…']:inChart||patient?['Τι άλλαξε στην τελευταία επίσκεψη;','Ποια είναι η καταγεγραμμένη αγωγή;','Πώς εξελίχθηκε ο ύπνος;']:['Πώς εξελίχθηκε η κατάσταση της…','Τι αγωγή παίρνει η…'];
 const patientLabel=synthetic?(syntheticChart?.label||'Μαρία Δοκιμαστική'):patient?patient.first_name+' '+patient.last_name:inChart?'Στον ανοιχτό φάκελο':'Διάλεξε ασθενή στη συζήτηση';
 if(!mounted)return null;
 return createPortal(<div className={styles.dock}>
  <section id={uid+'-panel'} className={styles.panel} hidden={!open} aria-label="Συνομιλία με τον Βοηθό Ψ" onKeyDown={e=>{if(e.key==='Escape'){e.stopPropagation();minimize();}}}>
   <header className={styles.chatHeader}><span className={styles.avatar}><Sparkles size={19}/></span><div><h2>Βοηθός Ψ</h2><p>{busy?'Γράφει μια απάντηση…':'Ο φάκελος, σε μια συζήτηση'}</p></div><button type="button" onClick={reset} disabled={busy} aria-label="Νέα συζήτηση" title="Νέα συζήτηση"><Plus size={18}/></button><button type="button" onClick={minimize} aria-label="Ελαχιστοποίηση συνομιλίας" title="Ελαχιστοποίηση"><Minus size={19}/></button></header>
   <div className={styles.chatContext}><span className={styles.contextDot}/><span>{patientLabel}</span>{synthetic&&<small>Συνθετικός φάκελος</small>}</div>
   {!synthetic&&<div className={styles.mode}><button type="button" aria-pressed={!actionMode} disabled={busy} onClick={()=>{if(actionMode){reset();setActionMode(false)}}}>Συζήτηση</button><button type="button" aria-pressed={actionMode} disabled={busy} onClick={()=>{if(!actionMode){reset();setActionMode(true)}}}>Ενέργεια</button></div>}
   <div ref={scroll} className={styles.chatScroll} onScroll={()=>{const el=scroll.current;if(el)follow.current=el.scrollHeight-el.scrollTop-el.clientHeight<70;}}>
    {!turns.length&&<div className={styles.welcome}><span><MessageCircle size={24}/></span><h3>Τι θα ήθελες να δούμε;</h3><p>Ρώτησε για την πορεία, την αγωγή ή τις πρόσφατες αλλαγές.</p><div className={styles.prompts}>{examples.map(example=><button type="button" key={example} onClick={()=>example.includes('…')?setQuery(example.replace('…',' ')):void ask(example)}>{example}<ArrowUpRight size={14}/></button>)}</div></div>}
    <div className={styles.messages} aria-live="polite" aria-relevant="additions text">{turns.map((turn,index)=><article className={styles.messageTurn} key={index}>
     <div className={styles.questionBubble}>{turn.question}</div>
     {turn.error?<div className={styles.errorBubble} role="alert"><p>{turn.error}</p><button disabled={busy} onClick={()=>void ask(turn.question,turn.choice)}>Δοκιμή ξανά</button></div>:<div className={styles.answerBubble}>
      {turn.result?.answer?<p>{turn.result.answer}</p>:<span className={styles.thinking} role="status"><i/><i/><i/><span className={styles.srOnly}>Διαβάζω τον φάκελο</span></span>}
      {turn.result?.blocks?.map((block,i)=><div className={styles.block} key={i}><strong>{block.title}</strong><p>{block.text}</p></div>)}
      {turn.result?.choices?.map(p=><button className={styles.choice} disabled={busy} key={p.id} onClick={()=>void ask(turn.question,p.id)}>{p.first_name} {p.last_name} · {p.id.slice(-6)}</button>)}
      {turn.result?.proposal&&<div className={styles.action}><strong>Προτεινόμενη ενέργεια</strong><p>{turn.result.proposal.summary}</p><small>Λήξη: {new Date(turn.result.proposal.expires_at).toLocaleTimeString('el-GR')}</small>{!turn.done&&<button disabled={busy} onClick={()=>void confirm(index)}>{turn.executing?'Εκτέλεση…':'Επιβεβαιώνω την εκτέλεση'}</button>}</div>}
      {turn.totalMs!==undefined&&<div className={styles.answerFooter}><span>{(turn.totalMs/1000).toFixed(1)} δευτ.{synthetic&&turn.firstMs!==undefined?' · πρώτο κείμενο '+(turn.firstMs/1000).toFixed(1)+' δευτ.':''}</span>{turn.result?.patient&&!synthetic&&!turn.result.proposal&&<Link href={'/patients/demo/'+turn.result.patient.id}>Καρτέλα <ArrowUpRight size={12}/></Link>}</div>}
     </div>}
    </article>)}</div>
   </div>
   <footer className={styles.chatFooter}><form className={styles.chatCompose} onSubmit={e=>{e.preventDefault();void ask(query)}}>
    <label className={styles.srOnly} htmlFor={uid+'-question'}>Μήνυμα στον Βοηθό Ψ</label>
    <textarea ref={input} id={uid+'-question'} rows={2} maxLength={1500} disabled={busy} value={query} onChange={e=>setQuery(e.target.value)} onKeyDown={e=>{if(e.key==='Enter'&&!e.shiftKey&&!e.nativeEvent.isComposing){e.preventDefault();void ask(query)}}} placeholder="Γράψε την ερώτησή σου…"/>
    {busy?<button type="button" onClick={()=>pending.current?.abort()} aria-label="Διακοπή απάντησης"><Square size={15}/></button>:<button type="submit" disabled={query.trim().length<3} aria-label="Αποστολή ερώτησης"><Send size={17}/></button>}
   </form><small>{synthetic?'Ζωντανή δοκιμή · μόνο συνθετικά δεδομένα':'Έλεγξε την απάντηση μαζί με την καρτέλα ασθενούς.'}</small></footer>
  </section>
  <button ref={launcher} type="button" className={styles.launcher} aria-controls={uid+'-panel'} aria-expanded={open} onClick={()=>open?minimize():setOpen(true)}><Sparkles size={20}/><span>Βοηθός Ψ</span>{busy&&<i className={styles.busyDot}/>}</button>
 </div>,document.body);
}
export function OverviewShortcuts({searchOnly=false}:{searchOnly?:boolean}={}){
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
 return <div className={styles.shortcuts+(searchOnly?' '+styles.toolbarSearch:'')}>
  <div className={styles.searchWrap}><form onSubmit={event=>{event.preventDefault();void search()}}><Search size={16} aria-hidden="true"/><input aria-label="Αναζήτηση ασθενούς" placeholder="Αναζήτηση ασθενούς…" maxLength={100} value={query} onKeyDown={event=>{if(event.key==='Escape')closeResults()}} onChange={event=>{sequence.current++;setQuery(event.target.value);setPatients([]);setStatus('')}}/>{!searchOnly&&<button disabled={query.trim().length<2} type="submit">Αναζήτηση</button>}</form>
   {(patients.length>0||status)&&<div className={styles.results}><button className={styles.close} aria-label="Κλείσιμο αποτελεσμάτων" onClick={closeResults}>×</button><span role="status">{status}</span>{patients.map(patient=><Link key={patient.id} href={'/patients/demo/'+patient.id}>{patient.first_name} {patient.last_name}<small>Φάκελος · {patient.id.slice(-6)}</small></Link>)}</div>}
  </div>
  {!searchOnly&&<><Link className={styles.primary} href="/calendar?new=1">+ Νέο ραντεβού</Link>
  <Link href="/patients/new">+ Νέος ασθενής</Link></>}
 </div>;
}

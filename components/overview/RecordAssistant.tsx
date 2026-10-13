'use client';
import {useRef,useState} from 'react';
import Link from 'next/link';
import {Send,Sparkles} from 'lucide-react';
import type {SearchAnswer,SearchPatient} from '@/lib/overview/record-search';
import styles from './RecordAssistant.module.css';
type Turn={question:string;result?:SearchAnswer;error?:string};
export default function RecordAssistant({compact=false}:{compact?:boolean}){
 const [query,setQuery]=useState(''),[turns,setTurns]=useState<Turn[]>([]),[busy,setBusy]=useState(false);
 const context=useRef<SearchPatient|null>(null),locked=useRef(false);
 async function ask(question:string,choice?:string){
  if(locked.current||question.trim().length<3)return;
  locked.current=true;setBusy(true);setQuery('');
  setTurns(current=>[...current.slice(-5),{question}]);
  try{
   const response=await fetch('/api/records/search',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({query:question,choice_id:choice,context_patient_id:context.current?.id})});
   const data=await response.json();if(!response.ok)throw new Error(data.error||'Δεν ολοκληρώθηκε η αναζήτηση.');
   if(data.patient)context.current=data.patient;
   setTurns(current=>current.map((turn,index)=>index===current.length-1?{question,result:data}:turn));
  }catch(error){setTurns(current=>current.map((turn,index)=>index===current.length-1?{question,error:error instanceof Error?error.message:'Δεν ολοκληρώθηκε η αναζήτηση.'}:turn))}
  finally{locked.current=false;setBusy(false)}
 }
 return <section className={styles.assistant+(compact?' '+styles.compact:'')} aria-label="Βοηθός φακέλων">
  <div className={styles.heading}><span><Sparkles size={18}/> Βοηθός φακέλων</span>{turns.length>0&&<button disabled={busy} onClick={()=>{setTurns([]);context.current=null}}>Νέα συζήτηση</button>}</div>
  <h2>Ρώτησε για τους φακέλους σου</h2>
  <p>Αγωγή, επισκέψεις, ραντεβού και εκκρεμότητες, με παραπομπή στην καταγραφή.</p>
  {!turns.length&&<div className={styles.suggestions}>{['Τι αγωγή παίρνει…','Πότε είναι το επόμενο ραντεβού του…','Τι εκκρεμεί για…'].map(example=><button key={example} onClick={()=>setQuery(example.replace('…',' '))}>{example}</button>)}</div>}
  <div className={styles.conversation} aria-live="polite" aria-busy={busy}>{turns.map((turn,index)=><div className={styles.turn} key={index}>
   <strong>{turn.question}</strong>
   {turn.error?<p role="alert">{turn.error}</p>:turn.result?<>
    {turn.result.patient&&<span className={styles.patient}>{turn.result.patient.first_name} {turn.result.patient.last_name}</span>}
    <p>{turn.result.answer}</p>
    {turn.result.choices?.map(patient=><button className={styles.choice} disabled={busy} key={patient.id} onClick={()=>void ask(turn.question,patient.id)}>{patient.first_name} {patient.last_name} · {patient.id.slice(-6)}</button>)}
    <div className={styles.sources}>{turn.result.sources.map((source,i)=><Link key={i} href={source.href}>{source.label} →</Link>)}</div>
   </>:<p>Αναζήτηση στον φάκελο…</p>}
  </div>)}</div>
  <form className={styles.compose} onSubmit={event=>{event.preventDefault();void ask(query)}}>
   <label className={styles.srOnly} htmlFor="record-question">Ερώτηση για φάκελο ασθενή</label>
   <textarea id="record-question" rows={2} maxLength={500} value={query} onChange={event=>setQuery(event.target.value)} placeholder="Τι αγωγή παίρνει η Μαρία Παπαδοπούλου;"/>
   <button type="submit" disabled={busy||query.trim().length<3} aria-label="Αποστολή ερώτησης"><Send size={18}/></button>
  </form>
 </section>;
}
export function OverviewShortcuts(){
 const [query,setQuery]=useState(''),[patients,setPatients]=useState<SearchPatient[]>([]),[status,setStatus]=useState('');
 const sequence=useRef(0);
 async function search(event:React.FormEvent){
  event.preventDefault();const current=++sequence.current;setPatients([]);setStatus('Αναζήτηση…');
  try{const response=await fetch('/api/records/search?q='+encodeURIComponent(query.trim()),{cache:'no-store'});const data=await response.json();if(!response.ok)throw new Error(data.error);if(current===sequence.current){setPatients(data.patients);setStatus(data.patients.length?'':'Δεν βρέθηκε ασθενής.')}}catch{if(current===sequence.current)setStatus('Η αναζήτηση δεν είναι διαθέσιμη προσωρινά.')}
 }
 return <div className={styles.shortcuts}>
  <div className={styles.searchWrap}><form onSubmit={event=>void search(event)}><input aria-label="Αναζήτηση ασθενούς" placeholder="Αναζήτηση ασθενούς" maxLength={100} value={query} onChange={event=>{sequence.current++;setQuery(event.target.value);setPatients([]);setStatus('')}}/><button disabled={query.trim().length<2} type="submit">Αναζήτηση</button></form>
   {(patients.length>0||status)&&<div className={styles.results}><button className={styles.close} aria-label="Κλείσιμο αποτελεσμάτων" onClick={()=>{sequence.current++;setPatients([]);setStatus('')}}>×</button><span role="status">{status}</span>{patients.map(patient=><Link key={patient.id} href={'/patients/demo/'+patient.id}>{patient.first_name} {patient.last_name}<small>Φάκελος · {patient.id.slice(-6)}</small></Link>)}</div>}
  </div>
  <Link className={styles.primary} href="/calendar?new=1">+ Νέο ραντεβού</Link>
  <Link href="/patients/new">+ Νέος ασθενής</Link>
 </div>;
}

'use client';
import {useRef,useState} from 'react';
import type {PatientBundle} from '@/lib/patients/demo-runtime';
import {continuityContexts} from '@/lib/clinical/continuity-context';
import {demoPost} from '@/lib/patients/demo-client';
import {formatClinicDateTime} from '@/lib/clinic-time';
import styles from './PatientRecord.module.css';
export default function PatientContext({bundle,reload,onVisit}:{bundle:PatientBundle;reload:()=>Promise<unknown>;onVisit:(id:string)=>void}){
 const items=continuityContexts(bundle),active=items.filter(i=>i.status==='active');
 const [editing,setEditing]=useState<{id:string;revision:number;content:string}|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const request=useRef<{id:string;action:string;content:string;requestId:string}|null>(null),flight=useRef(false);
 async function revise(item:typeof items[number],action:'updated'|'resolved',content:string){
  if(flight.current)return;flight.current=true;setBusy(true);setError('');
  const intent={id:item.id,action,content};
  if(!request.current||request.current.id!==intent.id||request.current.action!==action||request.current.content!==content)request.current={...intent,requestId:crypto.randomUUID()};
  let committed=false;
  try{await demoPost({action:'revise_context',source_session_id:item.id,request_id:request.current.requestId,context_action:action,content,expected_revision:editing?.id===item.id?editing.revision:item.revision});committed=true;setEditing(null);request.current=null;const fresh=await reload();if(!fresh)setError('Η αλλαγή αποθηκεύτηκε. Ανανεώστε τον φάκελο για να εμφανιστεί.');}
  catch(e){setError(committed?'Η αλλαγή αποθηκεύτηκε. Ανανεώστε τον φάκελο.':e instanceof Error?e.message:'Δεν αποθηκεύτηκε το context.')}
  finally{flight.current=false;setBusy(false)}
 }
 if(!items.length)return null;
 const row=(item:typeof items[number])=><article key={item.id}><p>{item.content}</p><small>Επιβεβαιωμένη πηγή · {formatClinicDateTime(item.sourceDate)}{item.revision>0&&<> · Ενημερώθηκε {formatClinicDateTime(item.updatedAt)}</>} <button type="button" className={styles.link} onClick={()=>onVisit(item.sourceSessionId)}>Επίσκεψη</button></small>{editing?.id===item.id?<div><label>Ενημέρωση σημαντικού context<textarea maxLength={2000} rows={2} value={editing.content} onChange={e=>setEditing({...editing,content:e.target.value})}/></label><button type="button" disabled={busy||!editing.content.trim()} onClick={()=>void revise(item,'updated',editing.content.trim())}>Αποθήκευση ενημέρωσης</button><button type="button" disabled={busy} onClick={()=>{setEditing(null);setError('')}}>Ακύρωση</button></div>:<div><button type="button" className={styles.link} disabled={busy} onClick={()=>{setEditing({id:item.id,revision:item.revision,content:item.content});setError('')}}>Ενημέρωση</button> · <button type="button" className={styles.link} disabled={busy} onClick={()=>void revise(item,'resolved','')}>Έκλεισε</button></div>}</article>;
 return <section className={styles.section}><span className="kicker">ΣΗΜΑΝΤΙΚΟ ΕΝΕΡΓΟ CONTEXT</span>{active.slice(0,3).map(row)}{!active.length&&<p className={styles.muted}>Δεν υπάρχει ενεργό context.</p>}{active.length>3&&<details><summary>Περισσότερα ενεργά · {active.length-3}</summary>{active.slice(3).map(row)}</details>}{items.some(i=>i.history.length>0)&&<details><summary>Ιστορικό context</summary>{items.filter(i=>i.history.length>0).map(i=><article key={i.id}><p>Αρχική επιβεβαίωση · {formatClinicDateTime(i.approvedAt)} · {i.original}</p>{i.history.map(r=><p key={r.id}>{formatClinicDateTime(r.created_at)} · {r.action==='resolved'?'Έκλεισε':'Ενημερώθηκε'} · {r.content}</p>)}</article>)}</details>}{error&&<p role="alert">{error}</p>}</section>;
}

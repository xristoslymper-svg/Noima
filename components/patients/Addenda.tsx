'use client';
import {useState} from 'react';
import type {PatientBundle} from '@/lib/patients/demo-runtime';
import {demoPost} from '@/lib/patients/demo-client';
import {formatClinicDateTime} from '@/lib/clinic-time';
export default function Addenda({bundle,sessionId,reload}:{bundle:PatientBundle;sessionId:string;reload:()=>Promise<unknown>}){
 const [open,setOpen]=useState(false),[content,setContent]=useState(''),[reason,setReason]=useState(''),[kind,setKind]=useState('addendum'),[request,setRequest]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState('');
 async function save(){setBusy(true);setError('');try{await demoPost({action:'addendum',session_id:sessionId,request_id:request,kind,reason,content});await reload();setOpen(false);setContent('');setReason('')}catch(e){setError(e instanceof Error?e.message:'Δεν αποθηκεύτηκε')}finally{setBusy(false)}}
 return <section className="addenda"><h3>Μεταγενέστερες προσθήκες / διορθώσεις</h3>{bundle.addenda.filter(x=>x.session_id===sessionId).map(x=><article key={x.id}><strong>{x.kind==='correction'?'Διόρθωση':'Προσθήκη'} · {formatClinicDateTime(x.created_at)}</strong><p>{x.content}</p><small>Αιτία: {x.reason} · Καταχώρηση από τον κλινικό χρήστη</small></article>)}
 {!open?<button onClick={()=>{setRequest(crypto.randomUUID());setOpen(true)}}>Νέα προσθήκη / διόρθωση</button>:<div><p>Η αρχική συνεδρία παραμένει αμετάβλητη.</p><label>Τύπος<select disabled={busy} value={kind} onChange={e=>setKind(e.target.value)}><option value="addendum">Προσθήκη</option><option value="correction">Διόρθωση</option></select></label><label>Αιτία<input disabled={busy} value={reason} onChange={e=>setReason(e.target.value)}/></label><label>Κείμενο<textarea disabled={busy} rows={5} value={content} onChange={e=>setContent(e.target.value)}/></label>{error&&<p role="alert">{error}</p>}<button disabled={busy||!content.trim()||!reason.trim()} onClick={()=>void save()}>Αποθήκευση προσθήκης</button><button disabled={busy} onClick={()=>setOpen(false)}>Κλείσιμο</button></div>}</section>
}

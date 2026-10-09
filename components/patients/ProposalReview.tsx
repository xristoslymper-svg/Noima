'use client';
import {useState,useEffect,useRef} from 'react';
import type {ClinicalProposal} from '@/lib/clinical/core-types';
import {getDemoTesterId} from '@/lib/demo-tester';
import {demoPost} from '@/lib/patients/demo-client';
export default function ProposalReview({sessionId,section,title,transcript,initial,onApproved,onCancel,beforeApprove,current}:{sessionId:string;section:string;title:string;transcript:string;initial?:ClinicalProposal;current:string;beforeApprove:()=>Promise<number|null>;onApproved:(section:{content:string;version:number})=>void;onCancel:()=>void}){
 const [raw,setRaw]=useState(initial?.transcript||transcript),[proposal,setProposal]=useState<ClinicalProposal|undefined>(initial),[text,setText]=useState(initial?.proposal.clinical_text||''),[mode,setMode]=useState<'append'|'replace'>('append'),[busy,setBusy]=useState(false),[error,setError]=useState(''),[manual,setManual]=useState(false);
 const started=useRef(false);
 const storageKey=`noima-proposal:${sessionId}:${section}`;
 const [ready,setReady]=useState(false);
 useEffect(()=>{
  if(started.current)return;started.current=true;
  try{const saved=JSON.parse(sessionStorage.getItem(storageKey)||'null');
   if(saved&&saved.transcript===(initial?.transcript||transcript)&&(!initial||saved.proposal?.id===initial.id)){
    setRaw(saved.raw);setText(saved.text);setMode(saved.mode);setManual(saved.manual);setProposal(saved.proposal);setReady(true);return;
   }
  }catch{}
  setReady(true);if(!initial)void extract();
 },[]);
 useEffect(()=>{if(ready)try{sessionStorage.setItem(storageKey,JSON.stringify({transcript:initial?.transcript||transcript,raw,text,mode,manual,proposal}))}catch{}},[ready,storageKey,initial,transcript,raw,text,mode,manual,proposal]);
 async function extract(){setBusy(true);setError('');try{const r=await fetch('/api/clinical/extract',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({tester:getDemoTesterId(),session_id:sessionId,section,transcript:raw})});const d=await r.json();if(!r.ok)throw new Error(d.error);setProposal(d.entry);setText(d.entry.proposal.clinical_text);setManual(false)}catch(e){setError(e instanceof Error?e.message:'Η μεταγραφή διατηρήθηκε.')}finally{setBusy(false)}}
 async function approve(){setBusy(true);setError('');try{const version=await beforeApprove();const d=manual?await demoPost({action:'save_section',session_id:sessionId,section_key:section,content:mode==='append'&&current.trim()?current+'\n\n'+text:text,source:'dictation',expected_version:version}):await demoPost({action:'approve_proposal',proposal_id:proposal?.id,text,mode,expected_version:version});onApproved(d.section)}catch(e){setError(e instanceof Error?e.message:'Δεν αποθηκεύτηκε.')}finally{setBusy(false)}}
 return <section className="proposal-review" aria-label={'Έλεγχος υπαγόρευσης · '+title}>
  <h4>Υπαγόρευση · {title}</h4><label>Αρχική μεταγραφή<textarea value={raw} readOnly={busy||Boolean(proposal)||manual} onChange={e=>setRaw(e.target.value)} rows={4}/></label>
  {!proposal&&!manual&&<button disabled={busy||!raw.trim()} onClick={()=>void extract()}>{busy?'Οργάνωση καταγραφής…':'Οργάνωση καταγραφής με AI'}</button>}
  {(proposal||manual)&&<><label>{manual?'Χειροκίνητη επεξεργασία μεταγραφής':'Καταγραφή προς έλεγχο'}<textarea value={text} readOnly={busy} onChange={e=>setText(e.target.value)} rows={5}/></label>{proposal?.proposal.facts.length? <details><summary>Ρητά αναφερόμενα στοιχεία</summary>{proposal.proposal.facts.map((f,i)=><p key={i}><b>{f.label}:</b> {f.value}</p>)}</details>:null}
  {current.trim()&&<><details><summary>Υπάρχουσα καταγραφή</summary><p>{current}</p></details><label>Τρόπος καταχώρησης<select disabled={busy} value={mode} onChange={e=>setMode(e.target.value as 'append'|'replace')}><option value="append">Προσθήκη στο υπάρχον κείμενο</option><option value="replace">Αντικατάσταση υπάρχοντος κειμένου</option></select></label></>}
  <button disabled={busy||!text.trim()} onClick={()=>void approve()}>{busy?'Αποθήκευση…':'Έγκριση & αποθήκευση καταγραφής'}</button></>}
  {error&&<p role="alert">{error}</p>}{!proposal&&!manual&&<button disabled={busy} onClick={()=>{setManual(true);setText(raw)}}>Χειροκίνητη χρήση μεταγραφής</button>}
  <button disabled={busy} onClick={onCancel}>Κλείσιμο ελέγχου</button>
 </section>
}

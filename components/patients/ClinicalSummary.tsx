'use client';
import Link from 'next/link';
import {useCalendarDialog} from '@/components/calendar/useCalendarDialog';
import {useEffect,useState} from 'react';
import type {PatientBundle} from '@/lib/patients/demo-runtime';
import {getDemoTesterId} from '@/lib/demo-tester';
import {buildSummaryContext,canonicalSummaryFindings,summaryContextHash,summaryContextKey,clinicDay,type Finding,type Evidence,categories} from '@/lib/clinical/summary-context';
import {formatClinicDateTime} from '@/lib/clinic-time';
import {evidenceText} from '@/lib/clinical/evidence-text';
type ResponseData={findings:Finding[];sources:Evidence[];context_hash:string;generated_at:string;mode:string};
export default function ClinicalSummary({bundle:inputBundle,onSessions,onPsychometrics,onMedications,onHistory,compact=false}:{compact?:boolean;bundle:PatientBundle;onSessions:(id?:string)=>void;onPsychometrics:()=>void;onMedications:()=>void;onHistory:()=>void}){
 const [retry,setRetry]=useState(0);
 const inputKey=summaryContextKey(inputBundle,clinicDay());
 const [snapshot,setSnapshot]=useState<{inputKey:string;bundle:PatientBundle}|null>(null);
 const bundle=snapshot?.inputKey===inputKey?snapshot.bundle:inputBundle;
 const [day,setDay]=useState(clinicDay());
 const [result,setResult]=useState<{key:string;data:ResponseData}|null>(null);
 const [state,setState]=useState<'loading'|'ready'|'unavailable'>('loading');
 const [evidence,setEvidence]=useState<Evidence|null>(null);
 const evidenceRef=useCalendarDialog(()=>setEvidence(null),false,Boolean(evidence));
 const key=summaryContextKey(bundle,day);const context=buildSummaryContext(bundle,day);
 useEffect(()=>{const timer=setInterval(()=>setDay(clinicDay()),30000);const refresh=()=>setRetry(n=>n+1);window.addEventListener('focus',refresh);return()=>{clearInterval(timer);window.removeEventListener('focus',refresh)}},[]);
 useEffect(()=>{
  let active=true;const controller=new AbortController();setState('loading');setEvidence(null);
  void (async()=>{
   const tester=getDemoTesterId();
   const recordResponse=await fetch('/api/patients/demo/runtime?tester='+encodeURIComponent(tester)+'&patient='+encodeURIComponent(inputBundle.patient.id),{cache:'no-store',signal:controller.signal});
   const recordData=await recordResponse.json();if(!recordResponse.ok||!recordData.bundle)throw new Error('record_unavailable');
   const fresh=recordData.bundle as PatientBundle;const freshKey=summaryContextKey(fresh,day);
   if(active)setSnapshot({inputKey,bundle:fresh});
   const hash=await summaryContextHash(fresh,day);const r=await fetch('/api/clinical/summary',{method:'POST',signal:controller.signal,headers:{'Content-Type':'application/json'},body:JSON.stringify({tester,patient_id:fresh.patient.id,context_hash:hash})});
   const data=await r.json();if(!r.ok||data.context_hash!==hash)throw new Error('stale_or_unavailable');if(active){setResult({key:freshKey,data});setState('ready')}
  })().catch(()=>{if(active){setResult(null);setState('unavailable')}});
  return()=>{active=false;controller.abort()};
 // key is the complete canonical record including date and policy version.
 },[inputKey,retry,day]);
 const current=result?.key===key?result.data:null;
 const findings=current?.findings||canonicalSummaryFindings(context);
 const sources=current?.sources||context.sources;
 const next=bundle.appointments.filter(a=>a.status==='scheduled'&&Date.parse(a.scheduled_end)>Date.now()).sort((a,b)=>Date.parse(a.scheduled_start)-Date.parse(b.scheduled_start))[0];
 function navigate(source:Evidence){setEvidence(null);if(source.target==='sessions')onSessions(source.session_id);else if(source.target==='medications')onMedications();else if(source.target==='psychometrics')onPsychometrics();else if(source.target==='history')onHistory();else window.location.href='/calendar';}
 const order=[...categories].sort((a,b)=>{const priority:Record<string,number>={'Χρειάζεται επιβεβαίωση':0,'Κίνδυνος':1,'Παρενέργειες':2,'Τρέχουσα εικόνα':3,'Πορεία':4,'Αγωγή':5,'Ψυχομετρικά':6,'Πλάνο':7,'Σημαντικό ιστορικό':8};return priority[a]-priority[b]});
 const sourceHref=(source:Evidence)=>source.target==='calendar'?'/calendar':'/patients/demo/'+bundle.patient.id+'?tab='+source.target+(source.session_id?'&session='+source.session_id:'');
 return <section className={compact?"clinical-summary summary-compact":"clinical-summary"}>
  <header className="clinical-summary-head"><div><span className="kicker">ΠΡΙΝ ΤΗ ΣΥΝΕΔΡΙΑ</span><h2>{compact?"Σύνοψη πριν την επίσκεψη":"Όσα χρειάζονται προσοχή"}</h2><p>{current?`Ενημέρωση ${formatClinicDateTime(current.generated_at)}`:state==='loading'?'Ενημέρωση σύνθεσης · εμφανίζονται οι τεκμηριωμένες καταγραφές':'Η κλινική σύνθεση δεν είναι προσωρινά διαθέσιμη'}{current?.mode==='canonical'?' · από τον φάκελο, χωρίς LLM':current?.mode==='synthesis'?' · επιλογή πηγών με AI':''}</p><button className="summary-refresh" disabled={state==='loading'} onClick={()=>setRetry(n=>n+1)}>Ανανέωση σύνοψης</button></div>{!compact&&next&&<div className="summary-next-compact"><strong>{formatClinicDateTime(next.scheduled_start)}</strong><span>{next.session_id?'Συνδεδεμένη συνεδρία':'Επόμενο ραντεβού'}</span></div>}</header>
  <div className="summary-findings">{order.map(category=>{const group=findings.filter(f=>f.label===category);if(!group.length)return null;return <section className="summary-category" key={category}><h3>{category}</h3>{group.map((f,index)=><article key={f.key} className={f.attention?'summary-finding attention':'summary-finding'}><span className="summary-finding-dot" aria-hidden="true"/><div>{compact&&(f.text.length>380||f.label==='Σημαντικό ιστορικό'||(f.label==='Τρέχουσα εικόνα'&&index>0))?<details><summary>{f.label} · καταγεγραμμένη πηγή</summary><p>{f.text}</p></details>:<p>{f.text}</p>}{f.source_ids.length>0&&<details className="summary-evidence"><summary>{f.source_ids.length} {f.source_ids.length===1?'πηγή':'πηγές'}</summary><ul>{f.source_ids.map(id=>{const source=sources.find(s=>s.id===id);return source?<li key={id}>{compact?<Link href={sourceHref(source)}>{source.label}</Link>:<button onClick={()=>setEvidence(source)}>{source.label}</button>}</li>:null})}</ul></details>}</div></article>)}</section>})}</div>
  {!findings.some(f=>f.label==='Τρέχουσα εικόνα')&&<p className="summary-empty">Δεν υπάρχει διαθέσιμη ολοκληρωμένη καταγραφή της τελευταίας κλινικής εικόνας. Πρόχειρες επισκέψεις δεν περιλαμβάνονται.</p>}
  {compact&&<Link className="summary-full-link" href={'/patients/demo/'+bundle.patient.id+'?tab=summary'}>Πλήρης σύνοψη & πηγές →</Link>}
  <style jsx global>{`.summary-refresh{border:0;background:#eef4f0;color:#356b59;border-radius:8px;padding:7px 10px;margin-top:8px;font-size:11px;cursor:pointer}.summary-compact .summary-category{margin-bottom:16px}.summary-compact .summary-category h3{font-size:12px;color:#557265}.summary-compact .summary-finding p{font-size:12px;line-height:1.7}.summary-compact details>summary{font-size:12px;color:#587364;cursor:pointer}.summary-full-link{display:block;margin-top:16px;color:#356b59;font-size:12px;font-weight:650}.summary-empty{font-size:12px;color:#7e8b84}.summary-evidence a{color:#356b59}.summary-compact .clinical-summary-head h2{font-size:20px}.summary-compact .clinical-summary-head p{font-size:11px}`}</style>
  {evidence&&<div className="entry-modal-backdrop" onClick={()=>setEvidence(null)}><section ref={evidenceRef} tabIndex={-1} className="entry-modal summary-evidence-modal" role="dialog" aria-modal="true" aria-label="Κλινική πηγή" onClick={e=>e.stopPropagation()}><button className="entry-close" onClick={()=>setEvidence(null)} aria-label="Κλείσιμο">×</button><h2>{evidence.label}</h2>{evidence.date&&<p>{formatClinicDateTime(evidence.date)}</p>}<pre>{evidenceText(evidence)}</pre><footer><button onClick={()=>navigate(evidence)}>Άνοιγμα καταγραφής</button></footer></section></div>}
 </section>;
}

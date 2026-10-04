'use client';
import {useEffect,useState} from 'react';
import type {PatientBundle} from '@/lib/patients/demo-runtime';
import {getDemoTesterId} from '@/lib/demo-tester';
import {buildSummaryContext,summaryContextHash,summaryContextKey,clinicDay,type Finding,type Evidence,categories} from '@/lib/clinical/summary-context';
import {formatClinicDateTime} from '@/lib/clinic-time';
import {evidenceText} from '@/lib/clinical/evidence-text';
type ResponseData={findings:Finding[];sources:Evidence[];context_hash:string;generated_at:string;mode:string;reason?:string|null};
export default function ClinicalSummary({bundle,onSessions,onPsychometrics,onMedications,onHistory}:{bundle:PatientBundle;onSessions:(id?:string)=>void;onPsychometrics:()=>void;onMedications:()=>void;onHistory:()=>void}){
 const [day,setDay]=useState(clinicDay());
 const [result,setResult]=useState<{key:string;data:ResponseData}|null>(null);
 const [state,setState]=useState<'loading'|'ready'|'unavailable'>('loading');
 const [evidence,setEvidence]=useState<Evidence|null>(null);
 const key=summaryContextKey(bundle,day);const context=buildSummaryContext(bundle,day);
 useEffect(()=>{const timer=setInterval(()=>setDay(clinicDay()),30000);return()=>clearInterval(timer)},[]);
 useEffect(()=>{
  let active=true;const controller=new AbortController();setState('loading');setEvidence(null);
  void (async()=>{const hash=await summaryContextHash(bundle,day);const r=await fetch('/api/clinical/summary',{method:'POST',signal:controller.signal,headers:{'Content-Type':'application/json'},body:JSON.stringify({tester:getDemoTesterId(),patient_id:bundle.patient.id,context_hash:hash})});const data=await r.json();if(!r.ok||data.context_hash!==hash)throw new Error('stale_or_unavailable');if(active){setResult({key,data});setState('ready')}})().catch(()=>{if(active)setState('unavailable')});
  return()=>{active=false;controller.abort()};
 // key is the complete canonical record including date and policy version.
 },[key]);
 const current=result?.key===key?result.data:null;
 const findings=current?.findings||context.findings;
 const sources=current?.sources||context.sources;
 const next=bundle.appointments.filter(a=>a.status==='scheduled'&&Date.parse(a.scheduled_end)>Date.now()).sort((a,b)=>Date.parse(a.scheduled_start)-Date.parse(b.scheduled_start))[0];
 function navigate(source:Evidence){setEvidence(null);if(source.target==='sessions')onSessions(source.session_id);else if(source.target==='medications')onMedications();else if(source.target==='psychometrics')onPsychometrics();else if(source.target==='history')onHistory();else window.location.href='/calendar';}
 const order=[...categories].sort((a,b)=>{const priority:Record<string,number>={'Χρειάζεται επιβεβαίωση':0,'Κίνδυνος':1,'Παρενέργειες':2,'Τι χρειάζεται προσοχή':3,'Τρέχουσα εικόνα':4,'Από την τελευταία επίσκεψη':5,'Τρέχον πλάνο':6,'Αγωγή':7,'Ψυχομετρικά':8,'Πλάνο':9,'Σημαντικό ιστορικό':10};return priority[a]-priority[b]});
 return <section className="clinical-summary">
  <header className="clinical-summary-head"><div><h2>Σύνοψη</h2><p>{current?`Ενημέρωση ${formatClinicDateTime(current.generated_at)}`:state==='loading'?'Ενημέρωση σύνθεσης · εμφανίζονται οι τεκμηριωμένες καταγραφές':'Η κλινική σύνθεση δεν είναι προσωρινά διαθέσιμη'}{current?.mode==='canonical'?` · canonical${current.reason?' · '+current.reason:''}`:''}</p></div>{next&&<div className="summary-next-compact"><strong>{formatClinicDateTime(next.scheduled_start)}</strong><span>{next.session_id?'Συνδεδεμένη συνεδρία':'Επόμενο ραντεβού'}</span></div>}</header>
  <div className="summary-findings">{order.map(category=>{const group=findings.filter(f=>f.label===category);if(!group.length)return null;return <section className="summary-category" key={category}><h3>{category}</h3>{group.map(f=><article key={f.key} className={f.attention?'summary-finding attention':'summary-finding'}><span className="summary-finding-dot" aria-hidden="true"/><div><p>{f.text}</p>{f.source_ids.length>0&&<details className="summary-evidence"><summary>{f.source_ids.length} {f.source_ids.length===1?'πηγή':'πηγές'}</summary><ul>{f.source_ids.map(id=>{const source=sources.find(s=>s.id===id);return source?<li key={id}><button onClick={()=>setEvidence(source)}>{source.label}</button></li>:null})}</ul></details>}</div></article>)}</section>})}</div>
  {evidence&&<div className="entry-modal-backdrop" onClick={()=>setEvidence(null)}><section className="entry-modal summary-evidence-modal" role="dialog" aria-modal="true" aria-label="Κλινική πηγή" onClick={e=>e.stopPropagation()}><button className="entry-close" onClick={()=>setEvidence(null)} aria-label="Κλείσιμο">×</button><h2>{evidence.label}</h2>{evidence.date&&<p>{formatClinicDateTime(evidence.date)}</p>}<pre>{evidenceText(evidence)}</pre><footer><button onClick={()=>navigate(evidence)}>Άνοιγμα καταγραφής</button></footer></section></div>}
 </section>;
}

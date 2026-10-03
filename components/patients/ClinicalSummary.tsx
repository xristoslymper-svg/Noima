'use client';
import {useEffect,useState} from 'react';
import type {PatientBundle} from '@/lib/patients/demo-runtime';
import {getDemoTesterId} from '@/lib/demo-tester';
import {clinicalSummaryFindings,type SummaryFinding} from '@/lib/clinical/summary';
import {formatClinicDate,formatClinicDateTime} from '@/lib/clinic-time';

type AiFinding={label:string;text:string;source_ids:string[];attention:boolean};

export default function ClinicalSummary({bundle,onSessions,onPsychometrics,onMedications,onHistory}:{bundle:PatientBundle;onSessions:(id?:string)=>void;onPsychometrics:()=>void;onMedications:()=>void;onHistory:()=>void}){
 const completed=[...bundle.sessions].filter(s=>s.status==='completed').sort((a,b)=>Date.parse(b.completed_at!)-Date.parse(a.completed_at!));
 const latest=completed[0];
 const fallbackFindings=clinicalSummaryFindings(bundle);
 const [aiFindings,setAiFindings]=useState<AiFinding[]|null>(null);
 const [aiState,setAiState]=useState<'loading'|'ready'|'fallback'>('loading');
 useEffect(()=>{let active=true;setAiState('loading');setAiFindings(null);fetch('/api/clinical/summary',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({tester:getDemoTesterId(),patient_id:bundle.patient.id})}).then(async r=>{const data=await r.json().catch(()=>({}));if(!r.ok)throw new Error(data.error||'summary_failed');if(active){setAiFindings(data.findings);setAiState('ready')}}).catch(()=>{if(active)setAiState('fallback')});return()=>{active=false}},[bundle.patient.id,bundle.sessions.map(s=>s.updated_at).join('|'),bundle.medications.map(m=>m.updated_at).join('|'),bundle.assessments.map(a=>a.updated_at).join('|'),bundle.addenda.map(a=>a.created_at).join('|')]);
 const findings=aiFindings||fallbackFindings;
 const next=[...bundle.appointments].filter(a=>a.status==='scheduled'&&new Date(a.scheduled_start)>new Date()).sort((a,b)=>Date.parse(a.scheduled_start)-Date.parse(b.scheduled_start))[0];
 const h=bundle.history;
 const historyItems=h?[['Αλλεργίες',h.allergies],['Ψυχιατρικό ιστορικό',h.psychiatric_history],['Ιατρικό ιστορικό',h.medical_history],['Νοσηλείες',h.hospitalizations],['Προηγούμενες θεραπείες',h.previous_treatments],['Ουσίες',h.substance_history]].filter((item):item is [string,string]=>Boolean(item[1]?.trim())):[];
 const additions=bundle.addenda.filter(a=>completed.some(s=>s.id===a.session_id)).sort((a,b)=>Date.parse(b.created_at)-Date.parse(a.created_at));
 const aiSourceAction=(finding:AiFinding)=>{
  const ids=finding.source_ids;
  const sectionId=ids.find(id=>id.startsWith('section:'));if(sectionId){const section=bundle.sections.find(x=>x.id===sectionId.slice(8));if(section)return()=>onSessions(section.session_id)}
  const riskId=ids.find(id=>id.startsWith('risk:'));if(riskId){const risk=bundle.risks.find(x=>x.id===riskId.slice(5));if(risk)return()=>onSessions(risk.session_id)}
  if(ids.some(id=>id.startsWith('medication:')||id.startsWith('side_effect:')))return onMedications;
  if(ids.some(id=>id.startsWith('assessment:')))return onPsychometrics;
  if(ids.some(id=>id.startsWith('history:')))return onHistory;
  const addendumId=ids.find(id=>id.startsWith('addendum:'));if(addendumId){const addendum=bundle.addenda.find(x=>x.id===addendumId.slice(9));if(addendum)return()=>onSessions(addendum.session_id)}
  return onHistory;
 };
 const aiSourceLabel=(finding:AiFinding)=>{const ids=finding.source_ids;if(ids.some(id=>id.startsWith('medication:')||id.startsWith('side_effect:')))return 'Αγωγή';if(ids.some(id=>id.startsWith('assessment:')))return 'Ψυχομετρικά';if(ids.some(id=>id.startsWith('history:')))return 'Ιστορικό';return 'Πηγή'};
 const sourceAction=(finding:SummaryFinding)=>{
  if(finding.source==='session')return ()=>onSessions(finding.sessionId);
  if(finding.source==='medications')return onMedications;
  if(finding.source==='psychometrics')return onPsychometrics;
  return onHistory;
 };
 const sourceLabel=(finding:SummaryFinding)=>finding.source==='session'?'Συνεδρία':finding.source==='medications'?'Αγωγή':finding.source==='psychometrics'?'Ψυχομετρικά':'Ιστορικό';

 return <section className="clinical-summary">
  <header className="clinical-summary-head">
   <div><span className="kicker">ΚΛΙΝΙΚΗ ΣΥΝΟΨΗ</span><h2>Κεντρικά ευρήματα</h2><p>{latest?<>Με βάση τον κλινικό φάκελο έως {formatClinicDate(latest.completed_at!)}{aiState==='ready'?' · AI σύνθεση με πηγές':aiState==='loading'?' · σύνθεση…':' · ασφαλής βασική προβολή'}</>:'Δεν υπάρχει ακόμη ολοκληρωμένη συνεδρία.'}</p></div>
   {latest&&<button className="summary-latest-source" onClick={()=>onSessions(latest.id)}>Τελευταία συνεδρία</button>}
  </header>

  <div className="summary-findings">
   {findings.length?findings.map((finding,index)=>{const ai='source_ids' in finding;return <article key={ai?'ai-'+index:finding.key} className={finding.attention?'summary-finding attention':'summary-finding'}>
    <span className="summary-finding-dot" aria-hidden="true"/>
    <div><strong>{finding.label}</strong><p>{finding.text}</p></div>
    <button onClick={ai?aiSourceAction(finding):sourceAction(finding)} aria-label={'Άνοιγμα πηγής: '+finding.label}>{ai?aiSourceLabel(finding):sourceLabel(finding)}</button>
   </article>}):<div className="summary-empty"><strong>Δεν υπάρχουν ακόμη κεντρικά κλινικά ευρήματα.</strong><p>Η σύνοψη θα ενημερωθεί από ολοκληρωμένες συνεδρίες, αγωγή και ψυχομετρικά.</p></div>}
  </div>

  {additions.length>0&&<aside className="summary-addenda"><strong>Μεταγενέστερες προσθήκες</strong><p>Υπάρχουν {additions.length} προσθήκες ή διορθώσεις σε ολοκληρωμένες συνεδρίες.</p><button onClick={()=>onSessions(additions[0].session_id)}>Έλεγχος προσθηκών</button></aside>}

  <div className="summary-context">
   <section><div className="summary-context-title"><h3>Σημαντικό ιστορικό</h3><button onClick={onHistory}>Πλήρες ιστορικό</button></div>{historyItems.length?<ul>{historyItems.slice(0,4).map(([label,value])=><li key={label}><strong>{label}</strong><span>{value}</span></li>)}</ul>:<p>Δεν υπάρχει συμπληρωμένο σχετικό ιστορικό.</p>}</section>
   <section><div className="summary-context-title"><h3>Επόμενο ραντεβού</h3></div>{next?<><strong className="summary-next-date">{formatClinicDateTime(next.scheduled_start)}</strong><span>{next.appointment_type==='initial_assessment'?'Αρχική αξιολόγηση':'Follow-up'}</span></>:<p>Δεν έχει προγραμματιστεί.</p>}</section>
  </div>
 </section>;
}

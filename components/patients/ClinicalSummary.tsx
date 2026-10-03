'use client';
import type {PatientBundle} from '@/lib/patients/demo-runtime';
import {clinicalSummaryFindings,type SummaryFinding} from '@/lib/clinical/summary';
import {formatClinicDate,formatClinicDateTime} from '@/lib/clinic-time';

export default function ClinicalSummary({bundle,onSessions,onPsychometrics,onMedications,onHistory}:{bundle:PatientBundle;onSessions:(id?:string)=>void;onPsychometrics:()=>void;onMedications:()=>void;onHistory:()=>void}){
 const completed=[...bundle.sessions].filter(s=>s.status==='completed').sort((a,b)=>Date.parse(b.completed_at!)-Date.parse(a.completed_at!));
 const latest=completed[0];
 const findings=clinicalSummaryFindings(bundle);
 const next=[...bundle.appointments].filter(a=>a.status==='scheduled'&&new Date(a.scheduled_start)>new Date()).sort((a,b)=>Date.parse(a.scheduled_start)-Date.parse(b.scheduled_start))[0];
 const h=bundle.history;
 const historyItems=h?[['Αλλεργίες',h.allergies],['Ψυχιατρικό ιστορικό',h.psychiatric_history],['Ιατρικό ιστορικό',h.medical_history],['Νοσηλείες',h.hospitalizations],['Προηγούμενες θεραπείες',h.previous_treatments],['Ουσίες',h.substance_history]].filter((item):item is [string,string]=>Boolean(item[1]?.trim())):[];
 const additions=bundle.addenda.filter(a=>completed.some(s=>s.id===a.session_id)).sort((a,b)=>Date.parse(b.created_at)-Date.parse(a.created_at));
 const sourceAction=(finding:SummaryFinding)=>{
  if(finding.source==='session')return ()=>onSessions(finding.sessionId);
  if(finding.source==='medications')return onMedications;
  if(finding.source==='psychometrics')return onPsychometrics;
  return onHistory;
 };
 const sourceLabel=(finding:SummaryFinding)=>finding.source==='session'?'Συνεδρία':finding.source==='medications'?'Αγωγή':finding.source==='psychometrics'?'Ψυχομετρικά':'Ιστορικό';

 return <section className="clinical-summary">
  <header className="clinical-summary-head">
   <div><span className="kicker">ΚΛΙΝΙΚΗ ΣΥΝΟΨΗ</span><h2>Κεντρικά ευρήματα</h2><p>{latest?<>Με βάση την τελευταία ολοκληρωμένη συνεδρία · {formatClinicDate(latest.completed_at!)}</>:'Δεν υπάρχει ακόμη ολοκληρωμένη συνεδρία.'}</p></div>
   {latest&&<button className="summary-latest-source" onClick={()=>onSessions(latest.id)}>Τελευταία συνεδρία</button>}
  </header>

  <div className="summary-findings">
   {findings.length?findings.map(finding=><article key={finding.key} className={finding.attention?'summary-finding attention':'summary-finding'}>
    <span className="summary-finding-dot" aria-hidden="true"/>
    <div><strong>{finding.label}</strong><p>{finding.text}</p></div>
    <button onClick={sourceAction(finding)} aria-label={'Άνοιγμα πηγής: '+finding.label}>{sourceLabel(finding)}</button>
   </article>):<div className="summary-empty"><strong>Δεν υπάρχουν ακόμη κεντρικά κλινικά ευρήματα.</strong><p>Η σύνοψη θα ενημερωθεί από ολοκληρωμένες συνεδρίες, αγωγή και ψυχομετρικά.</p></div>}
  </div>

  {additions.length>0&&<aside className="summary-addenda"><strong>Μεταγενέστερες προσθήκες</strong><p>Υπάρχουν {additions.length} προσθήκες ή διορθώσεις σε ολοκληρωμένες συνεδρίες.</p><button onClick={()=>onSessions(additions[0].session_id)}>Έλεγχος προσθηκών</button></aside>}

  <div className="summary-context">
   <section><div className="summary-context-title"><h3>Σημαντικό ιστορικό</h3><button onClick={onHistory}>Πλήρες ιστορικό</button></div>{historyItems.length?<ul>{historyItems.slice(0,4).map(([label,value])=><li key={label}><strong>{label}</strong><span>{value}</span></li>)}</ul>:<p>Δεν υπάρχει συμπληρωμένο σχετικό ιστορικό.</p>}</section>
   <section><div className="summary-context-title"><h3>Επόμενο ραντεβού</h3></div>{next?<><strong className="summary-next-date">{formatClinicDateTime(next.scheduled_start)}</strong><span>{next.appointment_type==='initial_assessment'?'Αρχική αξιολόγηση':'Follow-up'}</span></>:<p>Δεν έχει προγραμματιστεί.</p>}</section>
  </div>
 </section>;
}

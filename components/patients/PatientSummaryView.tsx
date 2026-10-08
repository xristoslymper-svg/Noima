'use client';
import {AlertTriangle,CalendarDays,CheckCircle2,Clock3,Pill,TestTube2} from 'lucide-react';
import type {PatientBundle} from '@/lib/patients/demo-runtime';
import {formatClinicAppointment,formatClinicDate} from '@/lib/clinic-time';
import {sessionClinicalTime} from '@/lib/clinical/visit-workspace-state';
import ClinicalSummary from './ClinicalSummary';

const eventLabel=(kind:string)=>kind==='started'?'Έναρξη αγωγής':kind==='stopped'?'Διακοπή αγωγής':kind==='changed'?'Αλλαγή αγωγής':'Μεταβολή αγωγής';

export default function PatientSummaryView({
 bundle,
 onOpenVisit,
 onTreatment,
 onHistory,
}:{
 bundle:PatientBundle;
 onOpenVisit:(id?:string)=>void;
 onTreatment:()=>void;
 onHistory:()=>void;
}){
 const completed=[...bundle.sessions].filter(s=>s.status==='completed').sort((a,b)=>Date.parse(sessionClinicalTime(bundle,b))-Date.parse(sessionClinicalTime(bundle,a)));
 const latestVisit=completed[0];
 const latestVisitTime=latestVisit?Date.parse(sessionClinicalTime(bundle,latestVisit)):null;
 const medicationName=(id:string)=>bundle.medications.find(m=>m.id===id)?.medication_name||'Αγωγή';
 const afterVisit=[
  ...(latestVisitTime===null?[]:bundle.medicationEvents.filter(e=>Date.parse(e.created_at)>latestVisitTime).map(e=>({time:Date.parse(e.created_at),text:`${eventLabel(e.event_type)} · ${medicationName(e.medication_id)}`,tone:'neutral' as const}))),
  ...(latestVisitTime===null?[]:bundle.medicationSideEffects.filter(e=>Date.parse(e.created_at)>latestVisitTime).map(e=>({time:Date.parse(e.created_at),text:`Νέα παρενέργεια · ${e.effect_text}`,tone:e.severity==='severe'?'warn' as const:'neutral' as const}))),
  ...(latestVisitTime===null?[]:bundle.assessments.filter(a=>a.status==='completed'&&a.completed_at&&Date.parse(a.completed_at)>latestVisitTime).map(a=>({time:Date.parse(a.completed_at!),text:`${a.instrument} · ${a.score??'ολοκληρώθηκε'}`,tone:a.item9_review&&!a.item9_reviewed_at?'warn' as const:'neutral' as const}))),
 ].sort((a,b)=>b.time-a.time).slice(0,5);

 const active=bundle.medications.filter(m=>m.status==='active');
 const latestScores=(['PHQ-9','GAD-7'] as const).flatMap(code=>{
  const scores=bundle.assessments.filter(a=>a.instrument===code&&a.status==='completed'&&a.score!==null).sort((a,b)=>Date.parse(b.completed_at||b.created_at)-Date.parse(a.completed_at||a.created_at));
  if(!scores.length)return [];
  const [latest,previous]=scores;
  const delta=previous&&latest.score!==null&&previous.score!==null?(latest.score<previous.score?'↓':latest.score>previous.score?'↑':'→'):'';
  return [{code,latest,delta}];
 });
 const latestRisk=completed.flatMap(session=>{
  const risk=bundle.risks.find(r=>r.session_id===session.id);
  return risk?[risk]:[];
 })[0];
 const riskText=!latestRisk?'Δεν υπάρχει ολοκληρωμένη αξιολόγηση':latestRisk.suicidal_ideation==='negative'?'Χωρίς καταγεγραμμένη ένδειξη':latestRisk.suicidal_ideation==='positive'?'Υπάρχει καταγεγραμμένη ένδειξη':latestRisk.suicidal_ideation==='unknown'?'Άγνωστο':'Δεν αξιολογήθηκε';
 const next=bundle.appointments.filter(a=>a.status==='scheduled'&&Date.parse(a.scheduled_end)>=Date.now()).sort((a,b)=>Date.parse(a.scheduled_start)-Date.parse(b.scheduled_start))[0];

 const keepInMind=[
  ...bundle.assessments.filter(a=>a.status==='completed'&&a.item9_review&&!a.item9_reviewed_at).map(a=>({key:'assessment-'+a.id,text:`${a.instrument} · λήμμα 9 αναμένει έλεγχο`,warn:true})),
  ...bundle.medicationSideEffects.filter(e=>!e.resolved_on).slice(0,3).map(e=>({key:'effect-'+e.id,text:`${e.effect_text} · ${medicationName(e.medication_id)}`,warn:e.severity==='severe'})),
  ...(bundle.history?.allergies?.trim()?[{key:'allergies',text:`Αλλεργίες: ${bundle.history.allergies.trim()}`,warn:true}]:[]),
 ].slice(0,5);

 return <div className="patient-summary-v2">
  <section className="summary-change-strip">
   <div className="patient-section-heading">
    <div><span className="kicker">ΑΠΟ ΤΗΝ ΤΕΛΕΥΤΑΙΑ ΕΠΙΣΚΕΨΗ</span><h2>Τι άλλαξε</h2></div>
    {latestVisit&&<button className="patient-text-link" onClick={()=>onOpenVisit(latestVisit.id)}>{formatClinicDate(sessionClinicalTime(bundle,latestVisit))} →</button>}
   </div>
   {!latestVisit?<p className="patient-quiet-empty">Δεν υπάρχει ακόμη ολοκληρωμένη επίσκεψη.</p>:afterVisit.length?<div className="summary-change-list">{afterVisit.map((item,index)=><div key={index} className={item.tone==='warn'?'warn':''}>{item.tone==='warn'?<AlertTriangle size={15}/>:<Clock3 size={15}/>}<span>{item.text}</span></div>)}</div>:<p className="patient-quiet-empty">Δεν υπάρχουν νεότερες δομημένες καταγραφές μετά την τελευταία επίσκεψη.</p>}
  </section>

  <section className="summary-now">
   <div className="patient-section-heading"><div><span className="kicker">ΤΩΡΑ</span><h2>Τρέχουσα κλινική εικόνα</h2></div></div>
   <div className="summary-now-grid">
    <button className="summary-now-item" onClick={onTreatment}><Pill size={16}/><span><small>ΤΡΕΧΟΥΣΑ ΘΕΡΑΠΕΙΑ</small><strong>{active.length?active.slice(0,2).map(m=>`${m.medication_name} ${m.dose} ${m.unit}`).join(' · '):'Δεν υπάρχει ενεργή αγωγή'}</strong>{active.length>2&&<em>+{active.length-2} ακόμη</em>}</span></button>
    <div className="summary-now-item"><TestTube2 size={16}/><span><small>ΜΕΤΡΗΣΕΙΣ</small><strong>{latestScores.length?latestScores.map(s=>`${s.code} ${s.latest.score} ${s.delta}`).join(' · '):'Δεν υπάρχουν ολοκληρωμένες μετρήσεις'}</strong>{latestScores[0]&&<em>τελευταία {formatClinicDate(latestScores[0].latest.completed_at||latestScores[0].latest.created_at)}</em>}</span></div>
    <div className={`summary-now-item ${latestRisk?.suicidal_ideation==='positive'?'risk':''}`}><CheckCircle2 size={16}/><span><small>ΚΙΝΔΥΝΟΣ</small><strong>{riskText}</strong>{latestRisk&&<em>τελευταία αξιολόγηση {formatClinicDate(latestRisk.updated_at)}</em>}</span></div>
    <div className="summary-now-item"><CalendarDays size={16}/><span><small>ΕΠΟΜΕΝΟ</small><strong>{next?formatClinicAppointment(next.scheduled_start):'Δεν υπάρχει προγραμματισμένο ραντεβού'}</strong></span></div>
   </div>
  </section>

  <section className="summary-dont-miss">
   <div className="patient-section-heading"><div><span className="kicker">ΝΑ ΜΗ ΧΑΘΕΙ</span><h2>Σημαντικό για την επόμενη επαφή</h2></div></div>
   {keepInMind.length?<div className="summary-dont-miss-list">{keepInMind.map(item=><div key={item.key} className={item.warn?'warn':''}>{item.warn?<AlertTriangle size={14}/>:<CheckCircle2 size={14}/>}<span>{item.text}</span></div>)}</div>:<p className="patient-quiet-empty">Δεν υπάρχουν δομημένες εκκρεμότητες ή ενεργά προειδοποιητικά στοιχεία.</p>}
  </section>

  <section className="summary-synthesis">
   <div className="patient-section-heading"><div><span className="kicker">ΚΛΙΝΙΚΗ ΣΥΝΘΕΣΗ</span><h2>Σύντομη εικόνα του φακέλου</h2></div></div>
   <ClinicalSummary compact bundle={bundle} onSessions={onOpenVisit} onPsychometrics={onTreatment} onMedications={onTreatment} onHistory={onHistory}/>
  </section>
 </div>;
}

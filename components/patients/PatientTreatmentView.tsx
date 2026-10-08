'use client';
import {useState,type MutableRefObject} from 'react';
import {AlertTriangle,CheckCircle2,ChevronRight,TestTube2} from 'lucide-react';
import type {PatientBundle} from '@/lib/patients/demo-runtime';
import {formatClinicDate} from '@/lib/clinic-time';
import {MedicationsPanel} from './PatientPanels';
import PatientPsychometrics from './PatientPsychometrics';

export default function PatientTreatmentView({
 bundle,
 reload,
 beforeNavigate,
 onTimeline,
}:{
 bundle:PatientBundle;
 reload:()=>Promise<unknown>;
 beforeNavigate?:MutableRefObject<(()=>Promise<void>)|null>;
 onTimeline:()=>void;
}){
 const [showPsychometrics,setShowPsychometrics]=useState(false);
 const medicationName=(id:string)=>bundle.medications.find(m=>m.id===id)?.medication_name||'Αγωγή';
 const activeEffects=bundle.medicationSideEffects.filter(e=>!e.resolved_on);
 const trajectories=(['PHQ-9','GAD-7'] as const).flatMap(code=>{
  const scores=bundle.assessments.filter(a=>a.instrument===code&&a.status==='completed'&&a.score!==null).sort((a,b)=>Date.parse(a.completed_at||a.created_at)-Date.parse(b.completed_at||b.created_at));
  return scores.length?[{code,scores}]:[];
 });
 return <div className="patient-treatment-v2">
  <section className="treatment-intro">
   <div className="patient-section-heading"><div><span className="kicker">ΘΕΡΑΠΕΙΑ</span><h2>Τι κάνουμε τώρα και πώς πάει</h2></div><button className="patient-text-link" onClick={onTimeline}>Προβολή στην Πορεία →</button></div>
  </section>

  <MedicationsPanel bundle={bundle} reload={reload} beforeNavigate={beforeNavigate}/>

  <section className="treatment-context-grid">
   <div className="treatment-context-block">
    <div className="treatment-block-title"><span>ΑΝΟΧΗ</span><h3>Ενεργές παρενέργειες</h3></div>
    {activeEffects.length?<div className="treatment-effect-list">{activeEffects.map(effect=><div key={effect.id} className={effect.severity==='severe'?'warning':''}>{effect.severity==='severe'?<AlertTriangle size={14}/>:<CheckCircle2 size={14}/>}<span><strong>{effect.effect_text}</strong><small>{medicationName(effect.medication_id)} · {effect.severity==='mild'?'ήπια':effect.severity==='moderate'?'μέτρια':'σοβαρή'} · {formatClinicDate(effect.noted_on)}</small></span></div>)}</div>:<p className="patient-quiet-empty">Δεν υπάρχουν ενεργές καταγεγραμμένες παρενέργειες.</p>}
   </div>
   <div className="treatment-context-block">
    <div className="treatment-block-title"><span>ΠΑΡΑΚΟΛΟΥΘΗΣΗ</span><h3>Μετρήσεις</h3></div>
    {trajectories.length?<div className="treatment-monitoring-list">{trajectories.map(({code,scores})=><button key={code} onClick={()=>setShowPsychometrics(true)}><span><strong>{code}</strong><small>{scores.slice(-4).map(s=>s.score).join(' → ')}</small></span><ChevronRight size={14}/></button>)}</div>:<p className="patient-quiet-empty">Δεν υπάρχουν ολοκληρωμένες μετρήσεις.</p>}
    <button className="treatment-secondary-action" onClick={()=>setShowPsychometrics(v=>!v)}><TestTube2 size={14}/>{showPsychometrics?'Κλείσιμο ψυχομετρικών':'Ψυχομετρικά · λεπτομέρειες / αποστολή'}</button>
   </div>
   <div className="treatment-context-block treatment-future-domain">
    <div className="treatment-block-title"><span>ΤΗΡΗΣΗ ΘΕΡΑΠΕΙΑΣ</span><h3>Adherence</h3></div>
    <p className="patient-quiet-empty">Δεν υπάρχει ακόμη δομημένη καταγραφή τήρησης. Δεν συμπεραίνεται από ελεύθερο κείμενο.</p>
   </div>
   <div className="treatment-context-block treatment-future-domain">
    <div className="treatment-block-title"><span>ΣΤΟΧΟΣ</span><h3>Στόχος θεραπείας</h3></div>
    <p className="patient-quiet-empty">Δεν έχει καταγραφεί ακόμη δομημένος στόχος θεραπείας.</p>
   </div>
  </section>

  {showPsychometrics&&<section className="treatment-psychometrics-detail"><PatientPsychometrics bundle={bundle} reload={reload}/></section>}
 </div>;
}

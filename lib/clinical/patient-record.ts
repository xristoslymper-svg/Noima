import type {PatientBundle} from '../patients/demo-runtime';

export type RecordEvent={id:string;kind:'visits'|'treatment'|'measurements';date:string;title:string;detail:string;sessionId?:string;assessmentId?:string;scheduled?:boolean;recordedAt?:string};
const eventLabels:Record<string,string>={started:'Έναρξη αγωγής',changed:'Αλλαγή αγωγής',stopped:'Διακοπή αγωγής'};
const day=(value:string)=>value.length===10?value:new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Athens',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(value));
export function completedMeasurements(bundle:PatientBundle,now=new Date()){
 const today=bundle.clinical_day||day(now.toISOString());
 return bundle.assessments.filter(a=>a.status==='completed'&&a.completed_at&&a.score!==null&&Date.parse(a.completed_at)<=now.getTime()&&day(a.completed_at)<=today).sort((a,b)=>Date.parse(b.completed_at!)-Date.parse(a.completed_at!)||a.id.localeCompare(b.id));
}
export function clinicalDate(bundle:PatientBundle,session:PatientBundle['sessions'][number]){
 return session.started_at;
}
export function patientRecord(bundle:PatientBundle,now=new Date()){
 const today=bundle.clinical_day||new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Athens',year:'numeric',month:'2-digit',day:'2-digit'}).format(now);
 const completed=bundle.sessions.filter(s=>s.status==='completed').sort((a,b)=>Date.parse(clinicalDate(bundle,b))-Date.parse(clinicalDate(bundle,a))||a.id.localeCompare(b.id));
 const latestVisit=completed[0];
 const revised=new Set((bundle.medicationRevisions||[]).map(r=>r.event_id));
 const medicationEvents=bundle.medicationEvents.filter(e=>!revised.has(e.id)&&eventLabels[e.event_type]);
 const measured=completedMeasurements(bundle,now);
 const latestScores=(['PHQ-9','GAD-7'] as const).flatMap(instrument=>{
  const results=measured.filter(a=>a.instrument===instrument&&day(a.completed_at!)<=today);
  return results[0]?[{current:results[0],previous:results[1]||null}]:[];
 });
 const activeEffects=bundle.medicationSideEffects.filter(e=>(!e.resolved_on||e.resolved_on>today)&&e.noted_on<=today);
 const medicationName=(id:string)=>bundle.medications.find(m=>m.id===id)?.medication_name||'Αγωγή';
 const events:RecordEvent[]=[
  ...completed.map(s=>({id:'visit-'+s.id,kind:'visits' as const,date:clinicalDate(bundle,s),title:s.session_type==='initial_assessment'?'Αρχική αξιολόγηση':'Επανεξέταση',detail:'Ολοκληρωμένη καταγραφή',sessionId:s.id})),
  ...medicationEvents.map(e=>({id:'med-'+e.id,kind:'treatment' as const,date:e.effective_on,recordedAt:e.created_at,title:eventLabels[e.event_type],detail:[String(e.new_state?.medication_name||e.previous_state?.medication_name||medicationName(e.medication_id)),e.new_state?.dose!==undefined?`${e.new_state.dose} ${e.new_state.unit||''}`:'',e.reason].filter(Boolean).join(' · '),sessionId:e.session_id||undefined,scheduled:e.effective_on>today})),
  ...bundle.medicationSideEffects.flatMap(e=>[
   {id:'effect-'+e.id,kind:'treatment' as const,date:e.noted_on,recordedAt:e.created_at,title:'Παρενέργεια',detail:`${medicationName(e.medication_id)} · ${e.effect_text}`,sessionId:e.session_id||undefined,scheduled:e.noted_on>today},
   ...(e.resolved_on?[{id:'effect-resolved-'+e.id,kind:'treatment' as const,date:e.resolved_on,recordedAt:e.updated_at,title:'Λήξη παρενέργειας',detail:`${medicationName(e.medication_id)} · ${e.effect_text}`,scheduled:e.resolved_on>today}]:[])
  ]),
  ...measured.map(a=>({id:'measurement-'+a.id,kind:'measurements' as const,date:a.completed_at!,title:`${a.instrument} · ${a.score}`,detail:a.item9_review&&!a.item9_reviewed_at?'Απάντηση στο στοιχείο 9 · εκκρεμεί κλινική ανασκόπηση':'Ολοκληρωμένη μέτρηση',sessionId:a.session_id||undefined,assessmentId:a.id,scheduled:day(a.completed_at!)>today}))
 ].sort((a,b)=>Date.parse(b.date)-Date.parse(a.date)||a.id.localeCompare(b.id));
 // Same-day date-only events need a recorded timestamp to establish ordering.
 const sinceLatest=latestVisit?events.filter(e=>{
  if(e.kind==='visits'||e.scheduled)return false;
  const visitDate=latestVisit.completed_at||clinicalDate(bundle,latestVisit);
  if(e.date.length>10)return Date.parse(e.date)>Date.parse(visitDate);
  return day(e.date)>day(visitDate)||(day(e.date)===day(visitDate)&&Boolean(e.recordedAt)&&Date.parse(e.recordedAt!)>Date.parse(visitDate));
 }):[];
 const risk=latestVisit?bundle.risks.find(r=>r.session_id===latestVisit.id)||null:null;
 const safetyLabels={suicidal_ideation:'Αυτοκτονικός ιδεασμός',intent:'Πρόθεση',plan:'Σχέδιο',self_harm:'Αυτοτραυματισμός',harm_to_others:'Κίνδυνος προς τρίτους'} as const;
 const safetyAlerts=risk?Object.entries(safetyLabels).filter(([key])=>risk[key as keyof typeof safetyLabels]==='positive').map(([,label])=>label):[];
 const nextAppointment=bundle.appointments.filter(a=>a.status==='scheduled'&&Date.parse(a.scheduled_end)>=now.getTime()).sort((a,b)=>Date.parse(a.scheduled_start)-Date.parse(b.scheduled_start))[0]||null;
 return {today,completed,latestVisit,risk,safetyAlerts,nextAppointment,latestScores,activeEffects,events,sinceLatest,activeMedications:bundle.medications.filter(m=>m.status==='active'),pendingSafety:measured.filter(a=>day(a.completed_at!)<=today&&a.item9_review&&!a.item9_reviewed_at)};
}

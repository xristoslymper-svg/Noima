import {medicationEventSession} from './medication-lineage.ts';
import {riskFindings} from './risk-findings.ts';
import {effectiveRisk} from './corrections.ts';
import {assessmentLink,assessmentLinkLabel} from './assessment-link.ts';
import type {PatientBundle} from '../patients/demo-runtime';

export type RecordEvent={id:string;kind:'visits'|'treatment'|'measurements';date:string;title:string;detail:string;sessionId?:string;assessmentId?:string;scheduled?:boolean;recordedAt?:string;draft?:boolean};
const eventLabels:Record<string,string>={started:'Έναρξη αγωγής',changed:'Αλλαγή αγωγής',stopped:'Διακοπή αγωγής'};
const day=(value:string)=>value.length===10?value:new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Athens',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(value));
export function completedMeasurements(bundle:PatientBundle,now=new Date()){
 const today=bundle.clinical_day||day(now.toISOString());
 return bundle.assessments.filter(a=>a.status==='completed'&&a.completed_at&&a.score!==null&&Date.parse(a.completed_at)<=now.getTime()&&day(a.completed_at)<=today).sort((a,b)=>Date.parse(b.completed_at!)-Date.parse(a.completed_at!)||a.id.localeCompare(b.id));
}
export function clinicalDate(bundle:PatientBundle,session:PatientBundle['sessions'][number]){
 return session.started_at;
}
export function upcomingAppointments(bundle:Pick<PatientBundle,'appointments'>,now=new Date()){
 return bundle.appointments.filter(a=>a.status==='scheduled'&&Date.parse(a.scheduled_end)>=now.getTime()).sort((a,b)=>Date.parse(a.scheduled_start)-Date.parse(b.scheduled_start));
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
  ...medicationEvents.map(e=>({id:'med-'+e.id,kind:'treatment' as const,date:e.effective_on,recordedAt:e.created_at,title:eventLabels[e.event_type],detail:[String(e.new_state?.medication_name||e.previous_state?.medication_name||medicationName(e.medication_id)),e.new_state?.dose!==undefined?`${e.new_state.dose} ${e.new_state.unit||''}`:'',e.reason].filter(Boolean).join(' · '),sessionId:medicationEventSession(bundle,e),scheduled:e.effective_on>today})),
  ...bundle.medicationSideEffects.flatMap(e=>[
   {id:'effect-'+e.id,kind:'treatment' as const,date:e.noted_on,recordedAt:e.created_at,title:'Παρενέργεια',detail:`${medicationName(e.medication_id)} · ${e.effect_text}`,sessionId:e.session_id||undefined,scheduled:e.noted_on>today},
   ...(e.resolved_on?[{id:'effect-resolved-'+e.id,kind:'treatment' as const,date:e.resolved_on,recordedAt:e.updated_at,title:'Λήξη παρενέργειας',detail:`${medicationName(e.medication_id)} · ${e.effect_text}`,scheduled:e.resolved_on>today}]:[])
  ]),
  ...measured.map(a=>({id:'measurement-'+a.id,kind:'measurements' as const,date:a.completed_at!,title:`${a.instrument} · ${a.score}`,detail:(a.item9_review&&!a.item9_reviewed_at?'Απάντηση στο στοιχείο 9 · εκκρεμεί κλινική ανασκόπηση':'Ολοκληρωμένη μέτρηση')+' · '+assessmentLinkLabel(bundle,a),sessionId:assessmentLink(bundle,a).session?.id,assessmentId:a.id,scheduled:day(a.completed_at!)>today}))
 ].sort((a,b)=>Date.parse(b.date)-Date.parse(a.date)||a.id.localeCompare(b.id));
 // Same-day date-only events need a recorded timestamp to establish ordering.
 const sinceLatest=latestVisit?events.filter(e=>{
  if(e.kind==='visits'||e.scheduled)return false;
  const visitDate=latestVisit.completed_at||clinicalDate(bundle,latestVisit);
  if(e.date.length>10)return Date.parse(e.date)>Date.parse(visitDate);
  return day(e.date)>day(visitDate)||(day(e.date)===day(visitDate)&&Boolean(e.recordedAt)&&Date.parse(e.recordedAt!)>Date.parse(visitDate));
 }):[];
 const risk=latestVisit?effectiveRisk(bundle.risks.find(r=>r.session_id===latestVisit.id),bundle.corrections,latestVisit.id)||null:null;
 const safetyAlerts=riskFindings(risk).filter(f=>!f.previousBranch&&['positive','active','both','passive'].includes(f.value)).map(f=>({self_harm:'Αυτοτραυματισμός',harm_to_others:'Κίνδυνος προς τρίτους'}[f.key]||f.label));
 const nextAppointment=upcomingAppointments(bundle,now)[0]||null;
 return {today,completed,latestVisit,risk,safetyAlerts,nextAppointment,latestScores,activeEffects,events,sinceLatest,activeMedications:bundle.medications.filter(m=>m.status==='active'),pendingSafety:measured.filter(a=>day(a.completed_at!)<=today&&a.item9_review&&!a.item9_reviewed_at)};
}

/** Explicit source links only: dates alone never attribute an event to a visit. */
export function visitTimelineContext(bundle:PatientBundle,now=new Date()){
 const record=patientRecord(bundle,now);
 const context=new Map<string,{treatment:RecordEvent[];measurements:{current:PatientBundle['assessments'][number];previous:PatientBundle['assessments'][number]|null}[]}>();
 for(const visit of bundle.sessions.filter(s=>s.patient_id===bundle.patient.id&&(s.status==='completed'||s.status==='draft')))context.set(visit.id,{treatment:[],measurements:[]});
 const revised=new Set(bundle.medicationRevisions.map(r=>r.event_id));
 const stateText=(state:Record<string,unknown>|null)=>state?[state.dose!==undefined?String(state.dose):'',state.unit?String(state.unit):'',state.frequency?String(state.frequency):''].filter(Boolean).join(' '):'';
 for(const event of bundle.medicationEvents){
  const sourceSession=medicationEventSession(bundle,event);
  if(!sourceSession||event.patient_id!==bundle.patient.id||revised.has(event.id)||!eventLabels[event.event_type])continue;
  const target=context.get(sourceSession);if(!target)continue;
  const before=stateText(event.previous_state),after=stateText(event.new_state);
  const name=String(event.new_state?.medication_name||event.previous_state?.medication_name||bundle.medications.find(m=>m.id===event.medication_id)?.medication_name||'Αγωγή');
  const detail=[name,event.event_type==='changed'&&before&&after?before+' → '+after:event.event_type==='stopped'?before:after].filter(Boolean).join(' · ');
  target.treatment.push({id:'med-'+event.id,kind:'treatment',date:event.effective_on,title:eventLabels[event.event_type],detail,scheduled:event.effective_on>record.today,sessionId:sourceSession});
 }
 const measured=completedMeasurements(bundle,now).filter(a=>a.patient_id===bundle.patient.id);
 for(const current of measured){
  const session=assessmentLink(bundle,current).session;const target=session?context.get(session.id):undefined;if(!target)continue;
  const previous=measured.find(a=>a.instrument===current.instrument&&a.instrument_version===current.instrument_version&&Date.parse(a.completed_at!)<Date.parse(current.completed_at!))||null;
  target.measurements.push({current,previous});
 }
 for(const entry of context.values())entry.treatment.sort((a,b)=>a.date.localeCompare(b.date)||a.id.localeCompare(b.id));
 return context;
}

/** Presentation model only. Draft anchors never become confirmed clinical history. */
export function patientTimeline(bundle:PatientBundle,now=new Date()){
 const record=patientRecord(bundle,now),context=visitTimelineContext(bundle,now);
 const visits:RecordEvent[]=[
  ...record.events.filter(e=>e.kind==='visits'&&context.has(e.sessionId!)),
  ...bundle.sessions.filter(s=>s.patient_id===bundle.patient.id&&s.status==='draft').map(s=>({
   id:'visit-'+s.id,kind:'visits' as const,date:s.started_at,
   title:s.session_type==='initial_assessment'?'Αρχική αξιολόγηση':'Επανεξέταση',
   detail:'Οι σημειώσεις έχουν αποθηκευτεί. Η επίσκεψη δεν έχει καταχωριστεί οριστικά.',sessionId:s.id,draft:true
  }))
 ].sort((a,b)=>Date.parse(b.date)-Date.parse(a.date)||a.id.localeCompare(b.id));
 // Side-effect source links are explicit too; never infer a visit from dates.
 for(const effect of bundle.medicationSideEffects){
  if(effect.patient_id!==bundle.patient.id||!effect.session_id)continue;
  const target=context.get(effect.session_id),event=record.events.find(e=>e.id==='effect-'+effect.id);
  if(target&&event)target.treatment.push(event);
 }
 const grouped=new Set([...context.values()].flatMap(c=>[...c.treatment.map(e=>e.id),...c.measurements.map(m=>'measurement-'+m.current.id)]));
 const owned=new Set([
  ...bundle.medicationEvents.filter(e=>e.patient_id===bundle.patient.id).map(e=>'med-'+e.id),
  ...bundle.medicationSideEffects.filter(e=>e.patient_id===bundle.patient.id).flatMap(e=>['effect-'+e.id,'effect-resolved-'+e.id]),
  ...bundle.assessments.filter(a=>a.patient_id===bundle.patient.id).map(a=>'measurement-'+a.id)
 ]);
 const unlinked=record.events.filter(e=>e.kind!=='visits'&&owned.has(e.id)&&!grouped.has(e.id));
 return {visits,context,unlinked};
}

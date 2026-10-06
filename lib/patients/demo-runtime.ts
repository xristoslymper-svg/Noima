import {pilotAuthorization} from '@/lib/pilot/request-scope';
import {isClinicalId} from '@/lib/clinical/identity';
import type {VisitDocument} from '@/lib/clinical/visit-document';
import type { ClinicalProposal, Addendum, Assessment, StructuredCorrection } from '@/lib/clinical/core-types';
const URL = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://mgpnaxaquzeoomxdzhic.supabase.co';
const KEY = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || 'sb_publishable_g4MJzSlAYzIFAt9glM_WeQ_UcP-yheG';
const headers = () => ({ apikey: KEY || '', Authorization: `Bearer ${KEY || ''}`, 'Content-Type': 'application/json', ...pilotAuthorization() });

export type DemoPatient = { id:string; tester_id:string; first_name:string; last_name:string; reported_age:number|null; phone:string; landline:string; contact_phone:string; amka:string; address:string; email:string; chief_complaint:string; note:string; status:string; created_at:string; updated_at:string };
export type DemoSession = { id:string; tester_id:string; patient_id:string; session_type:string; status:'draft'|'completed'; version:number; started_at:string; completed_at:string|null; updated_at:string };
export type DemoSection = { document?:VisitDocument|null; id:string; session_id:string; patient_id:string; section_key:string; content:string; source:string; version:number; updated_at:string };
export type DemoRisk = { tree?:import('../clinical/risk-tree').RiskTree; harm_to_others?:string; session_id:string; patient_id:string; suicidal_ideation:string; intent:string; plan:string; self_harm:string; attempt_history:string; protective_factors:string; clinical_note:string; version:number; updated_at:string };
export type DemoHistory = { patient_id:string; psychiatric_history:string; medical_history:string; previous_treatments:string; hospitalizations:string; family_history:string; substance_history:string; social_functioning:string; allergies:string; version:number; updated_at:string };
export type DemoMedication = { plan_version:number; id:string; patient_id:string; medication_name:string; dose:number; unit:string; frequency:string; effective_from:string; started_at:string; ended_at:string|null; status:string; notes:string; updated_at:string };
export type DemoMedicationEvent = { id:string; patient_id:string; medication_id:string; session_id:string|null; event_type:string; previous_state:Record<string,unknown>|null; new_state:Record<string,unknown>|null; reason:string; effective_on:string; created_at:string };
export type DemoMedicationSideEffect = { id:string; patient_id:string; medication_id:string; session_id:string|null; effect_text:string; severity:'mild'|'moderate'|'severe'; impact:string; noted_on:string; resolved_on:string|null; note:string; created_at:string; updated_at:string };
export type PatientBundle = { clinical_day?:string; patient:DemoPatient; sessions:DemoSession[]; sections:DemoSection[]; risks:DemoRisk[]; history:DemoHistory|null; medications:DemoMedication[]; medicationEvents:DemoMedicationEvent[]; medicationSideEffects:DemoMedicationSideEffect[]; medicationRevisions:{event_id:string;replacement_id:string|null;reason:string;created_at:string}[]; proposals:ClinicalProposal[]; addenda:Addendum[]; corrections:StructuredCorrection[]; assessments:Assessment[]; appointments:{id:string;session_id:string|null;appointment_type:string;scheduled_start:string;scheduled_end:string;status:string}[] };

function configured(){ if(!URL || !KEY) throw new Error('demo_runtime_not_configured'); }
export async function request(path:string, init:RequestInit={}){
  configured();
  const response=await fetch(`${URL}/rest/v1/${path}`,{...init,headers:{...headers(),...(init.headers||{})},cache:'no-store'});
  const text=await response.text();
  let data:unknown=null; try{data=text?JSON.parse(text):null}catch{data=text}
  if(!response.ok){const message=typeof data==='object'&&data&&'message' in data?String((data as {message?:unknown}).message):`demo_http_${response.status}`;throw new Error(message)}
  return data;
}
export async function rpc(name:string,args:Record<string,unknown>){return request(`rpc/${name}`,{method:'POST',body:JSON.stringify(args)})}
const rows=<T>(value:unknown):T[]=>Array.isArray(value)?value as T[]:value?[value as T]:[];
const one=<T>(value:unknown):T=>rows<T>(value)[0];
export async function bootstrap(tester:string){await rpc('demo_tester_bootstrap',{p_tester:tester})}
export async function listPatients(tester:string){await bootstrap(tester);return rows<DemoPatient>(await request(`demo_patients?select=*&tester_id=eq.${encodeURIComponent(tester)}&order=updated_at.desc`))}
export async function listPatientRows(tester:string){
 const patients=await listPatients(tester);
 const tid=encodeURIComponent(tester);
 const [sessionData,appointmentData,sectionData]=await Promise.all([
  request(`demo_sessions?select=*&tester_id=eq.${tid}&order=started_at.desc`),
  request(`demo_calendar_events?select=id,patient_id,session_id,scheduled_start,scheduled_end,status&tester_id=eq.${tid}&order=scheduled_start.asc`),
  request(`demo_session_sections?select=patient_id,session_id,section_key,document,updated_at&tester_id=eq.${tid}&section_key=eq.assessment&order=updated_at.desc`),
 ]);
 const sessions=rows<DemoSession>(sessionData);
 const appointments=rows<{id:string;patient_id:string|null;session_id:string|null;scheduled_start:string;scheduled_end:string;status:string}>(appointmentData);
 const diagnosisSections=rows<{patient_id:string;session_id:string;document?:VisitDocument|null;updated_at:string}>(sectionData);
 const now=Date.now();
 const registryOrder=[...patients].sort((a,b)=>new Date(a.created_at).getTime()-new Date(b.created_at).getTime()||a.id.localeCompare(b.id));
 const registryNumber=new Map(registryOrder.map((patient,index)=>[patient.id,index+1]));
 return patients.map(patient=>({
  ...patient,
  registry_number:registryNumber.get(patient.id)||0,
  diagnosis:(()=>{const initial=sessions.filter(s=>s.patient_id===patient.id&&s.session_type==='initial_assessment').sort((a,b)=>new Date(a.started_at).getTime()-new Date(b.started_at).getTime())[0];if(!initial)return null;const document=diagnosisSections.find(section=>section.patient_id===patient.id&&section.session_id===initial.id)?.document;const field=document?.kind==='assessment'?document.fields.find(item=>item.key==='diagnosis'):undefined;return field?.codes?.[0]||null;})(),
  draft:sessions.find(s=>s.patient_id===patient.id&&s.status==='draft')||null,
  last_session:sessions.find(s=>s.patient_id===patient.id&&s.status==='completed')||null,
  next_appointment:appointments.find(a=>a.patient_id===patient.id&&a.status==='scheduled'&&new Date(a.scheduled_end).getTime()>=now)||null,
 }));
}
export async function createPatient(tester:string,input:{first_name:string;last_name:string;age:number|null;phone:string;landline:string;contact_phone:string;amka:string;address:string;email:string;chief_complaint:string}){
  await bootstrap(tester); return one<DemoPatient>(await rpc('demo_patient_create_v3',{p_tester:tester,p_first_name:input.first_name,p_last_name:input.last_name,p_age:input.age,p_phone:input.phone,p_landline:input.landline,p_contact_phone:input.contact_phone,p_amka:input.amka,p_address:input.address,p_email:input.email,p_complaint:input.chief_complaint}));
}
export async function patientBundle(tester:string,patientRef:string):Promise<PatientBundle>{
  if(!isClinicalId(patientRef))throw new Error('patient_not_found');
  const tid=encodeURIComponent(tester),id=encodeURIComponent(patientRef);
  const patient=rows<DemoPatient>(await request(`demo_patients?select=*&tester_id=eq.${tid}&id=eq.${id}&limit=1`))[0];
  if(!patient) throw new Error('patient_not_found');
  const clinicalDay=new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Athens',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
  const patientId=encodeURIComponent(patient.id);
  const [sessions,sections,risks,history,medications,events,sideEffects,proposals,addenda,corrections,appointments,revisions]=await Promise.all([
    request(`demo_sessions?select=*&tester_id=eq.${tid}&patient_id=eq.${patientId}&order=started_at.desc`),
    request(`demo_session_sections?select=*&tester_id=eq.${tid}&patient_id=eq.${patientId}&order=updated_at.desc`),
    request(`demo_risk_assessments?select=*&tester_id=eq.${tid}&patient_id=eq.${patientId}&order=updated_at.desc`),
    request(`demo_patient_history?select=*&tester_id=eq.${tid}&patient_id=eq.${patientId}&limit=1`),
    rpc('demo_medications_at',{p_tester:tester,p_patient:patient.id,p_on:clinicalDay}),
    request(`demo_medication_events?select=*&tester_id=eq.${tid}&patient_id=eq.${patientId}&order=effective_on.desc,created_at.desc`),
    request(`demo_medication_side_effects?select=*&tester_id=eq.${tid}&patient_id=eq.${patientId}&order=noted_on.desc,created_at.desc`),
    request(`demo_clinical_entries?select=*&tester_id=eq.${tid}&patient_id=eq.${patientId}&order=created_at.desc`),
    request(`demo_session_addenda?select=*&tester_id=eq.${tid}&patient_id=eq.${patientId}&order=created_at.asc`),
    request(`demo_session_corrections?select=*&tester_id=eq.${tid}&patient_id=eq.${patientId}&order=created_at.asc`),
    request(`demo_calendar_events?select=id,session_id,appointment_type,scheduled_start,scheduled_end,status&tester_id=eq.${tid}&patient_id=eq.${patientId}&order=scheduled_start.asc`),
    request(`demo_medication_event_revisions?select=event_id,replacement_id,reason,created_at&tester_id=eq.${tid}`),
  ]);
  return {clinical_day:clinicalDay,patient,medicationRevisions:rows<PatientBundle['medicationRevisions'][number]>(revisions),proposals:rows<ClinicalProposal>(proposals),addenda:rows<Addendum>(addenda),corrections:rows<StructuredCorrection>(corrections),assessments:rows<Assessment>(await rpc('demo_assessment_list',{p_tester:tester,p_patient:patient.id})),appointments:rows<PatientBundle['appointments'][number]>(appointments),sessions:rows<DemoSession>(sessions),sections:rows<DemoSection>(sections),risks:rows<DemoRisk>(risks),history:rows<DemoHistory>(history)[0]||null,medications:rows<DemoMedication>(medications),medicationEvents:rows<DemoMedicationEvent>(events),medicationSideEffects:rows<DemoMedicationSideEffect>(sideEffects)};
}

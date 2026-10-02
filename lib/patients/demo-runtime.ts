const URL = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://mgpnaxaquzeoomxdzhic.supabase.co';
const KEY = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || 'sb_publishable_g4MJzSlAYzIFAt9glM_WeQ_UcP-yheG';
const headers = () => ({ apikey: KEY || '', Authorization: `Bearer ${KEY || ''}`, 'Content-Type': 'application/json' });

export type DemoPatient = { id:string; tester_id:string; first_name:string; last_name:string; reported_age:number|null; phone:string; email:string; chief_complaint:string; note:string; status:string; created_at:string; updated_at:string };
export type DemoSession = { id:string; tester_id:string; patient_id:string; session_type:string; status:'draft'|'completed'; version:number; started_at:string; completed_at:string|null; updated_at:string };
export type DemoSection = { id:string; session_id:string; patient_id:string; section_key:string; content:string; source:string; version:number; updated_at:string };
export type DemoRisk = { session_id:string; patient_id:string; suicidal_ideation:string; intent:string; plan:string; self_harm:string; attempt_history:string; protective_factors:string; clinical_note:string; version:number; updated_at:string };
export type DemoHistory = { patient_id:string; psychiatric_history:string; medical_history:string; previous_treatments:string; hospitalizations:string; family_history:string; substance_history:string; social_functioning:string; allergies:string; updated_at:string };
export type DemoMedication = { id:string; patient_id:string; medication_name:string; dose:number; unit:string; frequency:string; effective_from:string; started_at:string; ended_at:string|null; status:string; notes:string; updated_at:string };
export type DemoMedicationEvent = { id:string; patient_id:string; medication_id:string; session_id:string|null; event_type:string; previous_state:Record<string,unknown>|null; new_state:Record<string,unknown>|null; reason:string; effective_on:string; created_at:string };
export type PatientBundle = { patient:DemoPatient; sessions:DemoSession[]; sections:DemoSection[]; risks:DemoRisk[]; history:DemoHistory|null; medications:DemoMedication[]; medicationEvents:DemoMedicationEvent[] };

function configured(){ if(!URL || !KEY) throw new Error('demo_runtime_not_configured'); }
async function request(path:string, init:RequestInit={}){
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
 const [sessionData,appointmentData]=await Promise.all([
  request(`demo_sessions?select=*&tester_id=eq.${tid}&order=started_at.desc`),
  request(`demo_calendar_events?select=id,patient_id,session_id,scheduled_start,scheduled_end,status&tester_id=eq.${tid}&status=eq.scheduled&order=scheduled_start.asc`),
 ]);
 const sessions=rows<DemoSession>(sessionData);
 const appointments=rows<{id:string;patient_id:string|null;session_id:string|null;scheduled_start:string;scheduled_end:string;status:string}>(appointmentData);
 const now=Date.now();
 return patients.map(patient=>({
  ...patient,
  draft:sessions.find(s=>s.patient_id===patient.id&&s.status==='draft')||null,
  last_session:sessions.find(s=>s.patient_id===patient.id&&s.status==='completed')||null,
  next_appointment:appointments.find(a=>a.patient_id===patient.id&&new Date(a.scheduled_end).getTime()>=now)||null,
 }));
}
export async function createPatient(tester:string,input:{first_name:string;last_name:string;age:number|null;phone:string;email:string;chief_complaint:string}){
  await bootstrap(tester); return one<DemoPatient>(await rpc('demo_patient_create_v2',{p_tester:tester,p_first_name:input.first_name,p_last_name:input.last_name,p_age:input.age,p_phone:input.phone,p_email:input.email,p_complaint:input.chief_complaint}));
}
export async function patientBundle(tester:string,patientRef:string):Promise<PatientBundle>{
  const patients=await listPatients(tester); const normalized=patientRef.toLocaleLowerCase('el');
  const patient=patients.find(p=>p.id===patientRef)||patients.find(p=>p.first_name.toLocaleLowerCase('el')===normalized);
  if(!patient) throw new Error('patient_not_found');
  const id=encodeURIComponent(patient.id); const tid=encodeURIComponent(tester);
  const [sessions,sections,risks,history,medications,events]=await Promise.all([
    request(`demo_sessions?select=*&tester_id=eq.${tid}&patient_id=eq.${id}&order=started_at.desc`),
    request(`demo_session_sections?select=*&tester_id=eq.${tid}&patient_id=eq.${id}&order=updated_at.desc`),
    request(`demo_risk_assessments?select=*&tester_id=eq.${tid}&patient_id=eq.${id}&order=updated_at.desc`),
    request(`demo_patient_history?select=*&tester_id=eq.${tid}&patient_id=eq.${id}&limit=1`),
    request(`demo_medications?select=*&tester_id=eq.${tid}&patient_id=eq.${id}&order=updated_at.desc`),
    request(`demo_medication_events?select=*&tester_id=eq.${tid}&patient_id=eq.${id}&order=created_at.desc`),
  ]);
  return {patient,sessions:rows<DemoSession>(sessions),sections:rows<DemoSection>(sections),risks:rows<DemoRisk>(risks),history:rows<DemoHistory>(history)[0]||null,medications:rows<DemoMedication>(medications),medicationEvents:rows<DemoMedicationEvent>(events)};
}

import type {PatientBundle,DemoSession} from './demo-runtime';
import type {ContinuityDraft} from '../clinical/continuity';
export function simulateVisitWrite(bundle:PatientBundle,body:Record<string,unknown>,now:string):unknown{
 const session=bundle.sessions.find(s=>s.id===body.session_id);
 if(body.action==='start_session'){
  if(body.patient_id!==bundle.patient.id||typeof body.request_id!=='string')throw new Error('patient_not_found');
  const appointment=body.appointment_id?bundle.appointments.find(a=>a.id===body.appointment_id):null;
  if(body.appointment_id&&!appointment)throw new Error('appointment_unavailable');
  const found=bundle.sessions.find(s=>s.id===(appointment?.session_id||body.request_id));if(found)return {session:found};
  const created:DemoSession={id:body.request_id,tester_id:bundle.patient.tester_id,patient_id:bundle.patient.id,session_type:String(body.session_type),status:'draft',version:0,closure_version:0,closure_draft:null,continuity:null,started_at:now,completed_at:null,updated_at:now};
  bundle.sessions.unshift(created);if(appointment)appointment.session_id=created.id;return {session:created};
 }
 if(!session||session.patient_id!==bundle.patient.id)throw new Error('session_unavailable');
 if(body.action==='finalize_session'||body.action==='finalize_closure'){
  if(session.status==='completed')return {session};
  if(body.expected_version!==session.version)throw new Error('stale_session');
  if(body.action==='finalize_closure'&&(body.confirmed!==true||body.expected_closure_version!==session.closure_version))throw new Error('stale_closure');
  const memory=session.closure_draft;
  if(memory){
   const values={interview:memory.transcript||memory.clinical_state_summary,assessment:memory.clinical_state_summary,plan:memory.treatment_decision,review:memory.next_review_focus,adherence:memory.adherence};
   for(const [key,text] of Object.entries(values))if(text.trim()&&!bundle.sections.some(s=>s.session_id===session.id&&s.section_key===key&&s.content.trim()))bundle.sections.push({id:session.id+':'+key,session_id:session.id,patient_id:bundle.patient.id,section_key:key,content:text,source:'manual',version:1,updated_at:now});
   session.continuity={...memory,session_id:session.id,approved_at:now,approved_by:'synthetic'};
   session.closure_draft=null;
  }
  session.status='completed';session.completed_at=now;session.updated_at=now;session.version++;
  for(const appointment of bundle.appointments)if(appointment.session_id===session.id&&appointment.status==='scheduled')appointment.status='completed';
  return {session};
 }
 if(session.status!=='draft')throw new Error('session_unavailable');
 if(body.action==='save_closure'){
  if(body.expected_version!==(session.closure_version||0))throw new Error('stale_closure');
  session.closure_draft=body.value as ContinuityDraft;session.closure_version=(session.closure_version||0)+1;session.version++;session.updated_at=now;return {session};
 }
 if(body.action==='save_section'||body.action==='save_document'){
  const key=String(body.section_key);let section=bundle.sections.find(s=>s.session_id===session.id&&s.section_key===key);
  if((body.expected_version??0)!==(section?.version||0))throw new Error('stale_section');
  if(!section){section={id:session.id+':'+key,session_id:session.id,patient_id:bundle.patient.id,section_key:key,content:'',source:'manual',version:0,updated_at:now};bundle.sections.push(section)}
  section.content=String(body.content||'');if(body.document){section.document=body.document as NonNullable<typeof section.document>;section.content=section.document.fields.filter(f=>f.text.trim()).map(f=>f.label+': '+f.text).join('\n\n')}
  section.version++;section.updated_at=now;session.version++;return {section};
 }
 if(body.action==='save_risk'){
  let risk=bundle.risks.find(r=>r.session_id===session.id);
  if((body.expected_version??0)!==(risk?.version||0))throw new Error('stale_risk');
  if(!risk){risk={session_id:session.id,patient_id:bundle.patient.id,suicidal_ideation:'not_assessed',intent:'not_assessed',plan:'not_assessed',self_harm:'not_assessed',attempt_history:'not_assessed',protective_factors:'',clinical_note:'',version:0,updated_at:now};bundle.risks.push(risk)}
  Object.assign(risk,body.risk,{version:risk.version+1,updated_at:now});session.version++;return {risk};
 }
 if(body.action==='finish_session_later')return {ok:true};
 throw new Error('Η ενέργεια δεν υποστηρίζεται στη συνθετική δοκιμή. Δεν στάλθηκε στη βάση.');
}

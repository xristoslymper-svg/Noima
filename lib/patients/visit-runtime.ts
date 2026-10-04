import {request,bootstrap,type PatientBundle,type DemoPatient} from './demo-runtime';
import {isClinicalId} from '../clinical/identity';
const empty=(patient:DemoPatient):PatientBundle=>({patient,sessions:[],sections:[],risks:[],history:null,medications:[],medicationEvents:[],medicationSideEffects:[],medicationRevisions:[],proposals:[],addenda:[],assessments:[],appointments:[]});
export async function visitBundle(tester:string,patientRef:string,sessionId?:string):Promise<PatientBundle>{
 const tid=encodeURIComponent(tester),id=encodeURIComponent(patientRef);
 const path=`demo_patients?select=*&tester_id=eq.${tid}&${isClinicalId(patientRef)?'id':'first_name'}=eq.${id}&limit=1`;
 let patients=await request(path) as DemoPatient[];
 if(!patients.length&&!isClinicalId(patientRef)){await bootstrap(tester);patients=await request(path) as DemoPatient[]}
 const patient=patients[0];if(!patient)throw new Error('patient_not_found');
 const filter=`tester_id=eq.${tid}&patient_id=eq.${patient.id}`;
 const b=empty(patient);
 if(!sessionId){const [sessions,appointments]=await Promise.all([request(`demo_sessions?select=*&${filter}&order=started_at.desc`),request(`demo_calendar_events?select=id,session_id,appointment_type,scheduled_start,scheduled_end,status&${filter}&order=scheduled_start.asc`)]);return {...b,sessions:sessions as PatientBundle['sessions'],appointments:appointments as PatientBundle['appointments']}}
 if(!isClinicalId(sessionId))throw new Error('session_unavailable');
 const ss=await request(`demo_sessions?select=*&${filter}&id=eq.${sessionId}`) as PatientBundle['sessions'];if(!ss.length)throw new Error('session_unavailable');
 const child=`${filter}&session_id=eq.${sessionId}`;
 const [sections,risks,proposals,addenda]=await Promise.all([request(`demo_session_sections?select=*&${child}`),request(`demo_risk_assessments?select=*&${child}`),request(`demo_clinical_entries?select=*&${child}&order=created_at.desc`),request(`demo_session_addenda?select=*&${child}&order=created_at.asc`)]);
 return {...b,sessions:ss,sections:sections as PatientBundle['sections'],risks:risks as PatientBundle['risks'],proposals:proposals as PatientBundle['proposals'],addenda:addenda as PatientBundle['addenda']};
}

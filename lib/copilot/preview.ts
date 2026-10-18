import {copilotPatients} from './synthetic-fixtures.mjs';
import treatmentFixture from '../clinical/treatment-preview.json' with {type:'json'};
import type {PatientBundle} from '../patients/demo-runtime';
import type {SyntheticChartKey} from './chart-scope.ts';
export const SYNTHETIC_CHART_PATH='/patients/demo/synthetic-copilot';
export function syntheticPreviewEnabled(){
 const preview=process.env.VERCEL_ENV==='preview'&&['codex/clinical-copilot-agent','codex/copilot-text-masking'].includes(process.env.VERCEL_GIT_COMMIT_REF||'');
 const chartPreview=process.env.VERCEL_ENV==='preview'&&process.env.VERCEL_GIT_COMMIT_REF==='codex/copilot-preview-scope'&&['demo','synthetic'].includes(process.env.CLINICAL_DATA_MODE||'');
 const releasedDemo=process.env.VERCEL_ENV==='production'&&process.env.VERCEL_GIT_COMMIT_REF==='main'&&['demo','synthetic'].includes(process.env.CLINICAL_DATA_MODE||'');
 return (chartPreview||((preview||releasedDemo)&&process.env.COPILOT_INTERACTIVE_SYNTHETIC==='true'))&&process.env.EXTERNAL_AI_ENABLED!=='false';
}
export function syntheticPatient(chart:SyntheticChartKey='copilot'){
 if(chart==='treatment')return structuredClone(treatmentFixture) as unknown as PatientBundle;
 if(chart!=='copilot')throw new Error('synthetic_chart_invalid');
 const bundle=copilotPatients()[0];
 bundle.patient={...bundle.patient,first_name:'Μαρία',last_name:'Δοκιμαστική',reported_age:38,phone:'',landline:'',contact_phone:'',amka:'',address:'',email:'',status:'active',created_at:'2026-02-10T09:00:00Z',updated_at:'2026-09-10T09:00:00Z'};
 const patientId=bundle.patient.id;
 bundle.sessions=bundle.sessions.filter(s=>s.status==='completed').map(s=>({...s,patient_id:patientId,tester_id:'synthetic',session_type:s.started_at.startsWith('2026-02')?'initial_assessment':'follow_up',version:1,updated_at:s.completed_at||s.started_at}));
 const sessions=new Set(bundle.sessions.map(s=>s.id));
 bundle.sections=bundle.sections.filter(s=>sessions.has(s.session_id)).map(s=>({...s,patient_id:patientId,source:'manual',version:1,updated_at:bundle.sessions.find(v=>v.id===s.session_id)!.started_at}));
 bundle.medications=bundle.medications.map(m=>({...m,patient_id:patientId,plan_version:1,effective_from:m.started_at,ended_at:null,notes:'Συνθετικό φάρμακο',updated_at:'2026-09-10T09:00:00Z'}));
 bundle.medicationEvents=bundle.medicationEvents.map(e=>({...e,patient_id:patientId,previous_state:null}));
 bundle.risks=bundle.risks.map(r=>({...r,patient_id:patientId,self_harm:'not_assessed',protective_factors:'',clinical_note:'Συνθετική καταγραφή',version:1,updated_at:'2026-02-10T09:00:00Z'}));
 bundle.appointments=bundle.appointments.map(a=>({...a,session_id:null,appointment_type:'follow_up'}));
 return bundle;
}

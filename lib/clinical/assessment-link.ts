import type {Assessment} from './core-types';
import type {PatientBundle} from '../patients/demo-runtime';
export function assessmentLink(bundle:Pick<PatientBundle,'sessions'|'appointments'>,assessment:Assessment){
 const direct=assessment.session_id?bundle.sessions.find(s=>s.id===assessment.session_id&&(!s.patient_id||s.patient_id===assessment.patient_id)):undefined;
 const appointment=assessment.appointment_id?bundle.appointments.find(a=>a.id===assessment.appointment_id):undefined;
 if(assessment.session_id)return {kind:direct?'direct':'unavailable',session:direct,appointment} as const;
 if(assessment.appointment_id){const session=appointment?.session_id?bundle.sessions.find(s=>s.id===appointment.session_id&&(!s.patient_id||s.patient_id===assessment.patient_id)):undefined;return {kind:appointment?'appointment':'unavailable',session,appointment} as const;}
 return {kind:'unlinked',session:undefined,appointment:undefined} as const;
}
export function assessmentLinkLabel(bundle:Pick<PatientBundle,'sessions'|'appointments'>,assessment:Assessment){
 const link=assessmentLink(bundle,assessment);
 return link.kind==='direct'?'Απευθείας σύνδεση με κλινική επίσκεψη':link.kind==='appointment'?(link.session?'Μέσω ραντεβού που συνδέεται με κλινική επίσκεψη':'Σύνδεση με ραντεβού · χωρίς συνδεδεμένη κλινική επίσκεψη'):link.kind==='unavailable'?'Η αναφερόμενη σύνδεση δεν είναι διαθέσιμη':'Χωρίς σύνδεση με ραντεβού ή κλινική επίσκεψη';
}

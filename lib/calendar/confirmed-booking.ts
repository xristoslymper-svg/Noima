import {isClinicalId} from '../clinical/identity.ts';
import type {PatientBundle} from '../patients/demo-runtime';
export function confirmedBooking(value:unknown,patientId:string,start:string,end:string):PatientBundle['appointments'][number]{
 const event=value as PatientBundle['appointments'][number]|null;
 if(!event||!isClinicalId(event.id)||event.patient_id!==patientId||event.status!=='scheduled'||event.appointment_type!=='follow_up'||Date.parse(event.scheduled_start)!==Date.parse(start)||Date.parse(event.scheduled_end)!==Date.parse(end))throw new Error('Δεν επιβεβαιώθηκε το συγκεκριμένο ραντεβού. Ελέγξτε την κατάσταση πριν επαναλάβετε.');
 return event;
}

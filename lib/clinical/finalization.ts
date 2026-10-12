import type {DemoSession} from '../patients/demo-runtime';

// A successful transport is not proof that the requested visit was completed.
export function confirmedCompletion(value:unknown,sessionId:string,patientId?:string):DemoSession{
 const s=value as Partial<DemoSession>|null;
 if(!s||s.id!==sessionId||(patientId&&s.patient_id!==patientId)||s.status!=='completed'||!s.completed_at||!Number.isInteger(s.version))
  throw new Error('Δεν επιβεβαιώθηκε η ολοκλήρωση της συγκεκριμένης επίσκεψης. Το πρόχειρο διατηρείται· ανανεώστε και δοκιμάστε ξανά.');
 return s as DemoSession;
}

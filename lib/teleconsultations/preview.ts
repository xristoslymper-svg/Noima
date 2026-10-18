import {appointmentContext,type Appointment} from './policy.ts';
import type {ContinuityDraft} from '../clinical/continuity';
export type FixtureRecord={appointment:Appointment;patientId:string;sessionId:string;version:number;notes:ContinuityDraft;assignments:('PHQ-9'|'GAD-7'|'history')[]};
export function saveFixtureNotes(record:FixtureRecord,patientId:string,sessionId:string,version:number|null,notes:ContinuityDraft):FixtureRecord{
 appointmentContext(record.appointment,patientId,sessionId);
 if(record.version!==version)throw new Error('Η καταγραφή άλλαξε. Επαναφορτώστε την επίσκεψη.');
 return {...record,notes:{...notes},version:record.version+1};
}
export function assignFixture(record:FixtureRecord,tool:'PHQ-9'|'GAD-7'|'history'){
 appointmentContext(record.appointment,record.patientId,record.sessionId);
 return record.assignments.includes(tool)?record:{...record,assignments:[...record.assignments,tool]};
}

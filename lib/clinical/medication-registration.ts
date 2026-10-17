import {isClinicalId} from './identity.ts';

export type MedicationRegistrationMode='existing'|'historical'|'prescribed';
export type MedicationRegistration={
 patient_id:string;request_id:string;mode:MedicationRegistrationMode;
 name:string;dose:number;unit:string;frequency:string;
 started_on:string|null;stopped_on:string|null;session_id:string|null;
};
const validDay=(value:unknown):value is string=>typeof value==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(value)&&Number.isFinite(Date.parse(value+'T12:00:00Z'))&&new Date(value+'T12:00:00Z').toISOString().slice(0,10)===value;

/** Dates describe clinical events only. A blank field never becomes today's date. */
export function medicationRegistration(input:MedicationRegistration,today:string):MedicationRegistration{
 if(typeof input.name!=='string'||typeof input.unit!=='string'||typeof input.frequency!=='string')throw new Error('invalid_medication_registration');
 if([input.started_on,input.stopped_on].some(day=>day!=null&&typeof day!=='string'))throw new Error('invalid_medication_dates');
 const value={...input,name:input.name.trim(),unit:input.unit.trim(),frequency:input.frequency.trim(),
  started_on:input.started_on||null,stopped_on:input.stopped_on||null};
 if(!isClinicalId(value.patient_id)||!isClinicalId(value.request_id)||!['existing','historical','prescribed'].includes(value.mode)
  ||!value.name||value.name.length>200||!Number.isFinite(value.dose)||value.dose<=0
  ||!value.unit||value.unit.length>30||!value.frequency||value.frequency.length>200)throw new Error('invalid_medication_registration');
 if((value.started_on&&!validDay(value.started_on))||(value.stopped_on&&!validDay(value.stopped_on))
  ||(value.mode==='prescribed'&&!value.started_on)
  ||(value.mode!=='prescribed'&&Boolean(value.started_on&&value.started_on>today))
  ||(value.mode!=='historical'&&value.stopped_on)
  ||(value.stopped_on&&(value.stopped_on>today||Boolean(value.started_on&&value.stopped_on<value.started_on))))throw new Error('invalid_medication_dates');
 // Folder registration never adopts an unrelated open clinical draft.
 if(value.mode!=='prescribed')value.session_id=null;
 else if(value.session_id&&!isClinicalId(value.session_id))throw new Error('invalid_medication_registration');
 return value;
}

export function confirmedMedicationRegistration(value:unknown,input:MedicationRegistration){
 const m=value as Record<string,unknown>|null;
 if(!m||!isClinicalId(m.id)||m.patient_id!==input.patient_id||m.registration_request_id!==input.request_id
  ||m.record_source!==input.mode||m.medication_name!==input.name||Number(m.dose)!==input.dose
  ||m.unit!==input.unit||m.frequency!==input.frequency||(m.started_at??null)!==input.started_on
  ||(m.ended_at??null)!==input.stopped_on)throw new Error('medication_registration_unconfirmed');
 return m;
}
